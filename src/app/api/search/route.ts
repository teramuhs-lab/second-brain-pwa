import { NextRequest, NextResponse } from 'next/server';
import OpenAI from 'openai';

// Notion database IDs
const DATABASE_IDS = {
  People: '2f092129-b3db-81b4-b767-fed1e3190303',
  Projects: '2f092129-b3db-81fd-aef1-e62b4f3445ff',
  Ideas: '2f092129-b3db-8121-b140-f7a8f4ec2a45',
  Admin: '2f092129-b3db-8171-ae6c-f98e8124574c',
};

const NOTION_API_KEY = process.env.NOTION_API_KEY;
const OPENAI_API_KEY = process.env.OPENAI_API_KEY;

interface NotionPage {
  id: string;
  properties: Record<string, unknown>;
  created_time: string;
  last_edited_time: string;
}

interface SearchResult {
  id: string;
  title: string;
  category: string;
  status?: string;
  created: string;
  lastEdited: string;
  snippet?: string;
}

async function notionRequest(endpoint: string, method: string, body?: object) {
  const response = await fetch(`https://api.notion.com/v1${endpoint}`, {
    method,
    headers: {
      Authorization: `Bearer ${NOTION_API_KEY}`,
      'Content-Type': 'application/json',
      'Notion-Version': '2022-06-28',
    },
    body: body ? JSON.stringify(body) : undefined,
  });

  if (!response.ok) {
    const error = await response.text();
    throw new Error(`Notion API error: ${response.status} - ${error}`);
  }

  return response.json();
}

function extractTitle(properties: Record<string, unknown>): string {
  // Try different title property names
  const titleProps = ['Name', 'Title', 'Task'];
  for (const prop of titleProps) {
    const titleProp = properties[prop] as { title?: Array<{ plain_text: string }> } | undefined;
    if (titleProp?.title?.[0]?.plain_text) {
      return titleProp.title[0].plain_text;
    }
  }
  return 'Untitled';
}

function extractStatus(properties: Record<string, unknown>): string | undefined {
  const statusProp = properties['Status'] as { select?: { name: string } } | undefined;
  return statusProp?.select?.name;
}

function extractText(properties: Record<string, unknown>): string {
  const texts: string[] = [];

  // Extract all text properties for search
  for (const [key, value] of Object.entries(properties)) {
    const prop = value as Record<string, unknown>;

    // Title
    if (prop.title && Array.isArray(prop.title)) {
      const titleArray = prop.title as Array<{ plain_text: string }>;
      texts.push(titleArray.map(t => t.plain_text).join(''));
    }

    // Rich text
    if (prop.rich_text && Array.isArray(prop.rich_text)) {
      const richTextArray = prop.rich_text as Array<{ plain_text: string }>;
      texts.push(richTextArray.map(t => t.plain_text).join(''));
    }

    // Select
    if (prop.select && typeof prop.select === 'object') {
      const select = prop.select as { name?: string };
      if (select.name) texts.push(select.name);
    }
  }

  return texts.join(' ');
}

async function searchDatabase(
  databaseId: string,
  category: string,
  searchTerms: string[]
): Promise<SearchResult[]> {
  // Fetch recent items (last 100)
  const response = await notionRequest(`/databases/${databaseId}/query`, 'POST', {
    page_size: 100,
    sorts: [{ timestamp: 'last_edited_time', direction: 'descending' }],
  });

  const results: SearchResult[] = [];
  const pages = response.results as NotionPage[];

  for (const page of pages) {
    const title = extractTitle(page.properties);
    const fullText = extractText(page.properties).toLowerCase();

    // Check if any search term matches
    const matches = searchTerms.some(term =>
      fullText.includes(term.toLowerCase()) ||
      title.toLowerCase().includes(term.toLowerCase())
    );

    if (matches) {
      results.push({
        id: page.id,
        title,
        category,
        status: extractStatus(page.properties),
        created: page.created_time,
        lastEdited: page.last_edited_time,
        snippet: fullText.slice(0, 150),
      });
    }
  }

  return results;
}

export async function POST(request: NextRequest) {
  try {
    if (!NOTION_API_KEY) {
      return NextResponse.json(
        { status: 'error', error: 'NOTION_API_KEY not configured' },
        { status: 500 }
      );
    }

    const body = await request.json();
    const { query, summarize = true } = body;

    if (!query || typeof query !== 'string') {
      return NextResponse.json(
        { status: 'error', error: 'Missing required field: query' },
        { status: 400 }
      );
    }

    // Extract search terms from query (allow 2+ character words)
    const searchTerms = query
      .toLowerCase()
      .replace(/[^\w\s]/g, '')
      .split(/\s+/)
      .filter(term => term.length >= 2); // Allow 2+ character words

    // Search all databases in parallel
    const [people, projects, ideas, admin] = await Promise.all([
      searchDatabase(DATABASE_IDS.People, 'People', searchTerms),
      searchDatabase(DATABASE_IDS.Projects, 'Project', searchTerms),
      searchDatabase(DATABASE_IDS.Ideas, 'Idea', searchTerms),
      searchDatabase(DATABASE_IDS.Admin, 'Admin', searchTerms),
    ]);

    const allResults = [...people, ...projects, ...ideas, ...admin];

    // Sort by last edited
    allResults.sort((a, b) =>
      new Date(b.lastEdited).getTime() - new Date(a.lastEdited).getTime()
    );

    // Group by category
    const grouped = {
      People: people,
      Project: projects,
      Idea: ideas,
      Admin: admin,
    };

    // Generate AI summary if requested and OpenAI is configured
    let summary = null;
    if (summarize && OPENAI_API_KEY && allResults.length > 0) {
      try {
        const openai = new OpenAI({ apiKey: OPENAI_API_KEY });

        const resultsContext = allResults.slice(0, 20).map(r =>
          `- [${r.category}] ${r.title}${r.status ? ` (${r.status})` : ''}`
        ).join('\n');

        const completion = await openai.chat.completions.create({
          model: 'gpt-4o-mini',
          temperature: 0.3,
          messages: [
            {
              role: 'system',
              content: 'You are a helpful assistant summarizing search results from a personal knowledge base. Be concise and actionable.',
            },
            {
              role: 'user',
              content: `User searched for: "${query}"\n\nFound ${allResults.length} matches:\n${resultsContext}\n\nProvide a brief 2-3 sentence summary of what was found, highlighting the most relevant items and any patterns.`,
            },
          ],
        });

        summary = completion.choices[0]?.message?.content;
      } catch (aiError) {
        console.error('AI summary error:', aiError);
        // Continue without summary
      }
    }

    return NextResponse.json({
      status: 'success',
      query,
      total: allResults.length,
      summary,
      results: allResults.slice(0, 50), // Limit to 50 results
      grouped: {
        People: grouped.People.length,
        Project: grouped.Project.length,
        Idea: grouped.Idea.length,
        Admin: grouped.Admin.length,
      },
    });
  } catch (error) {
    console.error('Search error:', error);
    return NextResponse.json(
      { status: 'error', error: error instanceof Error ? error.message : 'Unknown error' },
      { status: 500 }
    );
  }
}

// Handle CORS preflight
export async function OPTIONS() {
  return new NextResponse(null, {
    status: 200,
    headers: {
      'Access-Control-Allow-Origin': '*',
      'Access-Control-Allow-Methods': 'POST, OPTIONS',
      'Access-Control-Allow-Headers': 'Content-Type',
    },
  });
}
