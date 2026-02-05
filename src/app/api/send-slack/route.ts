import { NextRequest, NextResponse } from 'next/server';

const SLACK_BOT_TOKEN = process.env.SLACK_BOT_TOKEN;
const SLACK_USER_ID = process.env.SLACK_USER_ID || 'U0AA4A4MX35';

interface SlackMessageRequest {
  title: string;
  url: string;
  one_liner: string;
  category: string;
  readTime?: string;
  // Rich summary fields
  tldr?: string;
  key_takeaways?: string[];
  action_items?: string[];
  // Legacy fields
  full_summary?: string;
  key_points?: string[];
}

export async function POST(request: NextRequest) {
  try {
    if (!SLACK_BOT_TOKEN) {
      return NextResponse.json(
        { status: 'error', error: 'Slack not configured' },
        { status: 500 }
      );
    }

    const body: SlackMessageRequest = await request.json();
    const {
      title,
      url,
      one_liner,
      category,
      readTime,
      tldr,
      key_takeaways,
      action_items,
      full_summary,
      key_points
    } = body;

    // Extract hostname for display
    let hostname = url;
    try {
      hostname = new URL(url).hostname.replace('www.', '');
    } catch {
      // Use full URL if parsing fails
    }

    // Build metadata line
    const metaLine = [hostname, category, readTime].filter(Boolean).join(' • ');

    // Use rich summary or fall back to legacy
    const summaryText = tldr || full_summary || one_liner;
    const takeaways = key_takeaways || key_points || [];
    const actions = action_items || [];

    // Build key takeaways text
    const takeawaysText = takeaways.length > 0
      ? takeaways.slice(0, 5).map(p => `• ${p}`).join('\n')
      : '';

    // Build action items text
    const actionsText = actions.length > 0
      ? actions.slice(0, 3).map(a => `☐ ${a}`).join('\n')
      : '';

    // Create Slack Block Kit message with rich content
    const blocks: object[] = [
      {
        type: 'header',
        text: {
          type: 'plain_text',
          text: '📰 New Article Saved',
          emoji: true,
        },
      },
      {
        type: 'section',
        text: {
          type: 'mrkdwn',
          text: `*${title}*\n${metaLine}`,
        },
      },
      {
        type: 'section',
        text: {
          type: 'mrkdwn',
          text: `_"${one_liner}"_`,
        },
      },
      {
        type: 'divider',
      },
    ];

    // TL;DR Section
    if (summaryText) {
      blocks.push({
        type: 'section',
        text: {
          type: 'mrkdwn',
          text: `*TL;DR*\n${summaryText.slice(0, 1500)}${summaryText.length > 1500 ? '...' : ''}`,
        },
      });
    }

    // Key Takeaways Section
    if (takeawaysText) {
      blocks.push({
        type: 'section',
        text: {
          type: 'mrkdwn',
          text: `*Key Takeaways*\n${takeawaysText}`,
        },
      });
    }

    // Action Items Section
    if (actionsText) {
      blocks.push({
        type: 'section',
        text: {
          type: 'mrkdwn',
          text: `*Action Items*\n${actionsText}`,
        },
      });
    }

    // Add divider and buttons
    blocks.push(
      {
        type: 'divider',
      },
      {
        type: 'actions',
        elements: [
          {
            type: 'button',
            text: {
              type: 'plain_text',
              text: '📖 Read Article',
              emoji: true,
            },
            url: url,
            action_id: 'open_article',
            style: 'primary',
          },
          {
            type: 'button',
            text: {
              type: 'plain_text',
              text: '🧠 View in App',
              emoji: true,
            },
            url: `${process.env.NEXT_PUBLIC_APP_URL || 'https://second-brain.vercel.app'}/reading`,
            action_id: 'view_in_app',
          },
        ],
      }
    );

    // Send to Slack
    const response = await fetch('https://slack.com/api/chat.postMessage', {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${SLACK_BOT_TOKEN}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        channel: SLACK_USER_ID,
        blocks,
        text: `📰 New Article Saved: ${title}`, // Fallback text
      }),
    });

    const result = await response.json();

    if (!result.ok) {
      console.error('Slack API error:', result.error);
      return NextResponse.json(
        { status: 'error', error: result.error },
        { status: 500 }
      );
    }

    return NextResponse.json({
      status: 'sent',
      channel: result.channel,
      ts: result.ts,
    });

  } catch (error) {
    console.error('Send Slack error:', error);
    return NextResponse.json(
      {
        status: 'error',
        error: error instanceof Error ? error.message : 'Failed to send Slack message',
      },
      { status: 500 }
    );
  }
}
