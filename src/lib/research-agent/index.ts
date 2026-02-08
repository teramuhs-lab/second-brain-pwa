// Research Agent Core - ReAct-style research loop
// Implements: Think → Act → Observe → Repeat → Answer

import OpenAI from 'openai';
import { CitationTracker, Citation } from './citations';
import { detectDomainHybrid, getResearchSystemPrompt, ExpertDomain, classifyQueryIntent, CASUAL_SYSTEM_PROMPT, FOLLOW_UP_SYSTEM_PROMPT } from './personas';
import { searchWeb, formatWebResultsForContext, isWebSearchAvailable, SearchFocus } from './web-search';

// ============= Types =============

export interface ResearchStep {
  type: 'thinking' | 'tool_call' | 'observation' | 'decision';
  content: string;
  toolName?: string;
  toolArgs?: Record<string, unknown>;
  sources?: Citation[];
}

export interface ResearchResponse {
  status: 'success' | 'error';
  answer: string;
  citations: Citation[];
  researchSteps: ResearchStep[];
  expertDomain: ExpertDomain;
  tools_used: string[];
  iterations: number;
  error?: string;
}

export interface NotionSearchResult {
  id: string;
  title: string;
  category: string;
  snippet: string;
  status?: string;
  priority?: string;
}

// ============= Constants =============

const MAX_RESEARCH_ITERATIONS = 5;
const RESEARCH_MODEL = process.env.RESEARCH_AGENT_MODEL || 'gpt-4o';

// Database IDs from main config
const DATABASE_IDS: Record<string, string> = {
  People: '2f092129-b3db-81b4-b767-fed1e3190303',
  Projects: '2f092129-b3db-81fd-aef1-e62b4f3445ff',
  Ideas: '2f092129-b3db-8121-b140-f7a8f4ec2a45',
  Admin: '2f092129-b3db-8171-ae6c-f98e8124574c',
};

// ============= Tool Definitions =============

const researchTools: OpenAI.ChatCompletionTool[] = [
  {
    type: 'function',
    function: {
      name: 'search_brain',
      description: `Search the user's Second Brain (Notion databases) for items matching a topic.
Use this FIRST before web search - the user's own notes and knowledge are most relevant.
Returns results from People, Projects, Ideas, and Tasks.`,
      parameters: {
        type: 'object',
        properties: {
          query: {
            type: 'string',
            description: 'Search term, topic, or keyword to look for',
          },
          categories: {
            type: 'array',
            items: { type: 'string', enum: ['People', 'Projects', 'Ideas', 'Admin'] },
            description: 'Limit search to specific categories. Omit to search all.',
          },
        },
        required: ['query'],
      },
    },
  },
  {
    type: 'function',
    function: {
      name: 'search_web',
      description: `Search the web for external information.
Use this when:
- Second Brain lacks relevant info
- Question requires current/external knowledge
- Need to verify or expand on brain results`,
      parameters: {
        type: 'object',
        properties: {
          query: {
            type: 'string',
            description: 'Web search query',
          },
          focus: {
            type: 'string',
            enum: ['general', 'news', 'technical', 'research'],
            description: 'Type of search - affects query optimization',
          },
        },
        required: ['query'],
      },
    },
  },
  {
    type: 'function',
    function: {
      name: 'get_item_details',
      description: 'Get full details of a specific Notion item by ID. Use when you need more context about a search result.',
      parameters: {
        type: 'object',
        properties: {
          item_id: {
            type: 'string',
            description: 'The Notion page ID',
          },
        },
        required: ['item_id'],
      },
    },
  },
  {
    type: 'function',
    function: {
      name: 'finalize_research',
      description: `Call this when you have gathered enough information to answer the question.
ALWAYS call this before providing your final answer.`,
      parameters: {
        type: 'object',
        properties: {
          summary: {
            type: 'string',
            description: 'Brief summary of what you found',
          },
          ready_to_answer: {
            type: 'boolean',
            description: 'True if you have enough info, false if you need more research',
          },
          missing_info: {
            type: 'string',
            description: 'What additional info is needed (if ready_to_answer is false)',
          },
        },
        required: ['summary', 'ready_to_answer'],
      },
    },
  },
];

// ============= Notion Helpers =============

