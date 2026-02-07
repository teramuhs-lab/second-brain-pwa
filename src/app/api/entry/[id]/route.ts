import { NextRequest, NextResponse } from 'next/server';

const NOTION_API_KEY = process.env.NOTION_API_KEY;

interface NotionBlock {
  type: string;
  code?: {
    language: string;
    rich_text: Array<{ plain_text: string }>;
  };
}

// Fetch a single entry's full details including structured summary
export async function GET(
  request: NextRequest,
  context: { params: Promise<{ id: string }> }
) {
  try {
    if (!NOTION_API_KEY) {
      return NextResponse.json(
        { status: 'error', error: 'NOTION_API_KEY not configured' },
        { status: 500 }
      );
    }

    const { id } = await context.params;

    if (!id) {
      return NextResponse.json(
        { status: 'error', error: 'Missing entry ID' },
        { status: 400 }
      );
    }

    // Fetch page details
    const pageRes = await fetch(`https://api.notion.com/v1/pages/${id}`, {
      headers: {
        'Authorization': `Bearer ${NOTION_API_KEY}`,
        'Notion-Version': '2022-06-28',
      },
    });

    if (!pageRes.ok) {
      const error = await pageRes.text();
      return NextResponse.json(
        { status: 'error', error: `Failed to fetch page: ${error}` },
        { status: pageRes.status }
      );
    }

    const page = await pageRes.json();

    // Extract properties
    const props = page.properties || {};

    // Helper to extract text from rich_text
    const getText = (prop: unknown): string => {
      const p = prop as { rich_text?: Array<{ plain_text: string }> } | undefined;
      return p?.rich_text?.[0]?.plain_text || '';
    };

    // Helper to extract title
    const getTitle = (prop: unknown): string => {
      const p = prop as { title?: Array<{ plain_text: string }> } | undefined;
      return p?.title?.[0]?.plain_text || '';
    };

    // Helper to extract select
    const getSelect = (prop: unknown): string => {
      const p = prop as { select?: { name: string } } | undefined;
      return p?.select?.name || '';
    };

    // Helper to extract date
    const getDate = (prop: unknown): string | undefined => {
      const p = prop as { date?: { start: string } } | undefined;
      return p?.date?.start;
    };

    // Helper to extract URL
    const getUrl = (prop: unknown): string => {
      const p = prop as { url?: string } | undefined;
      return p?.url || '';
    };

    // Determine entry type based on available properties
    let entryType: 'Idea' | 'Admin' | 'Project' | 'People' = 'Idea';
    let title = '';

    if (props.Title) {
      entryType = 'Idea';
      title = getTitle(props.Title);
    } else if (props.Task) {
      entryType = 'Admin';
      title = getTitle(props.Task);
    } else if (props.Name) {
      // Could be Project or People - check for project-specific fields
      if (props['Next Action'] || props.Area) {
        entryType = 'Project';
      } else {
        entryType = 'People';
      }
      title = getTitle(props.Name);
    }

    // Build base entry data
    const entry: Record<string, unknown> = {
      id: page.id,
      title,
      type: entryType,
      created_time: page.created_time,
      last_edited_time: page.last_edited_time,
      status: getSelect(props.Status),
      priority: getSelect(props.Priority),
    };

    // Add type-specific fields
    if (entryType === 'Idea') {
      entry.one_liner = getText(props['One-liner']);
      entry.raw_insight = getText(props['Raw Insight']);
      entry.source = getUrl(props.Source);
      entry.category = getSelect(props.Category);
      entry.maturity = getSelect(props.Maturity);
    } else if (entryType === 'Admin') {
      entry.due_date = getDate(props['Due Date']);
      entry.category = getSelect(props.Category);
      entry.notes = getText(props.Notes);
    } else if (entryType === 'Project') {
      entry.next_action = getText(props['Next Action']);
      entry.due_date = getDate(props['Due Date']);
      entry.area = getSelect(props.Area);
      entry.notes = getText(props.Notes);
    } else if (entryType === 'People') {
      entry.company = getText(props.Company);
      entry.role = getText(props.Role);
      entry.context = getText(props.Context);
      entry.last_contact = getDate(props['Last Contact']);
      entry.next_followup = getDate(props['Next Follow-up']);
    }

    // For Ideas, also fetch page blocks to get structured summary JSON
    if (entryType === 'Idea') {
      try {
        const blocksRes = await fetch(
          `https://api.notion.com/v1/blocks/${id}/children?page_size=20`,
          {
            headers: {
              'Authorization': `Bearer ${NOTION_API_KEY}`,
              'Notion-Version': '2022-06-28',
            },
          }
        );

        if (blocksRes.ok) {
          const blocks = await blocksRes.json();
          // Find ALL JSON code blocks and concatenate them
          const codeBlocks = (blocks.results as NotionBlock[])?.filter(
            (b) => b.type === 'code' && b.code?.language === 'json'
          ) || [];

          if (codeBlocks.length > 0) {
            const fullJson = codeBlocks
              .map((b) => b.code?.rich_text?.[0]?.plain_text || '')
              .join('');

            if (fullJson) {
              try {
                entry.structured_summary = JSON.parse(fullJson);
              } catch {
                // JSON parse failed
              }
            }
          }
        }
      } catch {
        // Block fetch failed
      }
    }

    return NextResponse.json({
      status: 'success',
      entry,
    });
  } catch (error) {
    console.error('Entry fetch error:', error);
    return NextResponse.json(
      { status: 'error', error: error instanceof Error ? error.message : 'Unknown error' },
      { status: 500 }
    );
  }
}
