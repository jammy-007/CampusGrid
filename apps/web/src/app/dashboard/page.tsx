import type { Metadata } from 'next';
import Link from 'next/link';
import { redirect } from 'next/navigation';
import type { EventDTO, RegistrationDTO, TeamDTO } from '@campusgrid/shared';
import { apiServer } from '@/lib/server';
import { getSession } from '@/lib/session';
import { formatDateTime } from '@/lib/format';
import { ButtonLink, Card } from '@/components/ui';
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
      <div className="space-y-5">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <h1 className="text-2xl font-semibold">Hi, {user.name}</h1>
          <ButtonLink href="/events/new">Create event</ButtonLink>
        </div>
        <h2 className="text-lg font-semibold">{user.role === 'ADMIN' ? 'All campus events' : 'Your events'}</h2>
        {events.length === 0 ? (
          <Card className="text-sm text-slate-600">No events yet. Create one to get started.</Card>
        ) : (
          <Card className="divide-y divide-slate-100 p-0">
            {events.map((e) => (
              <div key={e.id} className="flex flex-wrap items-center justify-between gap-2 px-5 py-3">
                <div>
                  <Link href={`/events/${e.id}`} className="font-medium hover:text-brand-600">
                    {e.title}
                  </Link>
                  <p className="text-xs text-slate-500">
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
      <div className="space-y-5">
        <h1 className="text-2xl font-semibold">Hi, {user.name}</h1>
        <h2 className="text-lg font-semibold">Hackathons</h2>
        {events.length === 0 ? (
          <Card className="text-sm text-slate-600">No hackathons to judge right now.</Card>
        ) : (
          <div className="grid gap-4 sm:grid-cols-2">
            {events.map((e) => (
              <Card key={e.id} className="flex items-center justify-between gap-3">
                <div>
                  <p className="font-medium">{e.title}</p>
                  <p className="text-xs text-slate-500">{formatDateTime(e.startsAt)}</p>
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
    <div className="space-y-6">
      <h1 className="text-2xl font-semibold">Hi, {user.name}</h1>
      {next && (
        <Card className="space-y-1 bg-brand-50 ring-brand-100">
          <p className="text-sm text-brand-700">Your next event</p>
          <Link href={`/events/${next.eventId}`} className="text-xl font-semibold hover:underline">
            {next.event.title}
          </Link>
          <p className="text-sm text-slate-600">
            {formatDateTime(next.event.startsAt)} · {next.event.venue}
          </p>
        </Card>
      )}
      <section className="space-y-2">
        <h2 className="text-lg font-semibold">My events</h2>
        {upcoming.length === 0 ? (
          <Card className="text-sm text-slate-600">
            You haven&apos;t registered for anything yet.{' '}
            <Link href="/events" className="font-medium text-brand-600">
              Browse events
            </Link>
          </Card>
        ) : (
          <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
            {upcoming.map((r) => (
              <EventCard key={r.id} event={{ ...r.event, myRegistration: { id: r.id, status: r.status, teamId: r.teamId } }} />
            ))}
          </div>
        )}
      </section>
      <section className="space-y-2">
        <h2 className="text-lg font-semibold">My teams</h2>
        {teams.length === 0 ? (
          <Card className="text-sm text-slate-600">You&apos;re not in any team yet.</Card>
        ) : (
          <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
            {teams.map((t) => (
              <Link key={t.id} href={`/teams/${t.id}`}>
                <Card className="space-y-1 hover:shadow-md">
                  <p className="font-semibold">{t.name}</p>
                  <p className="text-sm text-slate-600">{t.eventTitle}</p>
                  <p className="text-xs text-slate-500">{t.members.length} members</p>
                </Card>
              </Link>
            ))}
          </div>
        )}
      </section>
    </div>
  );
}
