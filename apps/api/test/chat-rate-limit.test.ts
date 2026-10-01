import { describe, expect, it } from 'vitest';
import { SlidingWindowLimiter } from '../src/modules/chat/rateLimit';

describe('SlidingWindowLimiter', () => {
  it('allows max hits per window per key, then frees up as hits age out', () => {
    let now = 0;
    const limiter = new SlidingWindowLimiter(3, 10_000, () => now);
    expect([1, 2, 3].map(() => limiter.hit('a'))).toEqual([true, true, true]);
    expect(limiter.hit('a')).toBe(false);
    expect(limiter.hit('b')).toBe(true);
    expect(limiter.retryAfter('a')).toBe(10_000);

    now = 9_999;
    expect(limiter.hit('a')).toBe(false);
    now = 10_000;
    expect(limiter.retryAfter('a')).toBe(0);
    expect([1, 2, 3, 4].map(() => limiter.hit('a'))).toEqual([true, true, true, false]);
  });

  it('rejected attempts do not extend the window', () => {
    let now = 0;
    const limiter = new SlidingWindowLimiter(1, 1000, () => now);
    expect(limiter.hit('u')).toBe(true);
    now = 500;
    expect(limiter.hit('u')).toBe(false);
    now = 1000;
    expect(limiter.hit('u')).toBe(true);
  });
});
