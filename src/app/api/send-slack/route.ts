import { NextRequest, NextResponse } from 'next/server';

const SLACK_BOT_TOKEN = process.env.SLACK_BOT_TOKEN;
const SLACK_USER_ID = process.env.SLACK_USER_ID || 'U0AA4A4MX35';

interface SlackMessageRequest {
  title: string;
  url: string;
  one_liner: string;
  full_summary: string;
  key_points: string[];
  category: string;
  readTime?: string;
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
    const { title, url, one_liner, full_summary, key_points, category, readTime } = body;

    // Extract hostname for display
    let hostname = url;
    try {
      hostname = new URL(url).hostname.replace('www.', '');
    } catch {
      // Use full URL if parsing fails
    }

    // Build key points text
    const keyPointsText = key_points.length > 0
      ? key_points.map(p => `• ${p}`).join('\n')
      : 'No key points extracted';

    // Build metadata line
    const metaLine = [hostname, category, readTime].filter(Boolean).join(' • ');

    // Create Slack Block Kit message
    const blocks = [
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
      {
        type: 'section',
        text: {
          type: 'mrkdwn',
          text: `*Summary*\n${full_summary.slice(0, 1500)}${full_summary.length > 1500 ? '...' : ''}`,
        },
      },
      {
        type: 'section',
        text: {
          type: 'mrkdwn',
          text: `*Key Points*\n${keyPointsText}`,
        },
      },
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
              text: 'Open Article',
              emoji: true,
            },
            url: url,
            action_id: 'open_article',
          },
          {
            type: 'button',
            text: {
              type: 'plain_text',
              text: 'View in App',
              emoji: true,
            },
            url: process.env.NEXT_PUBLIC_APP_URL || 'https://second-brain.vercel.app/reading',
            action_id: 'view_in_app',
          },
        ],
      },
    ];

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
