import { AUTH_COOKIE, type SessionUser } from '@campusgrid/shared';
import { apiFetch } from './api';

/** Client components: `const { user } = useSession()`. */
export { useSession } from '@/components/session-provider';

/**
 * Server components / route handlers: the signed-in user, or null.
 * Reads cg_token from the incoming request and asks the API who it belongs to.
 */
export async function getSession(): Promise<SessionUser | null> {
  const { cookies } = await import('next/headers');
  const token = (await cookies()).get(AUTH_COOKIE)?.value;
  if (!token) return null;
  try {
    const { user } = await apiFetch<{ user: SessionUser }>('/api/auth/me', {
      cookie: `${AUTH_COOKIE}=${token}`,
    });
    return user;
  } catch {
    return null;
  }
}

/** Cookie header to forward on server-side apiFetch calls. */
export async function serverCookie(): Promise<string | undefined> {
  const { cookies } = await import('next/headers');
  const token = (await cookies()).get(AUTH_COOKIE)?.value;
  return token ? `${AUTH_COOKIE}=${token}` : undefined;
}
