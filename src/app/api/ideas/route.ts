import { NextResponse } from 'next/server';

const NOTION_API_KEY = process.env.NOTION_API_KEY;
const IDEAS_DB_ID = '2f092129-b3db-8121-b140-f7a8f4ec2a45';

export async function GET() {
  try {
    if (!NOTION_API_KEY) {
      return NextResponse.json(
        { status: 'error', error: 'Notion not configured' },
        { status: 500 }
      );
    }

    // Query all ideas (no source URL filter, unlike /api/reading)
    const response = await fetch(`https://api.notion.com/v1/databases/${IDEAS_DB_ID}/query`, {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${NOTION_API_KEY}`,
        'Content-Type': 'application/json',
        'Notion-Version': '2022-06-28',
      },
      body: JSON.stringify({
        sorts: [
          {
            timestamp: 'created_time',
            direction: 'descending',
          },
        ],
        page_size: 100,
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
    const pages = data.results || [];

    // Map to Entry-compatible format (maturity → status for uniform grouping)
    const items = pages.map((page: {
      id: string;
      created_time: string;
      properties: {
        Title?: { title: Array<{ plain_text: string }> };
        'One-liner'?: { rich_text: Array<{ plain_text: string }> };
        Source?: { url: string | null };
        Category?: { select: { name: string } | null };
        Maturity?: { select: { name: string } | null };
        Notes?: { rich_text: Array<{ plain_text: string }> };
      };
    }) => ({
      id: page.id,
      title: page.properties.Title?.title?.[0]?.plain_text || 'Untitled',
      status: page.properties.Maturity?.select?.name || 'Spark',
      one_liner: page.properties['One-liner']?.rich_text?.[0]?.plain_text || '',
      url: page.properties.Source?.url || undefined,
      notes: page.properties.Notes?.rich_text?.[0]?.plain_text || '',
      created: page.created_time,
    }));

    return NextResponse.json({
      status: 'success',
      count: items.length,
      items,
    });
  } catch (error) {
    console.error('Fetch ideas error:', error);
    return NextResponse.json(
      {
        status: 'error',
        error: error instanceof Error ? error.message : 'Failed to fetch ideas',
      },
      { status: 500 }
    );
  }
}
