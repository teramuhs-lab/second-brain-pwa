// Notion API Client
// Centralized Notion API operations - previously duplicated across 8+ files

const NOTION_API_KEY = process.env.NOTION_API_KEY;
const NOTION_VERSION = '2022-06-28';

export interface NotionPage {
  id: string;
  properties: Record<string, unknown>;
  created_time: string;
  last_edited_time: string;
}

export interface NotionQueryResponse {
  results: NotionPage[];
  has_more: boolean;
  next_cursor: string | null;
}

// Check if Notion is configured
export function isNotionConfigured(): boolean {
  return !!NOTION_API_KEY;
}

// Get headers for Notion API requests
function getHeaders(): HeadersInit {
  if (!NOTION_API_KEY) {
    throw new Error('NOTION_API_KEY is not configured');
  }
  return {
    Authorization: `Bearer ${NOTION_API_KEY}`,
    'Content-Type': 'application/json',
    'Notion-Version': NOTION_VERSION,
  };
}

// Query a database
export async function queryDatabase(
  databaseId: string,
  filter?: Record<string, unknown>,
  sorts?: Array<{ property: string; direction: 'ascending' | 'descending' }>,
  pageSize = 100
): Promise<NotionPage[]> {
  const response = await fetch(`https://api.notion.com/v1/databases/${databaseId}/query`, {
    method: 'POST',
    headers: getHeaders(),
    body: JSON.stringify({
      page_size: pageSize,
      ...(filter && { filter }),
      ...(sorts && { sorts }),
    }),
  });

  if (!response.ok) {
    const error = await response.text();
    throw new Error(`Notion query error: ${response.status} - ${error}`);
  }

  const data: NotionQueryResponse = await response.json();
  return data.results;
}

// Get a single page
export async function getPage(pageId: string): Promise<NotionPage> {
  const response = await fetch(`https://api.notion.com/v1/pages/${pageId}`, {
    headers: getHeaders(),
  });

  if (!response.ok) {
    const error = await response.text();
    throw new Error(`Notion page fetch error: ${response.status} - ${error}`);
  }

  return await response.json();
}

// Create a page
export async function createPage(
  databaseId: string,
  properties: Record<string, unknown>
): Promise<NotionPage> {
  const response = await fetch('https://api.notion.com/v1/pages', {
    method: 'POST',
    headers: getHeaders(),
    body: JSON.stringify({
      parent: { database_id: databaseId },
      properties,
    }),
  });

  if (!response.ok) {
    const error = await response.text();
    throw new Error(`Notion create error: ${response.status} - ${error}`);
  }

  return await response.json();
}

// Update a page
export async function updatePage(
  pageId: string,
  properties: Record<string, unknown>
): Promise<NotionPage> {
  const response = await fetch(`https://api.notion.com/v1/pages/${pageId}`, {
    method: 'PATCH',
    headers: getHeaders(),
    body: JSON.stringify({ properties }),
  });

  if (!response.ok) {
    const error = await response.text();
    throw new Error(`Notion update error: ${response.status} - ${error}`);
  }

  return await response.json();
}

// Archive a page (soft delete)
export async function archivePage(pageId: string): Promise<NotionPage> {
  const response = await fetch(`https://api.notion.com/v1/pages/${pageId}`, {
    method: 'PATCH',
    headers: getHeaders(),
    body: JSON.stringify({ archived: true }),
  });

  if (!response.ok) {
    const error = await response.text();
    throw new Error(`Notion archive error: ${response.status} - ${error}`);
  }

  return await response.json();
}
