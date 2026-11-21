import type { Metadata } from 'next';
import Link from 'next/link';
import { EVENT_TYPES, type EventDTO } from '@campusgrid/shared';
import { apiServer } from '@/lib/server';
import { getSession } from '@/lib/session';
import { BlurText, Button, ButtonLink, Card, Magnet } from '@/components/ui';
import { cn } from '@/lib/cn';
import { EventCard, TYPE_LABEL } from './_components/EventBits';

export const metadata: Metadata = { title: 'Events' };

type Search = { type?: string; when?: string; q?: string; mode?: string };

export default async function EventsPage({ searchParams }: { searchParams: Promise<Search> }) {
  const sp = await searchParams;
  const when = sp.when === 'past' ? 'past' : 'upcoming';
  const type = EVENT_TYPES.find((t) => t === sp.type);
  const q = sp.q?.trim() || '';
  const mode = sp.mode === 'team' || sp.mode === 'solo' ? sp.mode : undefined;

  const qs = new URLSearchParams({
    when,
    ...(type ? { type } : {}),
    ...(q ? { q } : {}),
    ...(mode ? { mode } : {}),
  });
  const [{ events }, user] = await Promise.all([
    apiServer<{ events: EventDTO[] }>(`/api/events?${qs}`, `/events?${qs}`),
    getSession(),
  ]);
  const canCreate = user?.role === 'ORGANIZER' || user?.role === 'ADMIN';

  const href = (next: Search) => {
    const p = new URLSearchParams({
      when,
      ...(type ? { type } : {}),
      ...(q ? { q } : {}),
      ...(mode ? { mode } : {}),
      ...next,
    });
    if (next.type === '') p.delete('type');
    if (next.mode === '') p.delete('mode');
    if (next.q === '') p.delete('q');
    return `/events?${p}`;
  };
  const chip = (active: boolean) =>
    cn(
      'rounded-full px-4 py-2 text-xs font-medium tracking-wide ring-1 backdrop-blur-md transition-all',
      active
        ? 'bg-gradient-to-r from-brand-600 to-sky-500 text-white shadow-md shadow-sky-500/20 ring-sky-400/50'
        : 'bg-slate-950/75 text-slate-300 ring-white/15 hover:bg-slate-900/90 hover:text-white',
    );

  return (
    <div className="space-y-8">
      <div className="flex flex-wrap items-center justify-between gap-4">
        <h1 className="text-3xl font-bold tracking-tight text-white">
          <BlurText text="Events" />
        </h1>
        {canCreate && (
          <Magnet>
            <ButtonLink href="/events/new">Create event</ButtonLink>
          </Magnet>
        )}
      </div>

      {/* Search & Filter Controls */}
      <div className="space-y-4">
        <form action="/events" method="GET" className="flex flex-wrap items-center gap-2">
          <input type="hidden" name="when" value={when} />
          {type && <input type="hidden" name="type" value={type} />}
          {mode && <input type="hidden" name="mode" value={mode} />}
          <div className="relative flex-1 min-w-[220px]">
            <input
              type="search"
              name="q"
              defaultValue={q}
              placeholder="Search events by title, venue, or topic..."
              className="w-full rounded-xl border border-white/15 bg-slate-950/80 px-4 py-2 text-sm text-white placeholder:text-slate-400 focus:border-sky-400 focus:outline-none focus:ring-2 focus:ring-sky-400/25"
            />
          </div>
          <Button type="submit" size="sm" variant="secondary">
            Search
          </Button>
          {q && (
            <ButtonLink href={href({ q: '' })} size="sm" variant="ghost">
              Clear
            </ButtonLink>
          )}
        </form>

        <div className="flex flex-wrap items-center gap-2.5">
          <Link href={href({ when: 'upcoming' })} className={chip(when === 'upcoming')}>
            Upcoming
          </Link>
          <Link href={href({ when: 'past' })} className={chip(when === 'past')}>
            Past
          </Link>
          <span className="mx-1 h-4 w-px bg-white/15" />
          <Link href={href({ type: '' })} className={chip(!type)}>
            All types
          </Link>
          {EVENT_TYPES.map((t) => (
            <Link key={t} href={href({ type: t })} className={chip(type === t)}>
              {TYPE_LABEL[t]}
            </Link>
          ))}
          <span className="mx-1 h-4 w-px bg-white/15" />
          <Link href={href({ mode: '' })} className={chip(!mode)}>
            Any format
          </Link>
          <Link href={href({ mode: 'solo' })} className={chip(mode === 'solo')}>
            Solo
          </Link>
          <Link href={href({ mode: 'team' })} className={chip(mode === 'team')}>
            Team
          </Link>
        </div>
      </div>

      {events.length === 0 ? (
        <Card className="p-8 text-center text-sm text-slate-300">
          No {when} events match your current filters.
        </Card>
      ) : (
        <div className="grid gap-6 sm:grid-cols-2 lg:grid-cols-3">
          {events.map((e) => (
            <EventCard key={e.id} event={e} />
          ))}
        </div>
      )}
    </div>
  );
}
