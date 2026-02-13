/**
 * One-time seed script: Migrate all Notion data into Neon Postgres
 *
 * Usage:  npx tsx src/db/seed-from-notion.ts
 *
 * What it does:
 *  1. Reads all 5 Notion databases (People, Projects, Ideas, Admin, Inbox Log)
 *  2. Maps each page to the unified `entries` table schema
 *  3. Generates embeddings via OpenAI text-embedding-3-small
 *  4. Inserts into Neon (entries + inbox_log tables)
 *
 * Safe to re-run — uses ON CONFLICT (notion_id) DO UPDATE to upsert.
 */

import { config } from 'dotenv';
config({ path: '.env.local' });

import { neon } from '@neondatabase/serverless';
import { drizzle } from 'drizzle-orm/neon-http';
import OpenAI from 'openai';
import { entries, inboxLog } from './schema';
import { queryDatabase } from '../services/notion/client';
import {
  extractTitle,
  extractSelect,
  extractStatus,
  extractPriority,
  extractDate,
  extractRichText,
  extractUrl,
  extractNumber,
  extractAllText,
} from '../services/notion/helpers';

// ============= Config =============

const DATABASE_IDS = {
  People: '2f092129-b3db-81b4-b767-fed1e3190303',
  Projects: '2f092129-b3db-81fd-aef1-e62b4f3445ff',
  Ideas: '2f092129-b3db-8121-b140-f7a8f4ec2a45',
  Admin: '2f092129-b3db-8171-ae6c-f98e8124574c',
  InboxLog: '2f092129-b3db-8104-a9ca-fc123e5be4a3',
};

// ============= Database connection =============

if (!process.env.DATABASE_URL) {
  throw new Error('DATABASE_URL not set in .env.local');
}
if (!process.env.OPENAI_API_KEY) {
  throw new Error('OPENAI_API_KEY not set in .env.local');
}

const sql = neon(process.env.DATABASE_URL);
const db = drizzle(sql);
const openai = new OpenAI({ apiKey: process.env.OPENAI_API_KEY });

// ============= Embedding generation =============

async function generateEmbedding(text: string): Promise<number[]> {
  // Truncate to ~8000 tokens worth of text (~32k chars) to stay within model limits
  const truncated = text.slice(0, 32000);
  const response = await openai.embeddings.create({
    model: 'text-embedding-3-small',
    input: truncated,
  });
  return response.data[0].embedding;
}

// Batch embeddings with rate limiting (max 20 per batch, 1s delay between batches)
async function generateEmbeddingsBatch(texts: string[]): Promise<number[][]> {
  const BATCH_SIZE = 20;
  const results: number[][] = [];

  for (let i = 0; i < texts.length; i += BATCH_SIZE) {
    const batch = texts.slice(i, i + BATCH_SIZE).map(t => t.slice(0, 32000));
    const response = await openai.embeddings.create({
      model: 'text-embedding-3-small',
      input: batch,
    });
    results.push(...response.data.map(d => d.embedding));

    if (i + BATCH_SIZE < texts.length) {
      await new Promise(r => setTimeout(r, 1000)); // rate limit pause
    }
  }

  return results;
}

// ============= Category-specific field extraction =============

interface EntryData {
  notionId: string;
  category: string;
  title: string;
  status: string | null;
  priority: string | null;
  content: Record<string, unknown>;
  dueDate: Date | null;
  createdAt: Date;
  updatedAt: Date;
  embeddingText: string; // text to generate embedding from
}

function extractPeopleEntry(page: { id: string; properties: Record<string, unknown>; created_time: string; last_edited_time: string }): EntryData {
  const props = page.properties;
  return {
    notionId: page.id,
    category: 'People',
    title: extractTitle(props),
    status: extractStatus(props) || null,
    priority: null,
    content: {
      company: extractRichText(props, 'Company'),
      role: extractRichText(props, 'Role'),
      context: extractRichText(props, 'Context'),
      lastContact: extractDate(props, 'Last Contact') || null,
      nextFollowUp: extractDate(props, 'Next Follow-up') || null,
    },
    dueDate: extractDate(props, 'Next Follow-up') ? new Date(extractDate(props, 'Next Follow-up')!) : null,
    createdAt: new Date(page.created_time),
    updatedAt: new Date(page.last_edited_time),
    embeddingText: extractAllText(props),
  };
}

