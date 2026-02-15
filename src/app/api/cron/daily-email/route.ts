import { NextRequest, NextResponse } from 'next/server';
import { queryEntries } from '@/services/db/entries';
import { gte } from 'drizzle-orm';
import { isConfigured as isTelegramConfigured, sendMarkdown, sendMessage } from '@/services/telegram/client';
import { createLogger } from '@/lib/logger';

const log = createLogger('cron/daily-email');

const CRON_SECRET = process.env.CRON_SECRET;
const TELEGRAM_CHAT_ID = process.env.TELEGRAM_CHAT_ID;

export async function GET(request: NextRequest) {
  try {
    // Verify cron secret (optional security)
    const authHeader = request.headers.get('authorization');
    if (CRON_SECRET && authHeader !== `Bearer ${CRON_SECRET}`) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const digestType = request.nextUrl.searchParams.get('type') || 'daily';

    // Weekly digest — Telegram only, no email
    if (digestType === 'weekly') {
      return handleWeeklyDigest();
    }

    // Daily flow: email + Telegram digest
    return handleDailyDigest();
  } catch (error) {
    log.error('Cron error:', error);
    return NextResponse.json(
      {
        status: 'error',
        error: error instanceof Error ? error.message : 'Cron job failed',
      },
      { status: 500 }
    );
  }
}

async function handleDailyDigest() {
  // Get articles from the last 24 hours (Ideas with source URL)
  const yesterday = new Date();
  yesterday.setDate(yesterday.getDate() - 1);

  const ideaEntries = await queryEntries({
    category: 'Ideas',
    orderBy: 'created_at',
    orderDir: 'desc',
  });

  // Filter to last 24h and entries with a source URL
  const articles = ideaEntries
    .filter(entry => entry.createdAt >= yesterday)
    .filter(entry => {
      const content = (entry.content as Record<string, unknown>) || {};
      return !!content.source;
    })
    .map(entry => {
      const content = (entry.content as Record<string, unknown>) || {};
      return {
        title: entry.title || 'Untitled',
        url: (content.source as string) || '',
        one_liner: (content.oneLiner as string) || '',
        full_summary: (content.rawInsight as string) || '',
        key_points: extractKeyPoints((content.rawInsight as string) || ''),
        category: (content.ideaCategory as string) || 'Tech',
      };
    })
    .filter(a => a.url);

  let emailSent = false;
  let telegramSent = false;

  // Send email if there are articles
  if (articles.length > 0) {
    const baseUrl = process.env.NEXT_PUBLIC_APP_URL || 'https://second-brain.vercel.app';
    try {
      const emailResponse = await fetch(`${baseUrl}/api/send-email`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ articles }),
      });
      const emailResult = await emailResponse.json();
      emailSent = emailResult.status !== 'error';
    } catch (emailError) {
      log.error('Email send failed:', emailError);
    }
  }

  // Send daily digest via Telegram if configured
  if (isTelegramConfigured() && TELEGRAM_CHAT_ID) {
    try {
      const baseUrl = process.env.NEXT_PUBLIC_APP_URL || 'http://localhost:3000';
      const digestRes = await fetch(`${baseUrl}/api/digest?type=daily`);

      if (digestRes.ok) {
        const digest = await digestRes.json();
        const { aiSummary, counts } = digest;

        const today = new Date();
        const dateStr = today.toLocaleDateString('en-US', { weekday: 'long', month: 'long', day: 'numeric' });

        const parts: string[] = [];
        if (counts?.projects > 0) parts.push(`${counts.projects} projects`);
        if (counts?.tasks > 0) parts.push(`${counts.tasks} tasks`);
        if (counts?.followups > 0) parts.push(`${counts.followups} follow-ups`);

        const header = `☀️ **Daily Briefing** · ${dateStr}${parts.length > 0 ? `\n${parts.join('  ·  ')}` : ''}\n\n`;
        await sendMarkdown(TELEGRAM_CHAT_ID, header + (aiSummary || 'All clear today.'));

        // Send due-today items with action buttons
        const dueItems = [...(digest.data?.tasks || []), ...(digest.data?.followups || [])];
        if (dueItems.length > 0) {
          const buttons = dueItems.slice(0, 5).map((item: { id: string; title: string }) => ([
            { text: `✓ ${item.title.slice(0, 20)}`, callback_data: `done:${item.id}` },
            { text: '⏰ Snooze', callback_data: `snzp:${item.id}` },
          ]));

          await sendMessage(TELEGRAM_CHAT_ID, '📋 *Due today — tap to act:*', {
            parse_mode: 'Markdown' as const,
            reply_markup: { inline_keyboard: buttons },
          });
        }

        // "View in app" button
        await sendMessage(TELEGRAM_CHAT_ID, '📱 Full digest:', {
          reply_markup: {
            inline_keyboard: [[
              { text: '🔗 View in app', url: `${baseUrl}/digest` },
            ]],
          },
        });

        telegramSent = true;
      }
    } catch (tgError) {
      log.error('Telegram digest send failed:', tgError);
    }
  }

  if (articles.length === 0 && !telegramSent) {
    return NextResponse.json({
      status: 'skipped',
      message: 'No new articles and no Telegram digest to send',
    });
  }

  return NextResponse.json({
    status: 'sent',
    type: 'daily',
    articleCount: articles.length,
    emailSent,
    telegramSent,
  });
}

