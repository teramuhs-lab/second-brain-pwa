import { pgTable, uuid, text, real, timestamp, jsonb, index, uniqueIndex } from 'drizzle-orm/pg-core';
import { sql } from 'drizzle-orm';

// ============= Custom pgvector type =============
// drizzle-orm doesn't have built-in vector support, so we use a custom column
import { customType } from 'drizzle-orm/pg-core';

const vector = customType<{ data: number[]; driverParam: string }>({
  dataType() {
    return 'vector(1536)';
  },
  toDriver(value: number[]): string {
    return `[${value.join(',')}]`;
  },
  fromDriver(value: unknown): number[] {
    // Postgres returns vectors as '[0.1,0.2,...]'
    if (typeof value === 'string') return JSON.parse(value);
    if (Array.isArray(value)) return value as number[];
    return [];
  },
});

// ============= Entries =============
// Unified table for all 4 categories: People, Projects, Ideas, Admin
export const entries = pgTable('entries', {
  id: uuid('id').defaultRandom().primaryKey(),
  notionId: text('notion_id').unique(),
  category: text('category').notNull(), // 'People' | 'Projects' | 'Ideas' | 'Admin'
  title: text('title').notNull(),
  status: text('status'),
  priority: text('priority'),
  content: jsonb('content').$type<Record<string, unknown>>().default({}),
  embedding: vector('embedding'),
  dueDate: timestamp('due_date', { withTimezone: true }),
  archived: timestamp('archived_at', { withTimezone: true }),
  createdAt: timestamp('created_at', { withTimezone: true }).defaultNow().notNull(),
  updatedAt: timestamp('updated_at', { withTimezone: true }).defaultNow().notNull(),
}, (table) => [
  index('entries_category_idx').on(table.category),
  index('entries_status_idx').on(table.status),
  index('entries_due_date_idx').on(table.dueDate),
  index('entries_created_at_idx').on(table.createdAt),
  uniqueIndex('entries_notion_id_idx').on(table.notionId),
]);

// ============= Entry Relations =============
// Connections between entries (person→project, idea→project, etc.)
export const entryRelations = pgTable('entry_relations', {
  id: uuid('id').defaultRandom().primaryKey(),
  sourceId: uuid('source_id').notNull().references(() => entries.id, { onDelete: 'cascade' }),
  targetId: uuid('target_id').notNull().references(() => entries.id, { onDelete: 'cascade' }),
  relationType: text('relation_type').notNull(), // 'related_to', 'part_of', 'inspired_by'
  createdAt: timestamp('created_at', { withTimezone: true }).defaultNow().notNull(),
}, (table) => [
  index('relations_source_idx').on(table.sourceId),
  index('relations_target_idx').on(table.targetId),
]);

// ============= Inbox Log =============
// Capture audit trail
export const inboxLog = pgTable('inbox_log', {
  id: uuid('id').defaultRandom().primaryKey(),
  notionId: text('notion_id').unique(),
  rawInput: text('raw_input').notNull(),
  category: text('category'),
  confidence: real('confidence'),
  destinationId: text('destination_id'),
  status: text('status'), // 'Processed' | 'Needs Review' | 'Fixed' | 'Ignored'
  slackThread: text('slack_thread'),
  createdAt: timestamp('created_at', { withTimezone: true }).defaultNow().notNull(),
});

// ============= Chat Sessions =============
// Replaces Notion Chat Sessions DB
export const chatSessions = pgTable('chat_sessions', {
  id: uuid('id').defaultRandom().primaryKey(),
  sessionId: text('session_id').notNull().unique(),
  messages: jsonb('messages').$type<Array<{ role: string; content: string }>>().default([]),
  lastActive: timestamp('last_active', { withTimezone: true }).defaultNow().notNull(),
}, (table) => [
  uniqueIndex('chat_sessions_session_id_idx').on(table.sessionId),
]);

// ============= Config =============
// Key-value store for Google tokens, settings, etc.
// Replaces Notion Config DB
export const config = pgTable('config', {
  id: uuid('id').defaultRandom().primaryKey(),
  key: text('key').notNull().unique(),
  value: jsonb('value').$type<Record<string, unknown>>().default({}),
  updatedAt: timestamp('updated_at', { withTimezone: true }).defaultNow().notNull(),
}, (table) => [
  uniqueIndex('config_key_idx').on(table.key),
]);

// ============= Type exports =============
export type Entry = typeof entries.$inferSelect;
export type NewEntry = typeof entries.$inferInsert;
export type EntryRelation = typeof entryRelations.$inferSelect;
export type NewEntryRelation = typeof entryRelations.$inferInsert;
export type InboxLogEntry = typeof inboxLog.$inferSelect;
export type ChatSession = typeof chatSessions.$inferSelect;
export type ConfigEntry = typeof config.$inferSelect;

// ============= SQL helpers for pgvector =============
// Use these in queries for vector similarity search
export const cosineSimilarity = (column: string, embedding: number[]) =>
  sql`1 - (${sql.identifier(column)} <=> ${`[${embedding.join(',')}]`}::vector)`;
