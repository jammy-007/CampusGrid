'use client';

import Link from 'next/link';
import { usePathname, useRouter } from 'next/navigation';
import { useState } from 'react';
import type { Role } from '@campusgrid/shared';
import { useSession } from '@/lib/session';
import { apiFetch } from '@/lib/api';
import { disconnectSockets } from '@/lib/socket';
import { cn } from '@/lib/cn';
import { DecryptedText } from '@/components/react-bits';

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
    <header className="sticky top-3 z-40 mx-auto max-w-6xl px-4">
      <div className="flex h-14 items-center gap-4 rounded-2xl border border-white/15 bg-slate-950/75 px-5 shadow-[0_8px_32px_rgba(0,0,0,0.45)] backdrop-blur-xl">
        <Link
          href={user ? '/dashboard' : '/'}
          className="group flex items-center gap-2.5 text-base font-bold tracking-tight text-white"
        >
          <img
            src="/logo.png"
            alt="CampusGrid logo"
            width={32}
            height={32}
            className="size-8 object-contain drop-shadow-[0_0_8px_rgba(56,189,248,0.45)] transition-transform duration-300 group-hover:scale-105"
          />
          <DecryptedText
            text="CampusGrid"
            animateOn="hover"
            className="font-sans font-bold tracking-tight text-white"
          />
        </Link>

        <nav className="hidden flex-1 items-center gap-1 sm:flex">
          {links.map((l) => {
            const active = pathname === l.href || (l.href !== '/events' && pathname.startsWith(`${l.href}/`));
            return (
              <Link
                key={l.href}
                href={l.href}
                className={cn(
                  'rounded-xl px-3.5 py-1.5 text-sm font-medium transition-all duration-200',
                  active
                    ? 'bg-sky-500/20 text-sky-200 ring-1 ring-sky-400/35'
                    : 'text-slate-300 hover:bg-white/10 hover:text-white',
                )}
              >
                {l.label}
              </Link>
            );
          })}
        </nav>
        <div className="ml-auto hidden items-center gap-2.5 sm:flex">
          {user ? (
            <>
              <span className="rounded-lg bg-white/5 px-2.5 py-1 text-xs font-medium text-slate-200 ring-1 ring-white/10">
                {user.name}{' '}
                <span className="ml-1 font-mono text-[11px] text-sky-300 uppercase">
                  {user.role.toLowerCase()}
                </span>
              </span>
              <button
                type="button"
                className="inline-flex h-8 items-center justify-center rounded-xl px-3 text-xs font-medium text-slate-300 transition-colors hover:bg-white/10 hover:text-white"
                onClick={logout}
              >
                Log out
              </button>
            </>
          ) : (
            <>
              <Link
                href="/login"
                className="inline-flex h-8 items-center justify-center rounded-xl px-3.5 text-xs font-medium text-slate-200 transition-colors hover:bg-white/10 hover:text-white"
              >
                Log in
              </Link>
              <Link
                href="/register"
                className="inline-flex h-8 items-center justify-center rounded-xl bg-gradient-to-r from-brand-600 to-sky-500 px-3.5 text-xs font-semibold text-white shadow-md shadow-sky-500/20 ring-1 ring-white/20 transition hover:brightness-110"
              >
                Sign up
              </Link>
            </>
          )}
        </div>
        <button
          className="ml-auto rounded-xl p-2 text-slate-200 hover:bg-white/10 sm:hidden"
          aria-label="Menu"
          aria-expanded={open}
          onClick={() => setOpen((o) => !o)}
        >
          ☰
        </button>
      </div>
      {open && (
        <div
          className="mt-2 rounded-2xl border border-white/15 bg-slate-950/95 p-3 text-white shadow-2xl backdrop-blur-xl sm:hidden"
          onClick={() => setOpen(false)}
        >
          {links.map((l) => (
            <Link key={l.href} href={l.href} className="block rounded-xl px-3 py-2 text-sm hover:bg-white/10">
              {l.label}
            </Link>
          ))}
          {user ? (
            <button
              className="block w-full rounded-xl px-3 py-2 text-left text-sm text-red-300 hover:bg-white/10"
              onClick={logout}
            >
              Log out ({user.name})
            </button>
          ) : (
            <>
              <Link href="/login" className="block rounded-xl px-3 py-2 text-sm hover:bg-white/10">
                Log in
              </Link>
              <Link href="/register" className="block rounded-xl px-3 py-2 text-sm text-sky-300 hover:bg-white/10">
                Sign up
              </Link>
            </>
          )}
        </div>
      )}
    </header>
  );
}
