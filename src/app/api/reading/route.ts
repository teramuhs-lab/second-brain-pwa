import { NextResponse } from 'next/server';
import { queryEntries } from '@/services/db/entries';

export async function GET() {
  try {
    const ideaEntries = await queryEntries({
      category: 'Ideas',
      orderBy: 'created_at',
      orderDir: 'desc',
      limit: 50,
    });

    // Filter to entries with a source URL
    const items = ideaEntries
      .filter(entry => {
        const content = (entry.content as Record<string, unknown>) || {};
        return !!content.source;
      })
      .map(entry => {
        const content = (entry.content as Record<string, unknown>) || {};
        return {
          id: entry.id,
          title: entry.title || 'Untitled',
          one_liner: (content.oneLiner as string) || '',
          raw_insight: (content.rawInsight as string) || '',
          source: (content.source as string) || '',
          category: (content.ideaCategory as string) || 'Tech',
          maturity: entry.status || 'Spark',
          created_time: entry.createdAt?.toISOString(),
          last_edited_time: entry.updatedAt?.toISOString(),
          structured_summary: (content.structuredSummary as Record<string, unknown>) || undefined,
        };
      });

    return NextResponse.json({
      status: 'success',
      count: items.length,
      items,
    });
  } catch (error) {
    console.error('Fetch reading items error:', error);
    return NextResponse.json(
      {
        status: 'error',
        error: error instanceof Error ? error.message : 'Failed to fetch reading items',
      },
      { status: 500 }
    );
  }
}
