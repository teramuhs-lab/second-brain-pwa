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
  priority?: string;
  dueDate?: string;
  created: string;
  lastEdited: string;
  snippet?: string;
  relevanceScore?: number;
  relatedTo?: string[];
  source?: string;
}

interface ParsedQuery {
  searchTerms: string[];
  intent: 'search' | 'question' | 'action' | 'filter';
  filters: {
    categories?: string[];
    statuses?: string[];
    dateRange?: { start?: Date; end?: Date };
    priority?: string[];
    hasRelation?: string;
  };
  naturalResponse?: string;
}

// ============================================
// PHASE 1: SEMANTIC SEARCH WITH EMBEDDINGS
// ============================================

async function generateEmbedding(text: string, openai: OpenAI): Promise<number[]> {
  const response = await openai.embeddings.create({
    model: 'text-embedding-3-small',
    input: text,
  });
  return response.data[0].embedding;
}

function cosineSimilarity(a: number[], b: number[]): number {
  let dotProduct = 0;
  let normA = 0;
  let normB = 0;
  for (let i = 0; i < a.length; i++) {
    dotProduct += a[i] * b[i];
    normA += a[i] * a[i];
    normB += b[i] * b[i];
  }
  return dotProduct / (Math.sqrt(normA) * Math.sqrt(normB));
}

// ============================================
// PHASE 2: NATURAL LANGUAGE QUERY PARSING
// ============================================

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

Output STRICT JSON:
{
  "searchTerms": ["keyword1", "keyword2"],
  "intent": "search" | "question" | "action" | "filter",
  "filters": {
    "categories": ["People", "Projects", "Ideas", "Admin"] or null,
    "statuses": ["Active", "Todo", "Done", "Complete", "New", "Dormant"] or null,
    "dateRange": { "start": "YYYY-MM-DD", "end": "YYYY-MM-DD" } or null,
    "priority": ["High", "Medium", "Low"] or null,
    "hasRelation": "person name or project name" or null
  },
  "naturalResponse": "Brief friendly response about what you're searching for"
}

