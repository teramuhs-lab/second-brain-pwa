import { NextRequest, NextResponse } from 'next/server';
import { createEntry, archiveEntry, getEntryByNotionId, createInboxLogEntry } from '@/services/db/entries';

type Category = 'People' | 'Project' | 'Idea' | 'Admin';
const VALID_CATEGORIES = new Set(['People', 'Project', 'Idea', 'Admin']);

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

    if (!VALID_CATEGORIES.has(new_category)) {
      return NextResponse.json(
        { status: 'error', error: `Invalid category: ${new_category}` },
        { status: 400 }
      );
    }

    // Step 1: Archive the old entry via dual-write (Neon + Notion)
    try {
      const oldEntry = await getEntryByNotionId(page_id);
      if (oldEntry) {
        await archiveEntry(oldEntry.id);
      }
    } catch (error) {
      console.error('Failed to archive old entry:', error);
    }

    // Step 2: Build category-specific content defaults
    const content: Record<string, unknown> = {};
    if (new_category === 'Admin') {
      content.adminCategory = 'Home';
    } else if (new_category === 'Project') {
      content.area = 'Work';
    } else if (new_category === 'Idea') {
      content.ideaCategory = 'Life';
    } else if (new_category === 'People') {
      content.lastContact = new Date().toISOString().split('T')[0];
    }

    // Step 3: Create new entry via dual-write (Neon + Notion)
    const newEntry = await createEntry({
      category: new_category as Category,
      title: raw_text,
      priority: (new_category === 'Admin' || new_category === 'Project') ? 'Medium' : undefined,
      content,
    });

    // Step 4: Log to Inbox Log via dual-write
    try {
      await createInboxLogEntry({
        rawInput: raw_text,
        category: new_category,
        confidence: 1.0,
        destinationId: newEntry.notionId || newEntry.id,
        status: 'Fixed',
      });
    } catch (logError) {
      console.error('Failed to log to Inbox Log:', logError);
    }

    return NextResponse.json({
      status: 'fixed',
      from_category: current_category,
      to_category: new_category,
      page_id: newEntry.notionId || newEntry.id,
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
