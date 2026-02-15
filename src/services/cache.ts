// Lightweight DB-backed cache using the config table
// Keys are prefixed with "cache:" to avoid collisions with other config entries

import { findConfigEntry, upsertConfig, deleteConfig } from '@/services/db/config';

interface CacheEntry<T> {
  data: T;
  expiresAt: number;
}

/** Get a cached value. Returns null if missing or expired. */
export async function getCached<T>(key: string): Promise<T | null> {
  const cacheKey = key.startsWith('cache:') ? key : `cache:${key}`;
  const entry = await findConfigEntry(cacheKey);
  if (!entry?.value) return null;

  const val = entry.value as Record<string, unknown>;
  const wrapped = val?.data as CacheEntry<T> | undefined;
  if (!wrapped || !wrapped.expiresAt) return null;

  if (Date.now() > wrapped.expiresAt) {
    // Expired — clean up asynchronously
    deleteConfig(cacheKey).catch(() => {});
    return null;
  }

  return wrapped.data;
}

/** Store a value in cache with a TTL in milliseconds. */
export async function setCache(key: string, value: unknown, ttlMs: number): Promise<void> {
  const cacheKey = key.startsWith('cache:') ? key : `cache:${key}`;
  const cacheEntry: CacheEntry<unknown> = {
    data: value,
    expiresAt: Date.now() + ttlMs,
  };
  // upsertConfig wraps in {data: ...}, so we pass the cacheEntry directly
  await upsertConfig(cacheKey, cacheEntry);
}

/** Clear a specific cache entry. */
export async function clearCache(key: string): Promise<void> {
  const cacheKey = key.startsWith('cache:') ? key : `cache:${key}`;
  await deleteConfig(cacheKey);
}
