import { describe, it, expect, vi, beforeEach } from 'vitest';
import {
  captureThought,
  recategorize,
  updateEntry,
  fetchEntries,
  markDone,
  snoozeEntry,
  searchEntries,
  askAgent,
  clearChat,
  deleteEntry,
  fetchDigest,
  isUrl,
  extractUrl,
} from '../api';

// Mock global.fetch before each test
vi.stubGlobal('fetch', vi.fn());
const mockFetch = vi.mocked(fetch);

beforeEach(() => {
  mockFetch.mockReset();
  vi.spyOn(console, 'error').mockImplementation(() => {});
  vi.spyOn(console, 'warn').mockImplementation(() => {});
});

// ---------------------------------------------------------------------------
// 1. captureThought
// ---------------------------------------------------------------------------
describe('captureThought', () => {
  it('returns captured response on success', async () => {
    const mockResponse = { status: 'captured', category: 'Admin', confidence: 0.9, page_id: 'page-1' };
    mockFetch.mockResolvedValueOnce({
      ok: true,
      json: async () => mockResponse,
    } as Response);

    const result = await captureThought('Buy groceries');
    expect(result).toEqual(mockResponse);
    expect(mockFetch).toHaveBeenCalledWith('/api/capture', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ text: 'Buy groceries', reminderDate: undefined }),
    });
  });

  it('returns error when HTTP response is not ok', async () => {
    mockFetch.mockResolvedValueOnce({
      ok: false,
      status: 500,
      json: async () => ({}),
    } as Response);

    const result = await captureThought('Test');
    expect(result.status).toBe('error');
    expect(result.error).toContain('500');
  });

  it('returns error on network TypeError (no indexedDB)', async () => {
    mockFetch.mockRejectedValueOnce(new TypeError('Failed to fetch'));

    const result = await captureThought('Offline thought');
    expect(result.status).toBe('error');
    expect(result.error).toBe('Failed to fetch');
  });
});

// ---------------------------------------------------------------------------
// 2. recategorize
// ---------------------------------------------------------------------------
describe('recategorize', () => {
  it('maps "fixed" status to "captured" on success', async () => {
    mockFetch.mockResolvedValueOnce({
      ok: true,
      json: async () => ({ status: 'fixed', page_id: 'new-page-1' }),
    } as Response);

    const result = await recategorize('old-page', 'Admin', 'Project', 'My raw text');
    expect(result.status).toBe('captured');
    expect(result.category).toBe('Project');
    expect(result.page_id).toBe('new-page-1');
  });

  it('returns error on HTTP failure', async () => {
    mockFetch.mockResolvedValueOnce({
      ok: false,
      status: 400,
      json: async () => ({}),
    } as Response);

    const result = await recategorize('page-1', 'Admin', 'Idea', 'text');
    expect(result.status).toBe('error');
    expect(result.error).toContain('400');
  });
});

// ---------------------------------------------------------------------------
// 3. updateEntry
// ---------------------------------------------------------------------------
describe('updateEntry', () => {
  it('returns data on success', async () => {
    const mockData = { status: 'updated', page_id: 'p1', updates_applied: ['status'] };
    mockFetch.mockResolvedValueOnce({
      ok: true,
      json: async () => mockData,
    } as Response);

    const result = await updateEntry('p1', 'admin', { status: 'Done' });
    expect(result).toEqual(mockData);
  });

  it('returns error with data.error when response is not ok', async () => {
    mockFetch.mockResolvedValueOnce({
      ok: false,
      status: 422,
      json: async () => ({ error: 'Invalid field', details: 'status is not valid' }),
    } as Response);

    const result = await updateEntry('p1', 'admin', { status: 'Invalid' });
    expect(result.status).toBe('error');
    expect(result.error).toBe('status is not valid');
  });

  it('returns error on network failure', async () => {
    mockFetch.mockRejectedValueOnce(new Error('Network down'));

    const result = await updateEntry('p1', 'admin', { status: 'Done' });
    expect(result.status).toBe('error');
    expect(result.error).toBe('Network down');
  });
});

// ---------------------------------------------------------------------------
// 4. fetchEntries
// ---------------------------------------------------------------------------
describe('fetchEntries', () => {
  it('returns items array on success', async () => {
    const items = [
      { id: '1', title: 'Task 1', status: 'Todo' },
      { id: '2', title: 'Task 2', status: 'Done' },
    ];
    mockFetch.mockResolvedValueOnce({
      ok: true,
      json: async () => ({ items }),
    } as Response);

    const result = await fetchEntries('admin', 'Todo');
    expect(result).toEqual(items);
    expect(mockFetch).toHaveBeenCalledWith(
      expect.stringContaining('/api/entries?database=admin&status=Todo'),
      expect.objectContaining({ method: 'GET' }),
    );
  });

  it('returns empty array on error', async () => {
    mockFetch.mockResolvedValueOnce({
      ok: false,
      status: 500,
      json: async () => ({}),
    } as Response);

    const result = await fetchEntries('projects');
    expect(result).toEqual([]);
  });
});

