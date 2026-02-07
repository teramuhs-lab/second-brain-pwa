import { NextRequest, NextResponse } from 'next/server';
import OpenAI from 'openai';

const NOTION_API_KEY = process.env.NOTION_API_KEY;
const OPENAI_API_KEY = process.env.OPENAI_API_KEY;

const DATABASE_IDS: Record<string, string> = {
  People: '2f092129-b3db-81b4-b767-fed1e3190303',
  Projects: '2f092129-b3db-81fd-aef1-e62b4f3445ff',
  Ideas: '2f092129-b3db-8121-b140-f7a8f4ec2a45',
  Admin: '2f092129-b3db-8171-ae6c-f98e8124574c',
};

// Chat Sessions database for persistent memory
// Schema: Session ID (title), Messages (rich_text JSON), Last Active (date)
const CHAT_SESSIONS_DB_ID = process.env.NOTION_CHAT_SESSIONS_DB_ID || '';

// Map category to database key
const CATEGORY_TO_DB: Record<string, string> = {
  people: 'People',
  projects: 'Projects',
  ideas: 'Ideas',
  admin: 'Admin',
  tasks: 'Admin',
};

interface NotionPage {
  id: string;
  properties: Record<string, unknown>;
  created_time: string;
  last_edited_time: string;
}

// ============= Helper Functions =============

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

function extractStatus(properties: Record<string, unknown>): string | undefined {
  const statusProp = properties['Status'] as { select?: { name: string } } | undefined;
  return statusProp?.select?.name;
}

function extractPriority(properties: Record<string, unknown>): string | undefined {
  const priorityProp = properties['Priority'] as { select?: { name: string } } | undefined;
  return priorityProp?.select?.name;
}