Examples:
- "What did I discuss with Sarah?" → categories: ["People"], searchTerms: ["Sarah"], hasRelation: "Sarah"
- "Show urgent tasks due this week" → categories: ["Admin"], statuses: ["Todo"], priority: ["High"], dateRange: this week
- "Active projects" → categories: ["Projects"], statuses: ["Active"]
- "Ideas about AI" → categories: ["Ideas"], searchTerms: ["AI"]
- "Everything from last month" → dateRange: last month
- "People at Google" → categories: ["People"], searchTerms: ["Google"]`,
      },
      { role: 'user', content: query },
    ],
  });

  try {
    const text = response.choices[0]?.message?.content || '';
    const jsonMatch = text.match(/\{[\s\S]*\}/);
    if (jsonMatch) {
      const parsed = JSON.parse(jsonMatch[0]);

      // Convert date strings to Date objects
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

  // Fallback: basic keyword extraction
  return {
    searchTerms: query.toLowerCase().split(/\s+/).filter(t => t.length >= 2),
    intent: 'search',
    filters: {},
  };
}

// ============================================
// NOTION HELPERS
// ============================================

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

function extractPriority(properties: Record<string, unknown>): string | undefined {
  const priorityProp = properties['Priority'] as { select?: { name: string } } | undefined;
  return priorityProp?.select?.name;
}

function extractDate(properties: Record<string, unknown>, field: string): string | undefined {
  const dateProp = properties[field] as { date?: { start: string } } | undefined;
  return dateProp?.date?.start;
}

function extractSource(properties: Record<string, unknown>): string | undefined {
  const sourceProp = properties['Source'] as { url?: string } | undefined;
  return sourceProp?.url || undefined;
}

function extractText(properties: Record<string, unknown>): string {
  const texts: string[] = [];

  for (const [, value] of Object.entries(properties)) {
    const prop = value as Record<string, unknown>;

    // Title field
    if (prop.title && Array.isArray(prop.title)) {
      const titleArray = prop.title as Array<{ plain_text: string }>;
      texts.push(titleArray.map(t => t.plain_text).join(''));
    }

    // Rich text fields (Notes, Context, Next Action, etc.)
    if (prop.rich_text && Array.isArray(prop.rich_text)) {
      const richTextArray = prop.rich_text as Array<{ plain_text: string }>;
      texts.push(richTextArray.map(t => t.plain_text).join(''));
    }

    // Select fields (Status, Priority, Category, etc.)
    if (prop.select && typeof prop.select === 'object') {
      const select = prop.select as { name?: string };
      if (select.name) texts.push(select.name);
    }

    // Multi-select fields
    if (prop.multi_select && Array.isArray(prop.multi_select)) {
      const multiSelect = prop.multi_select as Array<{ name: string }>;
      texts.push(multiSelect.map(s => s.name).join(' '));
    }

    // Relation fields - extract linked page titles
    if (prop.relation && Array.isArray(prop.relation)) {
      // Relations contain page IDs, but we can't fetch titles synchronously
      // Instead, we'll search for relation text in other fields
    }

    // People fields (mentions)
    if (prop.people && Array.isArray(prop.people)) {
      const people = prop.people as Array<{ name?: string }>;
      texts.push(people.map(p => p.name || '').filter(Boolean).join(' '));
    }

    // Email fields
    if (prop.email && typeof prop.email === 'string') {
      texts.push(prop.email);
    }

    // Phone number fields
    if (prop.phone_number && typeof prop.phone_number === 'string') {
      texts.push(prop.phone_number);
    }

    // URL fields
    if (prop.url && typeof prop.url === 'string') {
      texts.push(prop.url);
    }

    // Number fields (convert to string for searchability)
    if (prop.number !== undefined && prop.number !== null && typeof prop.number === 'number') {
      texts.push(String(prop.number));
    }

    // Checkbox (include label if checked)
    // Skipped - not useful for text search

    // Date fields - include for date-related searches
    if (prop.date && typeof prop.date === 'object') {
      const date = prop.date as { start?: string; end?: string };
      if (date.start) texts.push(date.start);
      if (date.end) texts.push(date.end);
    }
  }

  return texts.join(' ');
}

// Extract relation page IDs from properties
function extractRelationIds(properties: Record<string, unknown>): string[] {
  const ids: string[] = [];
  for (const [, value] of Object.entries(properties)) {
    const prop = value as Record<string, unknown>;
    if (prop.relation && Array.isArray(prop.relation)) {
      const relations = prop.relation as Array<{ id: string }>;
      ids.push(...relations.map(r => r.id));
    }
  }
  return ids;
}

// Batch fetch page titles for relation lookup
async function fetchPageTitles(pageIds: string[]): Promise<Map<string, string>> {
  const titles = new Map<string, string>();
  if (pageIds.length === 0) return titles;

  // Fetch in batches of 10 to avoid rate limits
  const batchSize = 10;
  for (let i = 0; i < Math.min(pageIds.length, 30); i += batchSize) {
    const batch = pageIds.slice(i, i + batchSize);
    const promises = batch.map(async (id) => {
      try {
        const response = await fetch(`https://api.notion.com/v1/pages/${id}`, {
          headers: {
            Authorization: `Bearer ${NOTION_API_KEY}`,
            'Notion-Version': '2022-06-28',
          },
        });
        if (response.ok) {
          const page = await response.json();
          const title = extractTitle(page.properties);
          titles.set(id, title);
        }
      } catch {
        // Skip failed fetches
      }
    });
    await Promise.all(promises);
  }
  return titles;
}

// ============================================
// PHASE 3: CROSS-REFERENCE DISCOVERY
// ============================================

function findRelatedEntries(
  results: SearchResult[],
  allEntries: Map<string, SearchResult>
): Map<string, string[]> {
  const relations = new Map<string, string[]>();

  for (const result of results) {
    const related: string[] = [];
    const titleWords = result.title.toLowerCase().split(/\s+/);

    // Find other entries that mention this entry's title or key words
    for (const [id, entry] of allEntries) {
      if (id === result.id) continue;

      const entryText = (entry.title + ' ' + (entry.snippet || '')).toLowerCase();

      // Check if other entries reference this one
      for (const word of titleWords) {
        if (word.length > 3 && entryText.includes(word)) {
          if (!related.includes(entry.title)) {
            related.push(entry.title);
          }
          break;
        }
      }
    }

    if (related.length > 0) {
      relations.set(result.id, related.slice(0, 3)); // Max 3 related items
    }
  }

  return relations;
}

