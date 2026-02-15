import OpenAI from 'openai';
import { getEmailDetail } from '@/services/google/gmail';
import type { GmailMessage } from '@/services/google/types';
import type { YesterboxCategory, EmailDigestItem, EmailDashboard } from '@/lib/types';
import { isGoogleConnected } from '@/services/google/auth';
import { searchEmails } from '@/services/google/gmail';
import { createLogger } from '@/lib/logger';

const OPENAI_API_KEY = process.env.OPENAI_API_KEY;
const log = createLogger('digest/email');

// Parse "John Doe <john@example.com>" into "John Doe"
export function parseSenderName(from: string): string {
  const match = from.match(/^"?([^"<]+)"?\s*</);
  if (match) return match[1].trim();
  const atIndex = from.indexOf('@');
  if (atIndex > 0) return from.substring(0, atIndex);
  return from;
}

// Extract raw email address from "Name <email@example.com>" format
export function parseEmailAddress(from: string): string {
  const match = from.match(/<([^>]+)>/);
  if (match) return match[1];
  if (from.includes('@')) return from.trim();
  return from;
}

// Build Gmail compose URL with pre-filled fields
export function buildGmailComposeUrl(to: string, subject: string, body: string): string {
  const params = new URLSearchParams({
    view: 'cm',
    to,
    su: `Re: ${subject}`,
    body,
  });
  return `https://mail.google.com/mail/?${params}`;
}

// Category priority order for sorting
export const CATEGORY_ORDER: Record<string, number> = {
  'Urgent & High-Priority': 0,
  'Deadline-Driven': 1,
  'Routine Updates': 2,
  'Non-Urgent Informational': 3,
  'Personal & Social': 4,
  'Spam/Unimportant': 5,
};

// Batch classify emails using AI (single API call)
export async function classifyEmails(emails: GmailMessage[]): Promise<EmailDigestItem[]> {
  if (emails.length === 0) return [];

  const baseItems: EmailDigestItem[] = emails.map(e => ({
    id: e.id,
    threadId: e.threadId,
    subject: e.subject,
    senderName: parseSenderName(e.from),
    from: e.from,
    date: e.date,
    snippet: e.snippet,
    yCategory: 'Non-Urgent Informational' as YesterboxCategory,
    aiSummary: e.snippet,
  }));

  if (!OPENAI_API_KEY) return baseItems;

  const emailSummaries = emails.map((e, i) =>
    `[${i}] From: ${e.from} | Subject: ${e.subject} | Snippet: ${e.snippet}`
  ).join('\n');

  try {
    const openai = new OpenAI({ apiKey: OPENAI_API_KEY });
    const completion = await openai.chat.completions.create({
      model: 'gpt-4o-mini',
      temperature: 0,
      response_format: { type: 'json_object' },
      messages: [
        {
          role: 'system',
          content: `You follow the Yesterbox methodology. Classify each email into exactly one category:

1. "Urgent & High-Priority" — Time-sensitive, requires immediate action, critical business
2. "Deadline-Driven" — Has a deadline or due date, needs action by a specific time
3. "Routine Updates" — Status updates, reports, newsletters to review & acknowledge
4. "Non-Urgent Informational" — FYI, reference material, no action needed now
5. "Personal & Social" — Personal messages, social invites, networking
6. "Spam/Unimportant" — Marketing, promotions, automated notifications, junk

OUTPUT STRICT JSON:
{
  "classifications": [
    {
      "index": 0,
      "category": "Urgent & High-Priority",
      "summary": "One-line actionable summary (max 15 words)",
      "action": "What to do about this email (or null if no action)"
    }
  ]
}

Focus the summary on WHAT THE USER NEEDS TO DO, not what the email says.`,
        },
        { role: 'user', content: emailSummaries },
      ],
    });

    const responseText = completion.choices[0]?.message?.content || '{"classifications":[]}';
    const parsed = JSON.parse(responseText);
    const classifications: Array<{ index: number; category: string; summary: string; action?: string | null }> = parsed.classifications || [];

    for (const cls of classifications) {
      if (cls.index >= 0 && cls.index < baseItems.length) {
        baseItems[cls.index].yCategory = (cls.category as YesterboxCategory) || 'Non-Urgent Informational';
        baseItems[cls.index].aiSummary = cls.summary || baseItems[cls.index].snippet;
        baseItems[cls.index].actionNeeded = cls.action || undefined;
      }
    }
  } catch (err) {
    log.warn('Email classification failed, using defaults', { error: err instanceof Error ? err.message : String(err) });
  }

  // Sort by category priority
  baseItems.sort((a, b) => (CATEGORY_ORDER[a.yCategory] ?? 3) - (CATEGORY_ORDER[b.yCategory] ?? 3));

  return baseItems;
}

