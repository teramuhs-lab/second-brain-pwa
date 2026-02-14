/**
 * Activity Log Service
 *
 * Tracks user actions (status changes, snoozes, completions, etc.)
 * for AI context — agents, digests, and insights can query this
 * to understand user behavior patterns.
 *
 * All writes are best-effort (never throw) so they don't break
 * the main request flow.
 */

import { eq, and, sql, desc, gte, count } from 'drizzle-orm';
import { db } from '@/db';
import { activityLog, entries } from '@/db/schema';

// ============= Types =============

export type ActionType =
  | 'created'
  | 'status_changed'
  | 'snoozed'
  | 'completed'
  | 'archived'
  | 'recategorized'
  | 'note_added'
  | 'saved_reading'
  | 'searched';

export interface ActivityFilters {
  entryId?: string;
  action?: ActionType;
  since?: Date;
  limit?: number;
}

export interface ActivitySummary {
  action: string;
  count: number;
}

// ============= WRITE (best-effort) =============

/**
 * Log a user action. Never throws — failures are silently logged to console.
 */
export async function logActivity(
  entryId: string | null,
  action: ActionType,
  metadata: Record<string, unknown> = {}
): Promise<void> {
  try {
    await db.insert(activityLog).values({
      entryId: entryId || null,
      action,
      metadata,
    });
  } catch (err) {
    console.error('Failed to log activity:', err);
  }
}

// ============= READ =============

/**
 * Get recent activity with optional filters.
 */
export async function getRecentActivity(filters: ActivityFilters = {}) {
  const since = filters.since || new Date(Date.now() - 7 * 24 * 60 * 60 * 1000); // default: 7 days
  const limit = filters.limit || 50;

  const conditions = [gte(activityLog.createdAt, since)];

  if (filters.entryId) {
    conditions.push(eq(activityLog.entryId, filters.entryId));
  }
  if (filters.action) {
    conditions.push(eq(activityLog.action, filters.action));
  }

  const results = await db
    .select({
      id: activityLog.id,
      entryId: activityLog.entryId,
      action: activityLog.action,
      metadata: activityLog.metadata,
      createdAt: activityLog.createdAt,
      entryTitle: entries.title,
      entryCategory: entries.category,
    })
    .from(activityLog)
    .leftJoin(entries, eq(activityLog.entryId, entries.id))
    .where(and(...conditions))
    .orderBy(desc(activityLog.createdAt))
    .limit(limit);

  return results;
}

/**
 * Get action counts grouped by action type (for digest/insights summaries).
 */
export async function getActivitySummary(since: Date): Promise<ActivitySummary[]> {
  const results = await db
    .select({
      action: activityLog.action,
      count: count(),
    })
    .from(activityLog)
    .where(gte(activityLog.createdAt, since))
    .groupBy(activityLog.action);

  return results.map(r => ({ action: r.action, count: r.count }));
}

/**
 * Get full activity timeline for a specific entry.
 */
export async function getEntryHistory(entryId: string) {
  return db
    .select()
    .from(activityLog)
    .where(eq(activityLog.entryId, entryId))
    .orderBy(desc(activityLog.createdAt));
}

/**
 * Get entries that have been snoozed frequently (stuck items).
 */
export async function getFrequentlySnoozed(since: Date, minSnoozes: number = 3) {
  const results = await db
    .select({
      entryId: activityLog.entryId,
      snoozeCount: count(),
      entryTitle: entries.title,
      entryCategory: entries.category,
      entryStatus: entries.status,
    })
    .from(activityLog)
    .leftJoin(entries, eq(activityLog.entryId, entries.id))
    .where(
      and(
        eq(activityLog.action, 'snoozed'),
        gte(activityLog.createdAt, since),
        sql`${entries.archived} IS NULL`
      )
    )
    .groupBy(activityLog.entryId, entries.title, entries.category, entries.status)
    .having(sql`count(*) >= ${minSnoozes}`);

  return results;
}

/**
 * Get entries with the most activity (most-interacted).
 */
export async function getMostActiveEntries(since: Date, limit: number = 5) {
  const results = await db
    .select({
      entryId: activityLog.entryId,
      activityCount: count(),
      entryTitle: entries.title,
      entryCategory: entries.category,
    })
    .from(activityLog)
    .leftJoin(entries, eq(activityLog.entryId, entries.id))
    .where(
      and(
        gte(activityLog.createdAt, since),
        sql`${activityLog.entryId} IS NOT NULL`,
        sql`${entries.archived} IS NULL`
      )
    )
    .groupBy(activityLog.entryId, entries.title, entries.category)
    .orderBy(sql`count(*) DESC`)
    .limit(limit);

  return results;
}
