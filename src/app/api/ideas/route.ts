import { NextResponse } from 'next/server';
import { queryEntries } from '@/services/db/entries';

export async function GET() {
  try {
    const ideaEntries = await queryEntries({
      category: 'Ideas',
      orderBy: 'created_at',
      orderDir: 'desc',
      limit: 100,
    });

    const items = ideaEntries.map(entry => {
      const content = (entry.content as Record<string, unknown>) || {};
      return {
        id: entry.id,
        title: entry.title || 'Untitled',
        status: entry.status || 'Spark',
        one_liner: (content.oneLiner as string) || '',
        url: (content.source as string) || undefined,
        notes: (content.notes as string) || '',
        created: entry.createdAt?.toISOString(),
      };
    });

    return NextResponse.json({
      status: 'success',
      count: items.length,
      items,
    });
  } catch (error) {
    console.error('Fetch ideas error:', error);
    return NextResponse.json(
      {
        status: 'error',
        error: error instanceof Error ? error.message : 'Failed to fetch ideas',
      },
      { status: 500 }
    );
  }
}
