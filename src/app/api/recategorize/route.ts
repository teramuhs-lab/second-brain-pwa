import { NextRequest, NextResponse } from 'next/server';
import { createEntry, archiveEntry, getEntryByLegacyId, createInboxLogEntry } from '@/services/db/entries';
import { validate, recategorizeSchema } from '@/lib/validation';

type Category = 'People' | 'Project' | 'Idea' | 'Admin';

export async function POST(request: NextRequest) {
  try {
    const body = await request.json();
    const parsed = validate(recategorizeSchema, body);
    if (!parsed.success) {
      return NextResponse.json({ status: 'error', error: parsed.error }, { status: 400 });
    }
    const { page_id, current_category, new_category, raw_text } = parsed.data;

    // Step 1: Archive the old entry
    try {
      const oldEntry = await getEntryByLegacyId(page_id);
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

    // Step 3: Create new entry
    const newEntry = await createEntry({
      category: new_category as Category,
      title: raw_text,
      priority: (new_category === 'Admin' || new_category === 'Project') ? 'Medium' : undefined,
      content,
    });

    // Step 4: Log to Inbox Log
    try {
      await createInboxLogEntry({
        rawInput: raw_text,
        category: new_category,
        confidence: 1.0,
        destinationId: newEntry.id,
        status: 'Fixed',
      });
    } catch (logError) {
      console.error('Failed to log to Inbox Log:', logError);
    }

    return NextResponse.json({
      status: 'fixed',
      from_category: current_category,
      to_category: new_category,
      page_id: newEntry.id,
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
