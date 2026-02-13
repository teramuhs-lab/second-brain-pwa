/**
 * Unified data service — dual-write to Neon + Notion
 *
 * All reads come from Neon (fast).
 * All writes go to Neon first, then Notion (best-effort backup).
 */

import { eq, and, sql, ilike, desc, asc } from 'drizzle-orm';
import { db } from '@/db';
import { entries, inboxLog, type NewEntry } from '@/db/schema';
import { createPage, updatePage, archivePage } from '@/services/notion/client';
import { CATEGORY_DB_IDS, DEFAULT_STATUS, TITLE_PROPERTY, DATABASE_IDS } from '@/config/constants';
import { generateEmbedding, buildEmbeddingText } from './embeddings';

// ============= Types =============

export interface CreateEntryInput {
  category: 'People' | 'Project' | 'Idea' | 'Admin';
  title: string;
  status?: string;
  priority?: string;
  content?: Record<string, unknown>;
  dueDate?: string | null; // ISO date string
  embedding?: number[];
}

export interface UpdateEntryInput {
  title?: string;
  status?: string;
  priority?: string;
  content?: Record<string, unknown>;
  dueDate?: string | null;
}

export interface QueryFilters {
  category?: string;
  status?: string;
  priority?: string;
  search?: string;
  limit?: number;
  offset?: number;
  orderBy?: 'created_at' | 'updated_at' | 'due_date' | 'title';
  orderDir?: 'asc' | 'desc';
}

// Map category to the DB category name used in entries table
const CATEGORY_TO_DB_CATEGORY: Record<string, string> = {
  People: 'People',
  Project: 'Projects',
  Idea: 'Ideas',
  Admin: 'Admin',
};

// ============= CREATE =============

export async function createEntry(input: CreateEntryInput) {
  const dbCategory = CATEGORY_TO_DB_CATEGORY[input.category] || input.category;
  const defaultStatus = DEFAULT_STATUS[input.category];

  // 1. Generate embedding
  const embeddingText = buildEmbeddingText(
    input.title,
    input.content || {}
  );
  let embedding = input.embedding;
  if (!embedding) {
    try {
      embedding = await generateEmbedding(embeddingText);
    } catch (err) {
      console.error('Failed to generate embedding:', err);
    }
  }

  // 2. Insert into Neon
  const [neonEntry] = await db
    .insert(entries)
    .values({
      category: dbCategory,
      title: input.title,
      status: input.status || defaultStatus,
      priority: input.priority || null,
      content: input.content || {},
      embedding: embedding || null,
      dueDate: input.dueDate ? new Date(input.dueDate) : null,
    })
    .returning();

  // 3. Dual-write to Notion (best-effort)
  let notionPageId: string | null = null;
  try {
    const notionProps = buildNotionProperties(input);
    const notionPage = await createPage(CATEGORY_DB_IDS[input.category], notionProps);
    notionPageId = notionPage.id;

    // Store Notion ID back in Neon for cross-referencing
    await db
      .update(entries)
      .set({ notionId: notionPageId })
      .where(eq(entries.id, neonEntry.id));
  } catch (err) {
    console.error('Notion dual-write failed (entry still saved in Neon):', err);
  }

  return {
    ...neonEntry,
    notionId: notionPageId,
  };
}

// ============= READ =============

export async function getEntry(id: string) {
  const [entry] = await db
    .select()
    .from(entries)
    .where(eq(entries.id, id))
    .limit(1);
  return entry || null;
}

export async function getEntryByNotionId(notionId: string) {
  const [entry] = await db
    .select()
    .from(entries)
    .where(eq(entries.notionId, notionId))
    .limit(1);
  return entry || null;
}

export async function queryEntries(filters: QueryFilters = {}) {
  const conditions = [];

  if (filters.category) {
    conditions.push(eq(entries.category, filters.category));
  }
  if (filters.status) {
    conditions.push(ilike(entries.status, filters.status));
  }
  if (filters.priority) {
    conditions.push(eq(entries.priority, filters.priority));
  }
  if (filters.search) {
    conditions.push(
      sql`(${entries.title} ILIKE ${'%' + filters.search + '%'} OR ${entries.content}::text ILIKE ${'%' + filters.search + '%'})`
    );
  }

  // Exclude archived
  conditions.push(sql`${entries.archived} IS NULL`);

  const orderCol = {
    created_at: entries.createdAt,
    updated_at: entries.updatedAt,
    due_date: entries.dueDate,
    title: entries.title,
  }[filters.orderBy || 'created_at'];

  const orderFn = filters.orderDir === 'asc' ? asc : desc;

  const results = await db
    .select()
    .from(entries)
    .where(conditions.length > 0 ? and(...conditions) : undefined)
    .orderBy(orderFn(orderCol))
    .limit(filters.limit || 100)
    .offset(filters.offset || 0);

  return results;
}

