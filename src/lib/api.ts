import type { CaptureResponse, UpdateResponse, Category, Entry, SearchResponse, AgentResponse } from './types';

// n8n webhook base URL - configure in environment
const N8N_BASE_URL = process.env.NEXT_PUBLIC_N8N_URL || 'https://n8n.srv1236227.hstgr.cloud';

// API endpoints
const ENDPOINTS = {
  capture: `${N8N_BASE_URL}/webhook/sb-pwa-v1`,
  fix: `${N8N_BASE_URL}/webhook/sb-pwa-fix`,
  update: `${N8N_BASE_URL}/webhook/sb-pwa-update`,
  fetch: `${N8N_BASE_URL}/webhook/sb-pwa-fetch`,
  agent: `${N8N_BASE_URL}/webhook/sb-agent`,
};

// Capture a new thought
export async function captureThought(text: string): Promise<CaptureResponse> {
  try {
    const response = await fetch(ENDPOINTS.capture, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ text, source: 'pwa' }),
    });

    if (!response.ok) {
      throw new Error(`HTTP error! status: ${response.status}`);
    }

    return await response.json();
  } catch (error) {
    console.error('Capture error:', error);
    return {
      status: 'error',
      error: error instanceof Error ? error.message : 'Unknown error',
    };
  }
}

// Recategorize an entry (uses local API route that talks directly to Notion)
export async function recategorize(
  pageId: string,
  currentCategory: Category,
  newCategory: Category,
  rawText: string
): Promise<CaptureResponse> {
  try {
    // Use local API route instead of n8n webhook
    const response = await fetch('/api/recategorize', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        page_id: pageId,
        current_category: currentCategory,
        new_category: newCategory,
        raw_text: rawText,
      }),
    });

    if (!response.ok) {
      throw new Error(`HTTP error! status: ${response.status}`);
    }

    const result = await response.json();
    // Map the response to CaptureResponse format
    return {
      status: result.status === 'fixed' ? 'captured' : 'error',
      category: newCategory,
      page_id: result.page_id,
      error: result.error,
    };
  } catch (error) {
    console.error('Recategorize error:', error);
    return {
      status: 'error',
      error: error instanceof Error ? error.message : 'Unknown error',
    };
  }
}

// Update an entry (status, priority, due date, etc.)
export async function updateEntry(
  pageId: string,
  database: string,
  updates: Record<string, unknown>
): Promise<UpdateResponse> {
  try {
    const response = await fetch(ENDPOINTS.update, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        page_id: pageId,
        database,
        updates,
      }),
    });

    if (!response.ok) {
      throw new Error(`HTTP error! status: ${response.status}`);
    }

    return await response.json();
  } catch (error) {
    console.error('Update error:', error);
    return {
      status: 'error',
      error: error instanceof Error ? error.message : 'Unknown error',
    };
  }
}

// Fetch entries by database and status
export async function fetchEntries(
  database: string,
  status?: string
): Promise<Entry[]> {
  try {
    const params = new URLSearchParams({ database });
    if (status) params.append('status', status);

    const response = await fetch(`${ENDPOINTS.fetch}?${params.toString()}`, {
      method: 'GET',
      headers: { 'Content-Type': 'application/json' },
    });

    if (!response.ok) {
      throw new Error(`HTTP error! status: ${response.status}`);
    }

    const data = await response.json();
    // n8n returns { status, database, count, items }
    return data.items || [];
  } catch (error) {
    console.error('Fetch error:', error);
    return [];
  }
}

// Mark entry as done
export async function markDone(pageId: string, database: string): Promise<UpdateResponse> {
  let statusValue: string;
  if (database === 'projects') {
    statusValue = 'Complete';
  } else if (database === 'people') {
    statusValue = 'Dormant';
  } else {
    statusValue = 'Done';
  }
  return updateEntry(pageId, database, { status: statusValue });
}

// Snooze entry to a specific date
export async function snoozeEntry(
  pageId: string,
  database: string,
  date: Date
): Promise<UpdateResponse> {
  const dateField = database === 'people' ? 'next_followup' : 'due_date';
  return updateEntry(pageId, database, { [dateField]: date.toISOString().split('T')[0] });
}

// Search across all databases
export async function searchEntries(
  query: string,
  summarize: boolean = true
): Promise<SearchResponse> {
  try {
    const response = await fetch('/api/search', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ query, summarize }),
    });

    if (!response.ok) {
      throw new Error(`HTTP error! status: ${response.status}`);
    }

    return await response.json();
  } catch (error) {
    console.error('Search error:', error);
    return {
      status: 'error',
      query,
      total: 0,
      results: [],
      grouped: { People: 0, Project: 0, Idea: 0, Admin: 0 },
      error: error instanceof Error ? error.message : 'Unknown error',
    };
  }
}

// Ask the AI Agent (Smart Capture)
export async function askAgent(
  message: string,
  sessionId: string
): Promise<AgentResponse> {
  try {
    const response = await fetch(ENDPOINTS.agent, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ message, session_id: sessionId }),
    });

    if (!response.ok) {
      throw new Error(`HTTP error! status: ${response.status}`);
    }

    return await response.json();
  } catch (error) {
    console.error('Agent error:', error);
    return {
      status: 'error',
      response: '',
      error: error instanceof Error ? error.message : 'Failed to reach agent',
    };
  }
}
