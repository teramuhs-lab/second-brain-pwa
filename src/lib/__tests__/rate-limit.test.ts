import { describe, it, expect } from 'vitest';
import { checkRateLimit } from '../rate-limit';

describe('checkRateLimit', () => {
  it('allows requests within limit', () => {
    const key = 'test-allow-' + Date.now();
    const result = checkRateLimit(key, 5, 60000);
    expect(result.allowed).toBe(true);
    expect(result.remaining).toBe(4);
  });

  it('blocks after exceeding limit', () => {
    const key = 'test-block-' + Date.now();
    for (let i = 0; i < 3; i++) {
      checkRateLimit(key, 3, 60000);
    }
    const result = checkRateLimit(key, 3, 60000);
    expect(result.allowed).toBe(false);
    expect(result.remaining).toBe(0);
  });

  it('tracks remaining count correctly', () => {
    const key = 'test-count-' + Date.now();
    expect(checkRateLimit(key, 5, 60000).remaining).toBe(4);
    expect(checkRateLimit(key, 5, 60000).remaining).toBe(3);
    expect(checkRateLimit(key, 5, 60000).remaining).toBe(2);
  });

  it('uses separate counters per key', () => {
    const key1 = 'test-key1-' + Date.now();
    const key2 = 'test-key2-' + Date.now();
    checkRateLimit(key1, 2, 60000);
    checkRateLimit(key1, 2, 60000);
    // key1 is at limit, key2 should still have room
    expect(checkRateLimit(key1, 2, 60000).allowed).toBe(false);
    expect(checkRateLimit(key2, 2, 60000).allowed).toBe(true);
  });
});