// ============= UPDATE =============

export async function updateEntry(id: string, input: UpdateEntryInput) {
  // 1. Update Neon
  const updateData: Record<string, unknown> = {
    updatedAt: new Date(),
  };

  if (input.title !== undefined) updateData.title = input.title;
  if (input.status !== undefined) updateData.status = input.status;
  if (input.priority !== undefined) updateData.priority = input.priority;
  if (input.dueDate !== undefined) {
    updateData.dueDate = input.dueDate ? new Date(input.dueDate) : null;
  }
  if (input.content !== undefined) {
    // Merge content rather than replace
    const existing = await getEntry(id);
    if (existing) {
      updateData.content = { ...(existing.content as Record<string, unknown>), ...input.content };
    } else {
      updateData.content = input.content;
    }
  }

  const [updated] = await db
    .update(entries)
    .set(updateData)
    .where(eq(entries.id, id))
    .returning();

  if (!updated) return null;

  // Re-generate embedding if title or content changed
  if (input.title !== undefined || input.content !== undefined) {
    try {
      const text = buildEmbeddingText(
        updated.title,
        (updated.content as Record<string, unknown>) || {}
      );
      const embedding = await generateEmbedding(text);
      await db.update(entries).set({ embedding }).where(eq(entries.id, id));
    } catch (err) {
      console.error('Failed to update embedding:', err);
    }
  }

  // 2. Dual-write to Notion (best-effort)
  if (updated.notionId) {
    try {
      const notionProps = buildNotionUpdateProperties(updated.category, input);
      await updatePage(updated.notionId, notionProps);
    } catch (err) {
      console.error('Notion dual-write update failed:', err);
    }
  }

  return updated;
}

// ============= ARCHIVE (soft delete) =============

export async function archiveEntry(id: string) {
  // 1. Soft-delete in Neon
  const [archived] = await db
    .update(entries)
    .set({ archived: new Date() })
    .where(eq(entries.id, id))
    .returning();

  if (!archived) return null;

  // 2. Archive in Notion (best-effort)
  if (archived.notionId) {
    try {
      await archivePage(archived.notionId);
    } catch (err) {
      console.error('Notion archive failed:', err);
    }
  }

  return archived;
}

// ============= SEARCH (vector + keyword) =============

export async function searchEntries(
  query: string,
  options: { category?: string; limit?: number } = {}
) {
  const limit = options.limit || 20;

  // Generate query embedding
  let queryEmbedding: number[] | null = null;
  try {
    queryEmbedding = await generateEmbedding(query);
  } catch (err) {
    console.error('Failed to generate search embedding:', err);
  }

  // Build WHERE conditions
  const conditions = [sql`${entries.archived} IS NULL`];
  if (options.category) {
    conditions.push(eq(entries.category, options.category));
  }

  if (queryEmbedding) {
    // Hybrid search: vector similarity + keyword matching
    const embeddingStr = `[${queryEmbedding.join(',')}]`;
    const results = await db
      .select({
        id: entries.id,
        notionId: entries.notionId,
        category: entries.category,
        title: entries.title,
        status: entries.status,
        priority: entries.priority,
        content: entries.content,
        dueDate: entries.dueDate,
        createdAt: entries.createdAt,
        updatedAt: entries.updatedAt,
        similarity: sql<number>`1 - (${entries.embedding} <=> ${embeddingStr}::vector)`,
      })
      .from(entries)
      .where(and(...conditions))
      .orderBy(sql`${entries.embedding} <=> ${embeddingStr}::vector`)
      .limit(limit);

    return results;
  } else {
    // Fallback: keyword search only
    conditions.push(
      sql`(${entries.title} ILIKE ${'%' + query + '%'} OR ${entries.content}::text ILIKE ${'%' + query + '%'})`
    );

    const results = await db
      .select()
      .from(entries)
      .where(and(...conditions))
      .orderBy(desc(entries.updatedAt))
      .limit(limit);

    return results.map(r => ({ ...r, similarity: 0 }));
  }
}

// ============= INBOX LOG =============

export async function createInboxLogEntry(data: {
  rawInput: string;
  category: string;
  confidence: number;
  destinationId?: string;
  status?: string;
}) {
  // 1. Insert into Neon
  const [logEntry] = await db
    .insert(inboxLog)
    .values({
      rawInput: data.rawInput,
      category: data.category,
      confidence: data.confidence,
      destinationId: data.destinationId || null,
      status: data.status || 'Processed',
    })
    .returning();

  // 2. Dual-write to Notion (best-effort)
  try {
    const notionPage = await createPage(DATABASE_IDS.InboxLog, {
      'Raw Input': {
        title: [{ text: { content: data.rawInput } }],
      },
      Category: {
        select: { name: data.category },
      },
      Confidence: {
        number: data.confidence,
      },
      'Destination ID': {
        rich_text: [{ text: { content: data.destinationId || '' } }],
      },
      Status: {
        select: { name: data.status || 'Processed' },
      },
    });

    // Store Notion ID
    await db
      .update(inboxLog)
      .set({ notionId: notionPage.id })
      .where(eq(inboxLog.id, logEntry.id));
  } catch (err) {
    console.error('Notion inbox log dual-write failed:', err);
  }

  return logEntry;
}

