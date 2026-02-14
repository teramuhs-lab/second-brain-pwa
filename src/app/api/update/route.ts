import { NextRequest, NextResponse } from 'next/server';
import { updateEntry, getEntry, getEntryByLegacyId } from '@/services/db/entries';
import type { UpdateEntryInput } from '@/services/db/entries';
import { logActivity } from '@/services/db/activity';
import { validate, updateSchema } from '@/lib/validation';

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
    const parsed = validate(updateSchema, body);
    if (!parsed.success) {
      return NextResponse.json({ status: 'error', error: parsed.error }, { status: 400 });
    }
    const { page_id, updates } = parsed.data;

    // Find entry by UUID first, then fall back to legacy Notion ID
    const entry = await getEntry(page_id) || await getEntryByLegacyId(page_id);
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

    // Update entry
    const updated = await updateEntry(entry.id, updateInput);

    if (!updated) {
      return NextResponse.json(
        { status: 'error', error: 'Failed to update entry' },
        { status: 500 }
      );
    }

    // Log activity based on what changed
    if (updateInput.status !== undefined) {
      logActivity(entry.id, 'status_changed', { from: entry.status, to: updateInput.status });
    }
    if (updateInput.dueDate !== undefined) {
      logActivity(entry.id, 'snoozed', { to: updateInput.dueDate });
    }
    if (Object.keys(contentUpdates).length > 0) {
      logActivity(entry.id, 'note_added', { fields: Object.keys(contentUpdates) });
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
