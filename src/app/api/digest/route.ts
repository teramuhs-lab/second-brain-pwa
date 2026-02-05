import { NextRequest, NextResponse } from 'next/server';
import OpenAI from 'openai';

// Notion database IDs
const DATABASE_IDS = {
  People: '2f092129-b3db-81b4-b767-fed1e3190303',
  Projects: '2f092129-b3db-81fd-aef1-e62b4f3445ff',
  Admin: '2f092129-b3db-8171-ae6c-f98e8124574c',
  InboxLog: '2f092129-b3db-8104-a9ca-fc123e5be4a3',
};

const NOTION_API_KEY = process.env.NOTION_API_KEY;
const OPENAI_API_KEY = process.env.OPENAI_API_KEY;

interface NotionPage {
  id: string;
  properties: Record<string, unknown>;
  created_time: string;
  last_edited_time: string;
}

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

async function notionRequest(endpoint: string, method: string, body?: object) {
  const response = await fetch(`https://api.notion.com/v1${endpoint}`, {
    method,
    headers: {
      Authorization: `Bearer ${NOTION_API_KEY}`,
      'Content-Type': 'application/json',
      'Notion-Version': '2022-06-28',
    },
    body: body ? JSON.stringify(body) : undefined,
  });

  if (!response.ok) {
    const error = await response.text();
    throw new Error(`Notion API error: ${response.status} - ${error}`);
  }

  return response.json();
}

