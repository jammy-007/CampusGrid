'use client';

import type { EventDTO } from '@campusgrid/shared';
import { buildGoogleCalendarUrl, downloadEventIcs } from '@/lib/calendar';
import { Button, buttonClass } from '@/components/ui';

export function CalendarActions({ event }: { event: EventDTO }) {
  const origin = typeof window !== 'undefined' ? window.location.origin : undefined;
  const googleUrl = buildGoogleCalendarUrl(event, origin);

  return (
    <div className="flex flex-wrap gap-2 pt-2 border-t border-white/10">
      <a
        href={googleUrl}
        target="_blank"
        rel="noopener noreferrer"
        className={buttonClass('secondary', 'sm', 'flex-1 justify-center text-xs')}
      >
        📅 Google Calendar
      </a>
      <Button
        type="button"
        variant="secondary"
        size="sm"
        onClick={() => downloadEventIcs(event)}
        className="flex-1 justify-center text-xs"
      >
        ⬇ Download .ics
      </Button>
    </div>
  );
}
