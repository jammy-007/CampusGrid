'use client';

import { Fragment, useCallback, useEffect, useLayoutEffect, useRef, useState, type KeyboardEvent } from 'react';
import { CHAT_MAX_LENGTH, splitLinks } from '@campusgrid/shared';
import { Button } from '@/components/ui';
import { useSession } from '@/lib/session';
import { cn } from '@/lib/cn';
import { dayKey, dayLabel, formatTime, type ChatItem } from './messages';
import { markRead } from './unread';
import { useTeamChat, type ConnectionStatus } from './useTeamChat';

const NEAR_BOTTOM_PX = 80;
const LOAD_OLDER_PX = 120;

/** Real-time team chat. Rendered by /teams/[id] for members only. */
export function TeamChat({ teamId }: { teamId: string }) {
  const { user } = useSession();
  const chat = useTeamChat(teamId, user);
  const { messages, loadOlder } = chat;

  const listRef = useRef<HTMLDivElement>(null);
  const atBottom = useRef(true);
  const prependFrom = useRef<number | null>(null);
  const lastKey = useRef<string | null>(null);
  const [showJump, setShowJump] = useState(false);

  const scrollToBottom = useCallback((smooth = false) => {
    const el = listRef.current;
    if (!el) return;
    el.scrollTo({ top: el.scrollHeight, behavior: smooth ? 'smooth' : 'auto' });
    atBottom.current = true;
    setShowJump(false);
  }, []);

  // Keep position when older messages are prepended; follow new ones when already at the bottom.
  useLayoutEffect(() => {
    const el = listRef.current;
    if (!el) return;
    if (prependFrom.current !== null) {
      el.scrollTop += el.scrollHeight - prependFrom.current;
      prependFrom.current = null;
    }
    const last = messages[messages.length - 1];
    const key = last ? last.id : null;
    if (key === lastKey.current) return;
    lastKey.current = key;
    const mine = last?.sender?.id === user?.id && last?.status === 'sending';
    if (atBottom.current || mine) scrollToBottom();
    else if (last) setShowJump(true);
  }, [messages, user?.id, scrollToBottom]);

  // Mark read while the newest message is on screen.
  useEffect(() => {
    const newest = [...messages].reverse().find((m) => !m.status);
    if (!newest) return;
    const mark = () => {
      if (atBottom.current && document.visibilityState === 'visible') markRead(teamId, newest.createdAt);
    };
    mark();
    document.addEventListener('visibilitychange', mark);
    return () => document.removeEventListener('visibilitychange', mark);
  }, [messages, teamId, showJump]);

  const onScroll = () => {
    const el = listRef.current;
    if (!el) return;
    atBottom.current = el.scrollHeight - el.scrollTop - el.clientHeight < NEAR_BOTTOM_PX;
    if (atBottom.current) setShowJump(false);
    if (el.scrollTop < LOAD_OLDER_PX && chat.hasOlder && !chat.loadingOlder && prependFrom.current === null) {
      prependFrom.current = el.scrollHeight;
      loadOlder().finally(() => {
        // Nothing was prepended (error or no change): don't shift on the next render.
        if (listRef.current && prependFrom.current === listRef.current.scrollHeight) prependFrom.current = null;
      });
    }
  };

  const disabled = chat.status === 'forbidden' || !user;

  return (
    <section
      aria-label="Team chat"
      className="flex h-[70dvh] min-h-[420px] flex-col rounded-xl bg-white shadow-sm ring-1 ring-slate-200 lg:h-[640px]"
    >
      <div className="flex items-center justify-between gap-2 border-b border-slate-200 px-4 py-3">
        <h2 className="font-semibold">Team chat</h2>
        <StatusPill status={chat.status} />
      </div>

      <div className="relative min-h-0 flex-1">
        <div
          ref={listRef}
          onScroll={onScroll}
          role="log"
          aria-live="polite"
          aria-label="Team messages"
          className="h-full overflow-y-auto overscroll-contain px-3 py-3 sm:px-4"
        >
          {chat.loadingOlder && <p className="py-2 text-center text-xs text-slate-400">Loading earlier messages…</p>}
          {!chat.hasOlder && !chat.loading && messages.length > 0 && (
            <p className="py-2 text-center text-xs text-slate-400">This is the start of your team chat.</p>
          )}
          {chat.loading && <p className="py-8 text-center text-sm text-slate-500">Loading messages…</p>}
          {chat.loadError && <p className="py-8 text-center text-sm text-red-600">{chat.loadError}</p>}
          {!chat.loading && !chat.loadError && messages.length === 0 && (
            <p className="py-8 text-center text-sm text-slate-500">No messages yet. Say hello to your team.</p>
          )}
          <ul className="space-y-1">
            {messages.map((m, i) => {
              const prev = messages[i - 1];
              const newDay = !prev || dayKey(prev.createdAt) !== dayKey(m.createdAt);
              const grouped =
                !newDay && !!prev?.sender && prev.sender.id === m.sender?.id && !m.status && !prev.status;
              return (
                <Fragment key={m.id}>
                  {newDay && <DaySeparator iso={m.createdAt} />}
                  <MessageRow message={m} mine={!!m.sender && m.sender.id === user?.id} grouped={grouped} onRetry={chat.retry} onDiscard={chat.discard} />
                </Fragment>
              );
            })}
          </ul>
        </div>
        {showJump && (
          <button
            type="button"
            onClick={() => scrollToBottom(true)}
            className="absolute bottom-3 left-1/2 -translate-x-1/2 rounded-full bg-brand-600 px-3 py-1 text-xs font-medium text-white shadow-md"
          >
            New messages ↓
          </button>
        )}
      </div>

      <div className="h-5 px-4 text-xs text-slate-500" aria-live="polite">
        {typingText(chat.typingNames)}
      </div>
      <Composer
        disabled={disabled}
        onSend={(text) => {
          chat.send(text);
          scrollToBottom();
        }}
        onTyping={chat.notifyTyping}
      />
    </section>
  );
}

