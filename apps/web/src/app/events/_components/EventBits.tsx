import Link from 'next/link';
import type { EventDTO, EventStatus, EventType } from '@campusgrid/shared';
import { Badge, Card, DecryptedText } from '@/components/ui';
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
    <Link href={`/events/${event.id}`} className="block h-full">
      <Card className="h-full space-y-3 transition-transform duration-300 hover:-translate-y-1">
        <div className="flex flex-wrap items-center gap-2">
          <Badge tone="brand">{TYPE_LABEL[event.type]}</Badge>
          <StatusBadge status={event.status} />
          {event.isTeamEvent && (
            <Badge tone="neutral">
              Teams of {event.minTeamSize}–{event.maxTeamSize}
            </Badge>
          )}
          {reg && <Badge tone="green">Registered</Badge>}
        </div>
        <h3 className="text-base font-bold tracking-tight text-white">{event.title}</h3>
        <p className="text-sm text-slate-300">
          {formatDateTime(event.startsAt)} · <span className="text-sky-300">{event.venue}</span>
        </p>
        {event.capacity !== null && event.registeredCount !== undefined && (
          <p className="font-mono text-xs text-slate-400">
            <DecryptedText
              text={`${event.registeredCount} / ${event.capacity} registered`}
              animateOn="hover"
            />
          </p>
        )}
      </Card>
    </Link>
  );
}