// ---------------------------------------------------------------------------
// 5. markDone
// ---------------------------------------------------------------------------
describe('markDone', () => {
  it('sends "Complete" for projects', async () => {
    mockFetch.mockResolvedValueOnce({
      ok: true,
      json: async () => ({ status: 'updated', page_id: 'p1' }),
    } as Response);

    await markDone('p1', 'projects');
    const body = JSON.parse(mockFetch.mock.calls[0][1]!.body as string);
    expect(body.updates.status).toBe('Complete');
  });

  it('sends "Dormant" for people', async () => {
    mockFetch.mockResolvedValueOnce({
      ok: true,
      json: async () => ({ status: 'updated', page_id: 'p2' }),
    } as Response);

    await markDone('p2', 'people');
    const body = JSON.parse(mockFetch.mock.calls[0][1]!.body as string);
    expect(body.updates.status).toBe('Dormant');
  });

  it('sends "Done" for admin (and any other database)', async () => {
    mockFetch.mockResolvedValueOnce({
      ok: true,
      json: async () => ({ status: 'updated', page_id: 'p3' }),
    } as Response);

    await markDone('p3', 'admin');
    const body = JSON.parse(mockFetch.mock.calls[0][1]!.body as string);
    expect(body.updates.status).toBe('Done');
  });
});

// ---------------------------------------------------------------------------
// 6. snoozeEntry
// ---------------------------------------------------------------------------
describe('snoozeEntry', () => {
  it('uses "next_followup" field for people', async () => {
    mockFetch.mockResolvedValueOnce({
      ok: true,
      json: async () => ({ status: 'updated' }),
    } as Response);

    await snoozeEntry('p1', 'people', new Date(2026, 1, 20)); // Feb 20, 2026
    const body = JSON.parse(mockFetch.mock.calls[0][1]!.body as string);
    expect(body.updates).toHaveProperty('next_followup');
    expect(body.updates.next_followup).toBe('2026-02-20');
  });

  it('uses "due_date" field for non-people databases', async () => {
    mockFetch.mockResolvedValueOnce({
      ok: true,
      json: async () => ({ status: 'updated' }),
    } as Response);

    await snoozeEntry('p2', 'admin', new Date(2026, 2, 15)); // Mar 15, 2026
    const body = JSON.parse(mockFetch.mock.calls[0][1]!.body as string);
    expect(body.updates).toHaveProperty('due_date');
    expect(body.updates.due_date).toBe('2026-03-15');
  });
});

// ---------------------------------------------------------------------------
// 7. searchEntries
// ---------------------------------------------------------------------------
describe('searchEntries', () => {
  it('returns search results on success', async () => {
    const mockResponse = {
      status: 'success',
      query: 'test',
      total: 2,
      results: [{ id: '1', title: 'Result 1' }],
      grouped: { People: 1, Project: 0, Idea: 0, Admin: 1, Reading: 0 },
    };
    mockFetch.mockResolvedValueOnce({
      ok: true,
      json: async () => mockResponse,
    } as Response);

    const result = await searchEntries('test');
    expect(result.status).toBe('success');
    expect(result.total).toBe(2);
    expect(result.results).toHaveLength(1);
  });

  it('returns empty results on error', async () => {
    mockFetch.mockRejectedValueOnce(new Error('Search failed'));

    const result = await searchEntries('broken query');
    expect(result.status).toBe('error');
    expect(result.total).toBe(0);
    expect(result.results).toEqual([]);
    expect(result.grouped).toEqual({ People: 0, Project: 0, Idea: 0, Admin: 0, Reading: 0 });
  });
});

// ---------------------------------------------------------------------------
// 8. askAgent
// ---------------------------------------------------------------------------
describe('askAgent', () => {
  it('returns agent response on success', async () => {
    const mockResponse = {
      status: 'success',
      response: 'Here is your answer',
      session_id: 'sess-1',
      tools_used: ['search'],
    };
    mockFetch.mockResolvedValueOnce({
      ok: true,
      json: async () => mockResponse,
    } as Response);

    const result = await askAgent('What are my tasks?', 'sess-1');
    expect(result.status).toBe('success');
    expect(result.response).toBe('Here is your answer');
  });

  it('returns error response on failure', async () => {
    mockFetch.mockRejectedValueOnce(new Error('Agent unavailable'));

    const result = await askAgent('Hello', 'sess-1');
    expect(result.status).toBe('error');
    expect(result.response).toBe('');
    expect(result.error).toBe('Agent unavailable');
  });
});

