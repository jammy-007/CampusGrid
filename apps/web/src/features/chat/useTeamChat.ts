'use client';

import { useCallback, useEffect, useRef, useState } from 'react';
import type {
  ChatAckResult,
  ChatErrorDTO,
  ChatHistoryDTO,
  ChatMessageDTO,
  ChatTypingDTO,
  SessionUser,
} from '@campusgrid/shared';
import { apiFetch, ApiError } from '@/lib/api';
import { getSocket } from '@/lib/socket';
import { mergeMessages, newClientId, updateLocal, type ChatItem } from './messages';

export type ConnectionStatus = 'connecting' | 'live' | 'reconnecting' | 'offline' | 'forbidden';

const SEND_TIMEOUT_MS = 10_000;
const TYPING_SEND_EVERY_MS = 2_500;
const TYPING_SHOW_FOR_MS = 4_000;
const CATCH_UP_PAGES = 5;

const historyUrl = (teamId: string, params: Record<string, string>) =>
  `/api/teams/${encodeURIComponent(teamId)}/chat/messages?${new URLSearchParams(params)}`;

/** All state and actions for one team's chat: history, live socket, optimistic sends, typing. */
export function useTeamChat(teamId: string, me: SessionUser | null) {
  const [messages, setMessages] = useState<ChatItem[]>([]);
  const [status, setStatus] = useState<ConnectionStatus>('connecting');
  const [loading, setLoading] = useState(true);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [hasOlder, setHasOlder] = useState(false);
  const [loadingOlder, setLoadingOlder] = useState(false);
  const [typing, setTyping] = useState<Record<string, { name: string; until: number }>>({});

  const messagesRef = useRef<ChatItem[]>([]);
  /** Optimistic messages written while offline, sent on the next connect. */
  const queued = useRef(new Set<string>());
  const lastTypingSent = useRef(0);

  const apply = useCallback((fn: (list: ChatItem[]) => ChatItem[]) => {
    setMessages((list) => {
      const next = fn(list);
      messagesRef.current = next;
      return next;
    });
  }, []);

  const fail = useCallback(
    (clientId: string, error: string) => {
      queued.current.delete(clientId);
      apply((list) => updateLocal(list, clientId, { status: 'failed', error }));
    },
    [apply],
  );

  const emitSend = useCallback(
    (clientId: string, body: string) => {
      const socket = getSocket('/chat');
      if (!socket.connected) {
        queued.current.add(clientId);
        return;
      }
      queued.current.delete(clientId);
      socket
        .timeout(SEND_TIMEOUT_MS)
        .emit('chat:send', { teamId, body, clientId }, (err: Error | null, res?: ChatAckResult<{ message: ChatMessageDTO }>) => {
          if (err || !res) return fail(clientId, 'No reply from the server');
          if (!res.ok) return fail(clientId, res.error.message);
          const { message } = res;
          apply((list) => mergeMessages(list, [{ ...message, clientId }]));
        });
    },
    [teamId, apply, fail],
  );

  /** Fetches pages newer than what we hold until the gap is closed (after a reconnect). */
  const catchUp = useCallback(async () => {
    const newest = [...messagesRef.current].reverse().find((m) => !m.status);
    let params: Record<string, string> = { limit: '50' };
    for (let page = 0; page < CATCH_UP_PAGES; page++) {
      const res = await apiFetch<ChatHistoryDTO>(historyUrl(teamId, params));
      apply((list) => mergeMessages(list, res.messages));
      const oldest = res.messages[res.messages.length - 1];
      if (!newest || !res.hasMore || !oldest || oldest.createdAt <= newest.createdAt) return;
      params = { limit: '50', before: oldest.createdAt, beforeId: oldest.id };
    }
  }, [teamId, apply]);

  // Initial history.
  useEffect(() => {
    let cancelled = false;
    setMessages([]);
    messagesRef.current = [];
    setLoading(true);
    setLoadError(null);
    apiFetch<ChatHistoryDTO>(historyUrl(teamId, { limit: '50' }))
      .then((res) => {
        if (cancelled) return;
        apply((list) => mergeMessages(list, res.messages));
        setHasOlder(res.hasMore);
      })
      .catch((err: unknown) => {
        if (cancelled) return;
        if (err instanceof ApiError && err.status === 403) setStatus('forbidden');
        setLoadError(err instanceof ApiError ? err.message : 'Could not load messages');
      })
      .finally(() => !cancelled && setLoading(false));
    return () => {
      cancelled = true;
    };
  }, [teamId, apply]);

  // Live socket.
  useEffect(() => {
    const socket = getSocket('/chat');
    let firstConnect = true;

    const join = () => {
      socket.emit('chat:join', { teamId }, (res: ChatAckResult) => {
        if (!res.ok) {
          setStatus(res.error.code === 'FORBIDDEN' ? 'forbidden' : 'reconnecting');
          return;
        }
        setStatus('live');
        // The initial fetch covers the first connect; after a reconnect, fetch what was missed.
        if (!firstConnect) catchUp().catch(() => undefined);
        firstConnect = false;
        for (const clientId of [...queued.current]) {
          const item = messagesRef.current.find((m) => m.clientId === clientId && m.status === 'sending');
          if (item) emitSend(clientId, item.body);
          else queued.current.delete(clientId);
        }
      });
    };
    const onDisconnect = () => setStatus((s) => (s === 'forbidden' ? s : 'reconnecting'));
    const onConnectError = (err: Error) =>
      setStatus((s) => (s === 'forbidden' ? s : err.message === 'UNAUTHORIZED' ? 'offline' : 'reconnecting'));
    const onMessage = (m: ChatMessageDTO) => {
      if (m.teamId !== teamId) return;
      // Only keep clientId when it is ours, so another tab's optimistic copy isn't matched by accident.
      apply((list) => mergeMessages(list, [m.sender?.id === me?.id ? m : { ...m, clientId: undefined }]));
      const senderId = m.sender?.id;
      if (senderId) setTyping(({ [senderId]: _gone, ...rest }) => rest);
    };
    const onTyping = (t: ChatTypingDTO) => {
      if (t.teamId !== teamId || t.userId === me?.id) return;
      setTyping((prev) => ({ ...prev, [t.userId]: { name: t.name, until: Date.now() + TYPING_SHOW_FOR_MS } }));
    };
    const onError = (e: ChatErrorDTO) => {
      if (e.teamId && e.teamId !== teamId) return;
      if (e.clientId) return fail(e.clientId, e.message);
      if (e.code === 'FORBIDDEN' && e.teamId === teamId) setStatus('forbidden');
    };

    socket.on('connect', join);
    socket.on('disconnect', onDisconnect);
    socket.on('connect_error', onConnectError);
    socket.on('chat:message', onMessage);
    socket.on('chat:typing', onTyping);
    socket.on('chat:error', onError);
    if (socket.connected) join();
    else if (!socket.active) socket.connect();

    return () => {
      socket.off('connect', join);
      socket.off('disconnect', onDisconnect);
      socket.off('connect_error', onConnectError);
      socket.off('chat:message', onMessage);
      socket.off('chat:typing', onTyping);
      socket.off('chat:error', onError);
    };
  }, [teamId, me?.id, apply, catchUp, emitSend, fail]);

  // Expire typing indicators.
  const typingCount = Object.keys(typing).length;
  useEffect(() => {
    if (!typingCount) return;
    const timer = setInterval(() => {
      const now = Date.now();
      setTyping((prev) => {
        const next = Object.fromEntries(Object.entries(prev).filter(([, v]) => v.until > now));
        return Object.keys(next).length === Object.keys(prev).length ? prev : next;
      });
    }, 1000);
    return () => clearInterval(timer);
  }, [typingCount]);

  const send = useCallback(
    (text: string) => {
      const body = text.trim();
      if (!body || !me) return;
      const clientId = newClientId();
      apply((list) => [
        ...list,
        {
          id: `local:${clientId}`,
          teamId,
          sender: { id: me.id, name: me.name },
          body,
          createdAt: new Date().toISOString(),
          clientId,
          status: 'sending',
        },
      ]);
      emitSend(clientId, body);
    },
    [teamId, me, apply, emitSend],
  );

  const retry = useCallback(
    (clientId: string) => {
      const item = messagesRef.current.find((m) => m.clientId === clientId && m.status === 'failed');
      if (!item) return;
      apply((list) => updateLocal(list, clientId, { status: 'sending', error: undefined }));
      emitSend(clientId, item.body);
    },
    [apply, emitSend],
  );

  const discard = useCallback(
    (clientId: string) => apply((list) => list.filter((m) => !(m.status && m.clientId === clientId))),
    [apply],
  );

  const notifyTyping = useCallback(() => {
    const socket = getSocket('/chat');
    const now = Date.now();
    if (!socket.connected || now - lastTypingSent.current < TYPING_SEND_EVERY_MS) return;
    lastTypingSent.current = now;
    socket.emit('chat:typing', { teamId });
  }, [teamId]);

  const loadOlder = useCallback(async () => {
    const oldest = messagesRef.current.find((m) => !m.status);
    if (!oldest || loadingOlder || !hasOlder) return;
    setLoadingOlder(true);
    try {
      const res = await apiFetch<ChatHistoryDTO>(
        historyUrl(teamId, { limit: '50', before: oldest.createdAt, beforeId: oldest.id }),
      );
      apply((list) => mergeMessages(list, res.messages));
      setHasOlder(res.hasMore);
    } catch {
      // Leave hasOlder as is; scrolling up again retries.
    } finally {
      setLoadingOlder(false);
    }
  }, [teamId, apply, hasOlder, loadingOlder]);

  return {
    messages,
    status,
    loading,
    loadError,
    hasOlder,
    loadingOlder,
    typingNames: Object.values(typing).map((t) => t.name),
    send,
    retry,
    discard,
    notifyTyping,
    loadOlder,
  };
}
