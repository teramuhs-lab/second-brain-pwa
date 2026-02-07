import { NextResponse } from 'next/server';
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

interface StaleItem {
  id: string;
  title: string;
  category: string;
  status?: string;
  daysSinceEdit: number;
  lastEdited: string;
}

interface WeeklyStats {
  totalCaptures: number;
  byCategory: Record<string, number>;
  completedTasks: number;
  newIdeas: number;
  topTopics: string[];
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
      page_size: 100,
      ...(filter && { filter }),
    }),
  });

  if (!response.ok) {
    throw new Error(`Notion API error: ${response.status}`);
  }

  const data = await response.json();
  return data.results as NotionPage[];
}

export async function GET() {
  try {
    if (!NOTION_API_KEY) {
      return NextResponse.json({ status: 'error', error: 'NOTION_API_KEY not configured' }, { status: 500 });
    }

    const now = new Date();
    const twoWeeksAgo = new Date(now.getTime() - 14 * 24 * 60 * 60 * 1000);
    const oneWeekAgo = new Date(now.getTime() - 7 * 24 * 60 * 60 * 1000);

    // Fetch all databases in parallel
    const [people, projects, ideas, admin] = await Promise.all([
      queryDatabase(DATABASE_IDS.People),
      queryDatabase(DATABASE_IDS.Projects),
      queryDatabase(DATABASE_IDS.Ideas),
      queryDatabase(DATABASE_IDS.Admin),
    ]);

    // Find stale items (not edited in 2+ weeks, still active)
    const staleItems: StaleItem[] = [];
    const activeStatuses = ['Active', 'Todo', 'New', 'Not Started'];

    const checkStale = (pages: NotionPage[], category: string) => {
      for (const page of pages) {
        const lastEdited = new Date(page.last_edited_time);
        const status = extractStatus(page.properties);

        if (lastEdited < twoWeeksAgo && (!status || activeStatuses.includes(status))) {
          const daysSinceEdit = Math.floor((now.getTime() - lastEdited.getTime()) / (24 * 60 * 60 * 1000));
          staleItems.push({
            id: page.id,
            title: extractTitle(page.properties),
            category,
            status,
            daysSinceEdit,
            lastEdited: page.last_edited_time,
          });
        }
      }
    };

    checkStale(people, 'People');
    checkStale(projects, 'Projects');
    checkStale(ideas, 'Ideas');
    checkStale(admin, 'Admin');

    // Sort by staleness
    staleItems.sort((a, b) => b.daysSinceEdit - a.daysSinceEdit);

    // Calculate weekly stats
    const weeklyStats: WeeklyStats = {
      totalCaptures: 0,
      byCategory: { People: 0, Projects: 0, Ideas: 0, Admin: 0 },
      completedTasks: 0,
      newIdeas: 0,
      topTopics: [],
    };

    const recentTexts: string[] = [];

    const countRecent = (pages: NotionPage[], category: string) => {
      for (const page of pages) {
        const createdTime = new Date(page.created_time);
        const lastEdited = new Date(page.last_edited_time);

        if (createdTime > oneWeekAgo) {
          weeklyStats.totalCaptures++;
          weeklyStats.byCategory[category]++;
          recentTexts.push(extractText(page.properties));
        }

        if (category === 'Admin') {
          const status = extractStatus(page.properties);
          if (status === 'Done' && lastEdited > oneWeekAgo) {
            weeklyStats.completedTasks++;
          }
        }

        if (category === 'Ideas' && createdTime > oneWeekAgo) {
          weeklyStats.newIdeas++;
        }
      }
    };

    countRecent(people, 'People');
    countRecent(projects, 'Projects');
    countRecent(ideas, 'Ideas');
    countRecent(admin, 'Admin');

    // Generate AI insights if we have data
    let aiInsights: string | null = null;
    if (OPENAI_API_KEY && (weeklyStats.totalCaptures > 0 || staleItems.length > 0)) {
      const openai = new OpenAI({ apiKey: OPENAI_API_KEY });

      try {
        const completion = await openai.chat.completions.create({
          model: 'gpt-4o-mini',
          temperature: 0.5,
          messages: [
            {
              role: 'system',
              content: 'You are a helpful assistant analyzing a user\'s personal knowledge base activity. Be concise, actionable, and encouraging.',
            },
            {
              role: 'user',
              content: `Analyze my Second Brain activity this week:

Weekly Stats:
- Total new captures: ${weeklyStats.totalCaptures}
- By category: People (${weeklyStats.byCategory.People}), Projects (${weeklyStats.byCategory.Projects}), Ideas (${weeklyStats.byCategory.Ideas}), Tasks (${weeklyStats.byCategory.Admin})
- Completed tasks: ${weeklyStats.completedTasks}
- New ideas: ${weeklyStats.newIdeas}

Stale items (not touched in 2+ weeks): ${staleItems.length}
${staleItems.slice(0, 5).map(s => `- ${s.title} (${s.category}, ${s.daysSinceEdit} days)`).join('\n')}

Recent content themes: ${recentTexts.slice(0, 10).join(' ').slice(0, 500)}

Provide 2-3 brief, specific insights:
1. A pattern or theme you notice
2. A suggestion for what to focus on
3. An encouragement or observation

Keep it under 100 words total.`,
            },
          ],
        });

        aiInsights = completion.choices[0]?.message?.content || null;
      } catch (error) {
        console.error('AI insights error:', error);
      }
    }

    return NextResponse.json({
      status: 'success',
      staleItems: staleItems.slice(0, 10), // Top 10 stalest
      weeklyStats,
      aiInsights,
      generatedAt: now.toISOString(),
    });
  } catch (error) {
    console.error('Insights error:', error);
    return NextResponse.json(
      { status: 'error', error: error instanceof Error ? error.message : 'Unknown error' },
      { status: 500 }
    );
  }
}