function extractDate(properties: Record<string, unknown>, field: string): string | undefined {
  const dateProp = properties[field] as { date?: { start: string } } | undefined;
  return dateProp?.date?.start;
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

async function queryDatabase(databaseId: string): Promise<NotionPage[]> {
  const response = await fetch(`https://api.notion.com/v1/databases/${databaseId}/query`, {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${NOTION_API_KEY}`,
      'Content-Type': 'application/json',
      'Notion-Version': '2022-06-28',
    },
    body: JSON.stringify({ page_size: 100 }),
  });

  if (!response.ok) {
    throw new Error(`Notion API error: ${response.status}`);
  }

  const data = await response.json();
  return data.results as NotionPage[];
}

async function getPage(pageId: string): Promise<NotionPage> {
  const response = await fetch(`https://api.notion.com/v1/pages/${pageId}`, {
    headers: {
      Authorization: `Bearer ${NOTION_API_KEY}`,
      'Notion-Version': '2022-06-28',
    },
  });

  if (!response.ok) {
    throw new Error(`Notion API error: ${response.status}`);
  }

  return await response.json();
}

async function createNotionPage(
  databaseId: string,
  properties: Record<string, unknown>
): Promise<NotionPage> {
  const response = await fetch('https://api.notion.com/v1/pages', {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${NOTION_API_KEY}`,
      'Content-Type': 'application/json',
      'Notion-Version': '2022-06-28',
    },
    body: JSON.stringify({
      parent: { database_id: databaseId },
      properties,
    }),
  });

  if (!response.ok) {
    const error = await response.text();
    throw new Error(`Notion create error: ${error}`);
  }

  return await response.json();
}

// ============= Tool Definitions =============

const tools: OpenAI.ChatCompletionTool[] = [
  {
    type: 'function',
    function: {
      name: 'search_brain',
      description: 'Search the Second Brain for items matching a topic, keyword, or name. Use this when the user asks about a topic or wants to find something.',
      parameters: {
        type: 'object',
        properties: {
          query: {
            type: 'string',
            description: 'The search term, topic, or keyword to look for',
          },
          categories: {
            type: 'array',
            items: { type: 'string', enum: ['People', 'Projects', 'Ideas', 'Admin'] },
            description: 'Optional: limit search to specific categories. If not provided, searches all.',
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
      description: 'Get full details of a specific item by its ID. Use this when the user asks for more details about a specific item.',
      parameters: {
        type: 'object',
        properties: {
          item_id: {
            type: 'string',
            description: 'The Notion page ID of the item',
          },
        },
        required: ['item_id'],
      },
    },
  },
  {
    type: 'function',
    function: {
      name: 'create_task',
      description: 'Create a new task in the Second Brain. Use this when the user wants to add a new task or reminder.',
      parameters: {
        type: 'object',
        properties: {
          title: {
            type: 'string',
            description: 'The task title/description',
          },
          priority: {
            type: 'string',
            enum: ['High', 'Medium', 'Low'],
            description: 'Task priority level',
          },
          due_date: {
            type: 'string',
            description: 'Due date in YYYY-MM-DD format',
          },
        },
        required: ['title'],
      },
    },
  },
  {
    type: 'function',
    function: {
      name: 'save_idea',
      description: 'Save an insight, note, or finding as a new Idea in the Second Brain. Use this when the user wants to save something they learned.',
      parameters: {
        type: 'object',
        properties: {
          title: {
            type: 'string',
            description: 'A short title for the idea',
          },
          insight: {
            type: 'string',
            description: 'The full insight or note content',
          },
          category: {
            type: 'string',
            enum: ['Business', 'Tech', 'Life', 'Creative'],
            description: 'Category for the idea',
          },
        },
        required: ['title', 'insight'],
      },
    },
  },
];

// ============= Tool Handlers =============

interface SearchResult {
  id: string;
  title: string;
  status?: string;
  priority?: string;
  due_date?: string;
  snippet: string;
}

async function searchBrain(query: string, categories?: string[]): Promise<string> {
  const results: Record<string, SearchResult[]> = {
    People: [],
    Projects: [],
    Ideas: [],
    Admin: [],
  };

  const queryLower = query.toLowerCase();
  const categoriesToSearch = categories?.length
    ? categories
    : ['People', 'Projects', 'Ideas', 'Admin'];

  for (const category of categoriesToSearch) {
    const dbId = DATABASE_IDS[category];
    if (!dbId) continue;

    try {
      const pages = await queryDatabase(dbId);
      const matches = pages.filter((page) => {
        const text = extractAllText(page.properties).toLowerCase();
        return text.includes(queryLower);
      });

      results[category] = matches.slice(0, 5).map((page) => ({
        id: page.id,
        title: extractTitle(page.properties),
        status: extractStatus(page.properties),
        priority: extractPriority(page.properties),
        due_date: extractDate(page.properties, 'Due Date') || extractDate(page.properties, 'Next Follow-up'),
        snippet: extractAllText(page.properties).slice(0, 150),
      }));
    } catch (error) {
      console.error(`Error searching ${category}:`, error);
    }
  }

  // Count total results
  const totalResults = Object.values(results).reduce((sum, arr) => sum + arr.length, 0);

  if (totalResults === 0) {
    return JSON.stringify({
      found: false,
      message: `No items found matching "${query}" in your Second Brain.`,
      results: {},
    });
  }

  return JSON.stringify({
    found: true,
    total: totalResults,
    results,
  });
}

async function getItemDetails(itemId: string): Promise<string> {
  try {
    const page = await getPage(itemId);
    const props = page.properties;

    const details: Record<string, unknown> = {
      id: page.id,
      title: extractTitle(props),
      status: extractStatus(props),
      priority: extractPriority(props),
      created: page.created_time,
      last_edited: page.last_edited_time,
    };

    // Add type-specific fields
    if (props['Next Action']) {
      details.next_action = extractRichText(props, 'Next Action');
    }
    if (props['Due Date']) {
      details.due_date = extractDate(props, 'Due Date');
    }
    if (props['Next Follow-up']) {
      details.next_followup = extractDate(props, 'Next Follow-up');
    }
    if (props['Notes']) {
      details.notes = extractRichText(props, 'Notes');
    }
    if (props['Context']) {
      details.context = extractRichText(props, 'Context');
    }
    if (props['Raw Insight']) {
      details.raw_insight = extractRichText(props, 'Raw Insight');
    }
    if (props['One-liner']) {
      details.one_liner = extractRichText(props, 'One-liner');
    }
    if (props['Company']) {
      details.company = extractRichText(props, 'Company');
    }
    if (props['Role']) {
      details.role = extractRichText(props, 'Role');
    }

    return JSON.stringify({ success: true, item: details });
  } catch (error) {
    return JSON.stringify({
      success: false,
      error: `Could not find item with ID: ${itemId}`,
    });
  }
}

async function createTask(
  title: string,
  priority?: string,
  dueDate?: string
): Promise<string> {
  try {
    const properties: Record<string, unknown> = {
      Task: {
        title: [{ text: { content: title } }],
      },
      Status: {
        select: { name: 'Todo' },
      },
    };

    if (priority) {
      properties.Priority = { select: { name: priority } };
    }

    if (dueDate) {
      properties['Due Date'] = { date: { start: dueDate } };
    }

    const page = await createNotionPage(DATABASE_IDS.Admin, properties);

    return JSON.stringify({
      success: true,
      message: `Created task: "${title}"`,
      id: page.id,
    });
  } catch (error) {
    return JSON.stringify({
      success: false,
      error: `Failed to create task: ${error instanceof Error ? error.message : 'Unknown error'}`,
    });
  }
}

async function saveIdea(
  title: string,
  insight: string,
  category?: string
): Promise<string> {
  try {
    const properties: Record<string, unknown> = {
      Title: {
        title: [{ text: { content: title } }],
      },
      'Raw Insight': {
        rich_text: [{ text: { content: insight } }],
      },
      Maturity: {
        select: { name: 'Spark' },
      },
    };

    if (category) {
      properties.Category = { select: { name: category } };
    }

    const page = await createNotionPage(DATABASE_IDS.Ideas, properties);

    return JSON.stringify({
      success: true,
      message: `Saved idea: "${title}"`,
      id: page.id,
    });
  } catch (error) {
    return JSON.stringify({
      success: false,
      error: `Failed to save idea: ${error instanceof Error ? error.message : 'Unknown error'}`,
    });
  }
}

async function handleToolCall(
  name: string,
  args: Record<string, unknown>
): Promise<string> {
  switch (name) {
    case 'search_brain':
      return await searchBrain(
        args.query as string,
        args.categories as string[] | undefined
      );
    case 'get_item_details':
      return await getItemDetails(args.item_id as string);
    case 'create_task':
      return await createTask(
        args.title as string,
        args.priority as string | undefined,
        args.due_date as string | undefined
      );
    case 'save_idea':
      return await saveIdea(
        args.title as string,
        args.insight as string,
        args.category as string | undefined
      );
    default:
      return JSON.stringify({ error: `Unknown tool: ${name}` });
  }
}

// ============= System Prompt =============

function getSystemPrompt(): string {
  return `You are a smart assistant for a personal Second Brain knowledge management system.

## Your Capabilities
You have access to these tools:
- **search_brain**: Search for items by topic/keyword across People, Projects, Ideas, and Tasks
- **get_item_details**: Get full details of a specific item
- **create_task**: Create new tasks/reminders
- **save_idea**: Save insights as new Ideas

## Behavior Guidelines
1. When the user asks about a topic, use search_brain to find relevant items
2. Present results clearly organized by category
3. Include item IDs so you can get more details if asked
4. Offer helpful follow-up actions (view details, create related tasks, etc.)
5. For follow-ups like "tell me more", use get_item_details with the item's ID
6. Be conversational and suggest next steps

## Response Format
When showing search results, format them clearly:

📚 **Found in your Second Brain:**

**[Category]:**
• Item title (Status, Priority) [ID: xxx]
  - Key details or snippet

💡 **Suggestions:**
- Relevant follow-up actions

Today's date is ${new Date().toLocaleDateString()}.`;
}

// ============= Conversation History =============

type MessageRole = 'user' | 'assistant' | 'system' | 'tool';

interface ConversationMessage {
  role: MessageRole;
  content: string;
  tool_call_id?: string;
  tool_calls?: OpenAI.ChatCompletionMessageToolCall[];
}

// In-memory cache (fallback if no Notion DB configured)
const conversationHistory = new Map<string, ConversationMessage[]>();

// ============= Notion Conversation Persistence =============

interface ChatSession {
  pageId: string;
  sessionId: string;
  messages: ConversationMessage[];
  lastActive: string;
}

async function loadConversationFromNotion(sessionId: string): Promise<ConversationMessage[] | null> {
  if (!CHAT_SESSIONS_DB_ID) return null;

  try {
    // Query for existing session
    const response = await fetch(`https://api.notion.com/v1/databases/${CHAT_SESSIONS_DB_ID}/query`, {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${NOTION_API_KEY}`,
        'Content-Type': 'application/json',
        'Notion-Version': '2022-06-28',
      },
      body: JSON.stringify({
        filter: {
          property: 'Session ID',
          title: { equals: sessionId },
        },
        page_size: 1,
      }),
    });

    if (!response.ok) return null;

    const data = await response.json();
    if (data.results.length === 0) return null;

    const page = data.results[0];
    const messagesJson = page.properties['Messages']?.rich_text?.[0]?.plain_text;

    if (!messagesJson) return null;

    return JSON.parse(messagesJson) as ConversationMessage[];
  } catch (error) {
    console.error('Error loading conversation from Notion:', error);
    return null;
  }
}

async function saveConversationToNotion(
  sessionId: string,
  messages: ConversationMessage[]
): Promise<void> {
  if (!CHAT_SESSIONS_DB_ID) return;

  // Only save user and assistant messages (skip system and tool for storage efficiency)
  const messagesToSave = messages.filter(m => m.role === 'user' || m.role === 'assistant');
  const messagesJson = JSON.stringify(messagesToSave);

  // Notion rich_text limit is 2000 chars, so we truncate older messages if needed
  const truncatedJson = messagesJson.length > 1900
    ? JSON.stringify(messagesToSave.slice(-10))
    : messagesJson;

  try {
    // Check if session exists
    const queryResponse = await fetch(`https://api.notion.com/v1/databases/${CHAT_SESSIONS_DB_ID}/query`, {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${NOTION_API_KEY}`,
        'Content-Type': 'application/json',
        'Notion-Version': '2022-06-28',
      },
      body: JSON.stringify({
        filter: {
          property: 'Session ID',
          title: { equals: sessionId },
        },
        page_size: 1,
      }),
    });

    const queryData = await queryResponse.json();

    const properties = {
      'Session ID': { title: [{ text: { content: sessionId } }] },
      'Messages': { rich_text: [{ text: { content: truncatedJson } }] },
      'Last Active': { date: { start: new Date().toISOString() } },
    };

    if (queryData.results?.length > 0) {
      // Update existing session
      const pageId = queryData.results[0].id;
      await fetch(`https://api.notion.com/v1/pages/${pageId}`, {
        method: 'PATCH',
        headers: {
          Authorization: `Bearer ${NOTION_API_KEY}`,
          'Content-Type': 'application/json',
          'Notion-Version': '2022-06-28',
        },
        body: JSON.stringify({ properties }),
      });
    } else {
      // Create new session
      await fetch('https://api.notion.com/v1/pages', {
        method: 'POST',
        headers: {
          Authorization: `Bearer ${NOTION_API_KEY}`,
          'Content-Type': 'application/json',
          'Notion-Version': '2022-06-28',
        },
        body: JSON.stringify({
          parent: { database_id: CHAT_SESSIONS_DB_ID },
          properties,
        }),
      });
    }
  } catch (error) {
    console.error('Error saving conversation to Notion:', error);
  }
}

async function deleteConversationFromNotion(sessionId: string): Promise<boolean> {
  if (!CHAT_SESSIONS_DB_ID) return false;

  try {
    // Find the session
    const response = await fetch(`https://api.notion.com/v1/databases/${CHAT_SESSIONS_DB_ID}/query`, {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${NOTION_API_KEY}`,
        'Content-Type': 'application/json',
        'Notion-Version': '2022-06-28',
      },
      body: JSON.stringify({
        filter: {
          property: 'Session ID',
          title: { equals: sessionId },
        },
        page_size: 1,
      }),
    });

    const data = await response.json();
    if (data.results?.length > 0) {
      // Archive the page
      await fetch(`https://api.notion.com/v1/pages/${data.results[0].id}`, {
        method: 'PATCH',
        headers: {
          Authorization: `Bearer ${NOTION_API_KEY}`,
          'Content-Type': 'application/json',
          'Notion-Version': '2022-06-28',
        },
        body: JSON.stringify({ archived: true }),
      });
      return true;
    }
    return false;
  } catch (error) {
    console.error('Error deleting conversation from Notion:', error);
    return false;
  }
}

// ============= Main Handler =============

export async function POST(request: NextRequest) {
  try {
    if (!NOTION_API_KEY || !OPENAI_API_KEY) {
      return NextResponse.json(
        { status: 'error', error: 'API keys not configured' },
        { status: 500 }
      );
    }

    const body = await request.json();
    const { message, session_id } = body;

    if (!message) {
      return NextResponse.json(
        { status: 'error', error: 'Missing message' },
        { status: 400 }
      );
    }

    const sessionId = session_id || 'default';
    const openai = new OpenAI({ apiKey: OPENAI_API_KEY });

    // Load conversation - try Notion first, fall back to in-memory
    let history: ConversationMessage[];
    const notionHistory = await loadConversationFromNotion(sessionId);

    if (notionHistory && notionHistory.length > 0) {
      // Restore from Notion (add system prompt at start)
      history = [{ role: 'system', content: getSystemPrompt() }, ...notionHistory];
      conversationHistory.set(sessionId, history);
    } else if (!conversationHistory.has(sessionId)) {
      // New session
      history = [{ role: 'system', content: getSystemPrompt() }];
      conversationHistory.set(sessionId, history);
    } else {
      history = conversationHistory.get(sessionId)!;
    }

    // Add user message
    history.push({ role: 'user', content: message });

    // Keep history manageable (last 15 messages + system)
    const systemMessage = history[0];
    let recentMessages = history.slice(-15);
    if (recentMessages[0]?.role !== 'system') {
      recentMessages = [systemMessage, ...recentMessages];
    }

    // First API call - may include tool calls
    const completion = await openai.chat.completions.create({
      model: 'gpt-4o-mini',
      temperature: 0.7,
      max_tokens: 800,
      messages: recentMessages as OpenAI.ChatCompletionMessageParam[],
      tools: tools,
      tool_choice: 'auto',
    });

    const responseMessage = completion.choices[0]?.message;
    const toolsUsed: string[] = [];

    // Handle tool calls if present
    if (responseMessage?.tool_calls && responseMessage.tool_calls.length > 0) {
      // Add assistant's tool call message to history
      history.push({
        role: 'assistant',
        content: responseMessage.content || '',
        tool_calls: responseMessage.tool_calls,
      });

      // Execute each tool call
      for (const toolCall of responseMessage.tool_calls) {
        // Handle different tool call types
        if (toolCall.type !== 'function' || !('function' in toolCall)) {
          continue;
        }

        const funcCall = toolCall as { id: string; type: 'function'; function: { name: string; arguments: string } };
        const toolName = funcCall.function.name;
        toolsUsed.push(toolName);

        try {
          const args = JSON.parse(funcCall.function.arguments);
          const result = await handleToolCall(toolName, args);

          // Add tool result to history
          history.push({
            role: 'tool',
            content: result,
            tool_call_id: funcCall.id,
          });
        } catch (error) {
          history.push({
            role: 'tool',
            content: JSON.stringify({ error: 'Tool execution failed' }),
            tool_call_id: funcCall.id,
          });
        }
      }

      // Get final response with tool results
      const updatedMessages = history.slice(-20);
      if (updatedMessages[0]?.role !== 'system') {
        updatedMessages.unshift(systemMessage);
      }

      const finalCompletion = await openai.chat.completions.create({
        model: 'gpt-4o-mini',
        temperature: 0.7,
        max_tokens: 800,
        messages: updatedMessages as OpenAI.ChatCompletionMessageParam[],
      });

      const finalMessage =
        finalCompletion.choices[0]?.message?.content ||
        "I couldn't generate a response.";

      // Store final response
      history.push({ role: 'assistant', content: finalMessage });

      // Save to Notion (async, don't block response)
      saveConversationToNotion(sessionId, history).catch(console.error);

      return NextResponse.json({
        status: 'success',
        response: finalMessage,
        tools_used: toolsUsed,
      });
    }

    // No tool calls - direct response
    const assistantMessage =
      responseMessage?.content || "I couldn't generate a response.";
    history.push({ role: 'assistant', content: assistantMessage });

    // Save to Notion (async, don't block response)
    saveConversationToNotion(sessionId, history).catch(console.error);

    return NextResponse.json({
      status: 'success',
      response: assistantMessage,
      tools_used: toolsUsed,
    });
  } catch (error) {
    console.error('Agent error:', error);
    return NextResponse.json(
      {
        status: 'error',
        error: error instanceof Error ? error.message : 'Unknown error',
      },
      { status: 500 }
    );
  }
}

// DELETE - Clear conversation history
export async function DELETE(request: NextRequest) {
  try {
    const { searchParams } = new URL(request.url);
    const sessionId = searchParams.get('session_id');

    if (!sessionId) {
      return NextResponse.json(
        { status: 'error', error: 'Missing session_id' },
        { status: 400 }
      );
    }

    // Clear in-memory
    conversationHistory.delete(sessionId);

    // Clear from Notion
    await deleteConversationFromNotion(sessionId);

    return NextResponse.json({ status: 'success', message: 'Chat cleared' });
  } catch (error) {
    console.error('Clear chat error:', error);
    return NextResponse.json(
      { status: 'error', error: 'Failed to clear chat' },
      { status: 500 }
    );
  }
}
