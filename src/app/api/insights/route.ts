import { NextResponse } from 'next/server';
import OpenAI from 'openai';
import { queryEntries } from '@/services/db/entries';
import { getActivitySummary, getFrequentlySnoozed } from '@/services/db/activity';

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

function extractTimeFromDate(date: Date): string | undefined {
  const hours = date.getHours();
  const minutes = date.getMinutes();
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
    const todayStr = now.toISOString().split('T')[0];

    // Fetch all entries from Neon
    const allEntries = await queryEntries({ limit: 500 });

    // Find stale items (not edited in 2+ weeks, still active)
    const staleItems: StaleItem[] = [];
    const activeStatuses = ['active', 'todo', 'new', 'not started'];

    for (const entry of allEntries) {
      const lastEdited = entry.updatedAt;
      const statusLower = entry.status?.toLowerCase();

      if (lastEdited < twoWeeksAgo && (!statusLower || activeStatuses.includes(statusLower))) {
        const daysSinceEdit = Math.floor((now.getTime() - lastEdited.getTime()) / (24 * 60 * 60 * 1000));
        const content = (entry.content as Record<string, unknown>) || {};

        staleItems.push({
          id: entry.id,
          title: entry.title,
          category: entry.category,
          status: entry.status || undefined,
          maturity: entry.category === 'Ideas' ? entry.status || undefined : undefined,
          rawInsight: entry.category === 'Ideas' ? (content.rawInsight as string) || undefined : undefined,
          notes: (content.notes as string) || undefined,
          daysSinceEdit,
          lastEdited: lastEdited.toISOString(),
        });
      }
    }

    staleItems.sort((a, b) => b.daysSinceEdit - a.daysSinceEdit);

    // Find items due today
    const dueToday: DueTodayItem[] = [];
    const doneStatuses = ['done', 'complete', 'dormant'];

    for (const entry of allEntries) {
      if (!entry.dueDate) continue;
      const dueDateStr = entry.dueDate.toISOString().split('T')[0];
      if (dueDateStr !== todayStr) continue;

      const statusLower = entry.status?.toLowerCase();
      if (statusLower && doneStatuses.includes(statusLower)) continue;

      dueToday.push({
        id: entry.id,
        title: entry.title,
        category: entry.category,
        time: extractTimeFromDate(entry.dueDate),
      });
    }

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

    for (const entry of allEntries) {
      if (entry.createdAt > oneWeekAgo) {
        weeklyStats.totalCaptures++;
        weeklyStats.byCategory[entry.category] = (weeklyStats.byCategory[entry.category] || 0) + 1;

        const content = (entry.content as Record<string, unknown>) || {};
        const textParts = [entry.title];
        for (const val of Object.values(content)) {
          if (typeof val === 'string') textParts.push(val);
        }
        recentTexts.push(textParts.join(' '));
      }

      if (entry.category === 'Admin' && entry.status?.toLowerCase() === 'done' && entry.updatedAt > oneWeekAgo) {
        weeklyStats.completedTasks++;
      }

      if (entry.category === 'Ideas' && entry.createdAt > oneWeekAgo) {
        weeklyStats.newIdeas++;
      }
    }

    // Fetch activity data (best-effort)
    let activitySummary: Record<string, number> = {};
    let snoozedItems: Array<{ title: string; snoozeCount: number }> = [];
    try {
      const thirtyDaysAgo = new Date(now.getTime() - 30 * 24 * 60 * 60 * 1000);
      const [summaryArr, snoozedArr] = await Promise.all([
        getActivitySummary(oneWeekAgo),
        getFrequentlySnoozed(thirtyDaysAgo, 3),
      ]);
      for (const s of summaryArr) {
        activitySummary[s.action] = s.count;
      }
      snoozedItems = snoozedArr.map(i => ({ title: i.entryTitle || 'Unknown', snoozeCount: i.snoozeCount }));
    } catch {
      // Activity data is optional
    }

    // Generate AI insights
    let aiInsights: string | null = null;
    if (OPENAI_API_KEY && (weeklyStats.totalCaptures > 0 || staleItems.length > 0 || dueToday.length > 0)) {
      const openai = new OpenAI({ apiKey: OPENAI_API_KEY });

      // Build activity context
      let activityContext = '';
      if (Object.keys(activitySummary).length > 0) {
        activityContext += '\nUSER ACTIONS THIS WEEK:\n';
        for (const [action, count] of Object.entries(activitySummary)) {
          activityContext += `- ${count} ${action.replace('_', ' ')}${count > 1 ? 's' : ''}\n`;
        }
      }
      if (snoozedItems.length > 0) {
        activityContext += '\nFREQUENTLY SNOOZED (past 30 days, likely stuck):\n';
        for (const item of snoozedItems) {
          activityContext += `- "${item.title}" — snoozed ${item.snoozeCount} times\n`;
        }
      }

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
- Captured: ${weeklyStats.totalCaptures} items (People: ${weeklyStats.byCategory.People || 0}, Projects: ${weeklyStats.byCategory.Projects || 0}, Ideas: ${weeklyStats.byCategory.Ideas || 0}, Tasks: ${weeklyStats.byCategory.Admin || 0})
- Completed: ${weeklyStats.completedTasks} tasks
${activityContext}
STALE ITEMS (untouched 2+ weeks):
${staleItems.length > 0 ? staleItems.slice(0, 5).map(s => `- "${s.title}" (${s.category}, ${s.daysSinceEdit} days idle)`).join('\n') : '- None'}

RECENT THEMES: ${recentTexts.slice(0, 10).join(' ').slice(0, 400)}

Give exactly 3 insights:
1. **Priority**: What should I focus on right now and why? (name specific items)
2. **Stale**: Which idle item should I complete, archive, or revisit first? If any items have been snoozed many times, call them out as potentially stuck.
3. **Pattern**: One observation about my focus or momentum this week based on the activity data.

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
