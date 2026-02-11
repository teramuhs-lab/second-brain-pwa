// Gmail API operations

import { getAccessToken } from './auth';
import type { GmailMessage, GmailListResponse } from './types';

function parseGmailHeaders(
  headers: Array<{ name: string; value: string }>
): { subject: string; from: string; date: string } {
  const get = (name: string) =>
    headers.find((h) => h.name.toLowerCase() === name.toLowerCase())?.value || '';

  return {
    subject: get('Subject'),
    from: get('From'),
    date: get('Date'),
  };
}

function decodeBase64Url(data: string): string {
  const base64 = data.replace(/-/g, '+').replace(/_/g, '/');
  return Buffer.from(base64, 'base64').toString('utf-8');
}

export async function searchEmails(
  query: string,
  maxResults = 5
): Promise<GmailMessage[]> {
  const accessToken = await getAccessToken();
  if (!accessToken) return [];

  const params = new URLSearchParams({
    q: query,
    maxResults: String(maxResults),
  });

  const listRes = await fetch(
    `https://gmail.googleapis.com/gmail/v1/users/me/messages?${params}`,
    { headers: { Authorization: `Bearer ${accessToken}` } }
  );

  if (!listRes.ok) {
    console.error('Gmail search error:', await listRes.text());
    return [];
  }

  const listData: GmailListResponse = await listRes.json();
  if (!listData.messages?.length) return [];

  // Fetch each message's metadata in parallel
  const messages = await Promise.all(
    listData.messages.slice(0, maxResults).map(async (msg) => {
      const res = await fetch(
        `https://gmail.googleapis.com/gmail/v1/users/me/messages/${msg.id}?format=metadata&metadataHeaders=Subject&metadataHeaders=From&metadataHeaders=Date`,
        { headers: { Authorization: `Bearer ${accessToken}` } }
      );

      if (!res.ok) return null;

      const data = await res.json();
      const { subject, from, date } = parseGmailHeaders(data.payload?.headers || []);

      return {
        id: data.id,
        threadId: data.threadId,
        subject,
        from,
        date,
        snippet: data.snippet || '',
      } as GmailMessage;
    })
  );

  return messages.filter((m): m is GmailMessage => m !== null);
}

export async function getEmailDetail(messageId: string): Promise<GmailMessage | null> {
  const accessToken = await getAccessToken();
  if (!accessToken) return null;

  const res = await fetch(
    `https://gmail.googleapis.com/gmail/v1/users/me/messages/${messageId}?format=full`,
    { headers: { Authorization: `Bearer ${accessToken}` } }
  );

  if (!res.ok) {
    console.error('Gmail detail error:', await res.text());
    return null;
  }

  const data = await res.json();
  const { subject, from, date } = parseGmailHeaders(data.payload?.headers || []);

  // Extract body from parts
  let body = '';
  const parts = data.payload?.parts || [];
  const textPart = parts.find(
    (p: { mimeType: string }) => p.mimeType === 'text/plain'
  );

  if (textPart?.body?.data) {
    body = decodeBase64Url(textPart.body.data);
  } else if (data.payload?.body?.data) {
    body = decodeBase64Url(data.payload.body.data);
  }

  return {
    id: data.id,
    threadId: data.threadId,
    subject,
    from,
    date,
    snippet: data.snippet || '',
    body,
  };
}
