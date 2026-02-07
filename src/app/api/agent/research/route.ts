// Research Agent API Endpoint
// Provides deep research capabilities with citations and reasoning transparency

import { NextRequest, NextResponse } from 'next/server';
import OpenAI from 'openai';
import { runResearchLoop, ResearchResponse } from '@/lib/research-agent';
import { Citation } from '@/lib/research-agent/citations';

const OPENAI_API_KEY = process.env.OPENAI_API_KEY;
const NOTION_API_KEY = process.env.NOTION_API_KEY;

// Chat Sessions database for persistent memory
const CHAT_SESSIONS_DB_ID = process.env.NOTION_CHAT_SESSIONS_DB_ID || '';

// In-memory conversation cache
const conversationHistory = new Map<string, Array<{ role: string; content: string }>>();

// ============= Notion Conversation Persistence =============

async function loadConversationFromNotion(sessionId: string): Promise<Array<{ role: string; content: string }> | null> {
  if (!CHAT_SESSIONS_DB_ID || !NOTION_API_KEY) return null;

  try {
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

    return JSON.parse(messagesJson);
  } catch (error) {
    console.error('Error loading conversation from Notion:', error);
    return null;
  }
}

async function saveConversationToNotion(
  sessionId: string,
  messages: Array<{ role: string; content: string }>
): Promise<void> {
  if (!CHAT_SESSIONS_DB_ID || !NOTION_API_KEY) return;

  // Only save user and assistant messages
  const messagesToSave = messages.filter(m => m.role === 'user' || m.role === 'assistant');
  const messagesJson = JSON.stringify(messagesToSave);

  // Truncate to fit Notion's 2000 char limit
  const truncatedJson = messagesJson.length > 1900
    ? JSON.stringify(messagesToSave.slice(-10))
    : messagesJson;

  try {
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
      await fetch(`https://api.notion.com/v1/pages/${queryData.results[0].id}`, {
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

// ============= API Response Types =============

interface ResearchAPIResponse {
  status: 'success' | 'error';
  response: string;
  citations: Citation[];
  research_steps: Array<{
    type: string;
    content: string;
    tool?: string;
  }>;
  expert_domain: string;
  tools_used: string[];
  iterations: number;
  error?: string;
}

// ============= Main Handler =============

export async function POST(request: NextRequest): Promise<NextResponse<ResearchAPIResponse>> {
  try {
    if (!OPENAI_API_KEY) {
      return NextResponse.json(
        {
          status: 'error',
          error: 'OpenAI API key not configured',
          response: '',
          citations: [],
          research_steps: [],
          expert_domain: '',
          tools_used: [],
          iterations: 0,
        },
        { status: 500 }
      );
    }

    const body = await request.json();
    const { message, session_id } = body;

    if (!message) {
      return NextResponse.json(
        {
          status: 'error',
          error: 'Missing message',
          response: '',
          citations: [],
          research_steps: [],
          expert_domain: '',
          tools_used: [],
          iterations: 0,
        },
        { status: 400 }
      );
    }

    const sessionId = session_id || 'default-research';
    const openai = new OpenAI({ apiKey: OPENAI_API_KEY });

    // Load conversation history
    let history: Array<{ role: string; content: string }>;

    // Try Notion first
    const notionHistory = await loadConversationFromNotion(sessionId);
    if (notionHistory && notionHistory.length > 0) {
      history = notionHistory;
      conversationHistory.set(sessionId, history);
    } else if (conversationHistory.has(sessionId)) {
      history = conversationHistory.get(sessionId)!;
    } else {
      history = [];
      conversationHistory.set(sessionId, history);
    }

    // Run research loop
    const result: ResearchResponse = await runResearchLoop(message, history, openai);

    // Update history with new exchange
    history.push({ role: 'user', content: message });
    history.push({ role: 'assistant', content: result.answer });

    // Keep history manageable
    if (history.length > 20) {
      history = history.slice(-20);
    }

    conversationHistory.set(sessionId, history);

    // Save to Notion asynchronously
    saveConversationToNotion(sessionId, history).catch(console.error);

    // Format response
    const response: ResearchAPIResponse = {
      status: 'success',
      response: result.answer,
      citations: result.citations,
      research_steps: result.researchSteps.map(step => ({
        type: step.type,
        content: step.content,
        tool: step.toolName,
      })),
      expert_domain: result.expertDomain,
      tools_used: result.tools_used,
      iterations: result.iterations,
    };

    return NextResponse.json(response);
  } catch (error) {
    console.error('Research agent error:', error);
    const errorMessage = error instanceof Error ? error.message : 'Unknown error';

    return NextResponse.json(
      {
        status: 'error',
        error: errorMessage,
        response: '',
        citations: [],
        research_steps: [],
        expert_domain: '',
        tools_used: [],
        iterations: 0,
      },
      { status: 500 }
    );
  }
}

// ============= DELETE Handler =============

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

    return NextResponse.json({ status: 'success', message: 'Research session cleared' });
  } catch (error) {
    console.error('Clear research session error:', error);
    return NextResponse.json(
      { status: 'error', error: 'Failed to clear session' },
      { status: 500 }
    );
  }
}
