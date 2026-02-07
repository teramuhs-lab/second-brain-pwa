import { NextRequest, NextResponse } from 'next/server';

const NOTION_API_KEY = process.env.NOTION_API_KEY;

// This is a one-time setup endpoint to create the Chat Sessions database
// After running, copy the database ID to your .env.local file

export async function POST(request: NextRequest) {
  try {
    if (!NOTION_API_KEY) {
      return NextResponse.json(
        { status: 'error', error: 'NOTION_API_KEY not configured' },
        { status: 500 }
      );
    }

    const body = await request.json();
    const { parent_page_id } = body;

    if (!parent_page_id) {
      return NextResponse.json(
        {
          status: 'error',
          error: 'Missing parent_page_id. Provide a Notion page ID where the database should be created.'
        },
        { status: 400 }
      );
    }

    // Create the Chat Sessions database
    const response = await fetch('https://api.notion.com/v1/databases', {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${NOTION_API_KEY}`,
        'Content-Type': 'application/json',
        'Notion-Version': '2022-06-28',
      },
      body: JSON.stringify({
        parent: { page_id: parent_page_id },
        title: [{ text: { content: 'Chat Sessions' } }],
        properties: {
          'Session ID': {
            title: {},
          },
          'Messages': {
            rich_text: {},
          },
          'Last Active': {
            date: {},
          },
        },
      }),
    });

    if (!response.ok) {
      const error = await response.json();
      return NextResponse.json(
        {
          status: 'error',
          error: error.message || 'Failed to create database',
          details: error
        },
        { status: response.status }
      );
    }

    const database = await response.json();

    return NextResponse.json({
      status: 'success',
      message: 'Chat Sessions database created!',
      database_id: database.id,
      instructions: `Add this to your .env.local file:\nNOTION_CHAT_SESSIONS_DB_ID=${database.id}`,
    });
  } catch (error) {
    console.error('Setup error:', error);
    return NextResponse.json(
      { status: 'error', error: error instanceof Error ? error.message : 'Unknown error' },
      { status: 500 }
    );
  }
}

// GET endpoint to check if database is already configured
export async function GET() {
  const dbId = process.env.NOTION_CHAT_SESSIONS_DB_ID;

  if (dbId) {
    return NextResponse.json({
      status: 'configured',
      database_id: dbId,
      message: 'Chat Sessions database is already configured.',
    });
  }

  return NextResponse.json({
    status: 'not_configured',
    message: 'Chat Sessions database not configured. Use POST with parent_page_id to create one.',
    instructions: [
      '1. Find a Notion page where you want the database (copy page ID from URL)',
      '2. POST to /api/setup-chat-db with { "parent_page_id": "your-page-id" }',
      '3. Copy the returned database_id to .env.local',
    ],
  });
}
