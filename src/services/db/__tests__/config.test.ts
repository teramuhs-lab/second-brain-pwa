import { describe, it, expect, vi, beforeEach } from 'vitest';
import { config } from '@/db/schema';

// ── Mock chain builders ──────────────────────────────────────────────
const limitMock = vi.fn();
const whereMock = vi.fn().mockReturnValue({ limit: limitMock });
const fromMock = vi.fn().mockReturnValue({ where: whereMock });
const selectMock = vi.fn().mockReturnValue({ from: fromMock });

const onConflictDoUpdateMock = vi.fn();
const valuesMock = vi.fn().mockReturnValue({ onConflictDoUpdate: onConflictDoUpdateMock });
const insertMock = vi.fn().mockReturnValue({ values: valuesMock });

const deleteWhereMock = vi.fn();
const deleteMock = vi.fn().mockReturnValue({ where: deleteWhereMock });

vi.mock('@/db', () => ({
  db: {
    select: (...args: unknown[]) => selectMock(...args),
    insert: (...args: unknown[]) => insertMock(...args),
    delete: (...args: unknown[]) => deleteMock(...args),
  },
}));

// Re-import after mock is registered
import { findConfigEntry, upsertConfig, deleteConfig } from '../config';

describe('config CRUD operations', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    // Reset default return values that may have been overridden
    whereMock.mockReturnValue({ limit: limitMock });
    fromMock.mockReturnValue({ where: whereMock });
    selectMock.mockReturnValue({ from: fromMock });
    valuesMock.mockReturnValue({ onConflictDoUpdate: onConflictDoUpdateMock });
    insertMock.mockReturnValue({ values: valuesMock });
    deleteMock.mockReturnValue({ where: deleteWhereMock });
  });

  // ── 1. findConfigEntry returns entry when found ──────────────────
  it('returns the entry when a matching config key is found', async () => {
    const fakeEntry = { id: 'uuid-123', key: 'google_tokens', value: { data: 'tok' } };
    limitMock.mockResolvedValue([fakeEntry]);

    const result = await findConfigEntry('google_tokens');

    expect(selectMock).toHaveBeenCalled();
    expect(fromMock).toHaveBeenCalledWith(config);
    expect(limitMock).toHaveBeenCalledWith(1);
    expect(result).toEqual({ id: 'uuid-123', value: { data: 'tok' } });
  });

  // ── 2. findConfigEntry returns null when not found ───────────────
  it('returns null when no matching config key exists', async () => {
    limitMock.mockResolvedValue([]);

    const result = await findConfigEntry('nonexistent_key');

    expect(selectMock).toHaveBeenCalled();
    expect(fromMock).toHaveBeenCalledWith(config);
    expect(result).toBeNull();
  });

  // ── 3. upsertConfig wraps value in {data: ...} ──────────────────
  it('wraps the value in { data: ... } before inserting', async () => {
    onConflictDoUpdateMock.mockResolvedValue(undefined);

    await upsertConfig('theme', 'dark');

    expect(insertMock).toHaveBeenCalledWith(config);
    expect(valuesMock).toHaveBeenCalledWith({
      key: 'theme',
      value: { data: 'dark' },
    });
  });

  // ── 4. upsertConfig calls onConflictDoUpdate with config.key ────
  it('calls onConflictDoUpdate with config.key as the conflict target', async () => {
    onConflictDoUpdateMock.mockResolvedValue(undefined);

    await upsertConfig('theme', 'dark');

    expect(onConflictDoUpdateMock).toHaveBeenCalledWith({
      target: config.key,
      set: { value: { data: 'dark' } },
    });
  });

  // ── 5. deleteConfig calls delete with the correct key filter ────
  it('calls delete with the correct key filter', async () => {
    deleteWhereMock.mockResolvedValue(undefined);

    await deleteConfig('old_key');

    expect(deleteMock).toHaveBeenCalledWith(config);
    expect(deleteWhereMock).toHaveBeenCalled();
  });
});
