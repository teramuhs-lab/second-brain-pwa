import { NextRequest, NextResponse } from 'next/server';
import OpenAI from 'openai';
import { isGoogleConnected } from '@/services/google/auth';
import { fetchTodaysEvents } from '@/services/google/calendar';
import type { CalendarEvent } from '@/services/google/types';
import { DATABASE_IDS } from '@/config/constants';
import { queryDatabase, type NotionPage } from '@/services/notion/client';
import { extractTitle, extractSelect, extractDate, extractRichText } from '@/services/notion/helpers';

const OPENAI_API_KEY = process.env.OPENAI_API_KEY;

interface DigestItem {
  id: string;
  title: string;
  status?: string;
  priority?: string;
  dueDate?: string;
  nextAction?: string;
  company?: string;
  category?: string;
}

// Fetch calendar events safely (never throws)
async function fetchCalendarOrEmpty(): Promise<CalendarEvent[]> {
  try {
    if (!(await isGoogleConnected())) return [];
    return await fetchTodaysEvents();
  } catch {
    return [];
  }
}

async function fetchDailyData(): Promise<{
  projects: DigestItem[];
  tasks: DigestItem[];
  followups: DigestItem[];
  calendarEvents: CalendarEvent[];
}> {
  const [projectPages, adminPages, peoplePages, calendarEvents] = await Promise.all([
    queryDatabase(DATABASE_IDS.Projects, undefined, [{ property: 'Priority', direction: 'ascending' }]),
    queryDatabase(DATABASE_IDS.Admin, undefined, [{ property: 'Priority', direction: 'ascending' }]),
    queryDatabase(DATABASE_IDS.People),
    fetchCalendarOrEmpty(),
  ]);

  // Filter projects: Status = 'Active'
  const projects: DigestItem[] = projectPages
    .filter((page) => extractSelect(page.properties, 'Status')?.toLowerCase() === 'active')
    .map((page) => ({
      id: page.id,
      title: extractTitle(page.properties),
      status: extractSelect(page.properties, 'Status'),
      priority: extractSelect(page.properties, 'Priority'),
      dueDate: extractDate(page.properties, 'Due Date'),
      nextAction: extractRichText(page.properties, 'Next Action') || undefined,
    }));

  // Filter admin: Status = 'Todo'
  const tasks: DigestItem[] = adminPages
    .filter((page) => extractSelect(page.properties, 'Status')?.toLowerCase() === 'todo')
    .map((page) => ({
      id: page.id,
      title: extractTitle(page.properties),
      status: extractSelect(page.properties, 'Status'),
      priority: extractSelect(page.properties, 'Priority'),
      dueDate: extractDate(page.properties, 'Due Date'),
      category: extractSelect(page.properties, 'Category'),
    }));

  // Filter people: Next Follow-up <= today
  const today = new Date().toISOString().split('T')[0];
  const followups: DigestItem[] = peoplePages
    .filter((page) => {
      const nextFollowup = extractDate(page.properties, 'Next Follow-up');
      return nextFollowup && nextFollowup <= today;
    })
    .map((page) => ({
      id: page.id,
      title: extractTitle(page.properties),
      status: extractSelect(page.properties, 'Status'),
      company: extractRichText(page.properties, 'Company') || undefined,
      dueDate: extractDate(page.properties, 'Next Follow-up'),
    }));

  return { projects, tasks, followups, calendarEvents };
}

