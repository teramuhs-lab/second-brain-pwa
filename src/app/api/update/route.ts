import { NextRequest, NextResponse } from 'next/server';

const NOTION_API_KEY = process.env.NOTION_API_KEY;

// Field name mappings for different databases
const FIELD_MAPPINGS: Record<string, Record<string, string>> = {
  admin: {
    notes: 'Notes',
    status: 'Status',
    priority: 'Priority',
    due_date: 'Due Date',
  },
  projects: {
    notes: 'Notes',
    status: 'Status',
    priority: 'Priority',
    due_date: 'Due Date',
    next_action: 'Next Action',
  },
  ideas: {
    notes: 'Notes',
    raw_insight: 'Raw Insight',
    one_liner: 'One-liner',
    status: 'Status',
    maturity: 'Maturity',
    source: 'Source',
  },
  people: {
    notes: 'Notes',
    status: 'Status',
    context: 'Context',
    next_followup: 'Next Follow-up',
    last_contact: 'Last Contact',
  },
};

export async function POST(request: NextRequest) {
  try {
    if (!NOTION_API_KEY) {
      return NextResponse.json(
        { status: 'error', error: 'NOTION_API_KEY not configured' },
        { status: 500 }
      );
    }

    const body = await request.json();
    const { page_id, database, updates } = body;

    if (!page_id || !database || !updates) {
      return NextResponse.json(
        { status: 'error', error: 'Missing required fields: page_id, database, updates' },
        { status: 400 }
      );
    }

    const fieldMap = FIELD_MAPPINGS[database] || {};
    const properties: Record<string, unknown> = {};

    // Map update fields to Notion property format
    for (const [key, value] of Object.entries(updates)) {
      const notionField = fieldMap[key] || key;

      if (key === 'notes' || key === 'context' || key === 'next_action' || key === 'raw_insight' || key === 'one_liner') {
        // Rich text field
        properties[notionField] = {
          rich_text: [{ text: { content: String(value) } }],
        };
      } else if (key === 'status' || key === 'priority' || key === 'maturity') {
        // Select field
        properties[notionField] = {
          select: { name: String(value) },
        };
      } else if (key === 'due_date' || key === 'next_followup' || key === 'last_contact') {
        // Date field
        properties[notionField] = {
          date: value ? { start: String(value) } : null,
        };
      } else if (key === 'source') {
        // URL field
        properties[notionField] = {
          url: value ? String(value) : null,
        };
      }
    }

    // Update the Notion page
    const response = await fetch(`https://api.notion.com/v1/pages/${page_id}`, {
      method: 'PATCH',
      headers: {
        Authorization: `Bearer ${NOTION_API_KEY}`,
        'Content-Type': 'application/json',
        'Notion-Version': '2022-06-28',
      },
      body: JSON.stringify({ properties }),
    });

    if (!response.ok) {
      const error = await response.text();
      console.error('Notion update error:', error);
      return NextResponse.json(
        { status: 'error', error: `Notion API error: ${response.status}` },
        { status: response.status }
      );
    }

    return NextResponse.json({
      status: 'updated',
      page_id,
    });
  } catch (error) {
    console.error('Update error:', error);
    return NextResponse.json(
      { status: 'error', error: error instanceof Error ? error.message : 'Unknown error' },
      { status: 500 }
    );
  }
}
