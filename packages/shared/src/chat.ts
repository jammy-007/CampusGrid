// Owned by Agent 3 (see docs/CONTRACT.md): team chat schemas, DTOs and socket event types.
import { z } from 'zod';

export const CHAT_MAX_LENGTH = 2000;
export const CHAT_PAGE_SIZE = 50;
/** Each user may send at most CHAT_RATE_LIMIT.max messages per CHAT_RATE_LIMIT.windowMs. */
export const CHAT_RATE_LIMIT = { max: 10, windowMs: 10_000 } as const;

export const chatBodySchema = z
  .string()
  .trim()
  .min(1, 'Message is empty')
  .max(CHAT_MAX_LENGTH, `Messages are at most ${CHAT_MAX_LENGTH} characters`);

const teamId = z.string().trim().min(1).max(64);

export const chatJoinSchema = z.object({ teamId });
export type ChatJoinInput = z.infer<typeof chatJoinSchema>;

export const chatSendSchema = z.object({
  teamId,
  body: chatBodySchema,
  /** Client-generated id echoed back on chat:message so the sender can swap its optimistic copy. */
  clientId: z.string().trim().min(1).max(64).optional(),
});
export type ChatSendInput = z.infer<typeof chatSendSchema>;

export const chatTypingSchema = z.object({ teamId });
export type ChatTypingInput = z.infer<typeof chatTypingSchema>;

/**
 * GET /api/teams/:teamId/chat/messages?before=<iso>&limit=50.
 * `beforeId` (optional) breaks ties between messages sharing the `before` timestamp.
 */
export const chatHistoryQuerySchema = z.object({
  before: z.coerce
    .date()
    .refine((d) => !Number.isNaN(d.getTime()), 'before must be an ISO date')
    .optional(),
  beforeId: z.string().trim().min(1).max(64).optional(),
  limit: z.coerce.number().int().min(1).max(100).default(CHAT_PAGE_SIZE),
});
export type ChatHistoryQuery = z.infer<typeof chatHistoryQuerySchema>;

export interface ChatMessageDTO {
  id: string;
  teamId: string;
  /** null for system messages ("Priya joined the team"). */
  sender: { id: string; name: string } | null;
  body: string;
  createdAt: string;
  /** Only on the live broadcast of a message the sender sent with a clientId. */
  clientId?: string;
}

/** History page, newest first. Pass the last message's createdAt (and id) as before/beforeId for the next page. */
export interface ChatHistoryDTO {
  messages: ChatMessageDTO[];
  hasMore: boolean;
}

export interface ChatTypingDTO {
  teamId: string;
  userId: string;
  name: string;
}

export type ChatErrorCode = 'FORBIDDEN' | 'VALIDATION_ERROR' | 'RATE_LIMITED' | 'INTERNAL';

export interface ChatErrorDTO {
  code: ChatErrorCode;
  message: string;
  teamId?: string;
  /** Set when the error is about a chat:send, so the client can mark that message failed. */
  clientId?: string;
}

/** Optional acknowledgement for chat:join and chat:send (chat:error is emitted when no ack is passed). */
export type ChatAckResult<T extends object = object> = ({ ok: true } & T) | { ok: false; error: ChatErrorDTO };

/** Namespace /chat: events the client emits. */
export interface ChatClientToServerEvents {
  'chat:join': (payload: ChatJoinInput, ack?: (res: ChatAckResult) => void) => void;
  'chat:send': (payload: ChatSendInput, ack?: (res: ChatAckResult<{ message: ChatMessageDTO }>) => void) => void;
  'chat:typing': (payload: ChatTypingInput) => void;
}

/** Namespace /chat: events the server emits. */
export interface ChatServerToClientEvents {
  'chat:message': (message: ChatMessageDTO) => void;
  'chat:typing': (payload: ChatTypingDTO) => void;
  'chat:error': (error: ChatErrorDTO) => void;
}

export type TextSegment = { type: 'text'; text: string } | { type: 'link'; text: string; href: string };

const URL_RE = /\b(?:https?:\/\/|www\.)[^\s<>"']+/gi;
const TRAILING_PUNCT = /[.,;:!?)\]}'"]$/;
const count = (s: string, ch: string) => s.split(ch).length - 1;

/**
 * Splits plain text into text and link segments for safe rendering (no HTML is ever produced).
 * Only http(s) URLs and www. hosts become links; trailing punctuation stays outside the link.
 */
export function splitLinks(text: string): TextSegment[] {
  const out: TextSegment[] = [];
  let last = 0;
  for (const match of text.matchAll(URL_RE)) {
    let raw = match[0];
    const start = match.index ?? 0;
    while (TRAILING_PUNCT.test(raw)) {
      // Keep a closing paren that balances one inside the URL, e.g. en.wikipedia.org/wiki/Foo_(bar).
      if (raw.endsWith(')') && count(raw, '(') >= count(raw, ')')) break;
      raw = raw.slice(0, -1);
    }
    const href = raw.toLowerCase().startsWith('www.') ? `https://${raw}` : raw;
    let valid = false;
    try {
      const url = new URL(href);
      valid = (url.protocol === 'http:' || url.protocol === 'https:') && url.hostname.includes('.');
    } catch {
      valid = false;
    }
    if (!valid) continue;
    if (start > last) out.push({ type: 'text', text: text.slice(last, start) });
    out.push({ type: 'link', text: raw, href });
    last = start + raw.length;
  }
  if (last < text.length) out.push({ type: 'text', text: text.slice(last) });
  return out;
}
