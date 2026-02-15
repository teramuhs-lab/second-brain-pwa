import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';

vi.mock('@/services/db/config', () => ({
  findConfigEntry: vi.fn(),
  upsertConfig: vi.fn(),
  deleteConfig: vi.fn(),
}));

import { getCached, setCache, clearCache } from '../cache';
import { findConfigEntry, upsertConfig, deleteConfig } from '@/services/db/config';

const mockFindConfigEntry = findConfigEntry as ReturnType<typeof vi.fn>;
const mockUpsertConfig = upsertConfig as ReturnType<typeof vi.fn>;
const mockDeleteConfig = deleteConfig as ReturnType<typeof vi.fn>;

beforeEach(() => {
  vi.useFakeTimers();
  vi.setSystemTime(new Date('2025-01-15T12:00:00Z'));
  vi.clearAllMocks();
  mockDeleteConfig.mockResolvedValue(undefined);
  mockUpsertConfig.mockResolvedValue(undefined);
});

afterEach(() => {
  vi.useRealTimers();
});

describe('getCached', () => {
  it('returns cached data when not expired', async () => {
    const futureExpiry = Date.now() + 60_000;
    mockFindConfigEntry.mockResolvedValue({
      value: { data: { data: 'hello', expiresAt: futureExpiry } },
    });

    const result = await getCached<string>('my-key');

    expect(result).toBe('hello');
    expect(mockFindConfigEntry).toHaveBeenCalledWith('cache:my-key');
  });

  it('returns null when entry not found', async () => {
    mockFindConfigEntry.mockResolvedValue(null);

    const result = await getCached('missing-key');

    expect(result).toBeNull();
  });

  it('returns null when entry has no value', async () => {
    mockFindConfigEntry.mockResolvedValue({ value: null });

    const result = await getCached('empty-key');

    expect(result).toBeNull();
  });

  it('returns null and triggers cleanup when expired', async () => {
    const pastExpiry = Date.now() - 1000;
    mockFindConfigEntry.mockResolvedValue({
      value: { data: { data: 'stale', expiresAt: pastExpiry } },
    });

    const result = await getCached('expired-key');

    expect(result).toBeNull();
    expect(mockDeleteConfig).toHaveBeenCalledWith('cache:expired-key');
  });

  it('auto-prefixes "cache:" to key, does not double-prefix', async () => {
    const futureExpiry = Date.now() + 60_000;
    mockFindConfigEntry.mockResolvedValue({
      value: { data: { data: 42, expiresAt: futureExpiry } },
    });

    // Call with already-prefixed key
    await getCached('cache:already-prefixed');
    expect(mockFindConfigEntry).toHaveBeenCalledWith('cache:already-prefixed');

    mockFindConfigEntry.mockClear();

    // Call with unprefixed key
    await getCached('no-prefix');
    expect(mockFindConfigEntry).toHaveBeenCalledWith('cache:no-prefix');
  });
});

describe('setCache', () => {
  it('stores value with correct expiration timestamp', async () => {
    const ttl = 30_000;
    const expectedExpiry = Date.now() + ttl;

    await setCache('my-key', { foo: 'bar' }, ttl);

    expect(mockUpsertConfig).toHaveBeenCalledWith('cache:my-key', {
      data: { foo: 'bar' },
      expiresAt: expectedExpiry,
    });
  });

  it('auto-prefixes "cache:" to key', async () => {
    await setCache('unprefixed', 'value', 5000);

    expect(mockUpsertConfig).toHaveBeenCalledWith(
      'cache:unprefixed',
      expect.objectContaining({ data: 'value' }),
    );
  });

  it('does not double-prefix keys that already start with "cache:"', async () => {
    await setCache('cache:already', 'value', 5000);

    expect(mockUpsertConfig).toHaveBeenCalledWith(
      'cache:already',
      expect.objectContaining({ data: 'value' }),
    );
  });
});

describe('clearCache', () => {
  it('deletes the correct cache key', async () => {
    await clearCache('my-key');

    expect(mockDeleteConfig).toHaveBeenCalledWith('cache:my-key');
  });

  it('auto-prefixes "cache:" to key', async () => {
    await clearCache('unprefixed');

    expect(mockDeleteConfig).toHaveBeenCalledWith('cache:unprefixed');
  });

  it('does not double-prefix keys that already start with "cache:"', async () => {
    await clearCache('cache:already');

    expect(mockDeleteConfig).toHaveBeenCalledWith('cache:already');
  });
});