async function fetchWeeklyData(): Promise<{
  completedTasks: DigestItem[];
  completedProjects: DigestItem[];
  inboxByCategory: Record<string, DigestItem[]>;
  totalInbox: number;
}> {
  const oneWeekAgo = new Date();
  oneWeekAgo.setDate(oneWeekAgo.getDate() - 7);
  const weekAgoISO = oneWeekAgo.toISOString();

  const [inboxPages, adminPages, projectPages] = await Promise.all([
    queryDatabase(DATABASE_IDS.InboxLog, {
      timestamp: 'created_time',
      created_time: { past_week: {} },
    }),
    queryDatabase(DATABASE_IDS.Admin),
    queryDatabase(DATABASE_IDS.Projects),
  ]);

  // Filter completed tasks: Status = 'Done' & edited this week
  const completedTasks: DigestItem[] = adminPages
    .filter((page) => {
      const status = extractSelect(page.properties, 'Status')?.toLowerCase();
      return status === 'done' && page.last_edited_time >= weekAgoISO;
    })
    .map((page) => ({
      id: page.id,
      title: extractTitle(page.properties),
      status: extractSelect(page.properties, 'Status'),
      priority: extractSelect(page.properties, 'Priority'),
    }));

  // Filter completed projects: Status = 'Complete' & edited this week
  const completedProjects: DigestItem[] = projectPages
    .filter((page) => {
      const status = extractSelect(page.properties, 'Status')?.toLowerCase();
      return status === 'complete' && page.last_edited_time >= weekAgoISO;
    })
    .map((page) => ({
      id: page.id,
      title: extractTitle(page.properties),
      status: extractSelect(page.properties, 'Status'),
    }));

  // Group inbox entries by category
  const inboxByCategory: Record<string, DigestItem[]> = {
    People: [],
    Project: [],
    Idea: [],
    Admin: [],
  };

  inboxPages.forEach((page) => {
    const category = extractSelect(page.properties, 'Category') || 'Admin';
    const item: DigestItem = {
      id: page.id,
      title: extractTitle(page.properties),
      category,
    };
    if (inboxByCategory[category]) {
      inboxByCategory[category].push(item);
    }
  });

  return {
    completedTasks,
    completedProjects,
    inboxByCategory,
    totalInbox: inboxPages.length,
  };
}

async function generateDailySummary(
  projects: DigestItem[],
  tasks: DigestItem[],
  followups: DigestItem[],
  calendarEvents: CalendarEvent[] = []
): Promise<string> {
  if (!OPENAI_API_KEY) {
    return 'AI summary unavailable - OpenAI not configured';
  }

  if (projects.length === 0 && tasks.length === 0 && followups.length === 0 && calendarEvents.length === 0) {
    return 'All clear — no active projects, pending tasks, follow-ups, or meetings today.';
  }

  let summary = '';

  if (calendarEvents.length > 0) {
    summary += 'CALENDAR TODAY:\n';
    calendarEvents.forEach((e) => {
      const time = e.start.dateTime
        ? new Date(e.start.dateTime).toLocaleTimeString('en-US', { hour: 'numeric', minute: '2-digit' })
        : 'All day';
      summary += `- ${time} — ${e.summary}\n`;
    });
    summary += '\n';
  }

  if (projects.length > 0) {
    summary += 'ACTIVE PROJECTS:\n';
    projects.forEach((p) => {
      summary += `- ${p.title}: ${p.nextAction || 'No next action'}\n`;
    });
    summary += '\n';
  }

  if (tasks.length > 0) {
    summary += 'PENDING TASKS:\n';
    tasks.forEach((t) => {
      summary += `- ${t.title}${t.priority ? ' [' + t.priority + ']' : ''}\n`;
    });
    summary += '\n';
  }

  if (followups.length > 0) {
    summary += 'DUE FOLLOW-UPS:\n';
    followups.forEach((f) => {
      summary += `- ${f.title}${f.company ? ' (' + f.company + ')' : ''}\n`;
    });
  }

  const openai = new OpenAI({ apiKey: OPENAI_API_KEY });
  const completion = await openai.chat.completions.create({
    model: 'gpt-4o-mini',
    temperature: 0.5,
    messages: [
      {
        role: 'system',
        content: `You are a professional executive assistant. Create a clean, scannable daily briefing. Use this exact format:

**Projects** (only if items exist)
• Project Name — Next action

**Tasks** (only if items exist)
• Task description [Priority]

**Follow-ups** (only if items exist)
• Person Name (Company)

Rules: No intro text. No headers for empty sections. No sign-off. Max 150 words. Use bullet points (•) not dashes. Do NOT list the schedule/calendar as a separate section — the calendar is already displayed in the UI. Instead, weave meeting context naturally into your suggestions (e.g., "Good time to discuss X in your 2pm 1:1" or "Prep the proposal before your 3pm meeting").`,
      },
      { role: 'user', content: summary },
    ],
  });

  return completion.choices[0]?.message?.content || 'Unable to generate summary';
}

