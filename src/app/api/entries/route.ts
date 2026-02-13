import { NextRequest, NextResponse } from 'next/server';
import { queryEntries } from '@/services/db/entries';

/**
 * GET /api/entries?database=admin&status=Todo
 *
 * Local replacement for the n8n sb-pwa-fetch webhook.
 * Returns entries from Neon, matching the same response shape.
 */
export async function GET(request: NextRequest) {
  try {
    const { searchParams } = request.nextUrl;
    const database = searchParams.get('database');
    const status = searchParams.get('status') || undefined;

    if (!database) {
      return NextResponse.json(
        { status: 'error', error: 'Missing required param: database' },
        { status: 400 }
      );
    }

    // Map frontend database names to Neon category names
    const categoryMap: Record<string, string> = {
      admin: 'Admin',
      projects: 'Projects',
      ideas: 'Ideas',
      people: 'People',
    };

    const category = categoryMap[database.toLowerCase()];
    if (!category) {
      return NextResponse.json(
        { status: 'error', error: `Unknown database: ${database}` },
        { status: 400 }
      );
    }

    const entries = await queryEntries({
      category,
      status,
      orderBy: 'created_at',
      orderDir: 'desc',
      limit: 100,
    });

    // Map to the frontend Entry shape
    const items = entries.map(entry => {
      const content = (entry.content as Record<string, unknown>) || {};
      return {
        id: entry.notionId || entry.id, // Prefer Notion ID for backward compat
        title: entry.title,
        status: entry.status || '',
        priority: entry.priority || undefined,
        due_date: entry.dueDate?.toISOString().split('T')[0] || undefined,
        created: entry.createdAt.toISOString(),
        notes: (content.notes as string) || undefined,
        context: (content.context as string) || undefined,
        company: (content.company as string) || undefined,
        role: (content.role as string) || undefined,
        one_liner: (content.oneLiner as string) || undefined,
        maturity: category === 'Ideas' ? entry.status : undefined,
        url: (content.source as string) || undefined,
      };
    });

    return NextResponse.json({
      status: 'ok',
      database,
      count: items.length,
      items,
    });
  } catch (error) {
    console.error('Entries fetch error:', error);
    return NextResponse.json(
      { status: 'error', error: error instanceof Error ? error.message : 'Unknown error' },
      { status: 500 }
    );
  }
}
