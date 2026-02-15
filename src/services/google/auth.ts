// Google OAuth token management
// Stores refresh token in Neon config table (server-side only)

import { findConfigEntry, upsertConfig, deleteConfig } from '@/services/db/config';
import { getCached, setCache, clearCache } from '@/services/cache';

const GOOGLE_CLIENT_ID = process.env.GOOGLE_CLIENT_ID;
const GOOGLE_CLIENT_SECRET = process.env.GOOGLE_CLIENT_SECRET;

export async function getStoredRefreshToken(): Promise<string | null> {
  const entry = await findConfigEntry('google_refresh_token');
  const val = entry?.value as Record<string, unknown> | null;
  return (val?.data as string) || null;
}

export async function storeRefreshToken(token: string): Promise<void> {
  // Clear cached access token so next request uses the new refresh token
  await clearCache('google:access_token');
  await upsertConfig('google_refresh_token', token);
}

export async function removeRefreshToken(): Promise<void> {
  await deleteConfig('google_refresh_token');
  await clearCache('google:access_token');
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

export async function getSelectedTaskListIds(): Promise<string[] | null> {
  const entry = await findConfigEntry('google_selected_task_lists');
  if (!entry?.value) return null;
  try {
    const val = entry.value as Record<string, unknown>;
    const data = val?.data;
    if (Array.isArray(data)) return data as string[];
    if (typeof data === 'string') return JSON.parse(data);
    if (Array.isArray(entry.value)) return entry.value as string[];
    return null;
  } catch {
    return null;
  }
}

export async function setSelectedTaskListIds(ids: string[]): Promise<void> {
  await upsertConfig('google_selected_task_lists', ids);
}

export async function getAccessToken(): Promise<string | null> {
  // Check DB cache first (survives serverless cold starts)
  const cached = await getCached<string>('google:access_token');
  if (cached) return cached;

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

  // Cache for 55 min (Google tokens expire at 60 min)
  await setCache('google:access_token', data.access_token, 55 * 60 * 1000);

  return data.access_token;
}
