import { NextRequest, NextResponse } from 'next/server';
import { getEntry, getEntryByLegacyId } from '@/services/db/entries';

// Fetch a single entry's full details from Neon
export async function GET(
  request: NextRequest,
  context: { params: Promise<{ id: string }> }
) {
  try {
    const { id } = await context.params;

    if (!id) {
      return NextResponse.json(
        { status: 'error', error: 'Missing entry ID' },
        { status: 400 }
      );
    }

    // Try UUID first, then legacy ID for backwards compatibility
    let dbEntry = await getEntry(id);
    if (!dbEntry) {
      dbEntry = await getEntryByLegacyId(id);
    }

    if (!dbEntry) {
      return NextResponse.json(
        { status: 'error', error: 'Entry not found' },
        { status: 404 }
      );
    }

    const content = (dbEntry.content as Record<string, unknown>) || {};

    // Determine entry type from category
    const categoryMap: Record<string, string> = {
      People: 'People',
      Projects: 'Project',
      Ideas: 'Idea',
      Admin: 'Admin',
    };
    const entryType = categoryMap[dbEntry.category] || dbEntry.category;

    // Build response
    const entry: Record<string, unknown> = {
      id: dbEntry.id,
      title: dbEntry.title,
      type: entryType,
      created_time: dbEntry.createdAt?.toISOString(),
      last_edited_time: dbEntry.updatedAt?.toISOString(),
      status: dbEntry.status,
      priority: dbEntry.priority,
    };

    // Add type-specific fields from content jsonb
    if (entryType === 'Idea') {
      entry.one_liner = content.oneLiner || '';
      entry.raw_insight = content.rawInsight || '';
      entry.source = content.source || '';
      entry.category = content.ideaCategory || '';
      entry.maturity = dbEntry.status || '';
      entry.notes = content.notes || '';
      entry.structured_summary = content.structuredSummary || undefined;
    } else if (entryType === 'Admin') {
      entry.due_date = dbEntry.dueDate?.toISOString()?.split('T')[0];
      entry.category = content.adminCategory || '';
      entry.notes = content.notes || '';
    } else if (entryType === 'Project') {
      entry.next_action = content.nextAction || '';
      entry.due_date = dbEntry.dueDate?.toISOString()?.split('T')[0];
      entry.area = content.area || '';
      entry.notes = content.notes || '';
    } else if (entryType === 'People') {
      entry.company = content.company || '';
      entry.role = content.role || '';
      entry.context = content.context || '';
      entry.last_contact = content.lastContact || '';
      entry.next_followup = dbEntry.dueDate?.toISOString()?.split('T')[0];
      entry.notes = content.notes || '';
    }

    return NextResponse.json({
      status: 'success',
      entry,
    });
  } catch (error) {
    console.error('Entry fetch error:', error);
    return NextResponse.json(
      { status: 'error', error: error instanceof Error ? error.message : 'Unknown error' },
      { status: 500 }
    );
  }
}
