import { describe, expect, it } from 'vitest';
import { chatHistoryQuerySchema, chatSendSchema, splitLinks } from '../src';

describe('chat schemas', () => {
  it('trims bodies and enforces 1 to 2000 characters', () => {
    expect(chatSendSchema.parse({ teamId: 't', body: '  hi  ' }).body).toBe('hi');
    expect(chatSendSchema.safeParse({ teamId: 't', body: '   ' }).success).toBe(false);
    expect(chatSendSchema.safeParse({ teamId: 't', body: 'x'.repeat(2000) }).success).toBe(true);
    expect(chatSendSchema.safeParse({ teamId: 't', body: 'x'.repeat(2001) }).success).toBe(false);
  });

  it('defaults history limit to 50 and rejects bad cursors', () => {
    expect(chatHistoryQuerySchema.parse({})).toEqual({ limit: 50 });
    expect(chatHistoryQuerySchema.parse({ before: '2026-01-01T00:00:00.000Z', limit: '10' }).limit).toBe(10);
    expect(chatHistoryQuerySchema.safeParse({ before: 'yesterday' }).success).toBe(false);
    expect(chatHistoryQuerySchema.safeParse({ limit: '500' }).success).toBe(false);
  });
});

describe('splitLinks', () => {
  it('links http(s) and www URLs and leaves trailing punctuation as text', () => {
    expect(splitLinks('see https://github.com/x/y, then www.example.com.')).toEqual([
      { type: 'text', text: 'see ' },
      { type: 'link', text: 'https://github.com/x/y', href: 'https://github.com/x/y' },
      { type: 'text', text: ', then ' },
      { type: 'link', text: 'www.example.com', href: 'https://www.example.com' },
      { type: 'text', text: '.' },
    ]);
  });

  it('keeps balanced parentheses and drops unbalanced ones', () => {
    expect(splitLinks('(https://en.wikipedia.org/wiki/Foo_(bar))')).toEqual([
      { type: 'text', text: '(' },
      { type: 'link', text: 'https://en.wikipedia.org/wiki/Foo_(bar)', href: 'https://en.wikipedia.org/wiki/Foo_(bar)' },
      { type: 'text', text: ')' },
    ]);
  });

  it('never links other schemes or markup', () => {
    for (const s of ['javascript:alert(1)', '<a href="x">hi</a>', 'data:text/html,hi', 'http://localhost']) {
      expect(splitLinks(s).every((p) => p.type === 'text')).toBe(true);
    }
    expect(splitLinks('')).toEqual([]);
  });
});