async function queryNotionDatabase(databaseId: string): Promise<NotionSearchResult[]> {
  const NOTION_API_KEY = process.env.NOTION_API_KEY;
  if (!NOTION_API_KEY) return [];

  try {
    const response = await fetch(`https://api.notion.com/v1/databases/${databaseId}/query`, {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${NOTION_API_KEY}`,
        'Content-Type': 'application/json',
        'Notion-Version': '2022-06-28',
      },
      body: JSON.stringify({ page_size: 100 }),
    });

    if (!response.ok) return [];

    const data = await response.json();
    return data.results.map((page: Record<string, unknown>) => {
      const props = page.properties as Record<string, unknown>;
      return {
        id: page.id as string,
        title: extractTitle(props),
        category: getCategoryFromDbId(databaseId),
        snippet: extractAllText(props).slice(0, 200),
        status: extractSelect(props, 'Status'),
        priority: extractSelect(props, 'Priority'),
      };
    });
  } catch (error) {
    console.error('Notion query error:', error);
    return [];
  }
}

async function getNotionPage(pageId: string): Promise<Record<string, unknown> | null> {
  const NOTION_API_KEY = process.env.NOTION_API_KEY;
  if (!NOTION_API_KEY) return null;

  try {
    const response = await fetch(`https://api.notion.com/v1/pages/${pageId}`, {
      headers: {
        Authorization: `Bearer ${NOTION_API_KEY}`,
        'Notion-Version': '2022-06-28',
      },
    });

    if (!response.ok) return null;
    return await response.json();
  } catch (error) {
    console.error('Notion page fetch error:', error);
    return null;
  }
}

function extractTitle(properties: Record<string, unknown>): string {
  const titleProps = ['Name', 'Title', 'Task'];
  for (const prop of titleProps) {
    const titleProp = properties[prop] as { title?: Array<{ plain_text: string }> } | undefined;
    if (titleProp?.title?.[0]?.plain_text) {
      return titleProp.title[0].plain_text;
    }
  }
  return 'Untitled';
}

function extractSelect(properties: Record<string, unknown>, field: string): string | undefined {
  const prop = properties[field] as { select?: { name: string } } | undefined;
  return prop?.select?.name;
}

function extractRichText(properties: Record<string, unknown>, field: string): string {
  const prop = properties[field] as { rich_text?: Array<{ plain_text: string }> } | undefined;
  return prop?.rich_text?.map(t => t.plain_text).join('') || '';
}

function extractAllText(properties: Record<string, unknown>): string {
  const texts: string[] = [];
  for (const [, value] of Object.entries(properties)) {
    const prop = value as Record<string, unknown>;
    if (prop.title && Array.isArray(prop.title)) {
      texts.push((prop.title as Array<{ plain_text: string }>).map(t => t.plain_text).join(''));
    }
    if (prop.rich_text && Array.isArray(prop.rich_text)) {
      texts.push((prop.rich_text as Array<{ plain_text: string }>).map(t => t.plain_text).join(''));
    }
    if (prop.select && typeof prop.select === 'object') {
      const select = prop.select as { name?: string };
      if (select.name) texts.push(select.name);
    }
  }
  return texts.join(' ');
}

function getCategoryFromDbId(dbId: string): string {
  for (const [category, id] of Object.entries(DATABASE_IDS)) {
    if (id === dbId) return category;
  }
  return 'Unknown';
}

// ============= Tool Handlers =============

async function handleSearchBrain(
  query: string,
  categories?: string[],
  citationTracker?: CitationTracker
): Promise<{ result: string; citations: Omit<Citation, 'number'>[] }> {
  const queryLower = query.toLowerCase();
  const categoriesToSearch = categories?.length ? categories : ['People', 'Projects', 'Ideas', 'Admin'];
  const allResults: NotionSearchResult[] = [];
  const citations: Omit<Citation, 'number'>[] = [];

  for (const category of categoriesToSearch) {
    const dbId = DATABASE_IDS[category];
    if (!dbId) continue;

    const pages = await queryNotionDatabase(dbId);
    const matches = pages.filter(p => {
      const text = `${p.title} ${p.snippet}`.toLowerCase();
      return text.includes(queryLower);
    });

    for (const match of matches.slice(0, 5)) {
      allResults.push(match);
      citations.push({
        type: 'notion',
        id: match.id,
        title: match.title,
        snippet: match.snippet,
        database: category,
      });
    }
  }

  if (allResults.length === 0) {
    return {
      result: `No results found for "${query}" in Second Brain.`,
      citations: [],
    };
  }

  const resultText = allResults
    .map((r, i) => {
      const marker = citationTracker ? citationTracker.add(citations[i]) : `[${i + 1}]`;
      return `${marker} ${r.title} (${r.category})${r.status ? ` - ${r.status}` : ''}\n   ${r.snippet.slice(0, 100)}...`;
    })
    .join('\n\n');

  return {
    result: `Found ${allResults.length} results in Second Brain:\n\n${resultText}`,
    citations,
  };
}

