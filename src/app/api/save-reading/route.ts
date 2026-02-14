import { NextRequest, NextResponse } from 'next/server';
import { createEntry } from '@/services/db/entries';
import { logActivity } from '@/services/db/activity';
import { validate, saveReadingSchema } from '@/lib/validation';

export async function POST(request: NextRequest) {
  try {
    const body = await request.json();
    const parsed = validate(saveReadingSchema, body);
    if (!parsed.success) {
      return NextResponse.json({ status: 'error', error: parsed.error }, { status: 400 });
    }
    const { title, url, oneLiner, tldr, category, structuredSummary } = parsed.data;

    const newEntry = await createEntry({
      category: 'Reading',
      title: title.slice(0, 100),
      content: {
        oneLiner: oneLiner?.slice(0, 200) || '',
        rawInsight: tldr || '',
        source: url,
        ideaCategory: category || 'Tech',
        structuredSummary: structuredSummary || null,
      },
    });

    logActivity(newEntry.id, 'saved_reading', { url, title: title.slice(0, 100) });

    return NextResponse.json({
      status: 'success',
      pageId: newEntry.id,
    });
  } catch (error) {
    console.error('Save reading error:', error);
    return NextResponse.json(
      { status: 'error', error: 'Failed to save reading entry' },
      { status: 500 }
    );
  }
}