// ---------------------------------------------------------------------------
// 9. clearChat
// ---------------------------------------------------------------------------
describe('clearChat', () => {
  it('returns success on successful clear', async () => {
    mockFetch.mockResolvedValueOnce({
      ok: true,
      json: async () => ({ status: 'success', message: 'Chat cleared' }),
    } as Response);

    const result = await clearChat('sess-1');
    expect(result.status).toBe('success');
    expect(result.message).toBe('Chat cleared');
    expect(mockFetch).toHaveBeenCalledWith(
      expect.stringContaining('/api/agent?session_id=sess-1'),
      expect.objectContaining({ method: 'DELETE' }),
    );
  });
});

// ---------------------------------------------------------------------------
// 10. deleteEntry
// ---------------------------------------------------------------------------
describe('deleteEntry', () => {
  it('returns deleted status on success', async () => {
    mockFetch.mockResolvedValueOnce({
      ok: true,
      json: async () => ({ status: 'deleted' }),
    } as Response);

    const result = await deleteEntry('page-to-delete');
    expect(result.status).toBe('deleted');
    expect(mockFetch).toHaveBeenCalledWith('/api/delete', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ page_id: 'page-to-delete' }),
    });
  });

  it('returns error when deletion fails', async () => {
    mockFetch.mockResolvedValueOnce({
      ok: true,
      json: async () => ({ status: 'error', error: 'Page not found' }),
    } as Response);

    const result = await deleteEntry('nonexistent');
    expect(result.status).toBe('error');
    expect(result.error).toBe('Page not found');
  });
});

// ---------------------------------------------------------------------------
// 11. fetchDigest
// ---------------------------------------------------------------------------
describe('fetchDigest', () => {
  it('returns daily digest on success', async () => {
    const mockDigest = {
      status: 'success',
      type: 'daily',
      generatedAt: '2026-02-14T06:30:00Z',
      data: { projects: [], tasks: [{ id: '1', title: 'Todo item' }], followups: [] },
      counts: { projects: 0, tasks: 1, followups: 0 },
      aiSummary: 'You have 1 task today.',
    };
    mockFetch.mockResolvedValueOnce({
      ok: true,
      json: async () => mockDigest,
    } as Response);

    const result = await fetchDigest('daily');
    expect(result.status).toBe('success');
    expect(result.type).toBe('daily');
    expect(result.aiSummary).toBe('You have 1 task today.');
  });

  it('returns weekly error fallback structure on failure', async () => {
    mockFetch.mockRejectedValueOnce(new Error('Timeout'));

    const result = await fetchDigest('weekly');
    expect(result.status).toBe('error');
    expect(result.type).toBe('weekly');
    expect(result).toHaveProperty('data');
    // Verify the weekly error fallback structure
    const weeklyResult = result as {
      type: 'weekly';
      data: { completedTasks: unknown[]; completedProjects: unknown[]; inboxByCategory: Record<string, unknown> };
      counts: { completedTasks: number; completedProjects: number; totalInbox: number };
    };
    expect(weeklyResult.data.completedTasks).toEqual([]);
    expect(weeklyResult.data.completedProjects).toEqual([]);
    expect(weeklyResult.counts.completedTasks).toBe(0);
    expect(weeklyResult.counts.totalInbox).toBe(0);
  });
});

// ---------------------------------------------------------------------------
// 12. isUrl
// ---------------------------------------------------------------------------
describe('isUrl', () => {
  it('returns true for a valid URL', () => {
    expect(isUrl('https://example.com')).toBe(true);
    expect(isUrl('http://sub.domain.org/path')).toBe(true);
  });

  it('returns false for non-URL text', () => {
    expect(isUrl('just some text')).toBe(false);
    expect(isUrl('ftp://not-http.com')).toBe(false);
  });
});

// ---------------------------------------------------------------------------
// 13. extractUrl
// ---------------------------------------------------------------------------
describe('extractUrl', () => {
  it('extracts URL from mixed text', () => {
    const text = 'Check out https://example.com/article for more info';
    expect(extractUrl(text)).toBe('https://example.com/article');
  });

  it('returns null when no URL is present', () => {
    expect(extractUrl('no links here')).toBeNull();
  });
});
