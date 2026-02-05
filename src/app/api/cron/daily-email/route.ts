import { NextRequest, NextResponse } from 'next/server';

const NOTION_API_KEY = process.env.NOTION_API_KEY;
const IDEAS_DB_ID = '2f092129-b3db-8121-b140-f7a8f4ec2a45';
const CRON_SECRET = process.env.CRON_SECRET;

interface NotionPage {
  id: string;
  created_time: string;
  properties: {
    Title?: { title: Array<{ plain_text: string }> };
    'One-liner'?: { rich_text: Array<{ plain_text: string }> };
    'Raw Insight'?: { rich_text: Array<{ plain_text: string }> };
    Source?: { url: string | null };
    Category?: { select: { name: string } | null };
  };
}

export async function GET(request: NextRequest) {
  try {
    // Verify cron secret (optional security)
    const authHeader = request.headers.get('authorization');
    if (CRON_SECRET && authHeader !== `Bearer ${CRON_SECRET}`) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    if (!NOTION_API_KEY) {
      return NextResponse.json(
        { status: 'error', error: 'Notion not configured' },
        { status: 500 }
      );
    }

    // Get articles from the last 24 hours
    const yesterday = new Date();
    yesterday.setDate(yesterday.getDate() - 1);

    const response = await fetch(`https://api.notion.com/v1/databases/${IDEAS_DB_ID}/query`, {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${NOTION_API_KEY}`,
        'Content-Type': 'application/json',
        'Notion-Version': '2022-06-28',
      },
      body: JSON.stringify({
        filter: {
          and: [
            {
              property: 'Source',
              url: { is_not_empty: true },
            },
            {
              timestamp: 'created_time',
              created_time: { on_or_after: yesterday.toISOString() },
            },
          ],
        },
        sorts: [{ timestamp: 'created_time', direction: 'descending' }],
        page_size: 20,
      }),
    });

    if (!response.ok) {
      const error = await response.text();
      console.error('Notion API error:', error);
      return NextResponse.json(
        { status: 'error', error: 'Failed to fetch from Notion' },
        { status: 500 }
      );
    }

    const data = await response.json();
    const pages: NotionPage[] = data.results || [];

    if (pages.length === 0) {
      return NextResponse.json({
        status: 'skipped',
        message: 'No new articles in the last 24 hours',
      });
    }

    // Transform to article format
    const articles = pages.map((page) => ({
      title: page.properties.Title?.title?.[0]?.plain_text || 'Untitled',
      url: page.properties.Source?.url || '',
      one_liner: page.properties['One-liner']?.rich_text?.[0]?.plain_text || '',
      full_summary: page.properties['Raw Insight']?.rich_text?.[0]?.plain_text || '',
      key_points: extractKeyPoints(page.properties['Raw Insight']?.rich_text?.[0]?.plain_text || ''),
      category: page.properties.Category?.select?.name || 'Tech',
    })).filter(a => a.url); // Only include articles with URLs

    if (articles.length === 0) {
      return NextResponse.json({
        status: 'skipped',
        message: 'No articles with URLs found',
      });
    }

    // Send email
    const baseUrl = process.env.NEXT_PUBLIC_APP_URL || 'https://second-brain.vercel.app';
    const emailResponse = await fetch(`${baseUrl}/api/send-email`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ articles }),
    });

    const emailResult = await emailResponse.json();

    if (emailResult.status === 'error') {
      return NextResponse.json(
        { status: 'error', error: emailResult.error },
        { status: 500 }
      );
    }

    return NextResponse.json({
      status: 'sent',
      articleCount: articles.length,
      emailId: emailResult.id,
    });

  } catch (error) {
    console.error('Daily email cron error:', error);
    return NextResponse.json(
      {
        status: 'error',
        error: error instanceof Error ? error.message : 'Cron job failed',
      },
      { status: 500 }
    );
  }
}

// Extract key points from raw insight text
function extractKeyPoints(text: string): string[] {
  // Look for bullet points or numbered lists
  const lines = text.split('\n');
  const keyPoints: string[] = [];

  for (const line of lines) {
    const trimmed = line.trim();
    // Match bullet points (-, *, •) or numbered lists (1., 2., etc.)
    if (/^[-*•]\s+/.test(trimmed) || /^\d+\.\s+/.test(trimmed)) {
      const point = trimmed.replace(/^[-*•]\s+/, '').replace(/^\d+\.\s+/, '');
      if (point.length > 10 && point.length < 200) {
        keyPoints.push(point);
      }
    }
  }

  return keyPoints.slice(0, 5);
}
