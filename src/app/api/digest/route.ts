import { NextRequest, NextResponse } from 'next/server';
import { getActivitySummary, getFrequentlySnoozed, getMostActiveEntries } from '@/services/db/activity';
import { getCached, setCache } from '@/services/cache';
import { fetchDailyData, fetchWeeklyData, generateDailySummary, generateWeeklySummary } from '@/services/digest';
import { createLogger } from '@/lib/logger';

const log = createLogger('api/digest');

export async function GET(request: NextRequest) {
  try {
    const type = request.nextUrl.searchParams.get('type') || 'daily';
    const forceRefresh = request.nextUrl.searchParams.get('refresh') === 'true';
    const dateKey = new Date().toISOString().split('T')[0];

    if (type === 'daily') {
      const cacheKey = `digest:daily:${dateKey}`;

      // Return cached response unless force-refreshing
      if (!forceRefresh) {
        const cached = await getCached(cacheKey);
        if (cached) return NextResponse.json(cached);
      }

      const yesterday = new Date(Date.now() - 24 * 60 * 60 * 1000);
      const [dailyData, activityArr] = await Promise.all([
        fetchDailyData(),
        getActivitySummary(yesterday).catch(() => []),
      ]);
      const { projects, tasks, followups, calendarEvents, googleTasks, googleTasksScopeNeeded, emailDigest, emailDigestTotal, emailDashboard } = dailyData;
      // Convert ActivitySummary[] to Record<string, number>
      const activitySummary: Record<string, number> = {};
      for (const s of activityArr) {
        if (s && typeof s === 'object' && 'action' in s) activitySummary[s.action] = s.count;
      }
      const aiSummary = await generateDailySummary(projects, tasks, followups, calendarEvents, activitySummary, emailDigest);

      const responseData = {
        status: 'success',
        type: 'daily',
        generatedAt: new Date().toISOString(),
        data: { projects, tasks, followups, googleTasks, emailDigest, emailDashboard },
        counts: {
          projects: projects.length,
          tasks: tasks.length,
          followups: followups.length,
          googleTasks: googleTasks.length,
          emailDigestTotal,
        },
        googleTasksScopeNeeded,
        aiSummary,
      };

      // Cache for 1 hour
      await setCache(cacheKey, responseData, 60 * 60 * 1000);

      return NextResponse.json(responseData);
    } else {
      const cacheKey = `digest:weekly:${dateKey}`;

      // Return cached response unless force-refreshing
      if (!forceRefresh) {
        const cached = await getCached(cacheKey);
        if (cached) return NextResponse.json(cached);
      }

      const oneWeekAgo = new Date(Date.now() - 7 * 24 * 60 * 60 * 1000);
      const [weeklyData, actSummaryArr, snoozedItems, mostActive] = await Promise.all([
        fetchWeeklyData(),
        getActivitySummary(oneWeekAgo).catch(() => []),
        getFrequentlySnoozed(oneWeekAgo, 2).catch(() => []),
        getMostActiveEntries(oneWeekAgo, 5).catch(() => []),
      ]);
      const { completedTasks, completedProjects, inboxByCategory, totalInbox } = weeklyData;
      // Convert ActivitySummary[] to Record<string, number>
      const actSummary: Record<string, number> = {};
      for (const s of actSummaryArr) {
        if (s && typeof s === 'object' && 'action' in s) actSummary[s.action] = s.count;
      }
      const aiSummary = await generateWeeklySummary(
        completedTasks,
        completedProjects,
        inboxByCategory,
        totalInbox,
        {
          summary: actSummary,
          snoozedItems: snoozedItems.map(s => ({ title: s.entryTitle || 'Unknown', snoozeCount: s.snoozeCount })),
          mostActive: mostActive.map(a => ({ title: a.entryTitle || 'Unknown', category: a.entryCategory || 'Unknown', actionCount: a.activityCount })),
        }
      );

      const responseData = {
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
      };

      // Cache for 6 hours
      await setCache(cacheKey, responseData, 6 * 60 * 60 * 1000);

      return NextResponse.json(responseData);
    }
  } catch (error) {
    log.error('Digest generation failed', error);
    return NextResponse.json(
      { status: 'error', error: error instanceof Error ? error.message : 'Unknown error' },
      { status: 500 }
    );
  }
}
