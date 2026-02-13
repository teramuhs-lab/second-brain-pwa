import { NextRequest, NextResponse } from 'next/server';
import { updateEntry, getEntryByNotionId } from '@/services/db/entries';
import type { UpdateEntryInput } from '@/services/db/entries';

// Map frontend field keys to Neon content keys
const CONTENT_FIELDS = new Set([
  'notes', 'context', 'next_action', 'raw_insight', 'one_liner', 'source',
]);

const CONTENT_KEY_MAP: Record<string, string> = {
  notes: 'notes',
  context: 'context',
  next_action: 'nextAction',
  raw_insight: 'rawInsight',
  one_liner: 'oneLiner',
  source: 'source',
};

export async function POST(request: NextRequest) {
  try {
    const body = await request.json();
    const { page_id, database, updates } = body;

    if (!page_id || !database || !updates) {
      return NextResponse.json(
        { status: 'error', error: 'Missing required fields: page_id, database, updates' },
        { status: 400 }
      );
    }

    // Find entry in Neon by Notion ID
    const entry = await getEntryByNotionId(page_id);
    if (!entry) {
      return NextResponse.json(
        { status: 'error', error: 'Entry not found in database' },
        { status: 404 }
      );
    }

    // Build Neon update input
    const updateInput: UpdateEntryInput = {};
    const contentUpdates: Record<string, unknown> = {};

    for (const [key, value] of Object.entries(updates)) {
      if (key === 'status' || key === 'maturity') {
        updateInput.status = String(value);
      } else if (key === 'priority') {
        updateInput.priority = String(value);
      } else if (key === 'due_date' || key === 'next_followup' || key === 'last_contact') {
        updateInput.dueDate = value ? String(value) : null;
      } else if (CONTENT_FIELDS.has(key)) {
        const neonKey = CONTENT_KEY_MAP[key] || key;
        contentUpdates[neonKey] = String(value);
      }
    }

    if (Object.keys(contentUpdates).length > 0) {
      updateInput.content = contentUpdates;
    }

    // Update via dual-write service (Neon + Notion)
    const updated = await updateEntry(entry.id, updateInput);

    if (!updated) {
      return NextResponse.json(
        { status: 'error', error: 'Failed to update entry' },
        { status: 500 }
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
