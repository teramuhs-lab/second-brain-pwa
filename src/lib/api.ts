import type { CaptureResponse, UpdateResponse, Category, Entry, SearchResponse, AgentResponse, DigestResponse, DailyDigestResponse, WeeklyDigestResponse, UrlProcessResult } from './types';

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
  // Format date in local timezone (YYYY-MM-DD) instead of UTC
  const year = date.getFullYear();
  const month = String(date.getMonth() + 1).padStart(2, '0');
  const day = String(date.getDate()).padStart(2, '0');
  const localDateStr = `${year}-${month}-${day}`;
  return updateEntry(pageId, database, { [dateField]: localDateStr });
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

// Delete (archive) an entry
export async function deleteEntry(pageId: string): Promise<{ status: 'deleted' | 'error'; error?: string }> {
  try {
    const response = await fetch('/api/delete', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ page_id: pageId }),
    });

    const data = await response.json();

    if (!response.ok || data.status === 'error') {
      return {
        status: 'error',
        error: data.error || `HTTP error: ${response.status}`,
      };
    }

    return data;
  } catch (error) {
    console.error('Delete error:', error);
    return {
      status: 'error',
      error: error instanceof Error ? error.message : 'Unknown error',
    };
  }
}

// Fetch digest (daily or weekly)
export async function fetchDigest(type: 'daily'): Promise<DailyDigestResponse>;
export async function fetchDigest(type: 'weekly'): Promise<WeeklyDigestResponse>;
export async function fetchDigest(type: 'daily' | 'weekly'): Promise<DigestResponse> {
  try {
    const response = await fetch(`/api/digest?type=${type}`, {
      method: 'GET',
      headers: { 'Content-Type': 'application/json' },
    });

    if (!response.ok) {
      throw new Error(`HTTP error! status: ${response.status}`);
    }

    return await response.json();
  } catch (error) {
    console.error('Digest error:', error);
    const baseError = {
      status: 'error' as const,
      generatedAt: new Date().toISOString(),
      aiSummary: '',
      error: error instanceof Error ? error.message : 'Unknown error',
    };

    if (type === 'daily') {
      return {
        ...baseError,
        type: 'daily',
        data: { projects: [], tasks: [], followups: [] },
        counts: { projects: 0, tasks: 0, followups: 0 },
      };
    } else {
      return {
        ...baseError,
        type: 'weekly',
        data: { completedTasks: [], completedProjects: [], inboxByCategory: {} },
        counts: { completedTasks: 0, completedProjects: 0, totalInbox: 0 },
      };
    }
  }
}

// Process URL - Extract content and generate summary
export async function processUrl(url: string): Promise<UrlProcessResult> {
  try {
    const response = await fetch('/api/process-url', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ url }),
    });

    if (!response.ok) {
      throw new Error(`HTTP error! status: ${response.status}`);
    }

    return await response.json();
  } catch (error) {
    console.error('Process URL error:', error);
    return {
      status: 'error',
      url,
      urlType: 'generic',
      title: '',
      one_liner: '',
      full_summary: '',
      key_points: [],
      category: 'Tech',
      error: error instanceof Error ? error.message : 'Failed to process URL',
    };
  }
}

// Fetch a single entry's full details
export async function fetchEntry(entryId: string): Promise<{
  status: 'success' | 'error';
  entry?: Record<string, unknown>;
  error?: string;
}> {
  try {
    const response = await fetch(`/api/entry/${entryId}`, {
      method: 'GET',
      headers: { 'Content-Type': 'application/json' },
    });

    if (!response.ok) {
      throw new Error(`HTTP error! status: ${response.status}`);
    }

    return await response.json();
  } catch (error) {
    console.error('Fetch entry error:', error);
    return {
      status: 'error',
      error: error instanceof Error ? error.message : 'Unknown error',
    };
  }
}

// URL detection helper
export function isUrl(text: string): boolean {
  const urlRegex = /https?:\/\/[^\s]+/;
  return urlRegex.test(text);
}

// Extract URL from text
export function extractUrl(text: string): string | null {
  const urlRegex = /https?:\/\/[^\s]+/;
  const match = text.match(urlRegex);
  return match ? match[0] : null;
}

// Send URL summary to Slack (supports rich summary format)
export async function sendSlackNotification(data: {
  title: string;
  url: string;
  one_liner: string;
  category: string;
  readTime?: string;
  // Rich summary fields (optional for backward compatibility)
  tldr?: string;
  key_takeaways?: string[];
  action_items?: string[];
  // Legacy fields
  full_summary?: string;
  key_points?: string[];
}): Promise<{ status: 'sent' | 'error'; error?: string }> {
  try {
    const response = await fetch('/api/send-slack', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(data),
    });

    if (!response.ok) {
      throw new Error(`HTTP error! status: ${response.status}`);
    }

    return await response.json();
  } catch (error) {
    console.error('Send Slack error:', error);
    return {
      status: 'error',
      error: error instanceof Error ? error.message : 'Failed to send to Slack',
    };
  }
}
