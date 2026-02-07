import { NextRequest, NextResponse } from 'next/server';

const NOTION_API_KEY = process.env.NOTION_API_KEY;

async function archiveNotionPage(pageId: string) {
  const response = await fetch(`https://api.notion.com/v1/pages/${pageId}`, {
    method: 'PATCH',
    headers: {
      Authorization: `Bearer ${NOTION_API_KEY}`,
      'Content-Type': 'application/json',
      'Notion-Version': '2022-06-28',
    },
    body: JSON.stringify({ archived: true }),
  });

  if (!response.ok) {
    const errorData = await response.json().catch(() => null);
    console.error(`[Delete] Notion API error (${response.status}):`, errorData);

    // Provide user-friendly error messages
    if (response.status === 404) {
      throw new Error('Page not found. It may have already been deleted.');
    } else if (response.status === 401) {
      throw new Error('Notion API authentication failed. Check your API key.');
    } else if (response.status === 403) {
      throw new Error('Permission denied. The Notion integration may not have access to this page.');
    } else {
      throw new Error(errorData?.message || `Notion API error: ${response.status}`);
    }
  }

  return response.json();
}

export async function POST(request: NextRequest) {
  try {
    if (!NOTION_API_KEY) {
      return NextResponse.json(
        { status: 'error', error: 'NOTION_API_KEY not configured' },
        { status: 500 }
      );
    }

    const body = await request.json();
    const { page_id } = body;

    if (!page_id) {
      return NextResponse.json(
        { status: 'error', error: 'Missing required field: page_id' },
        { status: 400 }
      );
    }

    await archiveNotionPage(page_id);

    return NextResponse.json({
      status: 'deleted',
      page_id,
    });
  } catch (error) {
    console.error('Delete error:', error);
    return NextResponse.json(
      { status: 'error', error: error instanceof Error ? error.message : 'Unknown error' },
      { status: 500 }
    );
  }
}

// Handle CORS preflight
export async function OPTIONS() {
  return new NextResponse(null, {
    status: 200,
    headers: {
      'Access-Control-Allow-Origin': '*',
      'Access-Control-Allow-Methods': 'POST, OPTIONS',
      'Access-Control-Allow-Headers': 'Content-Type',
    },
  });
}
