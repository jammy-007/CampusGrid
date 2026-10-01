'use client';

import { useCallback, useEffect, useRef, useState } from 'react';
import type { ChatAckResult, ChatHistoryDTO, ChatMessageDTO } from '@campusgrid/shared';
import { apiFetch } from '@/lib/api';
import { getSocket } from '@/lib/socket';
import { useSession } from '@/lib/session';

const READ_EVENT = 'cg:chat-read';
const key = (teamId: string) => `cg:chat:lastRead:${teamId}`;

export function getLastRead(teamId: string): string | null {
  try {
    return localStorage.getItem(key(teamId));
  } catch {
    return null;
  }
}

/** Records that everything up to `createdAt` was seen; useUnreadCount listeners update immediately. */
export function markRead(teamId: string, createdAt: string): void {
  const prev = getLastRead(teamId);
  if (prev && prev >= createdAt) return;
  try {
    localStorage.setItem(key(teamId), createdAt);
  } catch {
    // Storage blocked (private mode): the badge just won't persist.
  }
  window.dispatchEvent(new CustomEvent(READ_EVENT, { detail: teamId }));
}

/**
 * Unread messages from teammates in a team chat since it was last open on this device
 * (counts up to 50 from history, then live). For nav and dashboard badges.
 */
export function useUnreadCount(teamId: string): number {
  const { user } = useSession();
  const myId = user?.id;
  const seen = useRef(new Map<string, string>()); // id -> createdAt, others' messages only
  const [count, setCount] = useState(0);

  const recount = useCallback(() => {
    const lastRead = getLastRead(teamId);
    let n = 0;
    for (const createdAt of seen.current.values()) if (!lastRead || createdAt > lastRead) n++;
    setCount(n);
  }, [teamId]);

  useEffect(() => {
    if (!myId) return;
    const messages = seen.current;
    messages.clear();
    let cancelled = false;
    const track = (m: ChatMessageDTO) => {
      if (m.teamId !== teamId || !m.sender || m.sender.id === myId) return;
      messages.set(m.id, m.createdAt);
      if (messages.size > 200) messages.delete(messages.keys().next().value as string);
    };

    apiFetch<ChatHistoryDTO>(`/api/teams/${encodeURIComponent(teamId)}/chat/messages?limit=50`)
      .then(({ messages: page }) => {
        if (cancelled) return;
        [...page].reverse().forEach(track);
        recount();
      })
      .catch(() => undefined);

    const socket = getSocket('/chat');
    const join = () => socket.emit('chat:join', { teamId }, (_res: ChatAckResult) => undefined);
    const onMessage = (m: ChatMessageDTO) => {
      track(m);
      recount();
    };
    const onRead = (e: Event) => {
      if ((e as CustomEvent<string>).detail === teamId) recount();
    };
    const onStorage = (e: StorageEvent) => {
      if (e.key === key(teamId)) recount();
    };
    socket.on('connect', join);
    socket.on('chat:message', onMessage);
    window.addEventListener(READ_EVENT, onRead);
    window.addEventListener('storage', onStorage);
    if (socket.connected) join();
    return () => {
      cancelled = true;
      socket.off('connect', join);
      socket.off('chat:message', onMessage);
      window.removeEventListener(READ_EVENT, onRead);
      window.removeEventListener('storage', onStorage);
    };
  }, [teamId, myId, recount]);

  return count;
}