// ============================================
// MAIN SEARCH FUNCTION
// ============================================

async function searchDatabase(
  databaseId: string,
  category: string,
  parsedQuery: ParsedQuery,
  queryEmbedding: number[] | null,
  openai: OpenAI | null
): Promise<SearchResult[]> {
  // Build Notion filter if we have specific filters
  const notionFilter: Record<string, unknown>[] = [];

  if (parsedQuery.filters.statuses && parsedQuery.filters.statuses.length > 0) {
    notionFilter.push({
      or: parsedQuery.filters.statuses.map(status => ({
        property: 'Status',
        select: { equals: status },
      })),
    });
  }

  if (parsedQuery.filters.priority && parsedQuery.filters.priority.length > 0) {
    notionFilter.push({
      or: parsedQuery.filters.priority.map(p => ({
        property: 'Priority',
        select: { equals: p },
      })),
    });
  }

  // Fetch from Notion
  const queryBody: Record<string, unknown> = {
    page_size: 100,
    sorts: [{ timestamp: 'last_edited_time', direction: 'descending' }],
  };

  if (notionFilter.length > 0) {
    queryBody.filter = notionFilter.length === 1 ? notionFilter[0] : { and: notionFilter };
  }

  const response = await notionRequest(`/databases/${databaseId}/query`, 'POST', queryBody);
  const pages = response.results as NotionPage[];

  // Phase 1: Collect all relation IDs across all pages
  const allRelationIds: Set<string> = new Set();
  const pageRelationMap = new Map<string, string[]>();

  for (const page of pages) {
    const relationIds = extractRelationIds(page.properties);
    if (relationIds.length > 0) {
      pageRelationMap.set(page.id, relationIds);
      relationIds.forEach(id => allRelationIds.add(id));
    }
  }

  // Phase 2: Batch fetch all relation titles (for searchability)
  const relationTitles = await fetchPageTitles(Array.from(allRelationIds));

  const results: SearchResult[] = [];

  for (const page of pages) {
    const title = extractTitle(page.properties);
    const fullText = extractText(page.properties);
    const source = extractSource(page.properties);

    // Get relation titles for this page
    const pageRelationIds = pageRelationMap.get(page.id) || [];
    const relatedTitles = pageRelationIds
      .map(id => relationTitles.get(id))
      .filter((t): t is string => !!t);

    // Include source URL and relation titles in searchable text
    let searchableText = fullText;
    if (source) searchableText += ' ' + source;
    if (relatedTitles.length > 0) searchableText += ' ' + relatedTitles.join(' ');

    const lastEdited = new Date(page.last_edited_time);

    // Apply date filter
    if (parsedQuery.filters.dateRange) {
      const { start, end } = parsedQuery.filters.dateRange;
      if (start && lastEdited < start) continue;
      if (end && lastEdited > end) continue;
    }

    // Calculate relevance score
    let relevanceScore = 0;

    // Keyword matching - includes source URL and relation titles in search
    const lowerText = searchableText.toLowerCase();
    const lowerTitle = title.toLowerCase();
    for (const term of parsedQuery.searchTerms) {
      const lowerTerm = term.toLowerCase();
      if (lowerTitle.includes(lowerTerm)) {
        relevanceScore += 10; // Title match is worth more
      }
      if (lowerText.includes(lowerTerm)) {
        relevanceScore += 5;
      }
      // Bonus for relation match (e.g., finding "Kaleb" in a linked Person)
      for (const relTitle of relatedTitles) {
        if (relTitle.toLowerCase().includes(lowerTerm)) {
          relevanceScore += 7; // Relation match is valuable
          break;
        }
      }
    }

    // Semantic similarity (if embeddings available)
    if (queryEmbedding && openai && relevanceScore > 0) {
      try {
        const textEmbedding = await generateEmbedding(title + ' ' + fullText.slice(0, 500), openai);
        const similarity = cosineSimilarity(queryEmbedding, textEmbedding);
        relevanceScore += similarity * 20; // Semantic score boost
      } catch {
        // Skip embedding if it fails
      }
    }

    // For queries without specific search terms, include everything
    if (parsedQuery.searchTerms.length === 0) {
      relevanceScore = 1;
    }

    if (relevanceScore > 0) {
      results.push({
        id: page.id,
        title,
        category,
        status: extractStatus(page.properties),
        priority: extractPriority(page.properties),
        dueDate: extractDate(page.properties, 'Due Date') || extractDate(page.properties, 'Next Follow-up'),
        created: page.created_time,
        lastEdited: page.last_edited_time,
        snippet: fullText.slice(0, 200),
        relevanceScore,
        source,
        relatedTo: relatedTitles.length > 0 ? relatedTitles : undefined,
      });
    }
  }

  return results;
}

