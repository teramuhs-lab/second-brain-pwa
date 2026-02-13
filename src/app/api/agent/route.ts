import { NextRequest, NextResponse } from 'next/server';
import OpenAI from 'openai';
import { createEntry } from '@/services/db/entries';
import { agentTools } from '@/lib/agent-tools/definitions';
import { searchBrainEntries, getItemDetailsCore } from '@/lib/agent-tools/handlers';
import { isGoogleConnected } from '@/services/google/auth';
import { fetchTodaysEvents, fetchTomorrowsEvents, fetchWeekEvents, createCalendarEvent, deleteCalendarEvent } from '@/services/google/calendar';
import { searchEmails as searchGmail, getEmailDetail } from '@/services/google/gmail';
import { eq } from 'drizzle-orm';
import { db } from '@/db';
import { chatSessions } from '@/db/schema';

const OPENAI_API_KEY = process.env.OPENAI_API_KEY;

// ============= Tool Handlers =============

async function searchBrain(query: string, categories?: string[]): Promise<string> {
  const results = await searchBrainEntries(query, categories);

  if (results.length === 0) {
    return JSON.stringify({
      found: false,
      message: `No items found matching "${query}" in your Second Brain.`,
      results: {},
    });
  }

  // Group by category for the agent's structured response
  const grouped: Record<string, typeof results> = {};
  for (const r of results) {
    if (!grouped[r.category]) grouped[r.category] = [];
    grouped[r.category].push(r);
  }

  return JSON.stringify({
    found: true,
    total: results.length,
    results: grouped,
  });
}

async function getItemDetails(itemId: string): Promise<string> {
  const details = await getItemDetailsCore(itemId);

  if (!details) {
    return JSON.stringify({
      success: false,
      error: `Could not find item with ID: ${itemId}`,
    });
  }

  return JSON.stringify({
    success: true,
    item: {
      id: details.id,
      title: details.title,
      status: details.status,
      priority: details.priority,
      created: details.created,
      last_edited: details.lastEdited,
      ...details.fields,
    },
  });
}

