/**
 * Unified data service — Neon (Postgres) only
 *
 * All reads and writes go directly to Neon.
 */

import { eq, and, sql, ilike, desc, asc } from 'drizzle-orm';
import { db } from '@/db';
import { entries, inboxLog, type NewEntry } from '@/db/schema';
import { DEFAULT_STATUS } from '@/config/constants';
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

  return neonEntry;
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

  return updated;
}

// ============= ARCHIVE (soft delete) =============

export async function archiveEntry(id: string) {
  const [archived] = await db
    .update(entries)
    .set({ archived: new Date() })
    .where(eq(entries.id, id))
    .returning();

  return archived || null;
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

  return logEntry;
}
