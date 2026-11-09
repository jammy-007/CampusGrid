import type { Metadata } from 'next';
import type { EventDTO } from '@campusgrid/shared';
import { EventPassButton } from '@/features/checkin';
import { HackathonPanel } from '@/features/hackathon';
import { apiServer } from '@/lib/server';
import { getSession } from '@/lib/session';
import { formatDateTime } from '@/lib/format';
import { Badge, ButtonLink, Card } from '@/components/ui';
import { StatusBadge, TYPE_LABEL } from '../_components/EventBits';
import { EventActions } from './EventActions';
import { PublishButton } from './PublishButton';
import { AnnouncementsPanel } from './AnnouncementsPanel';
import { CalendarActions } from './CalendarActions';

type Props = { params: Promise<{ id: string }> };

export async function generateMetadata({ params }: Props): Promise<Metadata> {
  const { id } = await params;
  const { event } = await apiServer<{ event: EventDTO }>(`/api/events/${id}`).catch(() => ({ event: null }));
  return { title: event?.title ?? 'Event' };
}

export default async function EventPage({ params }: Props) {
  const { id } = await params;
  const [{ event }, user] = await Promise.all([
    apiServer<{ event: EventDTO }>(`/api/events/${id}`, `/events/${id}`),
    getSession(),
  ]);
  const isManager = !!user && (user.role === 'ADMIN' || user.id === event.organizerId);
  const open =
    (event.status === 'PUBLISHED' || event.status === 'ONGOING') && new Date(event.registrationDeadline) >= new Date();
  const reg = event.myRegistration?.status === 'CONFIRMED' ? event.myRegistration : null;
  const waitlisted = event.myRegistration?.status === 'WAITLISTED' ? event.myRegistration : null;

  return (
    <div className="space-y-7">
      <div className="space-y-3">
        <div className="flex flex-wrap items-center gap-2.5">
          <Badge>{TYPE_LABEL[event.type]}</Badge>
          <StatusBadge status={event.status} />
          {event.isTeamEvent && <Badge>Teams of {event.minTeamSize}–{event.maxTeamSize}</Badge>}
        </div>
        <h1 className="text-3xl font-bold text-white">{event.title}</h1>
        {event.organizerName && <p className="text-sm text-slate-300">Organized by {event.organizerName}</p>}
      </div>

      {isManager && (
        <div className="flex flex-wrap gap-2.5">
          <ButtonLink href={`/events/${event.id}/manage`}>Manage</ButtonLink>
          <ButtonLink href={`/events/${event.id}/edit`} variant="secondary">
            Edit
          </ButtonLink>
          {event.status === 'DRAFT' && <PublishButton eventId={event.id} />}
        </div>
      )}

      <div className="grid gap-6 lg:grid-cols-3">
        <div className="space-y-6 lg:col-span-2">
          <Card className="space-y-4 p-6">
            {event.description ? (
              <p className="whitespace-pre-line text-sm leading-relaxed text-slate-200">{event.description}</p>
            ) : (
              <p className="text-sm text-slate-400">No description yet.</p>
            )}
          </Card>
          <AnnouncementsPanel eventId={event.id} canPost={isManager} />
          {event.type === 'HACKATHON' && <HackathonPanel eventId={event.id} />}
        </div>
        <div className="space-y-6">
          <Card className="space-y-3 p-6 text-sm">
            <Row label="Starts" value={formatDateTime(event.startsAt)} />
            <Row label="Ends" value={formatDateTime(event.endsAt)} />
            {event.checkoutOpensAt && (
              <Row label="QR Check-out opens" value={formatDateTime(event.checkoutOpensAt)} />
            )}
            <Row label="Venue" value={event.venue} />
            <Row label="Registration closes" value={formatDateTime(event.registrationDeadline)} />
            <Row
              label="Registered"
              value={`${event.registeredCount ?? 0}${event.capacity !== null ? ` / ${event.capacity}` : ''}`}
            />
            <CalendarActions event={event} />
          </Card>
          {user?.role === 'STUDENT' && (
            <Card className="space-y-4 p-6">
              {reg && <Badge tone="green">You are registered</Badge>}
              {waitlisted && (
                <Badge tone="amber">
                  On Waitlist{waitlisted.waitlistPosition ? ` (#${waitlisted.waitlistPosition})` : ''}
                </Badge>
              )}
              <EventActions event={event} open={open} />
              {reg && <EventPassButton registrationId={reg.id} />}
            </Card>
          )}
          {user?.role === 'JUDGE' && event.type === 'HACKATHON' && (
            <ButtonLink href={`/events/${event.id}/judge`} className="w-full">
              Open judging
            </ButtonLink>
          )}
        </div>
      </div>
    </div>
  );
}

function Row({ label, value }: { label: string; value: string }) {
  return (
    <div className="flex justify-between gap-4 py-1 border-b border-white/5 last:border-0">
      <span className="text-slate-400">{label}</span>
      <span className="text-right font-medium text-slate-200">{value}</span>
    </div>
  );
}