async function createTask(
  title: string,
  priority?: string,
  dueDate?: string
): Promise<string> {
  try {
    const entry = await createEntry({
      category: 'Admin',
      title,
      priority: priority || undefined,
      dueDate: dueDate || undefined,
    });

    return JSON.stringify({
      success: true,
      message: `Created task: "${title}"`,
      id: entry.notionId || entry.id,
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
    const content: Record<string, unknown> = {
      rawInsight: insight,
    };
    if (category) {
      content.ideaCategory = category;
    }

    const entry = await createEntry({
      category: 'Idea',
      title,
      content,
    });

    return JSON.stringify({
      success: true,
      message: `Saved idea: "${title}"`,
      id: entry.notionId || entry.id,
    });
  } catch (error) {
    return JSON.stringify({
      success: false,
      error: `Failed to save idea: ${error instanceof Error ? error.message : 'Unknown error'}`,
    });
  }
}

async function readCalendar(period: string): Promise<string> {
  try {
    const connected = await isGoogleConnected();
    if (!connected) {
      return JSON.stringify({
        success: false,
        error: 'Google Calendar is not connected. The user needs to connect Google from the Digest page.',
      });
    }

    let events;
    let label: string;
    switch (period) {
      case 'tomorrow':
        events = await fetchTomorrowsEvents();
        label = 'tomorrow';
        break;
      case 'this_week':
        events = await fetchWeekEvents();
        label = 'this week';
        break;
      default:
        events = await fetchTodaysEvents();
        label = 'today';
    }

    return JSON.stringify({
      success: true,
      period: label,
      count: events.length,
      events: events.map((e) => ({
        summary: e.summary,
        start: e.start.dateTime || e.start.date,
        end: e.end.dateTime || e.end.date,
        location: e.location,
        allDay: !!e.start.date,
      })),
    });
  } catch (error) {
    return JSON.stringify({
      success: false,
      error: `Failed to fetch calendar: ${error instanceof Error ? error.message : 'Unknown error'}`,
    });
  }
}

async function createCalendarEventTool(
  summary: string,
  start: string,
  end: string,
  description?: string,
  location?: string
): Promise<string> {
  try {
    const connected = await isGoogleConnected();
    if (!connected) {
      return JSON.stringify({
        success: false,
        error: 'Google Calendar is not connected. Connect from Settings.',
      });
    }

    const event = await createCalendarEvent({ summary, start, end, description, location });

    return JSON.stringify({
      success: true,
      event: {
        id: event.id,
        summary: event.summary,
        start: event.start.dateTime || event.start.date,
        end: event.end.dateTime || event.end.date,
        htmlLink: event.htmlLink,
      },
    });
  } catch (error) {
    return JSON.stringify({
      success: false,
      error: `Failed to create event: ${error instanceof Error ? error.message : 'Unknown error'}`,
    });
  }
}

async function deleteCalendarEventTool(eventId: string, calendarId?: string): Promise<string> {
  try {
    const connected = await isGoogleConnected();
    if (!connected) {
      return JSON.stringify({
        success: false,
        error: 'Google Calendar is not connected. Connect from Settings.',
      });
    }

    await deleteCalendarEvent(eventId, calendarId || 'primary');
    return JSON.stringify({ success: true, message: `Event deleted successfully.` });
  } catch (error) {
    return JSON.stringify({
      success: false,
      error: `Failed to delete event: ${error instanceof Error ? error.message : 'Unknown error'}`,
    });
  }
}

async function searchEmailsTool(query: string, maxResults?: number): Promise<string> {
  try {
    const connected = await isGoogleConnected();
    if (!connected) {
      return JSON.stringify({
        success: false,
        error: 'Gmail is not connected. The user needs to connect Google from the Digest page.',
      });
    }

    const emails = await searchGmail(query, maxResults || 5);

    return JSON.stringify({
      success: true,
      query,
      count: emails.length,
      emails: emails.map((e) => ({
        id: e.id,
        subject: e.subject,
        from: e.from,
        date: e.date,
        snippet: e.snippet,
      })),
    });
  } catch (error) {
    return JSON.stringify({
      success: false,
      error: `Failed to search emails: ${error instanceof Error ? error.message : 'Unknown error'}`,
    });
  }
}

async function getEmailTool(emailId: string): Promise<string> {
  try {
    const connected = await isGoogleConnected();
    if (!connected) {
      return JSON.stringify({ success: false, error: 'Gmail is not connected.' });
    }

    const email = await getEmailDetail(emailId);
    if (!email) {
      return JSON.stringify({ success: false, error: 'Email not found' });
    }

    return JSON.stringify({
      success: true,
      email: {
        subject: email.subject,
        from: email.from,
        date: email.date,
        body: email.body?.slice(0, 2000),
      },
    });
  } catch (error) {
    return JSON.stringify({
      success: false,
      error: `Failed to fetch email: ${error instanceof Error ? error.message : 'Unknown error'}`,
    });
  }
}

async function handleToolCall(
  name: string,
  args: Record<string, unknown>
): Promise<string> {
  switch (name) {
    case 'search_brain':
      return await searchBrain(args.query as string, args.categories as string[] | undefined);
    case 'get_item_details':
      return await getItemDetails(args.item_id as string);
    case 'create_task':
      return await createTask(args.title as string, args.priority as string | undefined, args.due_date as string | undefined);
    case 'save_idea':
      return await saveIdea(args.title as string, args.insight as string, args.category as string | undefined);
    case 'read_calendar':
      return await readCalendar(args.period as string);
    case 'create_calendar_event':
      return await createCalendarEventTool(args.summary as string, args.start as string, args.end as string, args.description as string | undefined, args.location as string | undefined);
    case 'search_emails':
      return await searchEmailsTool(args.query as string, args.max_results as number | undefined);
    case 'get_email':
      return await getEmailTool(args.email_id as string);
    case 'delete_calendar_event':
      return await deleteCalendarEventTool(args.event_id as string, args.calendar_id as string | undefined);
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
- **read_calendar**: Check Google Calendar events for today, tomorrow, or this week
- **create_calendar_event**: Schedule a new calendar event (always check availability first with read_calendar)
- **delete_calendar_event**: Delete/remove a calendar event by ID (use read_calendar first to find the event)
- **search_emails**: Search Gmail by sender, subject, date, or keywords
- **get_email**: Read full email content by ID (use after search_emails)

## Behavior Guidelines
1. **Route queries to the right tool:**
   - Calendar, schedule, meetings, availability, "what's on my calendar" → use **read_calendar**
   - Email, messages, inbox, "emails from..." → use **search_emails**
   - Schedule/create a meeting or event → use **read_calendar** first (check availability), then **create_calendar_event**
   - Remove/delete/cancel an event → use **read_calendar** first (find the event ID), then **delete_calendar_event**
   - Everything else (people, projects, ideas, tasks, topics, keywords) → use **search_brain**
2. Present results clearly organized by category
3. Include item IDs so you can get more details if asked
4. Offer helpful follow-up actions (view details, create related tasks, etc.)
5. For follow-ups like "tell me more", use get_item_details with the item's ID
6. Be conversational and suggest next steps
7. When asked to schedule a meeting, ALWAYS check availability first with read_calendar, then create the event with create_calendar_event. Confirm the details before creating.

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

const conversationHistory = new Map<string, ConversationMessage[]>();

// ============= Neon Conversation Persistence =============

async function loadConversationFromDB(sessionId: string): Promise<ConversationMessage[] | null> {
  try {
    const [session] = await db
      .select()
      .from(chatSessions)
      .where(eq(chatSessions.sessionId, sessionId))
      .limit(1);

    if (!session?.messages || !Array.isArray(session.messages)) return null;

    return session.messages as ConversationMessage[];
  } catch (error) {
    console.error('Error loading conversation from DB:', error);
    return null;
  }
}

async function saveConversationToDB(
  sessionId: string,
  messages: ConversationMessage[]
): Promise<void> {
  const messagesToSave = messages
    .filter(m => m.role === 'user' || m.role === 'assistant')
    .map(m => ({ role: m.role, content: m.content })) // Strip tool_calls to avoid broken history on reload
    .slice(-20); // Keep last 20 messages

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

async function deleteConversationFromDB(sessionId: string): Promise<boolean> {
  try {
    await db
      .delete(chatSessions)
      .where(eq(chatSessions.sessionId, sessionId));
    return true;
  } catch (error) {
    console.error('Error deleting conversation from DB:', error);
    return false;
  }
}

// ============= Main Handler =============

export async function POST(request: NextRequest) {
  try {
    if (!OPENAI_API_KEY) {
      return NextResponse.json(
        { status: 'error', error: 'OPENAI_API_KEY not configured' },
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

    // Load conversation - try Neon first, fall back to in-memory
    let history: ConversationMessage[];
    let dbHistory: ConversationMessage[] | null = null;
    try {
      dbHistory = await loadConversationFromDB(sessionId);
    } catch (dbError) {
      console.error('Failed to load from DB, using in-memory:', dbError);
    }

    if (dbHistory && dbHistory.length > 0) {
      history = [{ role: 'system', content: getSystemPrompt() }, ...dbHistory];
      conversationHistory.set(sessionId, history);
    } else if (!conversationHistory.has(sessionId)) {
      history = [{ role: 'system', content: getSystemPrompt() }];
      conversationHistory.set(sessionId, history);
    } else {
      history = conversationHistory.get(sessionId)!;
    }

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
      tools: agentTools,
      tool_choice: 'auto',
    });

    const responseMessage = completion.choices[0]?.message;
    const toolsUsed: string[] = [];

    // Handle tool calls if present
    if (responseMessage?.tool_calls && responseMessage.tool_calls.length > 0) {
      history.push({
        role: 'assistant',
        content: responseMessage.content || '',
        tool_calls: responseMessage.tool_calls,
      });

      for (const toolCall of responseMessage.tool_calls) {
        if (toolCall.type !== 'function' || !('function' in toolCall)) continue;

        const funcCall = toolCall as { id: string; type: 'function'; function: { name: string; arguments: string } };
        const toolName = funcCall.function.name;
        toolsUsed.push(toolName);

        try {
          const args = JSON.parse(funcCall.function.arguments);
          const result = await handleToolCall(toolName, args);

          history.push({
            role: 'tool',
            content: result,
            tool_call_id: funcCall.id,
          });
        } catch {
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

      history.push({ role: 'assistant', content: finalMessage });
      saveConversationToDB(sessionId, history).catch(console.error);

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
    saveConversationToDB(sessionId, history).catch(console.error);

    return NextResponse.json({
      status: 'success',
      response: assistantMessage,
      tools_used: toolsUsed,
    });
  } catch (error) {
    console.error('Agent error:', error);
    const errorMessage = error instanceof Error ? error.message : 'Unknown error';
    const errorStack = error instanceof Error ? error.stack : undefined;
    console.error('Full error details:', { message: errorMessage, stack: errorStack });
    return NextResponse.json(
      {
        status: 'error',
        error: errorMessage,
        details: process.env.NODE_ENV === 'development' ? errorStack : undefined,
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

    conversationHistory.delete(sessionId);
    await deleteConversationFromDB(sessionId);

    return NextResponse.json({ status: 'success', message: 'Chat cleared' });
  } catch (error) {
    console.error('Clear chat error:', error);
    return NextResponse.json(
      { status: 'error', error: 'Failed to clear chat' },
      { status: 500 }
    );
  }
}
