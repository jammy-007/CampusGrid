import type { Metadata } from 'next';
import Link from 'next/link';
import { redirect } from 'next/navigation';
import type { EventDTO, RegistrationDTO } from '@campusgrid/shared';
import { apiServer } from '@/lib/server';
import { getSession } from '@/lib/session';
import { formatDateTime } from '@/lib/format';
import { ButtonLink, Card, DecryptedText } from '@/components/ui';
import { StatusBadge } from '../../_components/EventBits';
import { StatusButton } from '../PublishButton';
import { RosterTableClient } from './RosterTableClient';

export const metadata: Metadata = { title: 'Manage event' };

/** Tabs to the other agents' organizer pages (Agent 2: scan, attendance, certificates; Agent 4: rubric, judges, leaderboard). */
const CHECKIN_TABS = [
  { href: 'scan', label: 'Scan passes' },
  { href: 'attendance', label: 'Attendance' },
  { href: 'attendance#certificates', label: 'Certificates' },
];
const HACKATHON_TABS = [
  { href: 'rubric', label: 'Rubric' },
  { href: 'rubric#judges', label: 'Judges' },
  { href: 'leaderboard', label: 'Leaderboard' },
];

export default async function ManageEventPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const from = `/events/${id}/manage`;
  const [{ event }, user] = await Promise.all([apiServer<{ event: EventDTO }>(`/api/events/${id}`, from), getSession()]);
  if (!user || (user.role !== 'ADMIN' && user.id !== event.organizerId)) redirect(`/events/${id}`);
  const { registrations } = await apiServer<{ registrations: RegistrationDTO[] }>(`/api/events/${id}/registrations`, from);

  const tabs = [...CHECKIN_TABS, ...(event.type === 'HACKATHON' ? HACKATHON_TABS : [])];
  const confirmed = registrations.filter((r) => r.status === 'CONFIRMED');
  const waitlisted = registrations.filter((r) => r.status === 'WAITLISTED');
  const teams = new Set(confirmed.map((r) => r.teamId).filter(Boolean));
  const fillPercent =
    event.capacity && event.capacity > 0
      ? Math.min(100, Math.round((confirmed.length / event.capacity) * 100))
      : null;

  return (
    <div className="space-y-6">
      <Card className="p-5">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <div>
            <Link href={`/events/${id}`} className="text-sm font-medium text-sky-400 hover:underline">
              ← {event.title}
            </Link>
            <h1 className="mt-1 flex items-center gap-2.5 text-2xl font-bold text-white">
              Manage event <StatusBadge status={event.status} />
            </h1>
          </div>
          <div className="flex gap-2">
            <ButtonLink href={`/events/${id}/edit`} variant="secondary">
              Edit
            </ButtonLink>
            <StatusButton eventId={id} status={event.status} />
          </div>
        </div>
      </Card>

      <nav className="flex flex-wrap gap-2">
        {tabs.map((t) => (
          <Link
            key={t.href}
            href={`/events/${id}/${t.href}`}
            className="rounded-xl border border-white/15 bg-slate-950/75 px-3.5 py-2 text-xs font-medium text-slate-200 backdrop-blur-md transition hover:border-sky-400/40 hover:bg-slate-900/90 hover:text-white"
          >
            {t.label}
          </Link>
        ))}
      </nav>

      <div className="grid grid-cols-2 gap-4 sm:grid-cols-4">
        <Card className="space-y-2">
          <p className="text-xs font-medium tracking-wider text-slate-400 uppercase">Confirmed</p>
          <p className="font-mono text-2xl font-bold text-white">
            <DecryptedText
              text={`${confirmed.length}${event.capacity !== null ? ` / ${event.capacity}` : ''}`}
              animateOn="view"
            />
          </p>
          {fillPercent !== null && (
            <div className="h-1.5 w-full overflow-hidden rounded-full bg-slate-800">
              <div
                className={`h-full rounded-full transition-all ${
                  fillPercent >= 100 ? 'bg-amber-400' : 'bg-emerald-400'
                }`}
                style={{ width: `${fillPercent}%` }}
              />
            </div>
          )}
        </Card>
        <Card>
          <p className="text-xs font-medium tracking-wider text-slate-400 uppercase">Waitlisted</p>
          <p className="mt-1 font-mono text-2xl font-bold text-amber-400">
            <DecryptedText text={String(waitlisted.length)} animateOn="view" />
          </p>
        </Card>
        {event.isTeamEvent && (
          <Card>
            <p className="text-xs font-medium tracking-wider text-slate-400 uppercase">Teams</p>
            <p className="mt-1 font-mono text-2xl font-bold text-white">
              <DecryptedText text={String(teams.size)} animateOn="view" />
            </p>
          </Card>
        )}
        <Card>
          <p className="text-xs font-medium tracking-wider text-slate-400 uppercase">Registration closes</p>
          <p className="mt-1 font-medium text-slate-100">{formatDateTime(event.registrationDeadline)}</p>
        </Card>
      </div>

      <RosterTableClient
        eventId={id}
        isTeamEvent={event.isTeamEvent}
        registrations={registrations}
      />
    </div>
  );
}
