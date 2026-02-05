import { NextResponse } from 'next/server';

const NOTION_API_KEY = process.env.NOTION_API_KEY;
const IDEAS_DB_ID = '2f092129-b3db-8121-b140-f7a8f4ec2a45';

interface NotionPage {
  id: string;
  created_time: string;
  last_edited_time: string;
  properties: {
    Title?: {
      title: Array<{ plain_text: string }>;
    };
    'One-liner'?: {
      rich_text: Array<{ plain_text: string }>;
    };
    'Raw Insight'?: {
      rich_text: Array<{ plain_text: string }>;
    };
    Source?: {
      url: string | null;
    };
    Category?: {
      select: { name: string } | null;
    };
    Maturity?: {
      select: { name: string } | null;
    };
  };
}

export async function GET() {
  try {
    if (!NOTION_API_KEY) {
      return NextResponse.json(
        { status: 'error', error: 'Notion not configured' },
        { status: 500 }
      );
    }

    // Query Ideas database for items with Source URL
    const response = await fetch(`https://api.notion.com/v1/databases/${IDEAS_DB_ID}/query`, {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${NOTION_API_KEY}`,
        'Content-Type': 'application/json',
        'Notion-Version': '2022-06-28',
      },
      body: JSON.stringify({
        filter: {
          property: 'Source',
          url: {
            is_not_empty: true,
          },
        },
        sorts: [
          {
            timestamp: 'created_time',
            direction: 'descending',
          },
        ],
        page_size: 50,
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

    // Transform to ReadingItem format
    const items = pages.map((page) => ({
      id: page.id,
      title: page.properties.Title?.title?.[0]?.plain_text || 'Untitled',
      one_liner: page.properties['One-liner']?.rich_text?.[0]?.plain_text || '',
      raw_insight: page.properties['Raw Insight']?.rich_text?.[0]?.plain_text || '',
      source: page.properties.Source?.url || '',
      category: page.properties.Category?.select?.name || 'Tech',
      maturity: page.properties.Maturity?.select?.name || 'Spark',
      created_time: page.created_time,
      last_edited_time: page.last_edited_time,
    }));

    return NextResponse.json({
      status: 'success',
      count: items.length,
      items,
    });

  } catch (error) {
    console.error('Fetch reading items error:', error);
    return NextResponse.json(
      {
        status: 'error',
        error: error instanceof Error ? error.message : 'Failed to fetch reading items',
      },
      { status: 500 }
    );
  }
}
