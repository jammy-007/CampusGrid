import { describe, expect, it } from 'vitest';
import { cn } from '../src/lib/cn';
import { formatDateTime, toLocalInput } from '../src/lib/format';

describe('cn and format helpers', () => {
  it('joins truthy class names and skips falsy values', () => {
    expect(cn('px-4', false, null, undefined, 'py-2', 'text-white')).toBe('px-4 py-2 text-white');
  });

  it('formats dates for display and datetime-local inputs', () => {
    const formatted = formatDateTime('2026-11-25T04:30:00.000Z');
    expect(formatted).toContain('2026');
    expect(toLocalInput(new Date(2026, 10, 5, 9, 7))).toBe('2026-11-05T09:07');
  });
});
