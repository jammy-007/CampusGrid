import type { Metadata } from 'next';
import Link from 'next/link';
import { redirect } from 'next/navigation';
import type { EventDTO, RegistrationDTO } from '@campusgrid/shared';
import { apiServer } from '@/lib/server';
import { getSession } from '@/lib/session';
import { formatDateTime } from '@/lib/format';
import { Badge, ButtonLink, Card, DecryptedText, Table, TBody, TD, TH, THead, TR } from '@/components/ui';
import { StatusBadge } from '../../_components/EventBits';
import { StatusButton } from '../PublishButton';

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
  const teams = new Set(confirmed.map((r) => r.teamId).filter(Boolean));

  return (
    <div className="space-y-6">
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

      <div className="grid grid-cols-2 gap-4 sm:grid-cols-3">
        <Card>
          <p className="text-xs font-medium tracking-wider text-slate-400 uppercase">Registered</p>
          <p className="mt-1 font-mono text-2xl font-bold text-white">
            <DecryptedText
              text={`${confirmed.length}${event.capacity !== null ? ` / ${event.capacity}` : ''}`}
              animateOn="view"
            />
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

      <section className="space-y-3">
        <h2 className="text-lg font-semibold text-white">Registrations</h2>
        {registrations.length === 0 ? (
          <Card className="text-sm text-slate-300">Nobody has registered yet.</Card>
        ) : (
          <Table>
            <THead>
              <TR>
                <TH>Name</TH>
                <TH>Email</TH>
                <TH>USN</TH>
                {event.isTeamEvent && <TH>Team</TH>}
                <TH>Status</TH>
                <TH>Registered</TH>
              </TR>
            </THead>
            <TBody>
              {registrations.map((r) => (
                <TR key={r.id}>
                  <TD>{r.user?.name}</TD>
                  <TD>{r.user?.email}</TD>
                  <TD>{r.user?.usn ?? '—'}</TD>
                  {event.isTeamEvent && (
                    <TD>
                      {r.team ? (
                        <Link href={`/teams/${r.team.id}`} className="font-medium text-sky-400 hover:underline">
                          {r.team.name}
                        </Link>
                      ) : (
                        '—'
                      )}
                    </TD>
                  )}
                  <TD>
                    <Badge tone={r.status === 'CONFIRMED' ? 'green' : 'neutral'}>{r.status.toLowerCase()}</Badge>
                  </TD>
                  <TD>{formatDateTime(r.createdAt)}</TD>
                </TR>
              ))}
            </TBody>
          </Table>
        )}
      </section>
    </div>
  );
}
