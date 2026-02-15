// Research Agent Core - ReAct-style research loop
// Implements: Think → Act → Observe → Repeat → Answer

import OpenAI from 'openai';
import { CitationTracker, Citation } from './citations';
import { detectDomainHybrid, getResearchSystemPrompt, ExpertDomain, classifyQueryIntent, CASUAL_SYSTEM_PROMPT, FOLLOW_UP_SYSTEM_PROMPT } from './personas';
import { searchWeb, isWebSearchAvailable, SearchFocus } from './web-search';
import { researchAgentTools } from '@/lib/agent-tools/definitions';
import { searchBrainEntries, getItemDetailsCore, getRecentActivityCore } from '@/lib/agent-tools/handlers';
import { isGoogleConnected } from '@/services/google/auth';
import { fetchTodaysEvents, fetchTomorrowsEvents, fetchWeekEvents, createCalendarEvent, deleteCalendarEvent } from '@/services/google/calendar';
import { searchEmails as searchGmail, getEmailDetail } from '@/services/google/gmail';
import { fetchTaskLists, fetchTasks } from '@/services/google/tasks';

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

// ============= Constants =============

const MAX_RESEARCH_ITERATIONS = 5;
const RESEARCH_MODEL = process.env.RESEARCH_AGENT_MODEL || 'gpt-4o';

// ============= Tool Handlers =============

type ToolResult = { result: string; citations: Omit<Citation, 'number'>[] };

async function handleSearchBrain(
  query: string,
  categories?: string[],
  citationTracker?: CitationTracker
): Promise<ToolResult> {
  const results = await searchBrainEntries(query, categories);
  const citations: Omit<Citation, 'number'>[] = [];

  if (results.length === 0) {
    return { result: `No results found for "${query}" in Second Brain.`, citations: [] };
  }

  for (const match of results) {
    citations.push({
      type: 'brain',
      id: match.id,
      title: match.title,
      snippet: match.snippet,
      database: match.category,
    });
  }

  const resultText = results
    .map((r, i) => {
      const marker = citationTracker ? citationTracker.add(citations[i]) : `[${i + 1}]`;
      return `${marker} ${r.title} (${r.category})${r.status ? ` - ${r.status}` : ''}\n   ${r.snippet.slice(0, 100)}...`;
    })
    .join('\n\n');

  return {
    result: `Found ${results.length} results in Second Brain:\n\n${resultText}`,
    citations,
  };
}

