import { isGoogleConnected, getSelectedTaskListIds } from '@/services/google/auth';
import { fetchTodaysEvents } from '@/services/google/calendar';
import { fetchTaskLists, fetchTasks } from '@/services/google/tasks';
import type { CalendarEvent } from '@/services/google/types';
import type { EmailDigestItem, EmailDashboard } from '@/lib/types';
import { queryEntries } from '@/services/db/entries';
import { gte } from 'drizzle-orm';
import { db } from '@/db';
import { inboxLog } from '@/db/schema';
import { classifyEmails, enrichCriticalEmails, generateEmailDashboard, fetchYesterdayEmailsOrEmpty } from './email';
import { createLogger } from '@/lib/logger';

const log = createLogger('digest/data');

export interface DigestItem {
  id: string;
  title: string;
  status?: string;
  priority?: string;
  dueDate?: string;
  nextAction?: string;
  company?: string;
  category?: string;
  notes?: string;
}

// Fetch calendar events safely (never throws)
async function fetchCalendarOrEmpty(): Promise<CalendarEvent[]> {
  try {
    if (!(await isGoogleConnected())) return [];
    return await fetchTodaysEvents();
  } catch (err) {
    log.warn('Calendar fetch failed (returning empty)', { error: err instanceof Error ? err.message : String(err) });
    return [];
  }
}

// Fetch Google Tasks safely (never throws)
async function fetchGoogleTasksOrEmpty(): Promise<{ tasks: DigestItem[]; scopeNeeded: boolean }> {
  try {
    if (!(await isGoogleConnected())) return { tasks: [], scopeNeeded: false };

    const [allLists, selectedIds] = await Promise.all([
      fetchTaskLists(),
      getSelectedTaskListIds(),
    ]);
    if (allLists.length === 0) return { tasks: [], scopeNeeded: false };

    // Filter to selected lists (null = unconfigured, show all)
    const listsToFetch = selectedIds
      ? allLists.filter(l => selectedIds.includes(l.id))
      : allLists;

    const allTasks: DigestItem[] = [];
    for (const list of listsToFetch) {
      const tasks = await fetchTasks(list.id, { showCompleted: false, maxResults: 20 });
      for (const t of tasks) {
        if (t.status === 'needsAction') {
          allTasks.push({
            id: t.id,
            title: t.title,
            status: 'Pending',
            dueDate: t.due ? t.due.split('T')[0] : undefined,
            category: list.title,
            notes: t.notes || undefined,
          });
        }
      }
    }

    // Sort: tasks with due dates first (soonest first), then no-date tasks
    allTasks.sort((a, b) => {
      if (a.dueDate && b.dueDate) return a.dueDate.localeCompare(b.dueDate);
      if (a.dueDate && !b.dueDate) return -1;
      if (!a.dueDate && b.dueDate) return 1;
      return 0;
    });

    return { tasks: allTasks, scopeNeeded: false };
  } catch (err) {
    const msg = err instanceof Error ? err.message : '';
    if (msg.includes('API is not enabled') || msg.includes('scope not authorized')) {
      return { tasks: [], scopeNeeded: true };
    }
    log.warn('Google Tasks fetch failed', { error: err instanceof Error ? err.message : String(err) });
    return { tasks: [], scopeNeeded: false };
  }
}

