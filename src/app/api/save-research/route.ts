// Save Research Result to Notion
// Saves AI research responses as Ideas or Tasks

import { NextRequest, NextResponse } from 'next/server';
import { DATABASE_IDS } from '@/config/constants';
import { createPage } from '@/services/notion/client';

interface SaveResearchRequest {
  question: string;
  answer: string;
  category: 'Idea' | 'Admin';
  citations?: Array<{
    title: string;
    type: string;
    url?: string;
    database?: string;
  }>;
  expertDomain?: string;
}

export async function POST(request: NextRequest) {
  try {
    const body: SaveResearchRequest = await request.json();
    const { question, answer, category, citations = [], expertDomain } = body;

    if (!question || !answer || !category) {
      return NextResponse.json(
        { status: 'error', error: 'Missing required fields' },
        { status: 400 }
      );
    }

    // Format citations as text
    const citationsText = citations.length > 0
      ? '\n\nSources:\n' + citations.map((c, i) =>
          `${i + 1}. ${c.title}${c.type === 'web' && c.url ? ` (${c.url})` : c.database ? ` (${c.database})` : ''}`
        ).join('\n')
      : '';

    const noteContent = `Q: ${question}\n\n${answer}${citationsText}`;
    const title = question.length > 80 ? question.slice(0, 77) + '...' : question;

    let properties: Record<string, unknown>;
    let databaseId: string;

    if (category === 'Idea') {
      databaseId = DATABASE_IDS.Ideas;
      properties = {
        Title: { title: [{ text: { content: title } }] },
        'Raw Insight': { rich_text: [{ text: { content: noteContent.slice(0, 2000) } }] },
        'One-liner': { rich_text: [{ text: { content: `Research: ${expertDomain || 'general'}` } }] },
        Category: { select: { name: 'Tech' } },
        Maturity: { select: { name: 'Spark' } },
      };
    } else {
      databaseId = DATABASE_IDS.Admin;
      properties = {
        Task: { title: [{ text: { content: title } }] },
        Notes: { rich_text: [{ text: { content: noteContent.slice(0, 2000) } }] },
        Status: { select: { name: 'Todo' } },
        Priority: { select: { name: 'Medium' } },
        Category: { select: { name: 'Work' } },
      };
    }

    const pageData = await createPage(databaseId, properties);

    return NextResponse.json({
      status: 'success',
      message: `Saved as ${category}`,
      pageId: pageData.id,
    });
  } catch (error) {
    console.error('Save research error:', error);
    return NextResponse.json(
      { status: 'error', error: 'Failed to save research' },
      { status: 500 }
    );
  }
}
