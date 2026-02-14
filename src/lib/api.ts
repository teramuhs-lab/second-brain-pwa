import type { CaptureResponse, UpdateResponse, Category, Entry, SearchResponse, AgentResponse, DigestResponse, DailyDigestResponse, WeeklyDigestResponse, UrlProcessResult, ResearchAgentResponse } from './types';
import { addToQueue } from './offline-queue';

// API endpoints (all local — no external dependencies)
const ENDPOINTS = {
  agent: '/api/agent',
};

// Capture a new thought (with optional reminder date)
export async function captureThought(text: string, reminderDate?: string): Promise<CaptureResponse> {
  try {
    // Use local API endpoint for better reliability
    const response = await fetch('/api/capture', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ text, reminderDate }),
    });

    if (!response.ok) {
      throw new Error(`HTTP error! status: ${response.status}`);
    }

    return await response.json();
  } catch (error) {
    // Network error — save to offline queue
    if (error instanceof TypeError && typeof indexedDB !== 'undefined') {
      try {
        await addToQueue(text, reminderDate);
        return {
          status: 'captured',
          category: 'Admin',
          confidence: 0,
          offline: true,
        } as CaptureResponse & { offline: boolean };
      } catch {
        // IndexedDB failed too
      }
    }
    console.error('Capture error:', error);
    return {
      status: 'error',
      error: error instanceof Error ? error.message : 'Unknown error',
    };
  }
}

// Recategorize an entry
export async function recategorize(
  pageId: string,
  currentCategory: Category,
  newCategory: Category,
  rawText: string
): Promise<CaptureResponse> {
  try {
    // Use local API route
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
    console.warn('Recategorize error:', error);
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
    // Use local API endpoint
    const response = await fetch('/api/update', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        page_id: pageId,
        database,
        updates,
      }),
    });

    const data = await response.json();

    if (!response.ok) {
      console.warn('Update failed:', data.error, data.details);
      return {
        status: 'error',
        error: data.details || data.error || `HTTP error: ${response.status}`,
      };
    }

    return data;
  } catch (error) {
    console.warn('Update failed:', error);
    return {
      status: 'error',
      error: error instanceof Error ? error.message : 'Unknown error',
    };
  }
}

// Fetch entries by database and status (reads from Neon via local API)
export async function fetchEntries(
  database: string,
  status?: string
): Promise<Entry[]> {
  try {
    const params = new URLSearchParams({ database });
    if (status) params.append('status', status);

    const response = await fetch(`/api/entries?${params.toString()}`, {
      method: 'GET',
      headers: { 'Content-Type': 'application/json' },
    });

    if (!response.ok) {
      throw new Error(`HTTP error! status: ${response.status}`);
    }

    const data = await response.json();
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
      grouped: { People: 0, Project: 0, Idea: 0, Admin: 0, Reading: 0 },
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

// Ask the Research Agent (deep research with citations)
export async function askResearchAgent(
  message: string,
  sessionId: string
): Promise<ResearchAgentResponse> {
  try {
    const response = await fetch('/api/agent/research', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ message, session_id: sessionId }),
    });

    if (!response.ok) {
      throw new Error(`HTTP error! status: ${response.status}`);
    }

    return await response.json();
  } catch (error) {
    console.error('Research agent error:', error);
    return {
      status: 'error',
      response: '',
      citations: [],
      research_steps: [],
      expert_domain: 'research',
      tools_used: [],
      iterations: 0,
      error: error instanceof Error ? error.message : 'Failed to reach research agent',
    };
  }
}

// Clear chat history
export async function clearChat(sessionId: string): Promise<{ status: 'success' | 'error'; message?: string; error?: string }> {
  try {
    const response = await fetch(`${ENDPOINTS.agent}?session_id=${encodeURIComponent(sessionId)}`, {
      method: 'DELETE',
    });

    if (!response.ok) {
      throw new Error(`HTTP error! status: ${response.status}`);
    }

    return await response.json();
  } catch (error) {
    console.error('Clear chat error:', error);
    return {
      status: 'error',
      error: error instanceof Error ? error.message : 'Failed to clear chat',
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

// Save a reading entry (from URL preview)
export async function saveReading(data: {
  title: string;
  url: string;
  oneLiner?: string;
  tldr?: string;
  category?: string;
  structuredSummary?: Record<string, unknown>;
}): Promise<{ status: 'success' | 'error'; pageId?: string; error?: string }> {
  try {
    const response = await fetch('/api/save-reading', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(data),
    });

    if (!response.ok) {
      throw new Error(`HTTP error! status: ${response.status}`);
    }

    return await response.json();
  } catch (error) {
    console.error('Save reading error:', error);
    return {
      status: 'error',
      error: error instanceof Error ? error.message : 'Failed to save reading entry',
    };
  }
}

// Save research result (Ideas, Admin, or Reading)
export async function saveResearchResult(data: {
  question: string;
  answer: string;
  category: 'Idea' | 'Admin' | 'Reading';
  citations?: Array<{
    title: string;
    type: string;
    url?: string;
    database?: string;
  }>;
  expertDomain?: string;
}): Promise<{ status: 'success' | 'error'; message?: string; pageId?: string; error?: string }> {
  try {
    const response = await fetch('/api/save-research', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(data),
    });

    if (!response.ok) {
      throw new Error(`HTTP error! status: ${response.status}`);
    }

    return await response.json();
  } catch (error) {
    console.error('Save research error:', error);
    return {
      status: 'error',
      error: error instanceof Error ? error.message : 'Failed to save research',
    };
  }
}