async function handleSearchWeb(
  query: string,
  focus?: SearchFocus,
  citationTracker?: CitationTracker
): Promise<ToolResult> {
  if (!isWebSearchAvailable()) {
    return { result: 'Web search is not configured. Only Second Brain search is available.', citations: [] };
  }

  const { success, results, citations, error } = await searchWeb(query, { maxResults: 5 });

  if (!success || results.length === 0) {
    return { result: error || `No web results found for "${query}".`, citations: [] };
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
): Promise<ToolResult> {
  const details = await getItemDetailsCore(itemId);

  if (!details) {
    return { result: `Could not find item with ID: ${itemId}`, citations: [] };
  }

  const lines: string[] = [`Title: ${details.title}`];
  if (details.status) lines.push(`Status: ${details.status}`);
  if (details.priority) lines.push(`Priority: ${details.priority}`);
  for (const [field, value] of Object.entries(details.fields)) {
    lines.push(`${field}: ${value}`);
  }

  const citation: Omit<Citation, 'number'> = {
    type: 'brain',
    id: itemId,
    title: details.title,
    snippet: lines.join('; ').slice(0, 200),
  };

  if (citationTracker) {
    citationTracker.add(citation);
  }

  return { result: lines.join('\n'), citations: [citation] };
}

// ============= Google Calendar & Email Handlers =============

function formatMeetingLocation(event: { location?: string; hangoutLink?: string; conferenceData?: { entryPoints?: Array<{ entryPointType: string; uri: string; label?: string }> } }): string {
  if (event.conferenceData?.entryPoints?.length) {
    const video = event.conferenceData.entryPoints.find(ep => ep.entryPointType === 'video');
    if (video) {
      if (/teams\.microsoft\.com/i.test(video.uri)) return 'Teams Meeting';
      if (/zoom\.us/i.test(video.uri)) return 'Zoom Meeting';
      if (/meet\.google\.com/i.test(video.uri)) return 'Google Meet';
      return 'Online Meeting';
    }
  }
  if (event.hangoutLink) return 'Google Meet';

  if (!event.location) return '';
  if (/teams\.microsoft\.com/i.test(event.location)) return 'Teams Meeting';
  if (/zoom\.us/i.test(event.location)) return 'Zoom Meeting';
  if (/meet\.google\.com/i.test(event.location)) return 'Google Meet';
  if (/^https?:\/\//i.test(event.location)) return 'Online Meeting';
  return event.location;
}

async function handleReadCalendar(period: string): Promise<ToolResult> {
  try {
    const connected = await isGoogleConnected();
    if (!connected) {
      return { result: 'Google Calendar is not connected. Connect from Settings.', citations: [] };
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

    if (events.length === 0) {
      return { result: `No events on your calendar ${label}.`, citations: [] };
    }

    const eventList = events.map(e => {
      const time = e.start.dateTime
        ? new Date(e.start.dateTime).toLocaleTimeString('en-US', { hour: 'numeric', minute: '2-digit' })
        : 'All day';
      const endTime = e.end.dateTime
        ? new Date(e.end.dateTime).toLocaleTimeString('en-US', { hour: 'numeric', minute: '2-digit' })
        : '';

      let duration = '';
      if (e.start.dateTime && e.end.dateTime) {
        const mins = (new Date(e.end.dateTime).getTime() - new Date(e.start.dateTime).getTime()) / 60000;
        if (mins < 60) duration = `${mins}m`;
        else if (mins % 60 === 0) duration = `${mins / 60}h`;
        else duration = `${Math.floor(mins / 60)}h ${mins % 60}m`;
      }

      const location = formatMeetingLocation(e);

      return `- **${time}${endTime ? ` – ${endTime}` : ''}** · ${e.summary}${duration ? ` (${duration})` : ''}${location ? ` · ${location}` : ''}${e.calendarName && e.calendarId !== 'primary' ? ` · _${e.calendarName}_` : ''} [id:${e.id}${e.calendarId && e.calendarId !== 'primary' ? `|cal:${e.calendarId}` : ''}]`;
    }).join('\n');

    return { result: `Calendar events ${label} (${events.length}):\n\n${eventList}`, citations: [] };
  } catch (error) {
    return { result: `Failed to fetch calendar: ${error instanceof Error ? error.message : 'Unknown error'}`, citations: [] };
  }
}

async function handleCreateCalendarEvent(
  summary: string, start: string, end: string, description?: string, location?: string
): Promise<ToolResult> {
  try {
    const connected = await isGoogleConnected();
    if (!connected) {
      return { result: 'Google Calendar is not connected. Connect from Settings.', citations: [] };
    }

    const event = await createCalendarEvent({ summary, start, end, description, location });
    return {
      result: `Created event: "${event.summary}" from ${event.start.dateTime || event.start.date} to ${event.end.dateTime || event.end.date}${event.htmlLink ? ` — ${event.htmlLink}` : ''}`,
      citations: [],
    };
  } catch (error) {
    return { result: `Failed to create event: ${error instanceof Error ? error.message : 'Unknown error'}`, citations: [] };
  }
}

async function handleDeleteCalendarEvent(eventId: string, calendarId?: string): Promise<ToolResult> {
  try {
    const connected = await isGoogleConnected();
    if (!connected) {
      return { result: 'Google Calendar is not connected. Connect from Settings.', citations: [] };
    }

    await deleteCalendarEvent(eventId, calendarId || 'primary');
    return { result: `Successfully deleted calendar event (ID: ${eventId}).`, citations: [] };
  } catch (error) {
    return { result: `Failed to delete event: ${error instanceof Error ? error.message : 'Unknown error'}`, citations: [] };
  }
}

async function handleSearchEmails(query: string, maxResults?: number): Promise<ToolResult> {
  try {
    const connected = await isGoogleConnected();
    if (!connected) {
      return { result: 'Gmail is not connected. Connect from Settings.', citations: [] };
    }

    const emails = await searchGmail(query, maxResults || 5);
    if (emails.length === 0) {
      return { result: `No emails found for "${query}".`, citations: [] };
    }

    const emailList = emails.map(e =>
      `- [${e.id}] "${e.subject}" from ${e.from} (${e.date})\n  ${e.snippet}`
    ).join('\n\n');

    return { result: `Found ${emails.length} emails:\n\n${emailList}`, citations: [] };
  } catch (error) {
    return { result: `Failed to search emails: ${error instanceof Error ? error.message : 'Unknown error'}`, citations: [] };
  }
}

async function handleGetEmail(emailId: string): Promise<ToolResult> {
  try {
    const connected = await isGoogleConnected();
    if (!connected) {
      return { result: 'Gmail is not connected.', citations: [] };
    }

    const email = await getEmailDetail(emailId);
    if (!email) {
      return { result: 'Email not found.', citations: [] };
    }

    return {
      result: `Subject: ${email.subject}\nFrom: ${email.from}\nDate: ${email.date}\n\n${email.body?.slice(0, 2000) || '(no body)'}`,
      citations: [],
    };
  } catch (error) {
    return { result: `Failed to fetch email: ${error instanceof Error ? error.message : 'Unknown error'}`, citations: [] };
  }
}

// ============= Google Tasks Handlers =============

async function handleGetTaskLists(): Promise<ToolResult> {
  try {
    const connected = await isGoogleConnected();
    if (!connected) {
      return { result: 'Google is not connected. Connect from Settings.', citations: [] };
    }

    const lists = await fetchTaskLists();
    if (lists.length === 0) {
      return { result: 'No Google Task lists found.', citations: [] };
    }

    const listText = lists
      .map((l) => `- "${l.title}" [id: ${l.id}]`)
      .join('\n');

    return { result: `Google Task lists (${lists.length}):\n\n${listText}`, citations: [] };
  } catch (error) {
    return { result: `Failed to fetch task lists: ${error instanceof Error ? error.message : 'Unknown error'}`, citations: [] };
  }
}

async function handleGetTasks(
  taskListId: string,
  statusFilter?: string,
  maxResults?: number
): Promise<ToolResult> {
  try {
    const connected = await isGoogleConnected();
    if (!connected) {
      return { result: 'Google is not connected. Connect from Settings.', citations: [] };
    }

    const showCompleted = statusFilter === 'completed' || statusFilter === 'all';

    const tasks = await fetchTasks(taskListId, {
      showCompleted,
      maxResults: maxResults || 20,
    });

    let filtered = tasks;
    if (statusFilter === 'pending') {
      filtered = tasks.filter((t) => t.status === 'needsAction');
    } else if (statusFilter === 'completed') {
      filtered = tasks.filter((t) => t.status === 'completed');
    }

    if (filtered.length === 0) {
      return { result: `No tasks found (filter: ${statusFilter || 'pending'}).`, citations: [] };
    }

    const taskList = filtered
      .map((t) => {
        const status = t.status === 'needsAction' ? '[ ]' : '[x]';
        const due = t.due ? ` (due: ${new Date(t.due).toLocaleDateString()})` : '';
        const notes = t.notes ? `\n    ${t.notes.slice(0, 100)}` : '';
        return `- ${status} ${t.title}${due}${notes}`;
      })
      .join('\n');

    return {
      result: `Tasks (${filtered.length}, filter: ${statusFilter || 'pending'}):\n\n${taskList}`,
      citations: [],
    };
  } catch (error) {
    return { result: `Failed to fetch tasks: ${error instanceof Error ? error.message : 'Unknown error'}`, citations: [] };
  }
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
      citations: [],
      researchSteps: [],
      expertDomain: 'personal' as ExpertDomain,
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

    const completion = await openai.chat.completions.create({
      model: RESEARCH_MODEL,
      temperature: 0.3,
      max_tokens: 1500,
      messages,
      tools: researchAgentTools,
      tool_choice: iteration === 1 ? 'required' : 'auto',
    });

    const responseMessage = completion.choices[0]?.message;

    if (!responseMessage?.tool_calls || responseMessage.tool_calls.length === 0) {
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

      let toolResult: ToolResult;

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
          if (args.ready_to_answer) isComplete = true;
          toolResult = {
            result: `Research summary: ${args.summary}. Ready to answer: ${args.ready_to_answer}`,
            citations: [],
          };
          break;
        case 'read_calendar':
          toolResult = await handleReadCalendar(args.period);
          break;
        case 'create_calendar_event':
          toolResult = await handleCreateCalendarEvent(args.summary, args.start, args.end, args.description, args.location);
          break;
        case 'search_emails':
          toolResult = await handleSearchEmails(args.query, args.max_results);
          break;
        case 'get_email':
          toolResult = await handleGetEmail(args.email_id);
          break;
        case 'delete_calendar_event':
          toolResult = await handleDeleteCalendarEvent(args.event_id, args.calendar_id);
          break;
        case 'get_task_lists':
          toolResult = await handleGetTaskLists();
          break;
        case 'get_tasks':
          toolResult = await handleGetTasks(args.task_list_id, args.status_filter, args.max_results);
          break;
        case 'get_recent_activity': {
          const validPeriod = (['today', 'this_week', 'this_month'] as const).includes(args.period)
            ? args.period : 'this_week';
          const activity = await getRecentActivityCore(validPeriod, args.action_filter);
          const lines: string[] = [`Activity (${validPeriod}): ${activity.totalActions} actions`];
          for (const [action, count] of Object.entries(activity.summary)) {
            lines.push(`  ${action}: ${count}`);
          }
          if (activity.recentActions.length > 0) {
            lines.push('\nRecent:');
            for (const a of activity.recentActions.slice(0, 10)) {
              lines.push(`- ${a.action}${a.title ? `: ${a.title}` : ''}${a.category ? ` (${a.category})` : ''}`);
            }
          }
          toolResult = { result: lines.join('\n'), citations: [] };
          break;
        }
        default:
          toolResult = { result: `Unknown tool: ${toolName}`, citations: [] };
      }

      researchSteps.push({
        type: 'observation',
        content: toolResult.result.slice(0, 500),
        sources: toolResult.citations.map((c, i) => ({ ...c, number: i + 1 })),
      });

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

  // Max iterations reached - generate final answer
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
