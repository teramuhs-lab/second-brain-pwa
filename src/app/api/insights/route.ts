import { NextResponse } from 'next/server';
import OpenAI from 'openai';
import { DATABASE_IDS } from '@/config/constants';
import { queryDatabase } from '@/services/notion/client';
import { extractTitle, extractSelect, extractRichText, extractAllText } from '@/services/notion/helpers';

const OPENAI_API_KEY = process.env.OPENAI_API_KEY;

interface StaleItem {
  id: string;
  title: string;
  category: string;
  status?: string;
  maturity?: string;
  rawInsight?: string;
  notes?: string;
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

interface DueTodayItem {
  id: string;
  title: string;
  category: string;
  time?: string;
}

function extractDueDate(properties: Record<string, unknown>): string | undefined {
  const dueDateProp = properties['Due Date'] as { date?: { start: string } } | undefined;
  const followUpProp = properties['Next Follow-up'] as { date?: { start: string } } | undefined;
  return dueDateProp?.date?.start || followUpProp?.date?.start;
}

function extractTimeFromDate(dateStr: string): string | undefined {
  if (!dateStr.includes('T')) return undefined;
  const timeMatch = dateStr.match(/T(\d{2}):(\d{2})/);
  if (!timeMatch) return undefined;
  const hours = parseInt(timeMatch[1], 10);
  const minutes = parseInt(timeMatch[2], 10);
  if (hours === 0 && minutes === 0) return undefined;
  const ampm = hours >= 12 ? 'PM' : 'AM';
  const displayHours = hours % 12 || 12;
  return minutes === 0 ? `${displayHours} ${ampm}` : `${displayHours}:${minutes.toString().padStart(2, '0')} ${ampm}`;
}

export async function GET() {
  try {
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

    const checkStale = (pages: typeof people, category: string) => {
      for (const page of pages) {
        const lastEdited = new Date(page.last_edited_time);
        const status = extractSelect(page.properties, 'Status');

        if (lastEdited < twoWeeksAgo && (!status || activeStatuses.includes(status))) {
          const daysSinceEdit = Math.floor((now.getTime() - lastEdited.getTime()) / (24 * 60 * 60 * 1000));
          staleItems.push({
            id: page.id,
            title: extractTitle(page.properties),
            category,
            status,
            maturity: category === 'Ideas' ? extractSelect(page.properties, 'Maturity') : undefined,
            rawInsight: category === 'Ideas' ? (extractRichText(page.properties, 'Raw Insight') || undefined) : undefined,
            notes: extractRichText(page.properties, 'Notes') || undefined,
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

    staleItems.sort((a, b) => b.daysSinceEdit - a.daysSinceEdit);

    // Find items due today
    const today = now.toISOString().split('T')[0];
    const dueToday: DueTodayItem[] = [];

    const checkDueToday = (pages: typeof people, category: string) => {
      for (const page of pages) {
        const dueDate = extractDueDate(page.properties);
        if (!dueDate) continue;

        const dueDateOnly = dueDate.split('T')[0];
        if (dueDateOnly === today) {
          const status = extractSelect(page.properties, 'Status');
          if (status === 'Done' || status === 'Complete' || status === 'Dormant') continue;

          dueToday.push({
            id: page.id,
            title: extractTitle(page.properties),
            category,
            time: extractTimeFromDate(dueDate),
          });
        }
      }
    };

    checkDueToday(people, 'People');
    checkDueToday(projects, 'Projects');
    checkDueToday(admin, 'Admin');

    dueToday.sort((a, b) => {
      if (a.time && !b.time) return -1;
      if (!a.time && b.time) return 1;
      if (a.time && b.time) return a.time.localeCompare(b.time);
      return 0;
    });

    // Calculate weekly stats
    const weeklyStats: WeeklyStats = {
      totalCaptures: 0,
      byCategory: { People: 0, Projects: 0, Ideas: 0, Admin: 0 },
      completedTasks: 0,
      newIdeas: 0,
      topTopics: [],
    };

    const recentTexts: string[] = [];

    const countRecent = (pages: typeof people, category: string) => {
      for (const page of pages) {
        const createdTime = new Date(page.created_time);
        const lastEdited = new Date(page.last_edited_time);

        if (createdTime > oneWeekAgo) {
          weeklyStats.totalCaptures++;
          weeklyStats.byCategory[category]++;
          recentTexts.push(extractAllText(page.properties));
        }

        if (category === 'Admin') {
          const status = extractSelect(page.properties, 'Status');
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
    if (OPENAI_API_KEY && (weeklyStats.totalCaptures > 0 || staleItems.length > 0 || dueToday.length > 0)) {
      const openai = new OpenAI({ apiKey: OPENAI_API_KEY });

      try {
        const completion = await openai.chat.completions.create({
          model: 'gpt-4o-mini',
          temperature: 0.7,
          messages: [
            {
              role: 'system',
              content: 'You are my personal productivity assistant. Give exactly 3 numbered insights using bold labels. Reference specific item names. No generic advice. No intro or sign-off.',
            },
            {
              role: 'user',
              content: `Analyze my Second Brain activity:

TODAY'S PRIORITY:
${dueToday.length > 0 ? dueToday.map(i => `- "${i.title}" (${i.category}${i.time ? ` at ${i.time}` : ''})`).join('\n') : '- Nothing due today'}

WEEKLY STATS:
- Captured: ${weeklyStats.totalCaptures} items (People: ${weeklyStats.byCategory.People}, Projects: ${weeklyStats.byCategory.Projects}, Ideas: ${weeklyStats.byCategory.Ideas}, Tasks: ${weeklyStats.byCategory.Admin})
- Completed: ${weeklyStats.completedTasks} tasks

STALE ITEMS (untouched 2+ weeks):
${staleItems.length > 0 ? staleItems.slice(0, 5).map(s => `- "${s.title}" (${s.category}, ${s.daysSinceEdit} days idle)`).join('\n') : '- None'}

RECENT THEMES: ${recentTexts.slice(0, 10).join(' ').slice(0, 400)}

Give exactly 3 insights:
1. **Priority**: What should I focus on right now and why? (name specific items)
2. **Stale**: Which idle item should I complete, archive, or revisit first?
3. **Pattern**: One observation about my focus or momentum this week.

Be direct and specific. Under 100 words.`,
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
      staleItems: staleItems.slice(0, 10),
      dueToday,
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
