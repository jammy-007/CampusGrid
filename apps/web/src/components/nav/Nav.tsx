'use client';

import Link from 'next/link';
import { usePathname, useRouter } from 'next/navigation';
import { useState } from 'react';
import type { Role } from '@campusgrid/shared';
import { useSession } from '@/lib/session';
import { apiFetch } from '@/lib/api';
import { disconnectSockets } from '@/lib/socket';
import { cn } from '@/lib/cn';
import { Button, ButtonLink } from '@/components/ui';

interface NavLink {
  href: string;
  label: string;
  roles?: Role[];
}

/**
 * Top-level routes from the ownership table. Per-event pages (scan, attendance, submit,
 * judge, leaderboard, rubric) are reached from /events/[id] and /events/[id]/manage.
 */
const LINKS: NavLink[] = [
  { href: '/dashboard', label: 'Dashboard' },
  { href: '/events', label: 'Events' },
  { href: '/events/new', label: 'Create event', roles: ['ORGANIZER', 'ADMIN'] },
  { href: '/certificates', label: 'Certificates', roles: ['STUDENT'] },
];

export function Nav() {
  const { user, setUser } = useSession();
  const pathname = usePathname();
  const router = useRouter();
  const [open, setOpen] = useState(false);

  const links = user ? LINKS.filter((l) => !l.roles || l.roles.includes(user.role)) : [];

  async function logout() {
    await apiFetch('/api/auth/logout', { method: 'POST' }).catch(() => undefined);
    disconnectSockets();
    setUser(null);
    router.push('/');
    router.refresh();
  }

  return (
    <header className="sticky top-0 z-40 border-b border-slate-200 bg-white/90 backdrop-blur">
      <div className="mx-auto flex h-14 max-w-6xl items-center gap-4 px-4">
        <Link href={user ? '/dashboard' : '/'} className="font-bold text-brand-700">
          CampusGrid
        </Link>
        <nav className="hidden flex-1 items-center gap-1 sm:flex">
          {links.map((l) => (
            <Link
              key={l.href}
              href={l.href}
              className={cn(
                'rounded-md px-3 py-1.5 text-sm text-slate-600 hover:bg-slate-100',
                (pathname === l.href || (l.href !== '/events' && pathname.startsWith(`${l.href}/`))) &&
                  'bg-slate-100 font-medium text-slate-900',
              )}
            >
              {l.label}
            </Link>
          ))}
        </nav>
        <div className="ml-auto hidden items-center gap-2 sm:flex">
          {user ? (
            <>
              <span className="text-sm text-slate-600">
                {user.name} <span className="text-xs text-slate-400">({user.role.toLowerCase()})</span>
              </span>
              <Button variant="ghost" size="sm" onClick={logout}>
                Log out
              </Button>
            </>
          ) : (
            <>
              <ButtonLink href="/login" variant="ghost" size="sm">
                Log in
              </ButtonLink>
              <ButtonLink href="/register" size="sm">
                Sign up
              </ButtonLink>
            </>
          )}
        </div>
        <button
          className="ml-auto rounded-md p-2 text-slate-600 sm:hidden"
          aria-label="Menu"
          aria-expanded={open}
          onClick={() => setOpen((o) => !o)}
        >
          ☰
        </button>
      </div>
      {open && (
        <div className="border-t border-slate-200 px-4 py-2 sm:hidden" onClick={() => setOpen(false)}>
          {links.map((l) => (
            <Link key={l.href} href={l.href} className="block rounded-md px-2 py-2 text-sm">
              {l.label}
            </Link>
          ))}
          {user ? (
            <button className="block w-full rounded-md px-2 py-2 text-left text-sm text-red-600" onClick={logout}>
              Log out ({user.name})
            </button>
          ) : (
            <>
              <Link href="/login" className="block rounded-md px-2 py-2 text-sm">
                Log in
              </Link>
              <Link href="/register" className="block rounded-md px-2 py-2 text-sm">
                Sign up
              </Link>
            </>
          )}
        </div>
      )}
    </header>
  );
}
