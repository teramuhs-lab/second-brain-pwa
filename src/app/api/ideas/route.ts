import { NextRequest, NextResponse } from 'next/server';
import { queryEntries, countEntries } from '@/services/db/entries';

export async function GET(request: NextRequest) {
  try {
    const { searchParams } = request.nextUrl;
    const page = Math.max(1, parseInt(searchParams.get('page') || '1'));
    const pageSize = Math.min(100, Math.max(1, parseInt(searchParams.get('pageSize') || '50')));

    const [ideaEntries, total] = await Promise.all([
      queryEntries({
        category: 'Ideas',
        orderBy: 'created_at',
        orderDir: 'desc',
        limit: pageSize,
        offset: (page - 1) * pageSize,
      }),
      countEntries({ category: 'Ideas' }),
    ]);

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
      total,
      page,
      pageSize,
      hasMore: page * pageSize < total,
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
