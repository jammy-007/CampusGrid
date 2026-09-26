import Link from 'next/link';
import type { EventDTO, EventStatus, EventType } from '@campusgrid/shared';
import { Badge, Card } from '@/components/ui';
import { formatDateTime } from '@/lib/format';

const statusTone: Record<EventStatus, 'neutral' | 'brand' | 'green' | 'amber'> = {
  DRAFT: 'amber',
  PUBLISHED: 'brand',
  ONGOING: 'green',
  COMPLETED: 'neutral',
};

export const TYPE_LABEL: Record<EventType, string> = {
  FEST: 'Fest',
  SYMPOSIUM: 'Symposium',
  HACKATHON: 'Hackathon',
  WORKSHOP: 'Workshop',
};

export function StatusBadge({ status }: { status: EventStatus }) {
  return <Badge tone={statusTone[status]}>{status.charAt(0) + status.slice(1).toLowerCase()}</Badge>;
}

export function EventCard({ event }: { event: EventDTO }) {
  const reg = event.myRegistration?.status === 'CONFIRMED';
  return (
    <Link href={`/events/${event.id}`} className="block">
      <Card className="h-full space-y-2 transition-shadow hover:shadow-md">
        <div className="flex flex-wrap items-center gap-2">
          <Badge>{TYPE_LABEL[event.type]}</Badge>
          <StatusBadge status={event.status} />
          {event.isTeamEvent && <Badge tone="neutral">Teams of {event.minTeamSize}–{event.maxTeamSize}</Badge>}
          {reg && <Badge tone="green">Registered</Badge>}
        </div>
        <h3 className="font-semibold">{event.title}</h3>
        <p className="text-sm text-slate-600">
          {formatDateTime(event.startsAt)} · {event.venue}
        </p>
        {event.capacity !== null && event.registeredCount !== undefined && (
          <p className="text-xs text-slate-500">
            {event.registeredCount} / {event.capacity} registered
          </p>
        )}
      </Card>
    </Link>
  );
}