// Enrich critical emails (Urgent + Deadline) with detailed analysis and response drafts
export async function enrichCriticalEmails(emails: EmailDigestItem[]): Promise<void> {
  const criticalCategories: YesterboxCategory[] = ['Urgent & High-Priority', 'Deadline-Driven'];
  const criticalEmails = emails.filter(e => criticalCategories.includes(e.yCategory));
  if (criticalEmails.length === 0 || !OPENAI_API_KEY) return;

  // Fetch full body for each critical email in parallel
  const bodies = await Promise.all(
    criticalEmails.map(async (e) => {
      const detail = await getEmailDetail(e.id);
      return { id: e.id, body: detail?.body || e.snippet };
    })
  );

  const bodyMap = new Map(bodies.map(b => [b.id, b.body]));

  const emailContext = criticalEmails.map((e, i) =>
    `[${i}] From: ${e.from} | Subject: ${e.subject} | Category: ${e.yCategory}\nBody:\n${(bodyMap.get(e.id) || e.snippet).slice(0, 1500)}`
  ).join('\n---\n');

  try {
    const openai = new OpenAI({ apiKey: OPENAI_API_KEY });
    const completion = await openai.chat.completions.create({
      model: 'gpt-4o-mini',
      temperature: 0,
      response_format: { type: 'json_object' },
      messages: [
        {
          role: 'system',
          content: `You are an executive assistant analyzing critical emails. For each email, provide:
1. A detailed 2-3 sentence summary of the email content and context
2. Why this email is urgent or deadline-driven (1 sentence)
3. 2-3 specific recommended next steps
4. A professional response draft (2-4 sentences, ready to send)

OUTPUT STRICT JSON:
{
  "enrichments": [
    {
      "index": 0,
      "detailedSummary": "2-3 sentence analysis...",
      "urgencyReason": "Why this needs attention now...",
      "recommendedSteps": ["Step 1", "Step 2"],
      "responseDraft": "Professional reply draft..."
    }
  ]
}

Write response drafts in first person, professional but concise. Match the tone of the original email.`,
        },
        { role: 'user', content: emailContext },
      ],
    });

    const responseText = completion.choices[0]?.message?.content || '{"enrichments":[]}';
    const parsed = JSON.parse(responseText);
    const enrichments: Array<{
      index: number;
      detailedSummary: string;
      urgencyReason: string;
      recommendedSteps: string[];
      responseDraft: string;
    }> = parsed.enrichments || [];

    for (const enr of enrichments) {
      if (enr.index >= 0 && enr.index < criticalEmails.length) {
        const email = criticalEmails[enr.index];
        email.detailedSummary = enr.detailedSummary;
        email.urgencyReason = enr.urgencyReason;
        email.recommendedSteps = enr.recommendedSteps;
        email.responseDraft = enr.responseDraft;
        email.replyToEmail = parseEmailAddress(email.from);
        email.gmailComposeUrl = buildGmailComposeUrl(
          email.replyToEmail,
          email.subject,
          enr.responseDraft
        );
      }
    }
  } catch (err) {
    log.warn('Email enrichment failed', { error: err instanceof Error ? err.message : String(err) });
  }
}

// Generate executive dashboard summary for email digest
export async function generateEmailDashboard(emails: EmailDigestItem[]): Promise<EmailDashboard | undefined> {
  if (emails.length === 0) return undefined;

  const categoryCounts: Record<string, number> = {};
  for (const e of emails) {
    categoryCounts[e.yCategory] = (categoryCounts[e.yCategory] || 0) + 1;
  }

  const criticalCount = (categoryCounts['Urgent & High-Priority'] || 0) + (categoryCounts['Deadline-Driven'] || 0);

  let aiConclusion = '';
  if (OPENAI_API_KEY) {
    try {
      const summary = Object.entries(categoryCounts)
        .map(([cat, count]) => `${count} ${cat}`)
        .join(', ');

      const openai = new OpenAI({ apiKey: OPENAI_API_KEY });
      const completion = await openai.chat.completions.create({
        model: 'gpt-4o-mini',
        temperature: 0.3,
        messages: [
          {
            role: 'system',
            content: 'You are an executive assistant. Given email category counts from yesterday, write a 1-2 sentence executive conclusion. Be direct and actionable. No fluff.',
          },
          { role: 'user', content: `Yesterday's ${emails.length} emails: ${summary}` },
        ],
      });
      aiConclusion = completion.choices[0]?.message?.content || '';
    } catch {
      aiConclusion = '';
    }
  }

  return {
    totalEmails: emails.length,
    categoryCounts,
    aiConclusion,
    criticalCount,
  };
}

// Yesterbox: fetch emails from yesterday's calendar day only (never today)
export async function fetchYesterdayEmailsOrEmpty(): Promise<{ emails: GmailMessage[]; scopeNeeded: boolean }> {
  try {
    if (!(await isGoogleConnected())) return { emails: [], scopeNeeded: false };

    const now = new Date();
    const yesterday = new Date(now);
    yesterday.setDate(now.getDate() - 1);
    const yStr = `${yesterday.getFullYear()}/${yesterday.getMonth() + 1}/${yesterday.getDate()}`;
    const tStr = `${now.getFullYear()}/${now.getMonth() + 1}/${now.getDate()}`;
    const query = `after:${yStr} before:${tStr}`;

    const emails = await searchEmails(query, 30);
    return { emails, scopeNeeded: false };
  } catch (err) {
    const msg = err instanceof Error ? err.message : '';
    if (msg.includes('scope') || msg.includes('403')) {
      return { emails: [], scopeNeeded: true };
    }
    log.warn('Email fetch failed (returning empty)', { error: err instanceof Error ? err.message : String(err) });
    return { emails: [], scopeNeeded: false };
  }
}