async function handleSearchWeb(
  query: string,
  focus?: SearchFocus,
  citationTracker?: CitationTracker
): Promise<{ result: string; citations: Omit<Citation, 'number'>[] }> {
  if (!isWebSearchAvailable()) {
    return {
      result: 'Web search is not configured. Only Second Brain search is available.',
      citations: [],
    };
  }

  const { success, results, citations, error } = await searchWeb(query, { maxResults: 5 });

  if (!success || results.length === 0) {
    return {
      result: error || `No web results found for "${query}".`,
      citations: [],
    };
  }

  const resultText = results
    .map((r, i) => {
      const marker = citationTracker ? citationTracker.add(citations[i]) : `[Web ${i + 1}]`;
      return `${marker} ${r.title}\n   ${r.url}\n   ${r.snippet}`;
    })
    .join('\n\n');

  return {
    result: `Found ${results.length} web results:\n\n${resultText}`,
    citations,
  };
}

async function handleGetItemDetails(
  itemId: string,
  citationTracker?: CitationTracker
): Promise<{ result: string; citations: Omit<Citation, 'number'>[] }> {
  const page = await getNotionPage(itemId);

  if (!page) {
    return {
      result: `Could not find item with ID: ${itemId}`,
      citations: [],
    };
  }

  const props = page.properties as Record<string, unknown>;
  const title = extractTitle(props);

  const details: string[] = [`Title: ${title}`];

  // Extract all relevant fields
  const fields = ['Status', 'Priority', 'Company', 'Role', 'Context', 'Notes', 'Next Action', 'Raw Insight', 'One-liner'];
  for (const field of fields) {
    const value = extractRichText(props, field) || extractSelect(props, field);
    if (value) {
      details.push(`${field}: ${value}`);
    }
  }

  const citation: Omit<Citation, 'number'> = {
    type: 'notion',
    id: itemId,
    title,
    snippet: details.join('; ').slice(0, 200),
  };

  if (citationTracker) {
    citationTracker.add(citation);
  }

  return {
    result: details.join('\n'),
    citations: [citation],
  };
}

// ============= Research Loop =============