async function generateWeeklySummary(
  completedTasks: DigestItem[],
  completedProjects: DigestItem[],
  inboxByCategory: Record<string, DigestItem[]>,
  totalInbox: number
): Promise<string> {
  if (!OPENAI_API_KEY) {
    return 'AI summary unavailable - OpenAI not configured';
  }

  const totalActivity = totalInbox + completedTasks.length + completedProjects.length;
  if (totalActivity === 0) {
    return 'No activity this week — no new entries captured and no items completed.';
  }

  let summary = `WEEK DATA (${totalInbox} new entries captured):\n\n`;

  if (completedTasks.length > 0 || completedProjects.length > 0) {
    summary += 'COMPLETED THIS WEEK:\n';
    if (completedTasks.length > 0) {
      const taskNames = completedTasks.slice(0, 5).map((t) => t.title);
      summary += `Tasks (${completedTasks.length}): ${taskNames.join(', ')}${completedTasks.length > 5 ? '...' : ''}\n`;
    }
    if (completedProjects.length > 0) {
      summary += `Projects (${completedProjects.length}): ${completedProjects.map((p) => p.title).join(', ')}\n`;
    }
    summary += '\n';
  }

  for (const [category, items] of Object.entries(inboxByCategory)) {
    if (items.length > 0) {
      summary += `${category.toUpperCase()} (${items.length}):\n`;
      items.forEach((item) => {
        summary += `• ${item.title}\n`;
      });
      summary += '\n';
    }
  }

  const openai = new OpenAI({ apiKey: OPENAI_API_KEY });
  const completion = await openai.chat.completions.create({
    model: 'gpt-4o-mini',
    temperature: 0.4,
    messages: [
      {
        role: 'system',
        content: `You are analyzing a personal knowledge management system. Create a detailed weekly review:

**Completed This Week**
• List tasks and projects that were finished (celebrate wins!)
• If nothing completed, skip this section entirely

**Patterns & Themes**
Analyze the new entries and identify:
• Recurring topics (what subjects keep coming up?)
• Key people mentioned (who appears multiple times?)
• Emerging priorities (what's demanding attention?)
Be specific - quote or reference actual content from the entries.

**Action Items**
Based on the patterns, suggest specific next steps:
• Follow-ups needed (who to contact, what to clarify)
• Decisions pending (what needs resolution)
• Ideas worth developing (which sparks have potential)

**Weekly Summary**
• Total new entries captured
• Total items completed
• Notable trend or observation

FORMATTING RULES:
- Use double asterisks for bold headers: **Header**
- Use • for all bullet points (never use dashes -)
- Be detailed and specific - name actual people, topics, ideas
- 200-300 words
- No intro text, no sign-off`,
      },
      { role: 'user', content: summary },
    ],
  });

  return completion.choices[0]?.message?.content || 'Unable to generate summary';
}

export async function GET(request: NextRequest) {
  try {
    const type = request.nextUrl.searchParams.get('type') || 'daily';

    if (type === 'daily') {
      const { projects, tasks, followups, calendarEvents } = await fetchDailyData();
      const aiSummary = await generateDailySummary(projects, tasks, followups, calendarEvents);

      return NextResponse.json({
        status: 'success',
        type: 'daily',
        generatedAt: new Date().toISOString(),
        data: { projects, tasks, followups },
        counts: {
          projects: projects.length,
          tasks: tasks.length,
          followups: followups.length,
        },
        aiSummary,
      });
    } else {
      const { completedTasks, completedProjects, inboxByCategory, totalInbox } =
        await fetchWeeklyData();
      const aiSummary = await generateWeeklySummary(
        completedTasks,
        completedProjects,
        inboxByCategory,
        totalInbox
      );

      return NextResponse.json({
        status: 'success',
        type: 'weekly',
        generatedAt: new Date().toISOString(),
        data: { completedTasks, completedProjects, inboxByCategory },
        counts: {
          completedTasks: completedTasks.length,
          completedProjects: completedProjects.length,
          totalInbox,
        },
        aiSummary,
      });
    }
  } catch (error) {
    console.error('Digest error:', error);
    return NextResponse.json(
      { status: 'error', error: error instanceof Error ? error.message : 'Unknown error' },
      { status: 500 }
    );
  }
}

// Handle CORS preflight
export async function OPTIONS() {
  return new NextResponse(null, {
    status: 200,
    headers: {
      'Access-Control-Allow-Origin': '*',
      'Access-Control-Allow-Methods': 'GET, OPTIONS',
      'Access-Control-Allow-Headers': 'Content-Type',
    },
  });
}
