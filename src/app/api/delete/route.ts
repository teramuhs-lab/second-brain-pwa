import { NextRequest, NextResponse } from 'next/server';
import { archiveEntry, getEntryByNotionId } from '@/services/db/entries';

export async function POST(request: NextRequest) {
  try {
    const body = await request.json();
    const { page_id } = body;

    if (!page_id) {
      return NextResponse.json(
        { status: 'error', error: 'Missing required field: page_id' },
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

    // Archive via dual-write service (Neon + Notion)
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