function typingText(names: string[]): string {
  if (!names.length) return '';
  if (names.length === 1) return `${names[0]} is typing…`;
  if (names.length === 2) return `${names[0]} and ${names[1]} are typing…`;
  return 'Several people are typing…';
}

const pill: Record<ConnectionStatus, { label: string; className: string }> = {
  connecting: { label: 'Connecting…', className: 'bg-slate-100 text-slate-600' },
  live: { label: 'Live', className: 'bg-green-100 text-green-800' },
  reconnecting: { label: 'Reconnecting…', className: 'bg-amber-100 text-amber-800' },
  offline: { label: 'Offline: sign in again', className: 'bg-red-100 text-red-700' },
  forbidden: { label: 'No access', className: 'bg-red-100 text-red-700' },
};

function StatusPill({ status }: { status: ConnectionStatus }) {
  const { label, className } = pill[status];
  return (
    <span role="status" className={cn('inline-flex items-center gap-1.5 rounded-full px-2 py-0.5 text-xs font-medium', className)}>
      <span
        className={cn(
          'size-1.5 rounded-full bg-current',
          (status === 'connecting' || status === 'reconnecting') && 'animate-pulse',
        )}
      />
      {label}
    </span>
  );
}

function DaySeparator({ iso }: { iso: string }) {
  return (
    <li className="flex items-center gap-3 py-3" aria-hidden="true">
      <span className="h-px flex-1 bg-slate-200" />
      <span className="text-xs font-medium text-slate-500">{dayLabel(iso)}</span>
      <span className="h-px flex-1 bg-slate-200" />
    </li>
  );
}

/** Plain text with http(s) links; React escapes everything, nothing is parsed as HTML. */
function MessageText({ body }: { body: string }) {
  return (
    <>
      {splitLinks(body).map((seg, i) =>
        seg.type === 'link' ? (
          <a
            key={i}
            href={seg.href}
            target="_blank"
            rel="noopener noreferrer nofollow ugc"
            className="break-all underline underline-offset-2"
          >
            {seg.text}
          </a>
        ) : (
          <Fragment key={i}>{seg.text}</Fragment>
        ),
      )}
    </>
  );
}

interface MessageRowProps {
  message: ChatItem;
  mine: boolean;
  grouped: boolean;
  onRetry: (clientId: string) => void;
  onDiscard: (clientId: string) => void;
}