// ============= Notion property builders =============

function buildNotionProperties(input: CreateEntryInput): Record<string, unknown> {
  const titleProp = TITLE_PROPERTY[input.category];
  const defaultStatus = DEFAULT_STATUS[input.category];

  const properties: Record<string, unknown> = {
    [titleProp]: {
      title: [{ text: { content: input.title.slice(0, 100) } }],
    },
  };

  // Status/Maturity
  if (input.category === 'Idea') {
    properties['Maturity'] = { select: { name: input.status || defaultStatus } };
  } else {
    properties['Status'] = { select: { name: input.status || defaultStatus } };
  }

  // Priority
  if (input.priority && (input.category === 'Admin' || input.category === 'Project')) {
    properties['Priority'] = { select: { name: input.priority } };
  }

  // Due date
  if (input.dueDate) {
    if (input.category === 'People') {
      properties['Next Follow-up'] = { date: { start: input.dueDate } };
    } else {
      properties['Due Date'] = { date: { start: input.dueDate } };
    }
  }

  // Category-specific content fields
  const content = input.content || {};

  if (input.category === 'Admin') {
    if (content.notes) {
      properties['Notes'] = { rich_text: [{ text: { content: String(content.notes) } }] };
    }
    if (content.adminCategory) {
      properties['Category'] = { select: { name: String(content.adminCategory) } };
    }
  } else if (input.category === 'Project') {
    if (content.nextAction) {
      properties['Next Action'] = { rich_text: [{ text: { content: String(content.nextAction) } }] };
    }
    if (content.area) {
      properties['Area'] = { select: { name: String(content.area) } };
    }
    if (content.notes) {
      properties['Notes'] = { rich_text: [{ text: { content: String(content.notes) } }] };
    }
  } else if (input.category === 'Idea') {
    if (content.rawInsight) {
      properties['Raw Insight'] = { rich_text: [{ text: { content: String(content.rawInsight).slice(0, 2000) } }] };
    }
    if (content.oneLiner) {
      properties['One-liner'] = { rich_text: [{ text: { content: String(content.oneLiner) } }] };
    }
    if (content.source) {
      properties['Source'] = { url: String(content.source) };
    }
    if (content.ideaCategory) {
      properties['Category'] = { select: { name: String(content.ideaCategory) } };
    }
  } else if (input.category === 'People') {
    if (content.company) {
      properties['Company'] = { rich_text: [{ text: { content: String(content.company) } }] };
    }
    if (content.role) {
      properties['Role'] = { rich_text: [{ text: { content: String(content.role) } }] };
    }
    if (content.context) {
      properties['Context'] = { rich_text: [{ text: { content: String(content.context) } }] };
    }
    if (content.lastContact) {
      properties['Last Contact'] = { date: { start: String(content.lastContact) } };
    }
  }

  return properties;
}

function buildNotionUpdateProperties(
  category: string,
  input: UpdateEntryInput
): Record<string, unknown> {
  const properties: Record<string, unknown> = {};

  if (input.status !== undefined) {
    if (category === 'Ideas') {
      properties['Maturity'] = { select: { name: input.status } };
    } else {
      properties['Status'] = { select: { name: input.status } };
    }
  }

  if (input.priority !== undefined) {
    properties['Priority'] = { select: { name: input.priority } };
  }

  if (input.dueDate !== undefined) {
    if (category === 'People') {
      properties['Next Follow-up'] = input.dueDate ? { date: { start: input.dueDate } } : null;
    } else {
      properties['Due Date'] = input.dueDate ? { date: { start: input.dueDate } } : null;
    }
  }

  if (input.content) {
    for (const [key, value] of Object.entries(input.content)) {
      if (typeof value !== 'string' || !value) continue;

      // Map content keys to Notion property names
      const fieldMap: Record<string, string> = {
        notes: 'Notes',
        nextAction: 'Next Action',
        rawInsight: 'Raw Insight',
        oneLiner: 'One-liner',
        context: 'Context',
        company: 'Company',
        role: 'Role',
      };

      const notionField = fieldMap[key];
      if (notionField) {
        properties[notionField] = {
          rich_text: [{ text: { content: value.slice(0, 2000) } }],
        };
      }
    }
  }

  return properties;
}
