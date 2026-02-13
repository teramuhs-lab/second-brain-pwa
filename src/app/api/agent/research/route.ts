// Research Agent API Endpoint
// Provides deep research capabilities with citations and reasoning transparency

import { NextRequest, NextResponse } from 'next/server';
import OpenAI from 'openai';
import { runResearchLoop, ResearchResponse } from '@/lib/research-agent';
import { Citation } from '@/lib/research-agent/citations';
import { eq } from 'drizzle-orm';
import { db } from '@/db';
import { chatSessions } from '@/db/schema';

const OPENAI_API_KEY = process.env.OPENAI_API_KEY;

// In-memory conversation cache
const conversationHistory = new Map<string, Array<{ role: string; content: string }>>();

// ============= Neon Conversation Persistence =============

async function loadConversationFromDB(sessionId: string): Promise<Array<{ role: string; content: string }> | null> {
  try {
    const [session] = await db
      .select()
      .from(chatSessions)
      .where(eq(chatSessions.sessionId, sessionId))
      .limit(1);

    if (!session?.messages || !Array.isArray(session.messages)) return null;

    return session.messages as Array<{ role: string; content: string }>;
  } catch (error) {
    console.error('Error loading conversation from DB:', error);
    return null;
  }
}

async function saveConversationToDB(
  sessionId: string,
  messages: Array<{ role: string; content: string }>
): Promise<void> {
  const messagesToSave = messages
    .filter(m => m.role === 'user' || m.role === 'assistant')
    .slice(-20);

  try {
    await db
      .insert(chatSessions)
      .values({
        sessionId,
        messages: messagesToSave,
        lastActive: new Date(),
      })
      .onConflictDoUpdate({
        target: chatSessions.sessionId,
        set: {
          messages: messagesToSave,
          lastActive: new Date(),
        },
      });
  } catch (error) {
    console.error('Error saving conversation to DB:', error);
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

    // Load conversation history from Neon, fall back to in-memory
    let history: Array<{ role: string; content: string }>;

    const dbHistory = await loadConversationFromDB(sessionId);
    if (dbHistory && dbHistory.length > 0) {
      history = dbHistory;
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

    // Save to Neon asynchronously
    saveConversationToDB(sessionId, history).catch(console.error);

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

    // Clear in-memory and DB
    conversationHistory.delete(sessionId);
    await db.delete(chatSessions).where(eq(chatSessions.sessionId, sessionId));

    return NextResponse.json({ status: 'success', message: 'Research session cleared' });
  } catch (error) {
    console.error('Clear research session error:', error);
    return NextResponse.json(
      { status: 'error', error: 'Failed to clear session' },
      { status: 500 }
    );
  }
}
