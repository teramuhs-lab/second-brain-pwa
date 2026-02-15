import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { formatRelativeDate } from '../date';

describe('formatRelativeDate', () => {
  const FIXED_NOW = new Date('2025-06-15T12:00:00Z');

  beforeEach(() => {
    vi.useFakeTimers();
    vi.setSystemTime(FIXED_NOW);
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  it('returns empty string for undefined input', () => {
    expect(formatRelativeDate(undefined)).toBe('');
  });

  it('returns empty string for empty string', () => {
    expect(formatRelativeDate('')).toBe('');
  });

  it('returns "Just now" for a date seconds ago', () => {
    const thirtySecondsAgo = new Date(FIXED_NOW.getTime() - 30 * 1000).toISOString();
    expect(formatRelativeDate(thirtySecondsAgo)).toBe('Just now');
  });

  it('returns "Xh ago" for dates within 24 hours', () => {
    const fiveHoursAgo = new Date(FIXED_NOW.getTime() - 5 * 60 * 60 * 1000).toISOString();
    expect(formatRelativeDate(fiveHoursAgo)).toBe('5h ago');
  });

  it('returns "Yesterday" for exactly 1 day ago', () => {
    const oneDayAgo = new Date(FIXED_NOW.getTime() - 24 * 60 * 60 * 1000).toISOString();
    expect(formatRelativeDate(oneDayAgo)).toBe('Yesterday');
  });

  it('returns "Xd ago" for 2-6 days ago', () => {
    const threeDaysAgo = new Date(FIXED_NOW.getTime() - 3 * 24 * 60 * 60 * 1000).toISOString();
    expect(formatRelativeDate(threeDaysAgo)).toBe('3d ago');
  });

  it('returns "Xw ago" for 7-29 days ago', () => {
    const fourteenDaysAgo = new Date(FIXED_NOW.getTime() - 14 * 24 * 60 * 60 * 1000).toISOString();
    expect(formatRelativeDate(fourteenDaysAgo)).toBe('2w ago');
  });

  it('returns formatted date for 30+ days ago', () => {
    const sixtyDaysAgo = new Date(FIXED_NOW.getTime() - 60 * 24 * 60 * 60 * 1000).toISOString();
    const result = formatRelativeDate(sixtyDaysAgo);
    // 60 days before June 15 = April 16
    expect(result).toBe('Apr 16');
  });
});
