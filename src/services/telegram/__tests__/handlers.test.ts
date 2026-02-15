import { describe, it, expect, vi, beforeEach } from 'vitest';

// ============= Mocks =============

const mockSendMessage = vi.fn().mockResolvedValue({ ok: true });
const mockSendMarkdown = vi.fn().mockResolvedValue({ ok: true });
const mockAnswerCallbackQuery = vi.fn().mockResolvedValue({ ok: true });
const mockAnswerInlineQuery = vi.fn().mockResolvedValue({ ok: true });
const mockGetFile = vi.fn().mockResolvedValue({ ok: true, result: { file_path: 'voice/test.ogg' } });
const mockGetFileDownloadUrl = vi.fn().mockReturnValue('https://api.telegram.org/file/bot123/voice/test.ogg');

vi.mock('../client', () => ({
  sendMessage: (...args: unknown[]) => mockSendMessage(...args),
  sendMarkdown: (...args: unknown[]) => mockSendMarkdown(...args),
  answerCallbackQuery: (...args: unknown[]) => mockAnswerCallbackQuery(...args),
  answerInlineQuery: (...args: unknown[]) => mockAnswerInlineQuery(...args),
  getFile: (...args: unknown[]) => mockGetFile(...args),
  getFileDownloadUrl: (...args: unknown[]) => mockGetFileDownloadUrl(...args),
}));

const mockCreateEntry = vi.fn().mockResolvedValue({ id: 'new-id', category: 'Admin', title: 'Test' });
const mockCreateInboxLogEntry = vi.fn().mockResolvedValue({});
const mockUpdateEntry = vi.fn().mockResolvedValue({ id: 'updated-id' });
const mockCountEntries = vi.fn().mockResolvedValue(5);
const mockSearchEntries = vi.fn().mockResolvedValue([]);
const mockGetEntry = vi.fn().mockResolvedValue(null);
const mockArchiveEntry = vi.fn().mockResolvedValue(null);

vi.mock('@/services/db/entries', () => ({
  createEntry: (...args: unknown[]) => mockCreateEntry(...args),
  createInboxLogEntry: (...args: unknown[]) => mockCreateInboxLogEntry(...args),
  updateEntry: (...args: unknown[]) => mockUpdateEntry(...args),
  countEntries: (...args: unknown[]) => mockCountEntries(...args),
  searchEntries: (...args: unknown[]) => mockSearchEntries(...args),
  getEntry: (...args: unknown[]) => mockGetEntry(...args),
  archiveEntry: (...args: unknown[]) => mockArchiveEntry(...args),
}));

vi.mock('@/services/db/relations', () => ({
  suggestRelations: vi.fn().mockResolvedValue([]),
  addRelation: vi.fn().mockResolvedValue({}),
}));

const mockDbDelete = vi.fn().mockReturnValue({ where: vi.fn().mockResolvedValue(undefined) });
vi.mock('@/db', () => ({
  db: { delete: (...args: unknown[]) => mockDbDelete(...args) },
}));

vi.mock('@/db/schema', () => ({
  chatSessions: { sessionId: 'session_id' },
}));

vi.mock('drizzle-orm', () => ({
  eq: vi.fn(),
}));

const mockChatCreate = vi.fn();
const mockTranscriptionCreate = vi.fn().mockResolvedValue({ text: 'transcribed text' });
vi.mock('openai', () => {
  return {
    default: class MockOpenAI {
      chat = { completions: { create: mockChatCreate } };
      audio = { transcriptions: { create: mockTranscriptionCreate } };
    },
  };
});

vi.mock('@/lib/logger', () => ({
  createLogger: () => ({
    debug: vi.fn(), info: vi.fn(), warn: vi.fn(), error: vi.fn(),
  }),
}));

// Mock global fetch for handlers that call internal API routes
vi.stubGlobal('fetch', vi.fn());
const mockFetch = vi.mocked(fetch);

