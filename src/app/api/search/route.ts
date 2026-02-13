import { NextRequest, NextResponse } from 'next/server';
import OpenAI from 'openai';
import { searchEntries } from '@/services/db/entries';
import { getRelatedEntries } from '@/services/db/relations';

const OPENAI_API_KEY = process.env.OPENAI_API_KEY;

interface ParsedQuery {
  searchTerms: string[];
  intent: 'search' | 'question' | 'action' | 'filter';
  filters: {
    categories?: string[];
    statuses?: string[];
    dateRange?: { start?: Date; end?: Date };
    priority?: string[];
  };
  naturalResponse?: string;
}

async function parseNaturalLanguageQuery(query: string, openai: OpenAI): Promise<ParsedQuery> {
  const today = new Date();
  const todayStr = today.toISOString().split('T')[0];

  const response = await openai.chat.completions.create({
    model: 'gpt-4o-mini',
    temperature: 0,
    messages: [
      {
        role: 'system',
        content: `You are a query parser for a personal knowledge base with 4 databases: People, Projects, Ideas, Admin (tasks).

Parse the user's query and extract structured filters. Today's date is ${todayStr}.

IMPORTANT: For simple keyword searches (like a person's name, project name, or general term), set categories to null to search ALL databases. Only filter to specific categories when the user EXPLICITLY asks for that type.

Output STRICT JSON:
{
  "searchTerms": ["keyword1", "keyword2"],
  "intent": "search" | "question" | "action" | "filter",
  "filters": {
    "categories": ["People", "Projects", "Ideas", "Admin"] or null,
    "statuses": ["Active", "Todo", "Done", "Complete", "New", "Dormant"] or null,
    "dateRange": { "start": "YYYY-MM-DD", "end": "YYYY-MM-DD" } or null,
    "priority": ["High", "Medium", "Low"] or null
  },
  "naturalResponse": "Brief friendly response about what you're searching for"
}

Examples:
- "Kaleb" → categories: null (search all), searchTerms: ["Kaleb"]
- "Show me the person Sarah" → categories: ["People"], searchTerms: ["Sarah"]
- "Show urgent tasks due this week" → categories: ["Admin"], statuses: ["Todo"], priority: ["High"], dateRange: this week
- "Active projects" → categories: ["Projects"], statuses: ["Active"]
- "Ideas about AI" → categories: ["Ideas"], searchTerms: ["AI"]`,
      },
      { role: 'user', content: query },
    ],
  });

  try {
    const text = response.choices[0]?.message?.content || '';
    const jsonMatch = text.match(/\{[\s\S]*\}/);
    if (jsonMatch) {
      const parsed = JSON.parse(jsonMatch[0]);
      if (parsed.filters?.dateRange) {
        if (parsed.filters.dateRange.start) {
          parsed.filters.dateRange.start = new Date(parsed.filters.dateRange.start);
        }
        if (parsed.filters.dateRange.end) {
          parsed.filters.dateRange.end = new Date(parsed.filters.dateRange.end);
        }
      }
      return parsed;
    }
  } catch (e) {
    console.error('Failed to parse query:', e);
  }

  return {
    searchTerms: query.toLowerCase().split(/\s+/).filter(t => t.length >= 2),
    intent: 'search',
    filters: {},
  };
}