export async function runResearchLoop(
  query: string,
  conversationHistory: Array<{ role: string; content: string }>,
  openai: OpenAI
): Promise<ResearchResponse> {
  // Check if this is casual, follow-up, or research
  const hasHistory = conversationHistory.length > 0;
  const queryIntent = classifyQueryIntent(query, hasHistory);

  // Handle casual conversation (greetings, thanks, etc.)
  if (queryIntent === 'casual') {
    const casualResponse = await openai.chat.completions.create({
      model: 'gpt-4o-mini',
      temperature: 0.7,
      max_tokens: 300,
      messages: [
        { role: 'system', content: CASUAL_SYSTEM_PROMPT },
        ...conversationHistory.map(m => ({
          role: m.role as 'user' | 'assistant',
          content: m.content,
        })),
        { role: 'user', content: query },
      ],
    });

    return {
      status: 'success',
      answer: casualResponse.choices[0]?.message?.content || "Hey! How can I help you today?",
      citations: [],
      researchSteps: [],
      expertDomain: 'personal' as ExpertDomain,
      tools_used: [],
      iterations: 0,
    };
  }

  // Handle follow-up questions naturally (no research loop)
  if (queryIntent === 'follow_up') {
    // Use recent history for context (last 6 messages to stay focused)
    const recentHistory = conversationHistory.slice(-6);

    const followUpResponse = await openai.chat.completions.create({
      model: 'gpt-4o-mini',
      temperature: 0.7,
      max_tokens: 800,
      messages: [
        { role: 'system', content: FOLLOW_UP_SYSTEM_PROMPT },
        ...recentHistory.map(m => ({
          role: m.role as 'user' | 'assistant',
          content: m.content,
        })),
        { role: 'user', content: query },
      ],
    });

    return {
      status: 'success',
      answer: followUpResponse.choices[0]?.message?.content || "Could you clarify what you'd like me to expand on?",
      citations: [], // Follow-ups don't add new citations
      researchSteps: [],
      expertDomain: 'personal' as ExpertDomain, // Keep it conversational
      tools_used: [],
      iterations: 0,
    };
  }

  const citationTracker = new CitationTracker();
  const researchSteps: ResearchStep[] = [];
  const toolsUsed: Set<string> = new Set();

  // Detect domain and get system prompt
  const domain = await detectDomainHybrid(query, openai);
  const today = new Date().toLocaleDateString();
  const systemPrompt = getResearchSystemPrompt(domain, today);

  // Build initial messages
  const messages: OpenAI.ChatCompletionMessageParam[] = [
    { role: 'system', content: systemPrompt },
    ...conversationHistory.map(m => ({
      role: m.role as 'user' | 'assistant',
      content: m.content,
    })),
    { role: 'user', content: query },
  ];

  let iteration = 0;
  let isComplete = false;

  while (iteration < MAX_RESEARCH_ITERATIONS && !isComplete) {
    iteration++;

    // Call AI to decide next action
    const completion = await openai.chat.completions.create({
      model: RESEARCH_MODEL,
      temperature: 0.3, // Lower temp for more consistent research
      max_tokens: 1500,
      messages,
      tools: researchTools,
      tool_choice: iteration === 1 ? 'required' : 'auto', // Force tool use on first iteration
    });

    const responseMessage = completion.choices[0]?.message;

    // If no tool calls, we're done
    if (!responseMessage?.tool_calls || responseMessage.tool_calls.length === 0) {
      // Final answer
      const finalAnswer = responseMessage?.content || '';

      return {
        status: 'success',
        answer: finalAnswer,
        citations: citationTracker.export(),
        researchSteps,
        expertDomain: domain,
        tools_used: Array.from(toolsUsed),
        iterations: iteration,
      };
    }

    // Process tool calls
    for (const toolCall of responseMessage.tool_calls) {
      if (toolCall.type !== 'function') continue;

      const toolName = toolCall.function.name;
      const args = JSON.parse(toolCall.function.arguments);
      toolsUsed.add(toolName);

      researchSteps.push({
        type: 'tool_call',
        content: `Using ${toolName}: ${JSON.stringify(args)}`,
        toolName,
        toolArgs: args,
      });

      let toolResult: { result: string; citations: Omit<Citation, 'number'>[] };

      switch (toolName) {
        case 'search_brain':
          toolResult = await handleSearchBrain(args.query, args.categories, citationTracker);
          break;
        case 'search_web':
          toolResult = await handleSearchWeb(args.query, args.focus, citationTracker);
          break;
        case 'get_item_details':
          toolResult = await handleGetItemDetails(args.item_id, citationTracker);
          break;
        case 'finalize_research':
          if (args.ready_to_answer) {
            isComplete = true;
          }
          toolResult = {
            result: `Research summary: ${args.summary}. Ready to answer: ${args.ready_to_answer}`,
            citations: [],
          };
          break;
        default:
          toolResult = { result: `Unknown tool: ${toolName}`, citations: [] };
      }

      researchSteps.push({
        type: 'observation',
        content: toolResult.result.slice(0, 500),
        sources: toolResult.citations.map((c, i) => ({ ...c, number: i + 1 })),
      });

      // Add tool response to messages
      messages.push({
        role: 'assistant',
        content: null,
        tool_calls: [toolCall],
      } as OpenAI.ChatCompletionMessageParam);

      messages.push({
        role: 'tool',
        tool_call_id: toolCall.id,
        content: toolResult.result,
      } as OpenAI.ChatCompletionMessageParam);
    }
  }

  // Max iterations reached - generate final answer with what we have
  messages.push({
    role: 'user',
    content: 'Based on all the research gathered, please provide your comprehensive answer now. Remember to cite your sources using [1], [2], etc.',
  });

  const finalCompletion = await openai.chat.completions.create({
    model: RESEARCH_MODEL,
    temperature: 0.5,
    max_tokens: 2000,
    messages,
  });

  const finalAnswer = finalCompletion.choices[0]?.message?.content || 'Unable to generate response.';

  return {
    status: 'success',
    answer: finalAnswer,
    citations: citationTracker.export(),
    researchSteps,
    expertDomain: domain,
    tools_used: Array.from(toolsUsed),
    iterations: iteration,
  };
}

// ============= Exports =============

export { CitationTracker } from './citations';
export { detectDomainHybrid } from './personas';
export type { ExpertDomain } from './personas';
export { searchWeb, isWebSearchAvailable } from './web-search';
