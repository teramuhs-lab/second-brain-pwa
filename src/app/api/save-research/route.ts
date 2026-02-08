// Save Research Result to Notion
// Saves AI research responses as Ideas or Tasks

import { NextRequest, NextResponse } from 'next/server';

const NOTION_API_KEY = process.env.NOTION_API_KEY;

const DATABASE_IDS: Record<string, string> = {
  Ideas: '2f092129-b3db-8121-b140-f7a8f4ec2a45',
  Admin: '2f092129-b3db-8171-ae6c-f98e8124574c',
};

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
    if (!NOTION_API_KEY) {
      return NextResponse.json(
        { status: 'error', error: 'Notion API key not configured' },
        { status: 500 }
      );
    }

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

    // Build the note content
    const noteContent = `Q: ${question}\n\n${answer}${citationsText}`;

    // Create title (truncate question if too long)
    const title = question.length > 80 ? question.slice(0, 77) + '...' : question;

    let properties: Record<string, unknown>;
    let databaseId: string;

    if (category === 'Idea') {
      databaseId = DATABASE_IDS.Ideas;
      properties = {
        Title: {
          title: [{ text: { content: title } }],
        },
        'Raw Insight': {
          rich_text: [{ text: { content: noteContent.slice(0, 2000) } }],
        },
        'One-liner': {
          rich_text: [{ text: { content: `Research: ${expertDomain || 'general'}` } }],
        },
        Category: {
          select: { name: 'Tech' }, // Default category
        },
        Maturity: {
          select: { name: 'Spark' },
        },
      };
    } else {
      // Admin/Task
      databaseId = DATABASE_IDS.Admin;
      properties = {
        Task: {
          title: [{ text: { content: title } }],
        },
        Notes: {
          rich_text: [{ text: { content: noteContent.slice(0, 2000) } }],
        },
        Status: {
          select: { name: 'Todo' },
        },
        Priority: {
          select: { name: 'Medium' },
        },
        Category: {
          select: { name: 'Work' },
        },
      };
    }

    // Create the Notion page
    const response = await fetch('https://api.notion.com/v1/pages', {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${NOTION_API_KEY}`,
        'Content-Type': 'application/json',
        'Notion-Version': '2022-06-28',
      },
      body: JSON.stringify({
        parent: { database_id: databaseId },
        properties,
      }),
    });

    if (!response.ok) {
      const errorData = await response.json();
      console.error('Notion API error:', errorData);
      return NextResponse.json(
        { status: 'error', error: 'Failed to save to Notion' },
        { status: 500 }
      );
    }

    const pageData = await response.json();

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
