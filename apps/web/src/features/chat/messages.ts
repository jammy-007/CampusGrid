import type { ChatMessageDTO } from '@campusgrid/shared';

export type SendStatus = 'sending' | 'failed';

/** A message in the list: a server message, or an optimistic one (id `local:<clientId>`) with a status. */
export interface ChatItem extends ChatMessageDTO {
  status?: SendStatus;
  error?: string;
}

const byTime = (a: ChatItem, b: ChatItem) =>
  a.createdAt === b.createdAt ? (a.id < b.id ? -1 : a.id > b.id ? 1 : 0) : a.createdAt < b.createdAt ? -1 : 1;

/**
 * Merges incoming server messages into the list (oldest first): dedupes by id and
 * replaces the optimistic copy that carries the same clientId.
 */
export function mergeMessages(list: ChatItem[], incoming: ChatMessageDTO[]): ChatItem[] {
  if (!incoming.length) return list;
  const ids = new Set(incoming.map((m) => m.id));
  const clientIds = new Set(incoming.map((m) => m.clientId).filter(Boolean));
  const kept = list.filter((m) => !ids.has(m.id) && !(m.status && m.clientId && clientIds.has(m.clientId)));
  const fresh = incoming.map(({ clientId: _clientId, ...m }) => m);
  // Pending messages stay at the bottom until the server confirms them.
  const confirmed = [...kept.filter((m) => !m.status), ...fresh].sort(byTime);
  return [...confirmed, ...kept.filter((m) => m.status)];
}

export function updateLocal(list: ChatItem[], clientId: string, patch: Partial<ChatItem>): ChatItem[] {
  return list.map((m) => (m.status && m.clientId === clientId ? { ...m, ...patch } : m));
}

export function newClientId(): string {
  // crypto.randomUUID is missing on plain-http LAN origins (e.g. testing on a phone).
  if (typeof crypto !== 'undefined' && typeof crypto.randomUUID === 'function') return crypto.randomUUID();
  return `${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 10)}`;
}

const TIME_ZONE = process.env.NEXT_PUBLIC_TIME_ZONE ?? 'Asia/Kolkata';
const dayKeyFmt = new Intl.DateTimeFormat('en-CA', { timeZone: TIME_ZONE, year: 'numeric', month: '2-digit', day: '2-digit' });
const dayLabelFmt = new Intl.DateTimeFormat('en-IN', { timeZone: TIME_ZONE, weekday: 'short', day: 'numeric', month: 'short', year: 'numeric' });
const timeFmt = new Intl.DateTimeFormat('en-IN', { timeZone: TIME_ZONE, hour: 'numeric', minute: '2-digit' });

/** YYYY-MM-DD in the campus time zone. */
export const dayKey = (iso: string) => dayKeyFmt.format(new Date(iso));
export const formatTime = (iso: string) => timeFmt.format(new Date(iso));

export function dayLabel(iso: string, now = new Date()): string {
  const key = dayKey(iso);
  if (key === dayKeyFmt.format(now)) return 'Today';
  if (key === dayKeyFmt.format(new Date(now.getTime() - 86_400_000))) return 'Yesterday';
  return dayLabelFmt.format(new Date(iso));
}
