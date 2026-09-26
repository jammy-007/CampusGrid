'use client';

import { createContext, useCallback, useContext, useState, type ReactNode } from 'react';
import type { SessionUser } from '@campusgrid/shared';
import { apiFetch } from '@/lib/api';

interface SessionContextValue {
  user: SessionUser | null;
  /** Re-reads GET /api/auth/me (call after login/logout). */
  refresh: () => Promise<SessionUser | null>;
  setUser: (user: SessionUser | null) => void;
}

const SessionContext = createContext<SessionContextValue | null>(null);

export function SessionProvider({ initialUser, children }: { initialUser: SessionUser | null; children: ReactNode }) {
  const [user, setUser] = useState<SessionUser | null>(initialUser);
  const refresh = useCallback(async () => {
    try {
      const { user: me } = await apiFetch<{ user: SessionUser }>('/api/auth/me');
      setUser(me);
      return me;
    } catch {
      setUser(null);
      return null;
    }
  }, []);
  return <SessionContext.Provider value={{ user, refresh, setUser }}>{children}</SessionContext.Provider>;
}

/** Client components: the signed-in user (or null), plus refresh/setUser. */
export function useSession(): SessionContextValue {
  const ctx = useContext(SessionContext);
  if (!ctx) throw new Error('useSession must be used inside <SessionProvider>');
  return ctx;
}