import { handleUpdate, type TelegramUpdate } from '../handlers';

// ============= Helpers =============

function textUpdate(text: string, chatId = 12345): TelegramUpdate {
  return {
    update_id: 1,
    message: {
      message_id: 1,
      chat: { id: chatId, type: 'private' },
      date: Date.now(),
      text,
    },
  };
}

function callbackUpdate(data: string, chatId = 12345): TelegramUpdate {
  return {
    update_id: 1,
    callback_query: {
      id: 'cb-1',
      from: { id: chatId },
      data,
      message: {
        message_id: 1,
        chat: { id: chatId, type: 'private' },
        date: Date.now(),
      },
    },
  };
}

function inlineUpdate(query: string, userId = 12345): TelegramUpdate {
  return {
    update_id: 1,
    inline_query: {
      id: 'iq-1',
      from: { id: userId, first_name: 'Test' },
      query,
      offset: '',
    },
  };
}

// ============= Tests =============

describe('Telegram handlers', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockFetch.mockReset();
    // Reset default mock returns
    mockCreateEntry.mockResolvedValue({ id: 'new-id', category: 'Admin', title: 'Test' });
    mockSearchEntries.mockResolvedValue([]);
    mockGetEntry.mockResolvedValue(null);
    mockCountEntries.mockResolvedValue(5);
  });

  // ============= Routing =============

  describe('routing', () => {
    it('ignores updates with no message or callback', async () => {
      await handleUpdate({ update_id: 1 });
      expect(mockSendMessage).not.toHaveBeenCalled();
    });

    it('ignores messages with no text, voice, or photo', async () => {
      await handleUpdate({
        update_id: 1,
        message: { message_id: 1, chat: { id: 12345, type: 'private' }, date: Date.now() },
      });
      expect(mockSendMessage).not.toHaveBeenCalled();
    });

    it('routes callback queries to callback handler', async () => {
      mockGetEntry.mockResolvedValue({ id: 'e1', category: 'Admin', title: 'Task', status: 'Todo' });
      await handleUpdate(callbackUpdate('done:e1'));
      expect(mockAnswerCallbackQuery).toHaveBeenCalledWith('cb-1', 'Marking done...');
    });

    it('routes inline queries to inline handler', async () => {
      await handleUpdate(inlineUpdate('test'));
      expect(mockAnswerInlineQuery).toHaveBeenCalled();
    });
  });

  // ============= Commands =============

  describe('/help', () => {
    it('shows grouped command list', async () => {
      await handleUpdate(textUpdate('/help'));
      expect(mockSendMessage).toHaveBeenCalledWith(
        12345,
        expect.stringContaining('Second Brain Bot'),
        expect.objectContaining({ parse_mode: 'Markdown' }),
      );
    });

    it('responds to /start as alias for help', async () => {
      await handleUpdate(textUpdate('/start'));
      expect(mockSendMessage).toHaveBeenCalledWith(
        12345,
        expect.stringContaining('Second Brain Bot'),
        expect.any(Object),
      );
    });
  });

  describe('/task', () => {
    it('rejects short text', async () => {
      await handleUpdate(textUpdate('/task ab'));
      expect(mockSendMessage).toHaveBeenCalledWith(12345, expect.stringContaining('Usage: /task'));
    });

    it('creates an Admin entry on valid input', async () => {
      await handleUpdate(textUpdate('/task Buy groceries'));
      expect(mockCreateEntry).toHaveBeenCalledWith(expect.objectContaining({
        category: 'Admin',
        title: 'Buy groceries',
      }));
      expect(mockSendMessage).toHaveBeenCalledWith(
        12345,
        expect.stringContaining('Task saved'),
        expect.any(Object),
      );
    });
  });

  describe('/idea', () => {
    it('creates an Idea entry on valid input', async () => {
      await handleUpdate(textUpdate('/idea Build a spaceship'));
      expect(mockCreateEntry).toHaveBeenCalledWith(expect.objectContaining({
        category: 'Idea',
        title: 'Build a spaceship',
      }));
      expect(mockSendMessage).toHaveBeenCalledWith(
        12345,
        expect.stringContaining('Idea saved'),
        expect.any(Object),
      );
    });
  });

  describe('/done', () => {
    it('shows usage when no query provided', async () => {
      await handleUpdate(textUpdate('/done'));
      expect(mockSendMessage).toHaveBeenCalledWith(12345, expect.stringContaining('Usage: /done'));
    });

    it('reports no items when search returns empty', async () => {
      mockSearchEntries.mockResolvedValue([]);
      await handleUpdate(textUpdate('/done groceries'));
      expect(mockSendMessage).toHaveBeenCalledWith(12345, expect.stringContaining('No active items'));
    });

    it('shows action buttons when items are found', async () => {
      mockSearchEntries.mockResolvedValue([
        { id: 'e1', category: 'Admin', title: 'Buy groceries', status: 'Todo', similarity: 0.9 },
      ]);
      await handleUpdate(textUpdate('/done groceries'));
      expect(mockSendMessage).toHaveBeenCalledWith(
        12345,
        expect.stringContaining('Found 1 item'),
        expect.objectContaining({
          reply_markup: expect.objectContaining({
            inline_keyboard: expect.any(Array),
          }),
        }),
      );
    });
  });

  describe('/remind', () => {
    it('shows usage when no text', async () => {
      await handleUpdate(textUpdate('/remind'));
      expect(mockSendMessage).toHaveBeenCalledWith(12345, expect.stringContaining('Usage: /remind'));
    });

    it('creates entry with tomorrow date', async () => {
      await handleUpdate(textUpdate('/remind tomorrow Call dentist'));
      expect(mockCreateEntry).toHaveBeenCalledWith(expect.objectContaining({
        category: 'Admin',
        title: 'Call dentist',
        dueDate: expect.stringMatching(/^\d{4}-\d{2}-\d{2}$/),
      }));
      expect(mockSendMessage).toHaveBeenCalledWith(
        12345,
        expect.stringContaining('Reminder set'),
        expect.any(Object),
      );
    });

    it('rejects unparseable date', async () => {
      await handleUpdate(textUpdate('/remind blarg'));
      expect(mockSendMessage).toHaveBeenCalledWith(12345, expect.stringContaining('Could not parse date'));
    });

    it('parses ISO date format', async () => {
      await handleUpdate(textUpdate('/remind 2026-06-15 Renew passport'));
      expect(mockCreateEntry).toHaveBeenCalledWith(expect.objectContaining({
        title: 'Renew passport',
        dueDate: '2026-06-15',
      }));
    });
  });

  describe('/stats', () => {
    it('shows category counts', async () => {
      mockCountEntries.mockResolvedValue(10);
      await handleUpdate(textUpdate('/stats'));
      expect(mockCountEntries).toHaveBeenCalledTimes(7); // 5 categories + 2 statuses
      expect(mockSendMessage).toHaveBeenCalledWith(
        12345,
        expect.stringContaining('Second Brain Stats'),
        expect.any(Object),
      );
    });
  });

  describe('/search', () => {
    it('shows usage when no query', async () => {
      await handleUpdate(textUpdate('/search'));
      expect(mockSendMessage).toHaveBeenCalledWith(12345, expect.stringContaining('Usage: /search'));
    });

    it('shows results with category badges', async () => {
      mockSearchEntries.mockResolvedValue([
        { id: 'e1', category: 'Projects', title: 'My Project', status: 'Active', similarity: 0.9 },
        { id: 'e2', category: 'Ideas', title: 'My Idea', status: 'Spark', similarity: 0.8 },
      ]);
      await handleUpdate(textUpdate('/search project'));
      expect(mockSendMessage).toHaveBeenCalledWith(
        12345,
        expect.stringContaining('Results for "project"'),
        expect.any(Object),
      );
    });
  });

  describe('/clear', () => {
    it('deletes chat session and confirms', async () => {
      await handleUpdate(textUpdate('/clear'));
      expect(mockDbDelete).toHaveBeenCalled();
      expect(mockSendMessage).toHaveBeenCalledWith(12345, '🗑️ Conversation cleared.');
    });
  });

  describe('/snooze', () => {
    it('shows usage when no query', async () => {
      await handleUpdate(textUpdate('/snooze'));
      expect(mockSendMessage).toHaveBeenCalledWith(12345, expect.stringContaining('Usage: /snooze'));
    });

    it('shows items with snooze buttons', async () => {
      mockSearchEntries.mockResolvedValue([
        { id: 'e1', category: 'Admin', title: 'Dentist', status: 'Todo', dueDate: new Date(), similarity: 0.9 },
      ]);
      await handleUpdate(textUpdate('/snooze dentist'));
      expect(mockSendMessage).toHaveBeenCalledWith(
        12345,
        expect.stringContaining('Select item to snooze'),
        expect.objectContaining({
          reply_markup: expect.objectContaining({
            inline_keyboard: expect.arrayContaining([
              expect.arrayContaining([
                expect.objectContaining({ callback_data: 'snzp:e1' }),
              ]),
            ]),
          }),
        }),
      );
    });
  });

  describe('/edit', () => {
    it('shows usage when no query', async () => {
      await handleUpdate(textUpdate('/edit'));
      expect(mockSendMessage).toHaveBeenCalledWith(12345, expect.stringContaining('Usage: /edit'));
    });
  });

  describe('/capture (AI classification)', () => {
    it('classifies text and creates entry with confidence bar', async () => {
      mockChatCreate.mockResolvedValue({
        choices: [{
          message: {
            content: JSON.stringify({
              category: 'Admin',
              confidence: 0.95,
              extracted_data: { task: 'Buy groceries' },
              reasoning: 'Task',
            }),
          },
        }],
      });

      await handleUpdate(textUpdate('/capture Buy groceries tomorrow'));

      expect(mockCreateEntry).toHaveBeenCalled();
      // Check for confidence bar in response (the capture confirmation message)
      const captureCall = mockSendMessage.mock.calls.find(
        (call: unknown[]) => typeof call[1] === 'string' && (call[1] as string).includes('Captured')
      );
      expect(captureCall).toBeTruthy();
    });
  });

  // ============= Callbacks =============

  describe('callback: done', () => {
    it('marks admin entry as Done', async () => {
      mockGetEntry.mockResolvedValue({ id: 'e1', category: 'Admin', title: 'Buy milk', status: 'Todo' });
      await handleUpdate(callbackUpdate('done:e1'));
      expect(mockUpdateEntry).toHaveBeenCalledWith('e1', { status: 'Done' });
      expect(mockSendMessage).toHaveBeenCalledWith(12345, expect.stringContaining('Done!'), expect.any(Object));
    });

    it('marks project entry as Complete', async () => {
      mockGetEntry.mockResolvedValue({ id: 'e2', category: 'Projects', title: 'Launch app', status: 'Active' });
      await handleUpdate(callbackUpdate('done:e2'));
      expect(mockUpdateEntry).toHaveBeenCalledWith('e2', { status: 'Complete' });
    });

    it('handles missing entry gracefully', async () => {
      mockGetEntry.mockResolvedValue(null);
      await handleUpdate(callbackUpdate('done:nonexistent'));
      expect(mockSendMessage).toHaveBeenCalledWith(12345, '⚠️ Entry not found.');
    });
  });

  describe('callback: snooze', () => {
    it('shows duration options on snzp', async () => {
      await handleUpdate(callbackUpdate('snzp:e1'));
      expect(mockSendMessage).toHaveBeenCalledWith(
        12345,
        expect.stringContaining('Snooze for how long'),
        expect.objectContaining({
          reply_markup: expect.objectContaining({
            inline_keyboard: expect.arrayContaining([
              expect.arrayContaining([
                expect.objectContaining({ text: 'Tomorrow' }),
              ]),
            ]),
          }),
        }),
      );
    });

    it('applies snooze with correct date', async () => {
      await handleUpdate(callbackUpdate('snz:e1:7'));
      expect(mockUpdateEntry).toHaveBeenCalledWith('e1', {
        dueDate: expect.stringMatching(/^\d{4}-\d{2}-\d{2}$/),
      });
      expect(mockSendMessage).toHaveBeenCalledWith(12345, expect.stringContaining('Snoozed'), expect.any(Object));
    });
  });

  describe('callback: edit', () => {
    it('shows status options on edtp for Admin', async () => {
      mockGetEntry.mockResolvedValue({ id: 'e1', category: 'Admin', title: 'Task', status: 'Todo' });
      await handleUpdate(callbackUpdate('edtp:e1'));
      expect(mockSendMessage).toHaveBeenCalledWith(
        12345,
        expect.stringContaining('Task'),
        expect.objectContaining({
          reply_markup: expect.objectContaining({
            inline_keyboard: expect.arrayContaining([
              expect.arrayContaining([
                expect.objectContaining({ text: 'Todo' }),
                expect.objectContaining({ text: 'Done' }),
              ]),
            ]),
          }),
        }),
      );
    });

    it('applies status change on est', async () => {
      await handleUpdate(callbackUpdate('est:e1:Active'));
      expect(mockUpdateEntry).toHaveBeenCalledWith('e1', { status: 'Active' });
      expect(mockSendMessage).toHaveBeenCalledWith(
        12345,
        expect.stringContaining('Status → *Active*'),
        expect.any(Object),
      );
    });
  });

  describe('callback: recategorize', () => {
    it('archives old entry and creates new one', async () => {
      mockGetEntry.mockResolvedValue({ id: 'e1', category: 'Admin', title: 'Test', content: {} });
      await handleUpdate(callbackUpdate('recat:e1:Idea'));
      expect(mockArchiveEntry).toHaveBeenCalledWith('e1');
      expect(mockCreateEntry).toHaveBeenCalledWith(expect.objectContaining({ category: 'Idea' }));
      expect(mockSendMessage).toHaveBeenCalledWith(12345, expect.stringContaining('Moved → Idea'), expect.any(Object));
    });
  });

  // ============= Inline Query =============

  describe('inline query', () => {
    it('returns empty for short queries', async () => {
      await handleUpdate(inlineUpdate('a'));
      expect(mockAnswerInlineQuery).toHaveBeenCalledWith('iq-1', [], { cache_time: 5 });
    });

    it('returns search results as articles', async () => {
      mockSearchEntries.mockResolvedValue([
        { id: 'e1', category: 'Projects', title: 'My Project', status: 'Active', similarity: 0.9 },
      ]);
      await handleUpdate(inlineUpdate('project'));
      expect(mockAnswerInlineQuery).toHaveBeenCalledWith(
        'iq-1',
        [expect.objectContaining({
          type: 'article',
          id: 'e1',
          title: expect.stringContaining('My Project'),
        })],
        { cache_time: 10 },
      );
    });
  });

  // ============= Plain text (default capture) =============

  describe('plain text', () => {
    it('routes plain text to AI capture', async () => {
      mockChatCreate.mockResolvedValue({
        choices: [{
          message: {
            content: JSON.stringify({
              category: 'Idea',
              confidence: 0.8,
              extracted_data: { title: 'A thought' },
              reasoning: 'Idea',
            }),
          },
        }],
      });

      await handleUpdate(textUpdate('I had an interesting thought today'));
      // First call is "Classifying..." status, second is the result
      expect(mockSendMessage).toHaveBeenCalledWith(12345, '🧠 Classifying...');
      expect(mockCreateEntry).toHaveBeenCalled();
    });
  });
});
