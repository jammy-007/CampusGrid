import type { EventDTO } from '@campusgrid/shared';

function toIcsUtcTimestamp(iso: string): string {
  return new Date(iso).toISOString().replace(/[-:]/g, '').replace(/\.\d{3}/, '');
}

function escapeIcsText(value: string): string {
  return value
    .replace(/\\/g, '\\\\')
    .replace(/;/g, '\\;')
    .replace(/,/g, '\\,')
    .replace(/\r?\n/g, '\\n');
}

export function buildGoogleCalendarUrl(event: EventDTO, origin?: string): string {
  const start = toIcsUtcTimestamp(event.startsAt);
  const end = toIcsUtcTimestamp(event.endsAt);
  const eventUrl = origin ? `${origin}/events/${event.id}` : '';
  const checkoutNote = event.checkoutOpensAt
    ? `\n\nQR Check-Out opens at: ${new Date(event.checkoutOpensAt).toLocaleString()} (Remember to scan out at exit to unlock your OD Certificate!)`
    : '\n\nRemember to scan your QR pass at both Check-In and Check-Out to unlock your OD Certificate.';

  const details = `${event.description ?? ''}${checkoutNote}${eventUrl ? `\n\nEvent Link: ${eventUrl}` : ''}`.trim();

  const params = new URLSearchParams({
    action: 'TEMPLATE',
    text: event.title,
    dates: `${start}/${end}`,
    details,
    location: event.venue,
  });

  return `https://calendar.google.com/calendar/render?${params.toString()}`;
}

export function buildEventIcsContent(event: EventDTO, origin?: string): string {
  const now = toIcsUtcTimestamp(new Date().toISOString());
  const start = toIcsUtcTimestamp(event.startsAt);
  const end = toIcsUtcTimestamp(event.endsAt);
  const eventUrl = origin ? `${origin}/events/${event.id}` : '';
  const checkoutNote = event.checkoutOpensAt
    ? `\\n\\nQR Check-Out opens at: ${new Date(event.checkoutOpensAt).toLocaleString()} (Scan out at exit to claim your OD Certificate!)`
    : '\\n\\nRemember to scan your QR pass at both Check-In and Check-Out to claim your OD Certificate.';

  const description = `${escapeIcsText(event.description ?? '')}${checkoutNote}${
    eventUrl ? `\\n\\nEvent Link: ${escapeIcsText(eventUrl)}` : ''
  }`;

  const lines = [
    'BEGIN:VCALENDAR',
    'VERSION:2.0',
    'PRODID:-//CampusGrid//Event Calendar//EN',
    'CALSCALE:GREGORIAN',
    'METHOD:PUBLISH',
    'BEGIN:VEVENT',
    `UID:event-${event.id}@campusgrid.local`,
    `DTSTAMP:${now}`,
    `DTSTART:${start}`,
    `DTEND:${end}`,
    `SUMMARY:${escapeIcsText(event.title)}`,
    `LOCATION:${escapeIcsText(event.venue)}`,
    `DESCRIPTION:${description}`,
    'BEGIN:VALARM',
    'TRIGGER:-PT30M',
    'ACTION:DISPLAY',
    'DESCRIPTION:CampusGrid Event Reminder',
    'END:VALARM',
    'END:VEVENT',
    'END:VCALENDAR',
  ];

  return lines.join('\r\n');
}

export function downloadEventIcs(event: EventDTO): void {
  const origin = typeof window !== 'undefined' ? window.location.origin : undefined;
  const content = buildEventIcsContent(event, origin);
  const blob = new Blob([content], { type: 'text/calendar;charset=utf-8' });
  const url = URL.createObjectURL(blob);
  const link = document.createElement('a');
  const slug = event.title
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-|-$/g, '');
  link.href = url;
  link.download = `${slug || 'campusgrid-event'}.ics`;
  document.body.appendChild(link);
  link.click();
  document.body.removeChild(link);
  URL.revokeObjectURL(url);
}