function extractProjectEntry(page: { id: string; properties: Record<string, unknown>; created_time: string; last_edited_time: string }): EntryData {
  const props = page.properties;
  return {
    notionId: page.id,
    category: 'Projects',
    title: extractTitle(props),
    status: extractStatus(props) || null,
    priority: extractPriority(props) || null,
    content: {
      nextAction: extractRichText(props, 'Next Action'),
      area: extractSelect(props, 'Area') || null,
      notes: extractRichText(props, 'Notes'),
    },
    dueDate: extractDate(props, 'Due Date') ? new Date(extractDate(props, 'Due Date')!) : null,
    createdAt: new Date(page.created_time),
    updatedAt: new Date(page.last_edited_time),
    embeddingText: extractAllText(props),
  };
}

function extractIdeaEntry(page: { id: string; properties: Record<string, unknown>; created_time: string; last_edited_time: string }): EntryData {
  const props = page.properties;
  return {
    notionId: page.id,
    category: 'Ideas',
    title: extractTitle(props),
    status: extractSelect(props, 'Maturity') || null,
    priority: null,
    content: {
      rawInsight: extractRichText(props, 'Raw Insight'),
      oneLiner: extractRichText(props, 'One-liner'),
      source: extractUrl(props, 'Source') || null,
      ideaCategory: extractSelect(props, 'Category') || null,
    },
    dueDate: null,
    createdAt: new Date(page.created_time),
    updatedAt: new Date(page.last_edited_time),
    embeddingText: extractAllText(props),
  };
}

function extractAdminEntry(page: { id: string; properties: Record<string, unknown>; created_time: string; last_edited_time: string }): EntryData {
  const props = page.properties;
  return {
    notionId: page.id,
    category: 'Admin',
    title: extractTitle(props),
    status: extractStatus(props) || null,
    priority: extractPriority(props) || null,
    content: {
      adminCategory: extractSelect(props, 'Category') || null,
      notes: extractRichText(props, 'Notes'),
    },
    dueDate: extractDate(props, 'Due Date') ? new Date(extractDate(props, 'Due Date')!) : null,
    createdAt: new Date(page.created_time),
    updatedAt: new Date(page.last_edited_time),
    embeddingText: extractAllText(props),
  };
}

// ============= Inbox Log extraction =============

interface InboxLogData {
  notionId: string;
  rawInput: string;
  category: string | null;
  confidence: number | null;
  destinationId: string | null;
  status: string | null;
  slackThread: string | null;
  createdAt: Date;
}

function extractInboxLogEntry(page: { id: string; properties: Record<string, unknown>; created_time: string }): InboxLogData {
  const props = page.properties;
  return {
    notionId: page.id,
    rawInput: extractTitle(props) || 'No input',
    category: extractSelect(props, 'Category') || null,
    confidence: extractNumber(props, 'Confidence') || null,
    destinationId: extractRichText(props, 'Destination ID') || null,
    status: extractStatus(props) || null,
    slackThread: extractUrl(props, 'Slack Thread') || null,
    createdAt: new Date(page.created_time),
  };
}

// ============= Main seed function =============

