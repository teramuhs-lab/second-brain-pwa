import { describe, it, expect, vi, beforeEach } from 'vitest';

// ============= Hoisted mock variables =============
// vi.hoisted() runs before vi.mock() factories, so these are available during hoisting.

const {
  mockGenerateEmbedding,
  mockBuildEmbeddingText,
  mockChainRef,
  createChain,
} = vi.hoisted(() => {
  const mockGenerateEmbedding = vi.fn().mockResolvedValue([0.1, 0.2, 0.3]);
  const mockBuildEmbeddingText = vi.fn().mockReturnValue('test embedding text');

  // Chainable DB mock — every method returns the chain itself so any call order works.
  // The chain is thenable (has .then) so `await chain.limit(...)` resolves to _result.
  // Tests override _result or specific terminal methods (returning, limit, offset) as needed.
  function createChain() {
    const chain: Record<string, any> = {};
    // Default resolved value when chain is awaited
    chain._result = [] as any[];
    // Make chain thenable so `await db.select().from()...` works
    chain.then = vi.fn((resolve: any) => resolve(chain._result));
    chain.select = vi.fn().mockReturnValue(chain);
    chain.from = vi.fn().mockReturnValue(chain);
    chain.where = vi.fn().mockReturnValue(chain);
    chain.limit = vi.fn().mockReturnValue(chain);
    chain.insert = vi.fn().mockReturnValue(chain);
    chain.values = vi.fn().mockReturnValue(chain);
    chain.returning = vi.fn().mockResolvedValue([]);
    chain.onConflictDoUpdate = vi.fn().mockReturnValue(chain);
    chain.update = vi.fn().mockReturnValue(chain);
    chain.set = vi.fn().mockReturnValue(chain);
    chain.delete = vi.fn().mockReturnValue(chain);
    chain.orderBy = vi.fn().mockReturnValue(chain);
    chain.offset = vi.fn().mockReturnValue(chain);
    return chain;
  }

  // Shared reference that the db proxy reads from. Tests swap this in beforeEach.
  const mockChainRef: { current: ReturnType<typeof createChain> } = {
    current: createChain(),
  };

  return { mockGenerateEmbedding, mockBuildEmbeddingText, mockChainRef, createChain };
});

// ============= Mocks =============

vi.mock('@/lib/logger', () => ({
  createLogger: vi.fn().mockReturnValue({
    debug: vi.fn(),
    info: vi.fn(),
    warn: vi.fn(),
    error: vi.fn(),
    timed: vi.fn(),
  }),
}));

vi.mock('@/services/db/embeddings', () => ({
  generateEmbedding: mockGenerateEmbedding,
  buildEmbeddingText: mockBuildEmbeddingText,
}));

vi.mock('@/db', () => {
  // Proxy delegates to mockChainRef.current so tests can swap the chain.
  const handler: ProxyHandler<any> = {
    get(_target, prop) {
      const chain = mockChainRef.current;
      if (chain && typeof chain[prop as string] === 'function') {
        return chain[prop as string];
      }
      return chain?.[prop as string];
    },
  };
  return {
    db: new Proxy({}, handler),
  };
});

vi.mock('@/db/schema', () => {
  const col = (name: string) => ({ name, _: { name } });
  return {
    entries: {
      id: col('id'),
      notionId: col('notion_id'),
      category: col('category'),
      title: col('title'),
      status: col('status'),
      priority: col('priority'),
      content: col('content'),
      embedding: col('embedding'),
      dueDate: col('due_date'),
      archived: col('archived_at'),
      createdAt: col('created_at'),
      updatedAt: col('updated_at'),
    },
    inboxLog: {
      id: col('id'),
      rawInput: col('raw_input'),
      category: col('category'),
      confidence: col('confidence'),
      destinationId: col('destination_id'),
      status: col('status'),
      createdAt: col('created_at'),
    },
  };
});

// ============= Import the module under test AFTER mocks are set up =============
import {
  createEntry,
  getEntry,
  getEntryByLegacyId,
  queryEntries,
  countEntries,
  updateEntry,
  archiveEntry,
  searchEntries,
  createInboxLogEntry,
} from '../entries';