async function handleWeeklyDigest() {
  if (!isTelegramConfigured() || !TELEGRAM_CHAT_ID) {
    return NextResponse.json({
      status: 'skipped',
      message: 'Telegram not configured for weekly digest',
    });
  }

  try {
    const baseUrl = process.env.NEXT_PUBLIC_APP_URL || 'http://localhost:3000';
    const digestRes = await fetch(`${baseUrl}/api/digest?type=weekly`);

    if (!digestRes.ok) {
      return NextResponse.json({ status: 'error', error: 'Failed to fetch weekly digest' }, { status: 500 });
    }

    const digest = await digestRes.json();
    const { aiSummary } = digest;

    const today = new Date();
    const weekStart = new Date(today);
    weekStart.setDate(weekStart.getDate() - 7);
    const range = `${weekStart.toLocaleDateString('en-US', { month: 'short', day: 'numeric' })} – ${today.toLocaleDateString('en-US', { month: 'short', day: 'numeric' })}`;

    const header = `📊 **Weekly Review** · ${range}\n\n`;
    await sendMarkdown(TELEGRAM_CHAT_ID, header + (aiSummary || 'Quiet week — nothing to report.'));

    // "View in app" button
    await sendMessage(TELEGRAM_CHAT_ID, '📱 Full weekly review:', {
      reply_markup: {
        inline_keyboard: [[
          { text: '🔗 View in app', url: `${baseUrl}/digest` },
        ]],
      },
    });

    return NextResponse.json({ status: 'sent', type: 'weekly', telegramSent: true });
  } catch (error) {
    log.error('Weekly digest cron error:', error);
    return NextResponse.json(
      { status: 'error', error: error instanceof Error ? error.message : 'Weekly digest failed' },
      { status: 500 }
    );
  }
}

// Extract key points from raw insight text
function extractKeyPoints(text: string): string[] {
  const lines = text.split('\n');
  const keyPoints: string[] = [];

  for (const line of lines) {
    const trimmed = line.trim();
    if (/^[-*•]\s+/.test(trimmed) || /^\d+\.\s+/.test(trimmed)) {
      const point = trimmed.replace(/^[-*•]\s+/, '').replace(/^\d+\.\s+/, '');
      if (point.length > 10 && point.length < 200) {
        keyPoints.push(point);
      }
    }
  }

  return keyPoints.slice(0, 5);
}