export async function POST(request: NextRequest) {
  try {
    const body = await request.json();
    const { query, summarize = true } = body;

    if (!query || typeof query !== 'string') {
      return NextResponse.json(
        { status: 'error', error: 'Missing required field: query' },
        { status: 400 }
      );
    }

    const openai = OPENAI_API_KEY ? new OpenAI({ apiKey: OPENAI_API_KEY }) : null;

    // Parse natural language query
    let parsedQuery: ParsedQuery;
    if (openai) {
      parsedQuery = await parseNaturalLanguageQuery(query, openai);
    } else {
      parsedQuery = {
        searchTerms: query.toLowerCase().split(/\s+/).filter(t => t.length >= 2),
        intent: 'search',
        filters: {},
      };
    }

    // Determine category filter
    const categoryFilter = parsedQuery.filters.categories?.length === 1
      ? parsedQuery.filters.categories[0]
      : undefined;

    // Search Neon using stored embeddings (vector + keyword hybrid)
    const results = await searchEntries(query, {
      category: categoryFilter ? ({
        People: 'People',
        Projects: 'Projects',
        Ideas: 'Ideas',
        Admin: 'Admin',
      }[categoryFilter] || undefined) : undefined,
      limit: 50,
    });

    // Map to the expected search result shape
    const searchResults = results.map(r => {
      const content = (r.content as Record<string, unknown>) || {};
      const contentText = Object.values(content)
        .filter(v => typeof v === 'string')
        .join(' ');

      // Map DB category names to display names
      const categoryMap: Record<string, string> = {
        People: 'People',
        Projects: 'Project',
        Ideas: 'Idea',
        Admin: 'Admin',
      };

      return {
        id: r.notionId || r.id,
        _neonId: r.id, // Internal: used for relation lookups
        title: r.title,
        category: categoryMap[r.category] || r.category,
        status: r.status || undefined,
        priority: r.priority || undefined,
        dueDate: r.dueDate?.toISOString().split('T')[0] || undefined,
        created: r.createdAt.toISOString(),
        lastEdited: r.updatedAt.toISOString(),
        snippet: contentText.slice(0, 200) || undefined,
        relevanceScore: ('similarity' in r) ? (r as { similarity: number }).similarity : 0,
        source: (content.source as string) || undefined,
      };
    });

    // Apply additional filters from parsed query
    let filtered = searchResults;

    if (parsedQuery.filters.statuses?.length) {
      const statuses = parsedQuery.filters.statuses.map(s => s.toLowerCase());
      filtered = filtered.filter(r =>
        r.status && statuses.includes(r.status.toLowerCase())
      );
    }

    if (parsedQuery.filters.priority?.length) {
      const priorities = parsedQuery.filters.priority.map(p => p.toLowerCase());
      filtered = filtered.filter(r =>
        r.priority && priorities.includes(r.priority.toLowerCase())
      );
    }

    if (parsedQuery.filters.dateRange) {
      const { start, end } = parsedQuery.filters.dateRange;
      filtered = filtered.filter(r => {
        const lastEdited = new Date(r.lastEdited);
        if (start && lastEdited < start) return false;
        if (end && lastEdited > end) return false;
        return true;
      });
    }

    if (parsedQuery.filters.categories && parsedQuery.filters.categories.length > 1) {
      const cats = parsedQuery.filters.categories.map(c => ({
        People: 'People',
        Projects: 'Project',
        Ideas: 'Idea',
        Admin: 'Admin',
      }[c] || c));
      filtered = filtered.filter(r => cats.includes(r.category));
    }

    // Fetch relations for top results (use Neon ID for lookups)
    const topResults = filtered.slice(0, 10);
    for (const result of topResults) {
      try {
        const related = await getRelatedEntries(result._neonId);
        if (related.length > 0) {
          (result as Record<string, unknown>).relatedTo = related.slice(0, 3).map(r => r.title);
        }
      } catch {
        // Skip relation fetch errors
      }
    }

    // Group counts
    const grouped = {
      People: filtered.filter(r => r.category === 'People').length,
      Project: filtered.filter(r => r.category === 'Project').length,
      Idea: filtered.filter(r => r.category === 'Idea').length,
      Admin: filtered.filter(r => r.category === 'Admin').length,
    };

    // Generate AI summary
    let summary = parsedQuery.naturalResponse || null;
    if (summarize && openai && filtered.length > 0) {
      try {
        const resultsContext = filtered.slice(0, 15).map(r =>
          `- [${r.category}] ${r.title}${r.status ? ` (${r.status})` : ''}${r.priority ? ` - ${r.priority} priority` : ''}`
        ).join('\n');

        const completion = await openai.chat.completions.create({
          model: 'gpt-4o-mini',
          temperature: 0.3,
          messages: [
            {
              role: 'system',
              content: 'You are a helpful assistant summarizing search results from a personal knowledge base. Be concise, actionable, and highlight connections between items.',
            },
            {
              role: 'user',
              content: `User asked: "${query}"\n\nFound ${filtered.length} matches:\n${resultsContext}\n\nProvide a brief 2-3 sentence summary. If there are cross-references between items, highlight those connections. Suggest what the user might want to do next.`,
            },
          ],
        });

        summary = completion.choices[0]?.message?.content || summary;
      } catch (aiError) {
        console.error('AI summary error:', aiError);
      }
    }

    // Strip internal _neonId before sending response
    const cleanResults = filtered.slice(0, 50).map(({ _neonId, ...rest }) => rest);

    return NextResponse.json({
      status: 'success',
      query,
      parsedQuery: {
        searchTerms: parsedQuery.searchTerms,
        intent: parsedQuery.intent,
        filters: {
          ...parsedQuery.filters,
          dateRange: parsedQuery.filters.dateRange ? {
            start: parsedQuery.filters.dateRange.start?.toISOString(),
            end: parsedQuery.filters.dateRange.end?.toISOString(),
          } : undefined,
        },
      },
      total: filtered.length,
      summary,
      results: cleanResults,
      grouped,
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