export async function fetchDailyData(): Promise<{
  projects: DigestItem[];
  tasks: DigestItem[];
  followups: DigestItem[];
  calendarEvents: CalendarEvent[];
  googleTasks: DigestItem[];
  googleTasksScopeNeeded: boolean;
  emailDigest: EmailDigestItem[];
  emailDigestTotal: number;
  emailDashboard?: EmailDashboard;
}> {
  const [projectEntries, adminEntries, peopleEntries, calendarEvents, googleTasksResult, emailResult] = await Promise.all([
    queryEntries({ category: 'Projects', status: 'Active', orderBy: 'created_at', orderDir: 'desc' }),
    queryEntries({ category: 'Admin', status: 'Todo', orderBy: 'created_at', orderDir: 'desc' }),
    queryEntries({ category: 'People' }),
    fetchCalendarOrEmpty(),
    fetchGoogleTasksOrEmpty(),
    fetchYesterdayEmailsOrEmpty(),
  ]);
  const googleTasks = googleTasksResult.tasks;
  const googleTasksScopeNeeded = googleTasksResult.scopeNeeded;

  // Classify emails (separate AI call, only if emails were fetched)
  const emailDigest = emailResult.emails.length > 0
    ? await classifyEmails(emailResult.emails)
    : [];
  const emailDigestTotal = emailResult.emails.length;

  // Enrich critical emails + generate dashboard (in parallel)
  const [, emailDashboard] = await Promise.all([
    enrichCriticalEmails(emailDigest),
    generateEmailDashboard(emailDigest),
  ]);

  const projects: DigestItem[] = projectEntries.map(entry => {
    const content = (entry.content as Record<string, unknown>) || {};
    return {
      id: entry.id,
      title: entry.title,
      status: entry.status || undefined,
      priority: entry.priority || undefined,
      dueDate: entry.dueDate?.toISOString().split('T')[0],
      nextAction: (content.nextAction as string) || undefined,
    };
  });

  const tasks: DigestItem[] = adminEntries.map(entry => {
    const content = (entry.content as Record<string, unknown>) || {};
    return {
      id: entry.id,
      title: entry.title,
      status: entry.status || undefined,
      priority: entry.priority || undefined,
      dueDate: entry.dueDate?.toISOString().split('T')[0],
      category: (content.adminCategory as string) || undefined,
    };
  });

  // Filter people: due follow-ups (dueDate <= today)
  const today = new Date();
  today.setHours(23, 59, 59, 999);
  const followups: DigestItem[] = peopleEntries
    .filter(entry => entry.dueDate && entry.dueDate <= today)
    .map(entry => {
      const content = (entry.content as Record<string, unknown>) || {};
      return {
        id: entry.id,
        title: entry.title,
        status: entry.status || undefined,
        company: (content.company as string) || undefined,
        dueDate: entry.dueDate?.toISOString().split('T')[0],
      };
    });

  return { projects, tasks, followups, calendarEvents, googleTasks, googleTasksScopeNeeded, emailDigest, emailDigestTotal, emailDashboard };
}

export async function fetchWeeklyData(): Promise<{
  completedTasks: DigestItem[];
  completedProjects: DigestItem[];
  inboxByCategory: Record<string, DigestItem[]>;
  totalInbox: number;
}> {
  const oneWeekAgo = new Date();
  oneWeekAgo.setDate(oneWeekAgo.getDate() - 7);

  const [adminEntries, projectEntries, inboxEntries] = await Promise.all([
    queryEntries({ category: 'Admin', status: 'Done' }),
    queryEntries({ category: 'Projects', status: 'Complete' }),
    db.select().from(inboxLog).where(gte(inboxLog.createdAt, oneWeekAgo)),
  ]);

  const completedTasks: DigestItem[] = adminEntries
    .filter(entry => entry.updatedAt >= oneWeekAgo)
    .map(entry => ({
      id: entry.id,
      title: entry.title,
      status: entry.status || undefined,
      priority: entry.priority || undefined,
    }));

  const completedProjects: DigestItem[] = projectEntries
    .filter(entry => entry.updatedAt >= oneWeekAgo)
    .map(entry => ({
      id: entry.id,
      title: entry.title,
      status: entry.status || undefined,
    }));

  const inboxByCategory: Record<string, DigestItem[]> = {
    People: [],
    Project: [],
    Idea: [],
    Admin: [],
  };

  for (const log of inboxEntries) {
    const category = log.category || 'Admin';
    const item: DigestItem = {
      id: log.id,
      title: log.rawInput,
      category,
    };
    if (inboxByCategory[category]) {
      inboxByCategory[category].push(item);
    }
  }

  return {
    completedTasks,
    completedProjects,
    inboxByCategory,
    totalInbox: inboxEntries.length,
  };
}
