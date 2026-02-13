/**
 * Embedding generation and storage utilities
 * Uses OpenAI text-embedding-3-small (1536 dimensions)
 */

import OpenAI from 'openai';
import { eq } from 'drizzle-orm';
import { db } from '@/db';
import { entries } from '@/db/schema';

const openai = new OpenAI({ apiKey: process.env.OPENAI_API_KEY });

/** Generate a single embedding vector from text */
export async function generateEmbedding(text: string): Promise<number[]> {
  const truncated = text.slice(0, 32000);
  const response = await openai.embeddings.create({
    model: 'text-embedding-3-small',
    input: truncated,
  });
  return response.data[0].embedding;
}

/** Generate embeddings for multiple texts in batches */
export async function generateEmbeddingsBatch(
  texts: string[],
  batchSize = 20
): Promise<number[][]> {
  const results: number[][] = [];

  for (let i = 0; i < texts.length; i += batchSize) {
    const batch = texts.slice(i, i + batchSize).map(t => t.slice(0, 32000));
    const response = await openai.embeddings.create({
      model: 'text-embedding-3-small',
      input: batch,
    });
    results.push(...response.data.map(d => d.embedding));

    if (i + batchSize < texts.length) {
      await new Promise(r => setTimeout(r, 500));
    }
  }

  return results;
}

/** Generate and store an embedding for an entry */
export async function upsertEmbedding(entryId: string, text: string): Promise<void> {
  const embedding = await generateEmbedding(text);
  await db
    .update(entries)
    .set({ embedding })
    .where(eq(entries.id, entryId));
}

/** Build the text to embed for an entry */
export function buildEmbeddingText(
  title: string,
  content: Record<string, unknown>
): string {
  const parts = [title];

  for (const [key, value] of Object.entries(content)) {
    if (typeof value === 'string' && value.trim()) {
      parts.push(value);
    }
  }

  return parts.join(' ').trim();
}
