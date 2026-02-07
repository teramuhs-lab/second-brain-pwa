import { NextRequest, NextResponse } from 'next/server';
import OpenAI from 'openai';

const NOTION_API_KEY = process.env.NOTION_API_KEY;
const OPENAI_API_KEY = process.env.OPENAI_API_KEY;

const DATABASE_IDS = {
  People: '2f092129-b3db-81b4-b767-fed1e3190303',
  Projects: '2f092129-b3db-81fd-aef1-e62b4f3445ff',
  Ideas: '2f092129-b3db-8121-b140-f7a8f4ec2a45',
  Admin: '2f092129-b3db-8171-ae6c-f98e8124574c',
};

interface NotionPage {
  id: string;
  properties: Record<string, unknown>;
  created_time: string;
  last_edited_time: string;
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

function extractText(properties: Record<string, unknown>): string {
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

async function queryDatabase(databaseId: string, filter?: object): Promise<NotionPage[]> {
  const response = await fetch(`https://api.notion.com/v1/databases/${databaseId}/query`, {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${NOTION_API_KEY}`,
      'Content-Type': 'application/json',
      'Notion-Version': '2022-06-28',
    },
    body: JSON.stringify({
      page_size: 50,
      ...(filter && { filter }),
    }),
  });

  if (!response.ok) {
    throw new Error(`Notion API error: ${response.status}`);
  }

  const data = await response.json();
  return data.results as NotionPage[];
}

async function gatherContext(): Promise<string> {
  const [people, projects, ideas, admin] = await Promise.all([
    queryDatabase(DATABASE_IDS.People),
    queryDatabase(DATABASE_IDS.Projects),
    queryDatabase(DATABASE_IDS.Ideas),
    queryDatabase(DATABASE_IDS.Admin),
  ]);

  let context = '# Your Second Brain Contents\n\n';

  // People
  context += '## People\n';
  for (const page of people.slice(0, 15)) {
    const name = extractTitle(page.properties);
    const status = extractStatus(page.properties);
    const notes = extractText(page.properties);
    context += `- **${name}** (${status || 'No status'}): ${notes.slice(0, 100)}\n`;
  }

  // Projects
  context += '\n## Projects\n';
  for (const page of projects.slice(0, 15)) {
    const name = extractTitle(page.properties);
    const status = extractStatus(page.properties);
    const priority = extractPriority(page.properties);
    const dueDate = extractDate(page.properties, 'Due Date');
    context += `- **${name}** [${status || 'No status'}]${priority ? ` (${priority})` : ''}${dueDate ? ` Due: ${dueDate}` : ''}\n`;
  }

  // Admin Tasks
  context += '\n## Tasks\n';
  for (const page of admin.slice(0, 20)) {
    const task = extractTitle(page.properties);
    const status = extractStatus(page.properties);
    const priority = extractPriority(page.properties);
    const dueDate = extractDate(page.properties, 'Due Date');
    context += `- **${task}** [${status || 'Todo'}]${priority ? ` (${priority})` : ''}${dueDate ? ` Due: ${dueDate}` : ''}\n`;
  }

  // Ideas
  context += '\n## Ideas\n';
  for (const page of ideas.slice(0, 10)) {
    const title = extractTitle(page.properties);
    const insight = extractText(page.properties);
    context += `- **${title}**: ${insight.slice(0, 150)}\n`;
  }

  return context;
}

// Store conversation history per session
const conversationHistory = new Map<string, Array<{ role: 'user' | 'assistant' | 'system'; content: string }>>();

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

    // Get or create conversation history
    if (!conversationHistory.has(sessionId)) {
      // Gather context from Notion
      const context = await gatherContext();

      conversationHistory.set(sessionId, [
        {
          role: 'system',
          content: `You are a helpful AI assistant for a personal "Second Brain" knowledge management system. You have access to the user's data from their Notion workspace including:
- People (contacts and relationships)
- Projects (ongoing work)
- Tasks (to-do items)
- Ideas (insights and learnings)

Here is the current state of their Second Brain:

${context}

When answering questions:
1. Be concise and helpful
2. Reference specific items from their data when relevant
3. Suggest actions they might take
4. If you don't find relevant information, say so
5. For follow-up questions, suggest searching for specific topics

Today's date is ${new Date().toLocaleDateString()}.`,
        },
      ]);
    }

    const history = conversationHistory.get(sessionId)!;

    // Add user message
    history.push({ role: 'user', content: message });

    // Keep history manageable (last 10 messages + system)
    const systemMessage = history[0];
    const recentMessages = history.slice(-10);
    if (recentMessages[0]?.role !== 'system') {
      recentMessages.unshift(systemMessage);
    }

    // Call OpenAI
    const completion = await openai.chat.completions.create({
      model: 'gpt-4o-mini',
      temperature: 0.7,
      max_tokens: 500,
      messages: recentMessages,
    });

    const assistantMessage = completion.choices[0]?.message?.content || 'I couldn\'t generate a response.';

    // Store assistant response
    history.push({ role: 'assistant', content: assistantMessage });

    return NextResponse.json({
      status: 'success',
      response: assistantMessage,
      tools_used: ['notion_query'],
    });
  } catch (error) {
    console.error('Agent error:', error);
    return NextResponse.json(
      { status: 'error', error: error instanceof Error ? error.message : 'Unknown error' },
      { status: 500 }
    );
  }
}
