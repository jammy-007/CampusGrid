import { describe, expect, it } from 'vitest';
import type { ChatMessageDTO } from '@campusgrid/shared';
import { dayKey, dayLabel, mergeMessages, newClientId, updateLocal, type ChatItem } from '../src/features/chat/messages';

const makeMsg = (overrides: Partial<ChatMessageDTO> = {}): ChatMessageDTO => ({
  id: 'm1',
  roomId: 'room_1',
  senderId: 'u1',
  senderName: 'Alice',
  body: 'Hello team',
  createdAt: '2026-11-22T10:00:00.000Z',
  ...overrides,
});

describe('chat message helpers', () => {
  it('merges incoming messages, dedupes by id, replaces optimistic copy, and keeps pending at bottom', () => {
    const optimisticAck: ChatItem = {
      ...makeMsg({ id: 'local:c1', clientId: 'c1', body: 'Sending...', createdAt: '2026-11-22T10:01:00.000Z' }),
      status: 'sending',
    };
    const stillPending: ChatItem = {
      ...makeMsg({ id: 'local:c2', clientId: 'c2', body: 'Still sending', createdAt: '2026-11-22T10:02:00.000Z' }),
      status: 'sending',
    };
    const existing: ChatItem[] = [makeMsg({ id: 'm1' }), optimisticAck, stillPending];

    const incoming: ChatMessageDTO[] = [
      makeMsg({ id: 'm1' }),
      makeMsg({ id: 'm2', clientId: 'c1', body: 'Sending...', createdAt: '2026-11-22T10:01:05.000Z' }),
    ];

    const merged = mergeMessages(existing, incoming);
    expect(merged.map((m) => m.id)).toEqual(['m1', 'm2', 'local:c2']);
    expect(merged[1]?.status).toBeUndefined();
    expect(merged[2]?.status).toBe('sending');
  });

  it('updates only matching optimistic local message', () => {
    const list: ChatItem[] = [
      makeMsg({ id: 'm1' }),
      { ...makeMsg({ id: 'local:c1', clientId: 'c1' }), status: 'sending' },
    ];
    const updated = updateLocal(list, 'c1', { status: 'failed', error: 'Network error' });
    expect(updated[0]?.status).toBeUndefined();
    expect(updated[1]?.status).toBe('failed');
    expect(updated[1]?.error).toBe('Network error');
  });

  it('formats campus day keys and Today/Yesterday labels', () => {
    const now = new Date('2026-11-22T12:00:00.000Z');
    expect(dayKey('2026-11-22T12:00:00.000Z')).toBe('2026-11-22');
    expect(dayLabel('2026-11-22T10:00:00.000Z', now)).toBe('Today');
    expect(dayLabel('2026-11-21T10:00:00.000Z', now)).toBe('Yesterday');
    expect(dayLabel('2026-11-15T10:00:00.000Z', now)).not.toBe('Today');
    expect(newClientId().length).toBeGreaterThan(6);
  });
});