function MessageRow({ message: m, mine, grouped, onRetry, onDiscard }: MessageRowProps) {
  if (!m.sender) {
    return (
      <li className="py-1 text-center">
        <span className="inline-block rounded-full bg-slate-100 px-3 py-1 text-xs text-slate-600">
          <MessageText body={m.body} /> · {formatTime(m.createdAt)}
        </span>
      </li>
    );
  }
  return (
    <li className={cn('flex flex-col', mine ? 'items-end' : 'items-start', !grouped && 'pt-2')}>
      {!grouped && !mine && <span className="mb-0.5 px-1 text-xs font-medium text-slate-600">{m.sender.name}</span>}
      <div
        className={cn(
          'max-w-[85%] rounded-2xl px-3 py-2 text-sm whitespace-pre-wrap break-words sm:max-w-[75%]',
          mine ? 'bg-brand-600 text-white' : 'bg-slate-100 text-slate-900',
          m.status === 'sending' && 'opacity-60',
          m.status === 'failed' && 'bg-red-50 text-red-900 ring-1 ring-red-200',
        )}
      >
        <MessageText body={m.body} />
      </div>
      <span className="mt-0.5 px-1 text-[11px] text-slate-400">
        {m.status === 'sending' && 'Sending…'}
        {m.status === 'failed' && m.clientId && (
          <span className="text-red-600">
            {m.error ?? 'Not sent'} ·{' '}
            <button type="button" className="font-medium underline" onClick={() => onRetry(m.clientId!)}>
              Retry
            </button>{' '}
            ·{' '}
            <button type="button" className="underline" onClick={() => onDiscard(m.clientId!)}>
              Delete
            </button>
          </span>
        )}
        {!m.status && formatTime(m.createdAt)}
      </span>
    </li>
  );
}

function Composer({
  disabled,
  onSend,
  onTyping,
}: {
  disabled: boolean;
  onSend: (text: string) => void;
  onTyping: () => void;
}) {
  const [text, setText] = useState('');
  const ref = useRef<HTMLTextAreaElement>(null);
  const trimmed = text.trim();
  const tooLong = trimmed.length > CHAT_MAX_LENGTH;

  // Grow with the text up to about five lines.
  useLayoutEffect(() => {
    const el = ref.current;
    if (!el) return;
    el.style.height = 'auto';
    el.style.height = `${Math.min(el.scrollHeight, 128)}px`;
  }, [text]);

  const submit = () => {
    if (disabled || !trimmed || tooLong) return;
    onSend(trimmed);
    setText('');
    ref.current?.focus();
  };

  const onKeyDown = (e: KeyboardEvent<HTMLTextAreaElement>) => {
    if (e.key === 'Enter' && !e.shiftKey && !e.nativeEvent.isComposing) {
      e.preventDefault();
      submit();
    }
  };

  return (
    <form
      className="flex items-end gap-2 border-t border-slate-200 p-3"
      onSubmit={(e) => {
        e.preventDefault();
        submit();
      }}
    >
      <div className="flex-1">
        <label htmlFor="team-chat-input" className="sr-only">
          Message
        </label>
        <textarea
          id="team-chat-input"
          ref={ref}
          rows={1}
          value={text}
          disabled={disabled}
          placeholder={disabled ? 'You can’t send messages here' : 'Message your team'}
          onChange={(e) => {
            setText(e.target.value);
            if (e.target.value.trim()) onTyping();
          }}
          onKeyDown={onKeyDown}
          className="block w-full resize-none rounded-lg border-0 bg-white px-3 py-2 text-base ring-1 ring-slate-300 placeholder:text-slate-400 focus:ring-2 focus:ring-brand-500 focus:outline-none disabled:bg-slate-50 sm:text-sm"
        />
        {trimmed.length > CHAT_MAX_LENGTH - 200 && (
          <p className={cn('mt-1 text-right text-xs', tooLong ? 'text-red-600' : 'text-slate-500')}>
            {trimmed.length}/{CHAT_MAX_LENGTH}
          </p>
        )}
      </div>
      <Button type="submit" disabled={disabled || !trimmed || tooLong}>
        Send
      </Button>
    </form>
  );
}