// ============================================
// API HANDLER
// ============================================

export async function POST(request: NextRequest) {
  try {
    if (!NOTION_API_KEY) {
      return NextResponse.json(
        { status: 'error', error: 'NOTION_API_KEY not configured' },
        { status: 500 }
      );
    }

    const body = await request.json();
    const { query, summarize = true, semantic = true } = body;

    if (!query || typeof query !== 'string') {
      return NextResponse.json(
        { status: 'error', error: 'Missing required field: query' },
        { status: 400 }
      );
    }

    const openai = OPENAI_API_KEY ? new OpenAI({ apiKey: OPENAI_API_KEY }) : null;

    // Phase 2: Parse natural language query
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

    // Phase 1: Generate query embedding for semantic search
    let queryEmbedding: number[] | null = null;
    if (semantic && openai && parsedQuery.searchTerms.length > 0) {
      try {
        queryEmbedding = await generateEmbedding(query, openai);
      } catch {
        // Continue without semantic search
      }
    }

    // Determine which databases to search
    const categoriesToSearch = parsedQuery.filters.categories || ['People', 'Projects', 'Ideas', 'Admin'];

    // Map category names to database IDs
    const categoryMap: Record<string, { id: string; name: string }> = {
      People: { id: DATABASE_IDS.People, name: 'People' },
      Projects: { id: DATABASE_IDS.Projects, name: 'Project' },
      Ideas: { id: DATABASE_IDS.Ideas, name: 'Idea' },
      Admin: { id: DATABASE_IDS.Admin, name: 'Admin' },
    };

    // Search selected databases in parallel
    const searchPromises = categoriesToSearch.map(cat => {
      const dbInfo = categoryMap[cat];
      if (!dbInfo) return Promise.resolve([]);
      return searchDatabase(dbInfo.id, dbInfo.name, parsedQuery, queryEmbedding, openai);
    });

    const resultsArrays = await Promise.all(searchPromises);
    let allResults = resultsArrays.flat();

    // Phase 3: Find cross-references
    const allEntriesMap = new Map(allResults.map(r => [r.id, r]));
    const relations = findRelatedEntries(allResults, allEntriesMap);

    // Add related items to results
    allResults = allResults.map(r => ({
      ...r,
      relatedTo: relations.get(r.id),
    }));

    // Sort by relevance score (descending), then by last edited
    allResults.sort((a, b) => {
      const scoreA = a.relevanceScore || 0;
      const scoreB = b.relevanceScore || 0;
      if (scoreB !== scoreA) return scoreB - scoreA;
      return new Date(b.lastEdited).getTime() - new Date(a.lastEdited).getTime();
    });

    // Group counts
    const grouped = {
      People: allResults.filter(r => r.category === 'People').length,
      Project: allResults.filter(r => r.category === 'Project').length,
      Idea: allResults.filter(r => r.category === 'Idea').length,
      Admin: allResults.filter(r => r.category === 'Admin').length,
    };

    // Generate AI summary with more context
    let summary = parsedQuery.naturalResponse || null;
    if (summarize && openai && allResults.length > 0) {
      try {
        const resultsContext = allResults.slice(0, 15).map(r =>
          `- [${r.category}] ${r.title}${r.status ? ` (${r.status})` : ''}${r.priority ? ` - ${r.priority} priority` : ''}${r.relatedTo ? ` [Related: ${r.relatedTo.join(', ')}]` : ''}`
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
              content: `User asked: "${query}"

Found ${allResults.length} matches:
${resultsContext}

Provide a brief 2-3 sentence summary. If there are cross-references between items, highlight those connections. Suggest what the user might want to do next.`,
            },
          ],
        });

        summary = completion.choices[0]?.message?.content || summary;
      } catch (aiError) {
        console.error('AI summary error:', aiError);
      }
    }

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
      total: allResults.length,
      summary,
      results: allResults.slice(0, 50),
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
