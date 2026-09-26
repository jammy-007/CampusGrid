import type { ApiErrorBody } from '@campusgrid/shared';

/** Thrown by apiFetch for any non-2xx response; carries the contract error code. */
export class ApiError extends Error {
  constructor(
    public readonly status: number,
    public readonly code: string,
    message: string,
    public readonly details?: unknown,
  ) {
    super(message);
    this.name = 'ApiError';
  }
}

export interface ApiFetchOptions extends Omit<RequestInit, 'body'> {
  /** Plain object bodies are JSON-encoded. */
  body?: unknown;
  /** Server components only: forward the incoming request's cookie header. */
  cookie?: string;
}

function baseUrl(): string {
  // In the browser, /api is same-origin (rewritten by next.config.ts). On the server, call the API directly.
  if (typeof window !== 'undefined') return '';
  return process.env.API_URL ?? 'http://localhost:4000';
}

/**
 * Typed fetch for the CampusGrid API. `path` starts with /api.
 * Example: const { events } = await apiFetch<{ events: EventDTO[] }>('/api/events');
 */
export async function apiFetch<T>(path: string, options: ApiFetchOptions = {}): Promise<T> {
  const { body, cookie, headers, ...init } = options;
  const h = new Headers(headers);
  const isForm = typeof FormData !== 'undefined' && body instanceof FormData;
  if (body !== undefined && !isForm) h.set('Content-Type', 'application/json');
  if (cookie) h.set('Cookie', cookie);

  const res = await fetch(`${baseUrl()}${path}`, {
    credentials: 'include',
    cache: 'no-store',
    ...init,
    headers: h,
    body: body === undefined ? undefined : isForm ? (body as FormData) : JSON.stringify(body),
  });

  if (res.status === 204) return undefined as T;
  const text = await res.text();
  const data: unknown = text ? JSON.parse(text) : undefined;
  if (!res.ok) {
    const err = (data as ApiErrorBody | undefined)?.error;
    throw new ApiError(res.status, err?.code ?? 'HTTP_ERROR', err?.message ?? res.statusText, err?.details);
  }
  return data as T;
}
