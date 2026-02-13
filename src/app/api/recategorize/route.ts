import { NextRequest, NextResponse } from 'next/server';
import { DATABASE_IDS, CATEGORY_DB_IDS, DEFAULT_STATUS, TITLE_PROPERTY } from '@/config/constants';
import { createPage, archivePage } from '@/services/notion/client';

export async function POST(request: NextRequest) {
  try {
    const body = await request.json();
    const { page_id, current_category, new_category, raw_text } = body;

    // Validate input
    if (!page_id || !new_category || !raw_text) {
      return NextResponse.json(
        { status: 'error', error: 'Missing required fields: page_id, new_category, raw_text' },
        { status: 400 }
      );
    }

    const targetDbId = CATEGORY_DB_IDS[new_category];
    if (!targetDbId) {
      return NextResponse.json(
        { status: 'error', error: `Invalid category: ${new_category}` },
        { status: 400 }
      );
    }

    // Step 1: Archive the old page
    try {
      await archivePage(page_id);
    } catch (error) {
      console.error('Failed to archive old page:', error);
    }

    // Step 2: Create new page in target database
    const titleProperty = TITLE_PROPERTY[new_category];
    const defaultStatus = DEFAULT_STATUS[new_category];

    const properties: Record<string, unknown> = {
      [titleProperty]: {
        title: [{ text: { content: raw_text } }],
      },
    };

    // Ideas uses Maturity instead of Status
    if (new_category !== 'Idea') {
      properties['Status'] = { select: { name: defaultStatus } };
    }

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

    const newPage = await createPage(targetDbId, properties);

    // Step 3: Log to Inbox Log database
    try {
      await createPage(DATABASE_IDS.InboxLog, {
        'Raw Input': { title: [{ text: { content: raw_text } }] },
        'Category': { select: { name: new_category } },
        'Confidence': { number: 1.0 },
        'Destination ID': { rich_text: [{ text: { content: newPage.id } }] },
        'Status': { select: { name: 'Fixed' } },
      });
    } catch (logError) {
      console.error('Failed to log to Inbox Log:', logError);
    }

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
