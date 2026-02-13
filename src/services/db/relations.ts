/**
 * Entry relations service — connections between entries
 *
 * Manages bidirectional links (person→project, idea→project, etc.)
 * and auto-suggests relations based on embedding similarity.
 */

import { eq, or, sql, and } from 'drizzle-orm';
import { db } from '@/db';
import { entries, entryRelations } from '@/db/schema';
import { generateEmbedding } from './embeddings';

export type RelationType = 'related_to' | 'part_of' | 'inspired_by';

// ============= CRUD =============

export async function addRelation(
  sourceId: string,
  targetId: string,
  type: RelationType = 'related_to'
) {
  const [relation] = await db
    .insert(entryRelations)
    .values({
      sourceId,
      targetId,
      relationType: type,
    })
    .returning();

  return relation;
}

export async function removeRelation(id: string) {
  await db.delete(entryRelations).where(eq(entryRelations.id, id));
}

export async function getRelatedEntries(entryId: string) {
  // Get relations where this entry is source or target
  const relations = await db
    .select()
    .from(entryRelations)
    .where(
      or(
        eq(entryRelations.sourceId, entryId),
        eq(entryRelations.targetId, entryId)
      )
    );

  if (relations.length === 0) return [];

  // Collect all related entry IDs
  const relatedIds = new Set<string>();
  for (const rel of relations) {
    if (rel.sourceId !== entryId) relatedIds.add(rel.sourceId);
    if (rel.targetId !== entryId) relatedIds.add(rel.targetId);
  }

  if (relatedIds.size === 0) return [];

  // Fetch the related entries
  const relatedEntries = await db
    .select()
    .from(entries)
    .where(
      sql`${entries.id} IN (${sql.join(
        [...relatedIds].map(id => sql`${id}::uuid`),
        sql`, `
      )})`
    );

  // Attach relation metadata
  return relatedEntries.map(entry => {
    const relation = relations.find(
      r => r.sourceId === entry.id || r.targetId === entry.id
    );
    return {
      ...entry,
      relationId: relation?.id,
      relationType: relation?.relationType,
    };
  });
}

// ============= Auto-suggest =============

/**
 * Find entries most similar to the given entry by embedding distance.
 * Returns top N candidates above the similarity threshold.
 */
export async function suggestRelations(
  entryId: string,
  options: { limit?: number; threshold?: number } = {}
) {
  const limit = options.limit || 5;
  const threshold = options.threshold || 0.75;

  // Get the source entry's embedding
  const [source] = await db
    .select({ embedding: entries.embedding })
    .from(entries)
    .where(eq(entries.id, entryId))
    .limit(1);

  if (!source?.embedding) return [];

  const embeddingStr = `[${source.embedding.join(',')}]`;

  // Find existing relation IDs to exclude
  const existingRelations = await db
    .select()
    .from(entryRelations)
    .where(
      or(
        eq(entryRelations.sourceId, entryId),
        eq(entryRelations.targetId, entryId)
      )
    );

  const excludeIds = new Set([
    entryId,
    ...existingRelations.map(r => r.sourceId),
    ...existingRelations.map(r => r.targetId),
  ]);

  // Vector similarity search, excluding self and existing relations
  const similar = await db
    .select({
      id: entries.id,
      category: entries.category,
      title: entries.title,
      status: entries.status,
      similarity: sql<number>`1 - (${entries.embedding} <=> ${embeddingStr}::vector)`,
    })
    .from(entries)
    .where(
      and(
        sql`${entries.archived} IS NULL`,
        sql`${entries.embedding} IS NOT NULL`,
        sql`1 - (${entries.embedding} <=> ${embeddingStr}::vector) > ${threshold}`
      )
    )
    .orderBy(sql`${entries.embedding} <=> ${embeddingStr}::vector`)
    .limit(limit + excludeIds.size);

  // Filter out already-related entries
  return similar
    .filter(s => !excludeIds.has(s.id))
    .slice(0, limit);
}

/**
 * Suggest relations for a newly created entry using its text content.
 * Useful when the entry doesn't have an embedding stored yet.
 */
export async function suggestRelationsForText(
  text: string,
  excludeEntryId?: string,
  options: { limit?: number; threshold?: number } = {}
) {
  const limit = options.limit || 5;
  const threshold = options.threshold || 0.75;

  const embedding = await generateEmbedding(text);
  const embeddingStr = `[${embedding.join(',')}]`;

  const conditions = [
    sql`${entries.archived} IS NULL`,
    sql`${entries.embedding} IS NOT NULL`,
    sql`1 - (${entries.embedding} <=> ${embeddingStr}::vector) > ${threshold}`,
  ];

  if (excludeEntryId) {
    conditions.push(sql`${entries.id} != ${excludeEntryId}::uuid`);
  }

  const similar = await db
    .select({
      id: entries.id,
      category: entries.category,
      title: entries.title,
      status: entries.status,
      similarity: sql<number>`1 - (${entries.embedding} <=> ${embeddingStr}::vector)`,
    })
    .from(entries)
    .where(and(...conditions))
    .orderBy(sql`${entries.embedding} <=> ${embeddingStr}::vector`)
    .limit(limit);

  return similar;
}