function extractTitle(properties: Record<string, unknown>, titleKey: string = 'Name'): string {
  const titleProps = [titleKey, 'Name', 'Title', 'Task'];
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

function extractDate(properties: Record<string, unknown>, dateKey: string): string | undefined {
  const dateProp = properties[dateKey] as { date?: { start: string } } | undefined;
  return dateProp?.date?.start;
}

function extractRichText(properties: Record<string, unknown>, key: string): string | undefined {
  const richTextProp = properties[key] as { rich_text?: Array<{ plain_text: string }> } | undefined;
  return richTextProp?.rich_text?.[0]?.plain_text;
}

function extractCategory(properties: Record<string, unknown>): string | undefined {
  const categoryProp = properties['Category'] as { select?: { name: string } } | undefined;
  return categoryProp?.select?.name;
}

async function fetchDailyData(): Promise<{
  projects: DigestItem[];
  tasks: DigestItem[];
  followups: DigestItem[];
}> {
  // Fetch all databases in parallel
  const [projectsResponse, adminResponse, peopleResponse] = await Promise.all([
    notionRequest(`/databases/${DATABASE_IDS.Projects}/query`, 'POST', {
      page_size: 100,
      sorts: [{ property: 'Priority', direction: 'ascending' }],
    }),
    notionRequest(`/databases/${DATABASE_IDS.Admin}/query`, 'POST', {
      page_size: 100,
      sorts: [{ property: 'Priority', direction: 'ascending' }],
    }),
    notionRequest(`/databases/${DATABASE_IDS.People}/query`, 'POST', {
      page_size: 100,
    }),
  ]);

  // Filter projects: Status = 'Active'
  const projects: DigestItem[] = (projectsResponse.results as NotionPage[])
    .filter((page) => {
      const status = extractStatus(page.properties)?.toLowerCase();
      return status === 'active';
    })
    .map((page) => ({
      id: page.id,
      title: extractTitle(page.properties),
      status: extractStatus(page.properties),
      priority: extractPriority(page.properties),
      dueDate: extractDate(page.properties, 'Due Date'),
      nextAction: extractRichText(page.properties, 'Next Action'),
    }));

  // Filter admin: Status = 'Todo'
  const tasks: DigestItem[] = (adminResponse.results as NotionPage[])
    .filter((page) => {
      const status = extractStatus(page.properties)?.toLowerCase();
      return status === 'todo';
    })
    .map((page) => ({
      id: page.id,
      title: extractTitle(page.properties, 'Task'),
      status: extractStatus(page.properties),
      priority: extractPriority(page.properties),
      dueDate: extractDate(page.properties, 'Due Date'),
      category: extractCategory(page.properties),
    }));

  // Filter people: Next Follow-up <= today
  const today = new Date().toISOString().split('T')[0];
  const followups: DigestItem[] = (peopleResponse.results as NotionPage[])
    .filter((page) => {
      const nextFollowup = extractDate(page.properties, 'Next Follow-up');
      return nextFollowup && nextFollowup <= today;
    })
    .map((page) => ({
      id: page.id,
      title: extractTitle(page.properties),
      status: extractStatus(page.properties),
      company: extractRichText(page.properties, 'Company'),
      dueDate: extractDate(page.properties, 'Next Follow-up'),
    }));

  return { projects, tasks, followups };
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

  // Fetch all databases in parallel
  const [inboxResponse, adminResponse, projectsResponse] = await Promise.all([
    notionRequest(`/databases/${DATABASE_IDS.InboxLog}/query`, 'POST', {
      page_size: 100,
      filter: {
        timestamp: 'created_time',
        created_time: { past_week: {} },
      },
    }),
    notionRequest(`/databases/${DATABASE_IDS.Admin}/query`, 'POST', {
      page_size: 100,
    }),
    notionRequest(`/databases/${DATABASE_IDS.Projects}/query`, 'POST', {
      page_size: 100,
    }),
  ]);

  // Filter completed tasks: Status = 'Done' & edited this week
  const completedTasks: DigestItem[] = (adminResponse.results as NotionPage[])
    .filter((page) => {
      const status = extractStatus(page.properties)?.toLowerCase();
      const editedRecently = page.last_edited_time >= weekAgoISO;
      return status === 'done' && editedRecently;
    })
    .map((page) => ({
      id: page.id,
      title: extractTitle(page.properties, 'Task'),
      status: extractStatus(page.properties),
      priority: extractPriority(page.properties),
    }));

  // Filter completed projects: Status = 'Complete' & edited this week
  const completedProjects: DigestItem[] = (projectsResponse.results as NotionPage[])
    .filter((page) => {
      const status = extractStatus(page.properties)?.toLowerCase();
      const editedRecently = page.last_edited_time >= weekAgoISO;
      return status === 'complete' && editedRecently;
    })
    .map((page) => ({
      id: page.id,
      title: extractTitle(page.properties),
      status: extractStatus(page.properties),
    }));

  // Group inbox entries by category
  const inboxByCategory: Record<string, DigestItem[]> = {
    People: [],
    Project: [],
    Idea: [],
    Admin: [],
  };

  (inboxResponse.results as NotionPage[]).forEach((page) => {
    const category = extractCategory(page.properties) || 'Admin';
    const item: DigestItem = {
      id: page.id,
      title: extractTitle(page.properties, 'Raw Input'),
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
    totalInbox: inboxResponse.results.length,
  };
}

async function generateDailySummary(
  projects: DigestItem[],
  tasks: DigestItem[],
  followups: DigestItem[]
): Promise<string> {
  if (!OPENAI_API_KEY) {
    return 'AI summary unavailable - OpenAI not configured';
  }

  if (projects.length === 0 && tasks.length === 0 && followups.length === 0) {
    return 'All clear — no active projects, pending tasks, or follow-ups today.';
  }

  let summary = '';

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

Rules: No intro text. No headers for empty sections. No sign-off. Max 120 words. Use bullet points (•) not dashes.`,
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
    if (!NOTION_API_KEY) {
      return NextResponse.json(
        { status: 'error', error: 'NOTION_API_KEY not configured' },
        { status: 500 }
      );
    }

    const type = request.nextUrl.searchParams.get('type') || 'daily';

    if (type === 'daily') {
      const { projects, tasks, followups } = await fetchDailyData();
      const aiSummary = await generateDailySummary(projects, tasks, followups);

      return NextResponse.json({
        status: 'success',
        type: 'daily',
        generatedAt: new Date().toISOString(),
        data: {
          projects,
          tasks,
          followups,
        },
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
        data: {
          completedTasks,
          completedProjects,
          inboxByCategory,
        },
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
