// Web search integration for research agent
// Supports Tavily API (recommended) with fallback to basic fetch

import { Citation } from './citations';

export interface WebSearchResult {
  title: string;
  url: string;
  snippet: string;
  score?: number;
}

export interface WebSearchResponse {
  success: boolean;
  results: WebSearchResult[];
  citations: Omit<Citation, 'number'>[];
  error?: string;
}

// Tavily API response structure
interface TavilyResult {
  title: string;
  url: string;
  content: string;
  score: number;
}

interface TavilyResponse {
  results: TavilyResult[];
  answer?: string;
}

/**
 * Search the web using Tavily API
 */
export async function searchWeb(
  query: string,
  options: {
    maxResults?: number;
    searchDepth?: 'basic' | 'advanced';
    includeAnswer?: boolean;
  } = {}
): Promise<WebSearchResponse> {
  const { maxResults = 5, searchDepth = 'basic', includeAnswer = false } = options;

  const apiKey = process.env.TAVILY_API_KEY;

  if (!apiKey) {
    console.warn('TAVILY_API_KEY not configured, web search disabled');
    return {
      success: false,
      results: [],
      citations: [],
      error: 'Web search not configured (missing TAVILY_API_KEY)',
    };
  }

  try {
    const response = await fetch('https://api.tavily.com/search', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        api_key: apiKey,
        query,
        search_depth: searchDepth,
        max_results: maxResults,
        include_answer: includeAnswer,
        include_raw_content: false,
      }),
    });

    if (!response.ok) {
      const errorText = await response.text();
      throw new Error(`Tavily API error: ${response.status} - ${errorText}`);
    }

    const data: TavilyResponse = await response.json();

    const results: WebSearchResult[] = data.results.map((r) => ({
      title: r.title,
      url: r.url,
      snippet: r.content.slice(0, 300),
      score: r.score,
    }));

    const citations: Omit<Citation, 'number'>[] = results.map((r) => ({
      type: 'web' as const,
      url: r.url,
      title: r.title,
      snippet: r.snippet,
    }));

    return {
      success: true,
      results,
      citations,
    };
  } catch (error) {
    console.error('Web search error:', error);
    return {
      success: false,
      results: [],
      citations: [],
      error: error instanceof Error ? error.message : 'Web search failed',
    };
  }
}

/**
 * Format web search results for AI context
 */
export function formatWebResultsForContext(results: WebSearchResult[]): string {
  if (results.length === 0) {
    return 'No web results found.';
  }

  return results
    .map((r, i) => `[Web ${i + 1}] ${r.title}\nURL: ${r.url}\n${r.snippet}`)
    .join('\n\n');
}

/**
 * Check if Tavily is configured
 */
export function isWebSearchAvailable(): boolean {
  return !!process.env.TAVILY_API_KEY;
}

/**
 * Search with focus area (maps to Tavily search types)
 */
export type SearchFocus = 'general' | 'news' | 'technical' | 'research';

export async function searchWebWithFocus(
  query: string,
  focus: SearchFocus
): Promise<WebSearchResponse> {
  // Adjust query and settings based on focus
  let adjustedQuery = query;
  let searchDepth: 'basic' | 'advanced' = 'basic';

  switch (focus) {
    case 'news':
      adjustedQuery = `${query} latest news 2024 2025`;
      break;
    case 'technical':
      adjustedQuery = `${query} documentation tutorial guide`;
      searchDepth = 'advanced';
      break;
    case 'research':
      adjustedQuery = `${query} research study analysis`;
      searchDepth = 'advanced';
      break;
    default:
      // general - no adjustment
      break;
  }

  return searchWeb(adjustedQuery, { searchDepth, maxResults: 5 });
}
