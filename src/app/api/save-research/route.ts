// Save Research Result
// Saves AI research responses as Ideas or Admin tasks

import { NextRequest, NextResponse } from 'next/server';
import { createEntry } from '@/services/db/entries';
import { validate, saveResearchSchema } from '@/lib/validation';

export async function POST(request: NextRequest) {
  try {
    const body = await request.json();
    const parsed = validate(saveResearchSchema, body);
    if (!parsed.success) {
      return NextResponse.json({ status: 'error', error: parsed.error }, { status: 400 });
    }
    const { question, answer, category, citations = [], expertDomain } = parsed.data;

    // Format citations as text
    const citationsText = citations.length > 0
      ? '\n\nSources:\n' + citations.map((c, i) =>
          `${i + 1}. ${c.title}${c.type === 'web' && c.url ? ` (${c.url})` : c.database ? ` (${c.database})` : ''}`
        ).join('\n')
      : '';

    const noteContent = `Q: ${question}\n\n${answer}${citationsText}`;
    const title = question.length > 80 ? question.slice(0, 77) + '...' : question;

    // Build content based on category
    const content: Record<string, unknown> = {};

    if (category === 'Idea') {
      content.rawInsight = noteContent.slice(0, 2000);
      content.oneLiner = `Research: ${expertDomain || 'general'}`;
      content.ideaCategory = 'Tech';
    } else {
      content.notes = noteContent.slice(0, 2000);
      content.adminCategory = 'Work';
    }

    // Create entry
    const newEntry = await createEntry({
      category,
      title,
      priority: category === 'Admin' ? 'Medium' : undefined,
      content,
    });

    return NextResponse.json({
      status: 'success',
      message: `Saved as ${category}`,
      pageId: newEntry.id,
    });
  } catch (error) {
    console.error('Save research error:', error);
    return NextResponse.json(
      { status: 'error', error: 'Failed to save research' },
      { status: 500 }
    );
  }
}
