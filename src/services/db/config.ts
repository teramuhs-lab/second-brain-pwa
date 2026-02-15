// Shared config table helpers (key-value store in Neon)

import { eq } from 'drizzle-orm';
import { db } from '@/db';
import { config } from '@/db/schema';

/** Find a config entry by key */
export async function findConfigEntry(key: string): Promise<{ id: string; value: unknown } | null> {
  const [entry] = await db
    .select()
    .from(config)
    .where(eq(config.key, key))
    .limit(1);

  if (!entry) return null;
  return { id: entry.id, value: entry.value };
}

/** Store or update a config entry (wraps value in {data: ...} for jsonb compatibility) */
export async function upsertConfig(key: string, value: unknown): Promise<void> {
  const wrapped = { data: value } as Record<string, unknown>;
  await db
    .insert(config)
    .values({ key, value: wrapped })
    .onConflictDoUpdate({
      target: config.key,
      set: { value: wrapped },
    });
}

/** Delete a config entry */
export async function deleteConfig(key: string): Promise<void> {
  await db.delete(config).where(eq(config.key, key));
}
