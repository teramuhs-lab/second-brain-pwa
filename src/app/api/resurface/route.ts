import { NextRequest, NextResponse } from 'next/server';
import { getEntry, getEntryByNotionId } from '@/services/db/entries';
import { getRelatedEntries, suggestRelations } from '@/services/db/relations';

export async function GET(request: NextRequest) {
  try {
    const entryId = request.nextUrl.searchParams.get('id');

    if (!entryId) {
      return NextResponse.json(
        { status: 'error', error: 'Missing required parameter: id' },
        { status: 400 }
      );
    }

    // Look up entry by Neon ID or Notion ID
    let entry = await getEntry(entryId);
    if (!entry) {
      entry = await getEntryByNotionId(entryId);
    }
    if (!entry) {
      return NextResponse.json(
        { status: 'error', error: 'Entry not found' },
        { status: 404 }
      );
    }

    // 1. Get explicitly linked entries
    const linked = await getRelatedEntries(entry.id);

    // 2. Get embedding-based suggestions (entries that aren't already linked)
    const suggestions = await suggestRelations(entry.id, { limit: 5, threshold: 0.7 });

    return NextResponse.json({
      status: 'success',
      entryId: entry.notionId || entry.id,
      linked: linked.map(e => ({
        id: e.notionId || e.id,
        title: e.title,
        category: e.category,
        status: e.status || undefined,
        relationId: e.relationId,
        relationType: e.relationType,
      })),
      suggested: suggestions.map(s => ({
        id: s.id,
        title: s.title,
        category: s.category,
        status: s.status || undefined,
        similarity: s.similarity,
      })),
    });
  } catch (error) {
    console.error('Resurface error:', error);
    return NextResponse.json(
      { status: 'error', error: error instanceof Error ? error.message : 'Unknown error' },
      { status: 500 }
    );
  }
}
