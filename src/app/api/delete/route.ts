import { NextRequest, NextResponse } from 'next/server';
import { archiveEntry, getEntryByLegacyId } from '@/services/db/entries';
import { validate, deleteSchema } from '@/lib/validation';

export async function POST(request: NextRequest) {
  try {
    const body = await request.json();
    const parsed = validate(deleteSchema, body);
    if (!parsed.success) {
      return NextResponse.json({ status: 'error', error: parsed.error }, { status: 400 });
    }
    const { page_id } = parsed.data;

    // Find entry by ID
    const entry = await getEntryByLegacyId(page_id);
    if (!entry) {
      return NextResponse.json(
        { status: 'error', error: 'Entry not found in database' },
        { status: 404 }
      );
    }

    // Archive entry
    const archived = await archiveEntry(entry.id);
    if (!archived) {
      return NextResponse.json(
        { status: 'error', error: 'Failed to archive entry' },
        { status: 500 }
      );
    }

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
