// Google OAuth token management
// Stores refresh token in Notion Config DB (server-side only)

import { CONFIG_DB_ID } from '@/config/constants';

const NOTION_API_KEY = process.env.NOTION_API_KEY;
const NOTION_VERSION = '2022-06-28';
const GOOGLE_CLIENT_ID = process.env.GOOGLE_CLIENT_ID;
const GOOGLE_CLIENT_SECRET = process.env.GOOGLE_CLIENT_SECRET;

// In-memory access token cache
let cachedAccessToken: string | null = null;
let tokenExpiresAt = 0;

function notionHeaders(): HeadersInit {
  return {
    Authorization: `Bearer ${NOTION_API_KEY}`,
    'Content-Type': 'application/json',
    'Notion-Version': NOTION_VERSION,
  };
}

// Find config entry by key
async function findConfigEntry(key: string): Promise<{ id: string; value: string } | null> {
  if (!CONFIG_DB_ID || !NOTION_API_KEY) return null;

  const res = await fetch(`https://api.notion.com/v1/databases/${CONFIG_DB_ID}/query`, {
    method: 'POST',
    headers: notionHeaders(),
    body: JSON.stringify({
      filter: {
        property: 'Key',
        title: { equals: key },
      },
    }),
  });

  if (!res.ok) return null;

  const data = await res.json();
  const page = data.results?.[0];
  if (!page) return null;

  const value = page.properties?.Value?.rich_text?.[0]?.plain_text || '';
  return { id: page.id, value };
}

// Store or update a config entry
async function upsertConfig(key: string, value: string): Promise<void> {
  const existing = await findConfigEntry(key);

  if (existing) {
    await fetch(`https://api.notion.com/v1/pages/${existing.id}`, {
      method: 'PATCH',
      headers: notionHeaders(),
      body: JSON.stringify({
        properties: {
          Value: { rich_text: [{ text: { content: value } }] },
        },
      }),
    });
  } else {
    await fetch('https://api.notion.com/v1/pages', {
      method: 'POST',
      headers: notionHeaders(),
      body: JSON.stringify({
        parent: { database_id: CONFIG_DB_ID },
        properties: {
          Key: { title: [{ text: { content: key } }] },
          Value: { rich_text: [{ text: { content: value } }] },
        },
      }),
    });
  }
}

export async function getStoredRefreshToken(): Promise<string | null> {
  const entry = await findConfigEntry('google_refresh_token');
  return entry?.value || null;
}

export async function storeRefreshToken(token: string): Promise<void> {
  await upsertConfig('google_refresh_token', token);
}

export async function removeRefreshToken(): Promise<void> {
  const entry = await findConfigEntry('google_refresh_token');
  if (entry) {
    await fetch(`https://api.notion.com/v1/pages/${entry.id}`, {
      method: 'PATCH',
      headers: notionHeaders(),
      body: JSON.stringify({ archived: true }),
    });
  }
  cachedAccessToken = null;
  tokenExpiresAt = 0;
}

export async function isGoogleConnected(): Promise<boolean> {
  const token = await getStoredRefreshToken();
  return !!token;
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