// ============= Helpers =============

const MOCK_ENTRY = {
  id: '550e8400-e29b-41d4-a716-446655440000',
  notionId: null,
  category: 'Projects',
  title: 'Build MVP',
  status: 'Active',
  priority: 'High',
  content: { notes: 'Some notes' },
  embedding: [0.1, 0.2, 0.3],
  dueDate: null,
  archived: null,
  createdAt: new Date('2024-01-01'),
  updatedAt: new Date('2024-01-01'),
};

const MOCK_INBOX_LOG = {
  id: '660e8400-e29b-41d4-a716-446655440000',
  rawInput: 'Follow up with Sarah',
  category: 'People',
  confidence: 0.95,
  destinationId: 'abc-123',
  status: 'Processed',
  createdAt: new Date('2024-01-01'),
};

// ============= Tests =============

describe('entries service', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockChainRef.current = createChain();
  });

  // ==================== createEntry ====================
  describe('createEntry', () => {
    it('maps category "Project" to "Projects" in DB', async () => {
      mockChainRef.current.returning = vi.fn().mockResolvedValue([{ ...MOCK_ENTRY, category: 'Projects' }]);

      const result = await createEntry({
        category: 'Project',
        title: 'Build MVP',
      });

      // The values call should have been made with category 'Projects'
      expect(mockChainRef.current.values).toHaveBeenCalledWith(
        expect.objectContaining({ category: 'Projects' }),
      );
      expect(result.category).toBe('Projects');
    });

    it('maps category "Idea" to "Ideas" in DB', async () => {
      mockChainRef.current.returning = vi.fn().mockResolvedValue([{ ...MOCK_ENTRY, category: 'Ideas', title: 'AI startup' }]);

      const result = await createEntry({
        category: 'Idea',
        title: 'AI startup',
      });

      expect(mockChainRef.current.values).toHaveBeenCalledWith(
        expect.objectContaining({ category: 'Ideas' }),
      );
      expect(result.category).toBe('Ideas');
    });

    it('uses DEFAULT_STATUS when no status provided (Admin -> "Todo")', async () => {
      mockChainRef.current.returning = vi.fn().mockResolvedValue([{ ...MOCK_ENTRY, category: 'Admin', status: 'Todo' }]);

      await createEntry({
        category: 'Admin',
        title: 'Pay rent',
      });

      expect(mockChainRef.current.values).toHaveBeenCalledWith(
        expect.objectContaining({ status: 'Todo' }),
      );
    });

    it('uses provided status when given', async () => {
      mockChainRef.current.returning = vi.fn().mockResolvedValue([{ ...MOCK_ENTRY, status: 'Done' }]);

      await createEntry({
        category: 'Admin',
        title: 'Already done task',
        status: 'Done',
      });

      expect(mockChainRef.current.values).toHaveBeenCalledWith(
        expect.objectContaining({ status: 'Done' }),
      );
    });

    it('continues without embedding when generateEmbedding throws', async () => {
      mockGenerateEmbedding.mockRejectedValueOnce(new Error('OpenAI rate limit'));
      mockChainRef.current.returning = vi.fn().mockResolvedValue([{ ...MOCK_ENTRY, embedding: null }]);

      const result = await createEntry({
        category: 'People',
        title: 'John Doe',
      });

      // Should still insert — embedding will be null
      expect(mockChainRef.current.values).toHaveBeenCalledWith(
        expect.objectContaining({ embedding: null }),
      );
      expect(result).toBeDefined();
    });
  });

  // ==================== getEntry ====================
  describe('getEntry', () => {
    it('returns entry when found', async () => {
      mockChainRef.current._result = [MOCK_ENTRY];

      const result = await getEntry(MOCK_ENTRY.id);

      expect(result).toEqual(MOCK_ENTRY);
      expect(mockChainRef.current.select).toHaveBeenCalled();
      expect(mockChainRef.current.from).toHaveBeenCalled();
      expect(mockChainRef.current.where).toHaveBeenCalled();
    });

    it('returns null when not found', async () => {
      mockChainRef.current._result = [];

      const result = await getEntry('non-existent-id');

      expect(result).toBeNull();
    });
  });

  // ==================== updateEntry ====================
  describe('updateEntry', () => {
    it('updates basic fields (title, status, priority)', async () => {
      // The update().set().where().returning() chain
      mockChainRef.current.returning = vi.fn().mockResolvedValue([{
        ...MOCK_ENTRY,
        title: 'Updated Title',
        status: 'Complete',
        priority: 'Low',
      }]);

      const result = await updateEntry(MOCK_ENTRY.id, {
        title: 'Updated Title',
        status: 'Complete',
        priority: 'Low',
      });

      expect(result).toBeDefined();
      expect(result!.title).toBe('Updated Title');
      expect(result!.status).toBe('Complete');
      expect(result!.priority).toBe('Low');
      expect(mockChainRef.current.set).toHaveBeenCalled();
    });

    it('merges content with existing content instead of replacing', async () => {
      // updateEntry calls getEntry internally to fetch existing content.
      // getEntry uses select().from().where().limit() -> thenable chain -> _result
      // updateEntry uses update().set().where().returning() -> returning resolves
      const existingEntry = { ...MOCK_ENTRY, content: { notes: 'old', company: 'Acme' } };
      mockChainRef.current._result = [existingEntry];
      mockChainRef.current.returning = vi.fn().mockResolvedValue([{
        ...existingEntry,
        content: { notes: 'updated', company: 'Acme' },
      }]);

      const result = await updateEntry(MOCK_ENTRY.id, {
        content: { notes: 'updated' },
      });

      // set() should have been called with merged content
      expect(mockChainRef.current.set).toHaveBeenCalledWith(
        expect.objectContaining({
          content: { notes: 'updated', company: 'Acme' },
        }),
      );
      expect(result).toBeDefined();
    });

    it('regenerates embedding when title changes', async () => {
      const updatedEntry = { ...MOCK_ENTRY, title: 'New Title' };
      mockChainRef.current.returning = vi.fn().mockResolvedValue([updatedEntry]);

      await updateEntry(MOCK_ENTRY.id, { title: 'New Title' });

      // Should call buildEmbeddingText with the new title
      expect(mockBuildEmbeddingText).toHaveBeenCalledWith(
        'New Title',
        expect.any(Object),
      );
      // Should call generateEmbedding to create a new embedding
      expect(mockGenerateEmbedding).toHaveBeenCalled();
      // Should call update a second time to set the new embedding
      expect(mockChainRef.current.update).toHaveBeenCalled();
    });

    it('returns null when entry does not exist', async () => {
      mockChainRef.current.returning = vi.fn().mockResolvedValue([]);

      const result = await updateEntry('non-existent-id', { title: 'Nope' });

      expect(result).toBeNull();
    });
  });

  // ==================== archiveEntry ====================
  describe('archiveEntry', () => {
    it('sets archived timestamp (soft delete)', async () => {
      const archivedEntry = { ...MOCK_ENTRY, archived: new Date() };
      mockChainRef.current.returning = vi.fn().mockResolvedValue([archivedEntry]);

      const result = await archiveEntry(MOCK_ENTRY.id);

      expect(result).toBeDefined();
      expect(result!.archived).toBeInstanceOf(Date);
      expect(mockChainRef.current.set).toHaveBeenCalledWith(
        expect.objectContaining({
          archived: expect.any(Date),
        }),
      );
    });

    it('returns null for non-existent entry', async () => {
      mockChainRef.current.returning = vi.fn().mockResolvedValue([]);

      const result = await archiveEntry('non-existent-id');

      expect(result).toBeNull();
    });
  });

  // ==================== searchEntries ====================
  describe('searchEntries', () => {
    it('uses vector search when embedding is generated successfully', async () => {
      mockGenerateEmbedding.mockResolvedValueOnce([0.4, 0.5, 0.6]);
      const searchResult = { ...MOCK_ENTRY, similarity: 0.95 };
      mockChainRef.current._result = [searchResult];

      const results = await searchEntries('build something');

      expect(mockGenerateEmbedding).toHaveBeenCalledWith('build something');
      // vector search path uses select with similarity column
      expect(mockChainRef.current.select).toHaveBeenCalledWith(
        expect.objectContaining({ similarity: expect.anything() }),
      );
      expect(results).toHaveLength(1);
    });

    it('falls back to keyword search when embedding generation fails', async () => {
      mockGenerateEmbedding.mockRejectedValueOnce(new Error('API down'));
      mockChainRef.current._result = [MOCK_ENTRY];

      const results = await searchEntries('build something');

      // Should still return results via keyword fallback
      expect(results).toHaveLength(1);
      // Keyword fallback adds similarity: 0
      expect(results[0]).toHaveProperty('similarity', 0);
      // Keyword path uses plain select() (no custom columns)
      expect(mockChainRef.current.select).toHaveBeenCalled();
    });

    it('applies category filter when provided', async () => {
      mockGenerateEmbedding.mockResolvedValueOnce([0.1, 0.2, 0.3]);
      mockChainRef.current._result = [];

      await searchEntries('test', { category: 'Projects' });

      // where() should have been called (conditions include archived IS NULL + category)
      expect(mockChainRef.current.where).toHaveBeenCalled();
    });
  });

  // ==================== createInboxLogEntry ====================
  describe('createInboxLogEntry', () => {
    it('inserts with all fields', async () => {
      mockChainRef.current.returning = vi.fn().mockResolvedValue([MOCK_INBOX_LOG]);

      const result = await createInboxLogEntry({
        rawInput: 'Follow up with Sarah',
        category: 'People',
        confidence: 0.95,
        destinationId: 'abc-123',
        status: 'Processed',
      });

      expect(mockChainRef.current.insert).toHaveBeenCalled();
      expect(mockChainRef.current.values).toHaveBeenCalledWith(
        expect.objectContaining({
          rawInput: 'Follow up with Sarah',
          category: 'People',
          confidence: 0.95,
          destinationId: 'abc-123',
          status: 'Processed',
        }),
      );
      expect(result).toEqual(MOCK_INBOX_LOG);
    });

    it('defaults status to "Processed" when not provided', async () => {
      mockChainRef.current.returning = vi.fn().mockResolvedValue([{ ...MOCK_INBOX_LOG, status: 'Processed' }]);

      await createInboxLogEntry({
        rawInput: 'Some note',
        category: 'Idea',
        confidence: 0.8,
      });

      expect(mockChainRef.current.values).toHaveBeenCalledWith(
        expect.objectContaining({
          status: 'Processed',
          destinationId: null,
        }),
      );
    });
  });

  // ==================== queryEntries ====================
  describe('queryEntries', () => {
    it('applies category filter', async () => {
      mockChainRef.current._result = [MOCK_ENTRY];

      const results = await queryEntries({ category: 'Projects' });

      expect(mockChainRef.current.where).toHaveBeenCalled();
      expect(results).toHaveLength(1);
    });

    it('excludes archived entries', async () => {
      mockChainRef.current._result = [];

      await queryEntries();

      // where() is always called because archived IS NULL condition is always added
      expect(mockChainRef.current.where).toHaveBeenCalled();
    });
  });

  // ==================== countEntries ====================
  describe('countEntries', () => {
    it('counts with filters', async () => {
      mockChainRef.current._result = [{ total: 5 }];

      const total = await countEntries({ category: 'Projects' });

      expect(total).toBe(5);
      expect(mockChainRef.current.select).toHaveBeenCalled();
      expect(mockChainRef.current.from).toHaveBeenCalled();
    });

    it('excludes archived entries', async () => {
      mockChainRef.current._result = [{ total: 3 }];

      const total = await countEntries();

      // where is always called (archived IS NULL condition always present)
      expect(mockChainRef.current.where).toHaveBeenCalled();
      expect(total).toBe(3);
    });
  });
});
