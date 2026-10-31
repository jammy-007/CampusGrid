import type { Metadata } from 'next';
import Link from 'next/link';
import { EVENT_TYPES, type EventDTO } from '@campusgrid/shared';
import { apiServer } from '@/lib/server';
import { getSession } from '@/lib/session';
import { BlurText, ButtonLink, Card, Magnet } from '@/components/ui';
import { cn } from '@/lib/cn';
import { EventCard, TYPE_LABEL } from './_components/EventBits';

export const metadata: Metadata = { title: 'Events' };

type Search = { type?: string; when?: string };

export default async function EventsPage({ searchParams }: { searchParams: Promise<Search> }) {
  const sp = await searchParams;
  const when = sp.when === 'past' ? 'past' : 'upcoming';
  const type = EVENT_TYPES.find((t) => t === sp.type);
  const qs = new URLSearchParams({ when, ...(type ? { type } : {}) });
  const [{ events }, user] = await Promise.all([
    apiServer<{ events: EventDTO[] }>(`/api/events?${qs}`, `/events?${qs}`),
    getSession(),
  ]);
  const canCreate = user?.role === 'ORGANIZER' || user?.role === 'ADMIN';

  const href = (next: Search) => {
    const p = new URLSearchParams({ when, ...(type ? { type } : {}), ...next });
    if (next.type === '') p.delete('type');
    return `/events?${p}`;
  };
  const chip = (active: boolean) =>
    cn(
      'rounded-full px-3.5 py-1.5 text-xs font-medium tracking-wide ring-1 backdrop-blur-md transition-all',
      active
        ? 'bg-gradient-to-r from-brand-600 to-sky-500 text-white shadow-md shadow-sky-500/20 ring-sky-400/50'
        : 'bg-slate-950/75 text-slate-300 ring-white/15 hover:bg-slate-900/90 hover:text-white',
    );

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <h1 className="text-3xl font-bold tracking-tight text-white">
          <BlurText text="Events" />
        </h1>
        {canCreate && (
          <Magnet>
            <ButtonLink href="/events/new">Create event</ButtonLink>
          </Magnet>
        )}
      </div>
      <div className="flex flex-wrap items-center gap-2">
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
      </div>
      {events.length === 0 ? (
        <Card className="text-sm text-slate-300">No {when} events{type ? ` of this type` : ''}.</Card>
      ) : (
        <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
          {events.map((e) => (
            <EventCard key={e.id} event={e} />
          ))}
        </div>
      )}
    </div>
  );
}
