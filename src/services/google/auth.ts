// Google OAuth token management
// Stores refresh token in Neon config table (server-side only)

import { eq } from 'drizzle-orm';
import { db } from '@/db';
import { config } from '@/db/schema';

const GOOGLE_CLIENT_ID = process.env.GOOGLE_CLIENT_ID;
const GOOGLE_CLIENT_SECRET = process.env.GOOGLE_CLIENT_SECRET;

// In-memory access token cache
let cachedAccessToken: string | null = null;
let tokenExpiresAt = 0;

// Find config entry by key
async function findConfigEntry(key: string): Promise<{ id: string; value: unknown } | null> {
  const [entry] = await db
    .select()
    .from(config)
    .where(eq(config.key, key))
    .limit(1);

  if (!entry) return null;
  return { id: entry.id, value: entry.value };
}

// Store or update a config entry (wraps value in {data: ...} for jsonb compatibility)
async function upsertConfig(key: string, value: unknown): Promise<void> {
  const wrapped = { data: value } as Record<string, unknown>;
  await db
    .insert(config)
    .values({ key, value: wrapped })
    .onConflictDoUpdate({
      target: config.key,
      set: { value: wrapped },
    });
}

// Delete a config entry
async function deleteConfig(key: string): Promise<void> {
  await db.delete(config).where(eq(config.key, key));
}

export async function getStoredRefreshToken(): Promise<string | null> {
  const entry = await findConfigEntry('google_refresh_token');
  const val = entry?.value as Record<string, unknown> | null;
  return (val?.data as string) || null;
}

export async function storeRefreshToken(token: string): Promise<void> {
  // Clear cached access token so next request uses the new refresh token
  cachedAccessToken = null;
  tokenExpiresAt = 0;
  await upsertConfig('google_refresh_token', token);
}

export async function removeRefreshToken(): Promise<void> {
  await deleteConfig('google_refresh_token');
  cachedAccessToken = null;
  tokenExpiresAt = 0;
}

export async function isGoogleConnected(): Promise<boolean> {
  const token = await getStoredRefreshToken();
  return !!token;
}

export async function getSelectedCalendarIds(): Promise<string[]> {
  const entry = await findConfigEntry('google_selected_calendars');
  if (!entry?.value) return ['primary'];
  try {
    if (typeof entry.value === 'string') return JSON.parse(entry.value);
    if (Array.isArray(entry.value)) return entry.value as string[];
    return ['primary'];
  } catch {
    return ['primary'];
  }
}

export async function setSelectedCalendarIds(ids: string[]): Promise<void> {
  await upsertConfig('google_selected_calendars', ids);
}

export async function getAccessToken(): Promise<string | null> {
  // Return cached token if still valid (with 60s buffer)
  if (cachedAccessToken && Date.now() < tokenExpiresAt - 60000) {
    return cachedAccessToken;
  }

  const refreshToken = await getStoredRefreshToken();
  if (!refreshToken || !GOOGLE_CLIENT_ID || !GOOGLE_CLIENT_SECRET) return null;

  const res = await fetch('https://oauth2.googleapis.com/token', {
    method: 'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    body: new URLSearchParams({
      client_id: GOOGLE_CLIENT_ID,
      client_secret: GOOGLE_CLIENT_SECRET,
      refresh_token: refreshToken,
      grant_type: 'refresh_token',
    }),
  });

  if (!res.ok) {
    console.error('Failed to refresh Google access token:', await res.text());
    return null;
  }

  const data = await res.json();
  cachedAccessToken = data.access_token;
  tokenExpiresAt = Date.now() + data.expires_in * 1000;

  return cachedAccessToken;
}
