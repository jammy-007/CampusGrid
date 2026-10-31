import type { Metadata } from 'next';
import Link from 'next/link';
import { redirect } from 'next/navigation';
import type { EventDTO, RegistrationDTO, TeamDTO } from '@campusgrid/shared';
import { apiServer } from '@/lib/server';
import { getSession } from '@/lib/session';
import { formatDateTime } from '@/lib/format';
import { BlurText, ButtonLink, Card, DecryptedText, Magnet } from '@/components/ui';
import { EventCard, StatusBadge } from '../events/_components/EventBits';

export const metadata: Metadata = { title: 'Dashboard' };

export default async function DashboardPage() {
  const user = await getSession();
  if (!user) redirect('/login?next=/dashboard');

  if (user.role === 'ORGANIZER' || user.role === 'ADMIN') {
    const { events } = await apiServer<{ events: EventDTO[] }>(
      `/api/events${user.role === 'ORGANIZER' ? '?mine=true' : ''}`,
      '/dashboard',
    );
    return (
      <div className="space-y-6">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <h1 className="text-3xl font-bold tracking-tight text-white">
            <BlurText text={`Hi, ${user.name}`} />
          </h1>
          <Magnet>
            <ButtonLink href="/events/new">Create event</ButtonLink>
          </Magnet>
        </div>
        <h2 className="text-lg font-semibold text-slate-200">
          {user.role === 'ADMIN' ? 'All campus events' : 'Your events'}
        </h2>
        {events.length === 0 ? (
          <Card className="text-sm text-slate-300">No events yet. Create one to get started.</Card>
        ) : (
          <Card className="divide-y divide-white/10 p-0">
            {events.map((e) => (
              <div key={e.id} className="flex flex-wrap items-center justify-between gap-2 px-5 py-4">
                <div>
                  <Link href={`/events/${e.id}`} className="font-semibold text-white hover:text-sky-300">
                    {e.title}
                  </Link>
                  <p className="mt-0.5 text-xs text-slate-400">
                    {formatDateTime(e.startsAt)} · {e.registeredCount ?? 0}
                    {e.capacity !== null ? ` / ${e.capacity}` : ''} registered
                  </p>
                </div>
                <div className="flex items-center gap-2">
                  <StatusBadge status={e.status} />
                  <ButtonLink href={`/events/${e.id}/manage`} variant="secondary" size="sm">
                    Manage
                  </ButtonLink>
                </div>
              </div>
            ))}
          </Card>
        )}
      </div>
    );
  }

  if (user.role === 'JUDGE') {
    const { events } = await apiServer<{ events: EventDTO[] }>('/api/events?type=HACKATHON', '/dashboard');
    return (
      <div className="space-y-6">
        <h1 className="text-3xl font-bold tracking-tight text-white">
          <BlurText text={`Hi, ${user.name}`} />
        </h1>
        <h2 className="text-lg font-semibold text-slate-200">Hackathons</h2>
        {events.length === 0 ? (
          <Card className="text-sm text-slate-300">No hackathons to judge right now.</Card>
        ) : (
          <div className="grid gap-4 sm:grid-cols-2">
            {events.map((e) => (
              <Card key={e.id} className="flex items-center justify-between gap-3">
                <div>
                  <p className="font-semibold text-white">{e.title}</p>
                  <p className="text-xs text-slate-400">{formatDateTime(e.startsAt)}</p>
                </div>
                <ButtonLink href={`/events/${e.id}/judge`} size="sm">
                  Judge
                </ButtonLink>
              </Card>
            ))}
          </div>
        )}
      </div>
    );
  }

  const [{ registrations }, { teams }] = await Promise.all([
    apiServer<{ registrations: (RegistrationDTO & { event: EventDTO })[] }>('/api/me/registrations', '/dashboard'),
    apiServer<{ teams: TeamDTO[] }>('/api/me/teams', '/dashboard'),
  ]);
  const now = Date.now();
  const upcoming = registrations.filter((r) => new Date(r.event.endsAt).getTime() >= now);
  const next = upcoming[0];

  return (
    <div className="space-y-7">
      <h1 className="text-3xl font-bold tracking-tight text-white">
        <BlurText text={`Hi, ${user.name}`} />
      </h1>
      {next && (
        <Card spotlightColor="rgba(56, 189, 248, 0.25)" className="space-y-1.5 border-sky-400/30">
          <p className="font-mono text-xs font-semibold tracking-wider text-sky-300 uppercase">
            <DecryptedText text="YOUR NEXT EVENT" animateOn="view" />
          </p>
          <Link href={`/events/${next.eventId}`} className="block text-xl font-bold text-white hover:text-sky-300">
            {next.event.title}
          </Link>
          <p className="text-sm text-slate-300">
            {formatDateTime(next.event.startsAt)} · <span className="text-sky-300">{next.event.venue}</span>
          </p>
        </Card>
      )}
      <section className="space-y-3">
        <h2 className="text-lg font-semibold text-slate-200">My events</h2>
        {upcoming.length === 0 ? (
          <Card className="text-sm text-slate-300">
            You haven&apos;t registered for anything yet.{' '}
            <Link href="/events" className="font-semibold text-sky-400 hover:underline">
              Browse events
            </Link>
          </Card>
        ) : (
          <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
            {upcoming.map((r) => (
              <EventCard
                key={r.id}
                event={{ ...r.event, myRegistration: { id: r.id, status: r.status, teamId: r.teamId } }}
              />
            ))}
          </div>
        )}
      </section>
      <section className="space-y-3">
        <h2 className="text-lg font-semibold text-slate-200">My teams</h2>
        {teams.length === 0 ? (
          <Card className="text-sm text-slate-300">You&apos;re not in any team yet.</Card>
        ) : (
          <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
            {teams.map((t) => (
              <Link key={t.id} href={`/teams/${t.id}`}>
                <Card className="space-y-1.5 transition-transform duration-300 hover:-translate-y-1">
                  <p className="font-bold text-white">{t.name}</p>
                  <p className="text-sm text-slate-300">{t.eventTitle}</p>
                  <p className="font-mono text-xs text-sky-300">{t.members.length} members</p>
                </Card>
              </Link>
            ))}
          </div>
        )}
      </section>
    </div>
  );
}