async function seed() {
  console.log('=== Notion → Neon Seed Script ===\n');

  // 1. Fetch all Notion databases in parallel
  console.log('Fetching from Notion...');
  const [peoplePages, projectPages, ideaPages, adminPages, inboxPages] = await Promise.all([
    queryDatabase(DATABASE_IDS.People),
    queryDatabase(DATABASE_IDS.Projects),
    queryDatabase(DATABASE_IDS.Ideas),
    queryDatabase(DATABASE_IDS.Admin),
    queryDatabase(DATABASE_IDS.InboxLog),
  ]);

  console.log(`  People:   ${peoplePages.length} pages`);
  console.log(`  Projects: ${projectPages.length} pages`);
  console.log(`  Ideas:    ${ideaPages.length} pages`);
  console.log(`  Admin:    ${adminPages.length} pages`);
  console.log(`  Inbox:    ${inboxPages.length} pages`);

  // 2. Extract structured data
  console.log('\nExtracting fields...');
  const allEntries: EntryData[] = [
    ...peoplePages.map(extractPeopleEntry),
    ...projectPages.map(extractProjectEntry),
    ...ideaPages.map(extractIdeaEntry),
    ...adminPages.map(extractAdminEntry),
  ];
  console.log(`  Total entries: ${allEntries.length}`);

  const allInboxLogs: InboxLogData[] = inboxPages.map(extractInboxLogEntry);
  console.log(`  Total inbox logs: ${allInboxLogs.length}`);

  // 3. Generate embeddings in batches
  console.log('\nGenerating embeddings...');
  const embeddingTexts = allEntries.map(e => {
    const text = `${e.title} ${e.embeddingText}`.trim();
    return text || e.title;
  });

  const embeddings = await generateEmbeddingsBatch(embeddingTexts);
  console.log(`  Generated ${embeddings.length} embeddings`);

  // 4. Insert entries into Neon
  console.log('\nInserting entries into Neon...');
  let insertedEntries = 0;
  let updatedEntries = 0;

  for (let i = 0; i < allEntries.length; i++) {
    const entry = allEntries[i];
    const embedding = embeddings[i];

    try {
      await db.insert(entries).values({
        notionId: entry.notionId,
        category: entry.category,
        title: entry.title,
        status: entry.status,
        priority: entry.priority,
        content: entry.content,
        embedding,
        dueDate: entry.dueDate,
        createdAt: entry.createdAt,
        updatedAt: entry.updatedAt,
      }).onConflictDoUpdate({
        target: entries.notionId,
        set: {
          category: entry.category,
          title: entry.title,
          status: entry.status,
          priority: entry.priority,
          content: entry.content,
          embedding,
          dueDate: entry.dueDate,
          updatedAt: entry.updatedAt,
        },
      });

      insertedEntries++;
      if (insertedEntries % 10 === 0) {
        process.stdout.write(`  ${insertedEntries}/${allEntries.length}\r`);
      }
    } catch (err) {
      console.error(`  Failed to insert entry "${entry.title}" (${entry.notionId}):`, err);
    }
  }
  console.log(`  Entries: ${insertedEntries} upserted`);

  // 5. Insert inbox logs into Neon
  console.log('\nInserting inbox logs into Neon...');
  let insertedLogs = 0;

  for (const log of allInboxLogs) {
    try {
      await db.insert(inboxLog).values({
        notionId: log.notionId,
        rawInput: log.rawInput,
        category: log.category,
        confidence: log.confidence,
        destinationId: log.destinationId,
        status: log.status,
        slackThread: log.slackThread,
        createdAt: log.createdAt,
      }).onConflictDoUpdate({
        target: inboxLog.notionId,
        set: {
          rawInput: log.rawInput,
          category: log.category,
          confidence: log.confidence,
          destinationId: log.destinationId,
          status: log.status,
          slackThread: log.slackThread,
        },
      });

      insertedLogs++;
    } catch (err) {
      console.error(`  Failed to insert inbox log "${log.rawInput.slice(0, 50)}":`, err);
    }
  }
  console.log(`  Inbox logs: ${insertedLogs} upserted`);

  // 6. Summary
  console.log('\n=== Seed Complete ===');
  console.log(`  Entries:    ${insertedEntries} / ${allEntries.length}`);
  console.log(`  Inbox logs: ${insertedLogs} / ${allInboxLogs.length}`);
  console.log(`  Embeddings: ${embeddings.length} generated`);
}

seed().catch(err => {
  console.error('Seed failed:', err);
  process.exit(1);
});
