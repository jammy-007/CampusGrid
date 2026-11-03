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
    <Link href={`/events/${event.id}`} className="group block h-full">
      <Card className="flex h-full flex-col justify-between p-6 transition-all duration-300 hover:-translate-y-1.5 hover:border-sky-400/40 hover:shadow-sky-500/10">
        <div className="space-y-4">
          <div className="flex flex-wrap items-center gap-2.5">
            <Badge tone="brand">{TYPE_LABEL[event.type]}</Badge>
            <StatusBadge status={event.status} />
            {event.isTeamEvent && (
              <Badge tone="neutral">
                Teams of {event.minTeamSize}–{event.maxTeamSize}
              </Badge>
            )}
            {reg && <Badge tone="green">Registered</Badge>}
          </div>
          <div className="space-y-2">
            <h3 className="text-lg font-bold tracking-tight text-white transition-colors group-hover:text-sky-300">
              {event.title}
            </h3>
            <p className="text-sm leading-relaxed text-slate-300">
              {formatDateTime(event.startsAt)} · <span className="font-medium text-sky-300">{event.venue}</span>
            </p>
          </div>
        </div>
        {event.capacity !== null && event.registeredCount !== undefined && (
          <div className="mt-5 border-t border-white/8 pt-3.5">
            <p className="font-mono text-xs text-slate-400">
              <DecryptedText
                text={`${event.registeredCount} / ${event.capacity} registered`}
                animateOn="hover"
              />
            </p>
          </div>
        )}
      </Card>
    </Link>
  );
}
