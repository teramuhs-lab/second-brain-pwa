// Shared agent handler functions
// Core logic for brain search and item details used by both agents

import { searchEntries, getEntry, getEntryByLegacyId } from '@/services/db/entries';
import { getRecentActivity, getActivitySummary, type ActionType } from '@/services/db/activity';

// ============= Types =============

export interface BrainSearchResult {
  id: string;
  title: string;
  category: string;
  snippet: string;
  status?: string;
  priority?: string;
  dueDate?: string;
}

export interface ItemDetails {
  id: string;
  title: string;
  status?: string;
  priority?: string;
  created?: string;
  lastEdited?: string;
  fields: Record<string, string>;
}

// ============= Brain Search =============

/** Search database using hybrid vector + keyword search */
export async function searchBrainEntries(
  query: string,
  categories?: string[]
): Promise<BrainSearchResult[]> {
  // Map category names to DB category format
  const categoryFilter = categories?.length === 1
    ? ({
        People: 'People',
        Projects: 'Projects',
        Ideas: 'Ideas',
        Admin: 'Admin',
      }[categories[0]] || undefined)
    : undefined;

  const results = await searchEntries(query, {
    category: categoryFilter,
    limit: 20,
  });

  // Map DB category names to display names
  const categoryMap: Record<string, string> = {
    People: 'People',
    Projects: 'Projects',
    Ideas: 'Ideas',
    Admin: 'Admin',
  };

  return results.map(r => {
    const content = (r.content as Record<string, unknown>) || {};
    const contentText = Object.values(content)
      .filter(v => typeof v === 'string')
      .join(' ');

    return {
      id: r.id,
      title: r.title,
      category: categoryMap[r.category] || r.category,
      snippet: contentText.slice(0, 200) || r.title,
      status: r.status || undefined,
      priority: r.priority || undefined,
      dueDate: r.dueDate?.toISOString().split('T')[0],
    };
  });
}

// ============= Item Details =============

/** Get full details for an entry */
export async function getItemDetailsCore(itemId: string): Promise<ItemDetails | null> {
  try {
    // Try as UUID first, then legacy ID
    let entry = await getEntry(itemId);
    if (!entry) {
      entry = await getEntryByLegacyId(itemId);
    }
    if (!entry) return null;

    const content = (entry.content as Record<string, unknown>) || {};
    const fields: Record<string, string> = {};

    // Map content keys to display field names
    const fieldMapping: Record<string, string> = {
      company: 'Company',
      role: 'Role',
      context: 'Context',
      notes: 'Notes',
      nextAction: 'Next Action',
      rawInsight: 'Raw Insight',
      oneLiner: 'One-liner',
      area: 'Area',
      adminCategory: 'Category',
      ideaCategory: 'Category',
    };

    for (const [key, displayName] of Object.entries(fieldMapping)) {
      const value = content[key];
      if (typeof value === 'string' && value) {
        fields[displayName] = value;
      }
    }

    if (entry.dueDate) {
      const dateField = entry.category === 'People' ? 'Next Follow-up' : 'Due Date';
      fields[dateField] = entry.dueDate.toISOString().split('T')[0];
    }

    return {
      id: entry.id,
      title: entry.title,
      status: entry.status || undefined,
      priority: entry.priority || undefined,
      created: entry.createdAt.toISOString(),
      lastEdited: entry.updatedAt.toISOString(),
      fields,
    };
  } catch {
    return null;
  }
}

// ============= Recent Activity =============

export interface ActivityResult {
  summary: Record<string, number>;
  recentActions: Array<{
    action: string;
    title?: string;
    category?: string;
    metadata: Record<string, unknown>;
    when: string;
  }>;
  totalActions: number;
}

/** Get recent user activity for AI context */
export async function getRecentActivityCore(
  period: 'today' | 'this_week' | 'this_month',
  actionFilter?: string
): Promise<ActivityResult> {
  const now = new Date();
  let since: Date;

  switch (period) {
    case 'today':
      since = new Date(now.getFullYear(), now.getMonth(), now.getDate());
      break;
    case 'this_week':
      since = new Date(now.getTime() - 7 * 24 * 60 * 60 * 1000);
      break;
    case 'this_month':
      since = new Date(now.getTime() - 30 * 24 * 60 * 60 * 1000);
      break;
  }

  const validActions: ActionType[] = ['created', 'status_changed', 'snoozed', 'completed', 'archived', 'recategorized', 'note_added', 'saved_reading', 'searched'];
  const typedAction = actionFilter && validActions.includes(actionFilter as ActionType)
    ? (actionFilter as ActionType)
    : undefined;

  const [actions, summaryArr] = await Promise.all([
    getRecentActivity({
      action: typedAction,
      since,
      limit: 20,
    }),
    getActivitySummary(since),
  ]);

  // Convert ActivitySummary[] to Record<string, number>
  const summaryMap: Record<string, number> = {};
  for (const s of summaryArr) {
    summaryMap[s.action] = s.count;
  }

  return {
    summary: summaryMap,
    recentActions: actions.map(a => ({
      action: a.action,
      title: a.entryTitle || undefined,
      category: a.entryCategory || undefined,
      metadata: (a.metadata as Record<string, unknown>) || {},
      when: a.createdAt.toISOString(),
    })),
    totalActions: summaryArr.reduce((sum, s) => sum + s.count, 0),
  };
}
