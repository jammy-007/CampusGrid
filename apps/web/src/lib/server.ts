import { notFound, redirect } from 'next/navigation';
import { apiFetch, ApiError } from './api';
import { serverCookie } from './session';

/**
 * Server components: GET from the API as the signed-in user.
 * 401 redirects to /login (back to `from`), 404 renders the not-found page.
 */
export async function apiServer<T>(path: string, from?: string): Promise<T> {
  try {
    return await apiFetch<T>(path, { cookie: await serverCookie() });
  } catch (err) {
    if (err instanceof ApiError && err.status === 401) redirect(from ? `/login?next=${encodeURIComponent(from)}` : '/login');
    if (err instanceof ApiError && err.status === 404) notFound();
    throw err;
  }
}
