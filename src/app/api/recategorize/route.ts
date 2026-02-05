import { NextRequest, NextResponse } from 'next/server';

// Notion database IDs
const DATABASE_IDS: Record<string, string> = {
  People: '2f092129-b3db-81b4-b767-fed1e3190303',
  Project: '2f092129-b3db-81fd-aef1-e62b4f3445ff',
  Idea: '2f092129-b3db-8121-b140-f7a8f4ec2a45',
  Admin: '2f092129-b3db-8171-ae6c-f98e8124574c',
};

// Default status for each category
const DEFAULT_STATUS: Record<string, string> = {
  People: 'New',
  Project: 'Active',
  Idea: 'Spark',
  Admin: 'Todo',
};

// Title property name for each category
const TITLE_PROPERTY: Record<string, string> = {
  People: 'Name',
  Project: 'Name',
  Idea: 'Title',
  Admin: 'Task',
};

const NOTION_API_KEY = process.env.NOTION_API_KEY;

async function notionRequest(endpoint: string, method: string, body?: object) {
  const response = await fetch(`https://api.notion.com/v1${endpoint}`, {
    method,
    headers: {
      'Authorization': `Bearer ${NOTION_API_KEY}`,
      'Content-Type': 'application/json',
      'Notion-Version': '2022-06-28',
    },
    body: body ? JSON.stringify(body) : undefined,
  });

  if (!response.ok) {
    const error = await response.text();
    throw new Error(`Notion API error: ${response.status} - ${error}`);
  }

  return response.json();
}

export async function POST(request: NextRequest) {
  try {
    // Check for Notion API key
    if (!NOTION_API_KEY) {
      return NextResponse.json(
        { status: 'error', error: 'NOTION_API_KEY not configured' },
        { status: 500 }
      );
    }

    const body = await request.json();
    const { page_id, current_category, new_category, raw_text } = body;

    // Validate input
    if (!page_id || !new_category || !raw_text) {
      return NextResponse.json(
        { status: 'error', error: 'Missing required fields: page_id, new_category, raw_text' },
        { status: 400 }
      );
    }

    const targetDbId = DATABASE_IDS[new_category];
    if (!targetDbId) {
      return NextResponse.json(
        { status: 'error', error: `Invalid category: ${new_category}` },
        { status: 400 }
      );
    }

    // Step 1: Archive the old page
    try {
      await notionRequest(`/pages/${page_id}`, 'PATCH', { archived: true });
    } catch (error) {
      console.error('Failed to archive old page:', error);
      // Continue anyway - maybe the page doesn't exist
    }

    // Step 2: Create new page in target database
    const titleProperty = TITLE_PROPERTY[new_category];
    const defaultStatus = DEFAULT_STATUS[new_category];

    const properties: Record<string, unknown> = {
      [titleProperty]: {
        title: [{ text: { content: raw_text } }],
      },
      Status: {
        select: { name: defaultStatus },
      },
    };

    // Add category-specific defaults
    if (new_category === 'Admin') {
      properties['Priority'] = { select: { name: 'Medium' } };
      properties['Category'] = { select: { name: 'Home' } };
    } else if (new_category === 'Project') {
      properties['Priority'] = { select: { name: 'Medium' } };
      properties['Area'] = { select: { name: 'Work' } };
    } else if (new_category === 'Idea') {
      properties['Category'] = { select: { name: 'Life' } };
      properties['Maturity'] = { select: { name: 'Spark' } };
    } else if (new_category === 'People') {
      properties['Last Contact'] = {
        date: { start: new Date().toISOString().split('T')[0] },
      };
    }

    const newPage = await notionRequest('/pages', 'POST', {
      parent: { database_id: targetDbId },
      properties,
    });

    return NextResponse.json({
      status: 'fixed',
      from_category: current_category,
      to_category: new_category,
      page_id: newPage.id,
      message: `Moved from ${current_category} to ${new_category}`,
    });
  } catch (error) {
    console.error('Recategorize error:', error);
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
