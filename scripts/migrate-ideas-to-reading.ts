/**
 * One-time migration: Move Ideas entries with source URLs → Reading category
 *
 * Identifies Ideas entries that have a 'source' field in their JSONB content
 * (these are saved links/articles), updates their category to 'Reading',
 * maps their status, and regenerates embeddings.
 *
 * Run with:
 *   DOTENV_CONFIG_PATH=.env.local npx tsx --require dotenv/config scripts/migrate-ideas-to-reading.ts
 */

import { eq, and, sql } from 'drizzle-orm';
import { db } from '../src/db';
import { entries } from '../src/db/schema';
import { generateEmbeddingsBatch, buildEmbeddingText } from '../src/services/db/embeddings';
import { logActivity } from '../src/services/db/activity';

async function migrateIdeasToReading() {
  console.log('=== Migrate Ideas → Reading ===\n');

  // Step 1: Find Ideas entries with a source URL
  const candidates = await db
    .select()
    .from(entries)
    .where(
      and(
        eq(entries.category, 'Ideas'),
        sql`${entries.content} ->> 'source' IS NOT NULL`,
        sql`${entries.content} ->> 'source' != ''`,
        sql`${entries.archived} IS NULL`
      )
    );

  console.log(`Found ${candidates.length} Ideas entries with source URLs:\n`);

  if (candidates.length === 0) {
    console.log('Nothing to migrate.');
    return;
  }

  for (const entry of candidates) {
    const content = (entry.content as Record<string, unknown>) || {};
    console.log(`  - "${entry.title}" [${entry.status}] source=${(content.source as string)?.slice(0, 60)}...`);
  }
  console.log();

  // Step 2: Build embedding texts
  const embeddingTexts = candidates.map(entry =>
    buildEmbeddingText(entry.title, (entry.content as Record<string, unknown>) || {})
  );

  // Step 3: Generate new embeddings in batch
  console.log(`Generating ${candidates.length} embeddings...`);
  const newEmbeddings = await generateEmbeddingsBatch(embeddingTexts);
  console.log(`Generated ${newEmbeddings.length} embeddings.\n`);

  // Step 4: Update each entry
  let migrated = 0;
  let failed = 0;

  for (let i = 0; i < candidates.length; i++) {
    const entry = candidates[i];

    // Map Ideas status → Reading status
    const newStatus = entry.status === 'Actionable' ? 'Read' : 'Unread';

    try {
      await db
        .update(entries)
        .set({
          category: 'Reading',
          status: newStatus,
          embedding: newEmbeddings[i],
          updatedAt: new Date(),
        })
        .where(eq(entries.id, entry.id));

      // Log the migration as activity
      logActivity(entry.id, 'recategorized', { from: 'Ideas', to: 'Reading' });

      migrated++;
      console.log(`  ✓ "${entry.title}" → Reading (${newStatus})`);
    } catch (err) {
      failed++;
      console.error(`  ✗ Failed: "${entry.title}" —`, err);
    }
  }

  console.log(`\n=== Migration complete: ${migrated} migrated, ${failed} failed ===`);
}

migrateIdeasToReading()
  .then(() => {
    // Give logActivity calls time to flush
    setTimeout(() => process.exit(0), 1000);
  })
  .catch(err => {
    console.error('Migration failed:', err);
    process.exit(1);
  });
