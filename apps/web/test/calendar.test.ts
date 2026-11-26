import { describe, expect, it } from 'vitest';
import type { EventDTO } from '@campusgrid/shared';
import { buildEventIcsContent, buildGoogleCalendarUrl } from '../src/lib/calendar';

const sampleEvent: EventDTO = {
  id: 'evt_123',
  institutionId: 'inst_1',
  organizerId: 'org_1',
  organizerName: 'Olivia Organizer',
  title: 'GridHack, 2026; Finals',
  description: 'Build something cool.\nBring chargers.',
  type: 'HACKATHON',
  venue: 'Main Auditorium, Block A',
  startsAt: '2026-11-25T04:30:00.000Z',
  endsAt: '2026-11-26T04:30:00.000Z',
  registrationDeadline: '2026-11-24T18:00:00.000Z',
  checkoutOpensAt: null,
  isTeamEvent: true,
  minTeamSize: 2,
  maxTeamSize: 4,
  capacity: 200,
  status: 'PUBLISHED',
  createdAt: '2026-11-20T00:00:00.000Z',
  registrationCount: 12,
  waitlistCount: 0,
};

describe('calendar helpers', () => {
  it('builds a Google Calendar template URL with UTC dates and event link', () => {
    const url = new URL(buildGoogleCalendarUrl(sampleEvent, 'https://campus-grid.vercel.app'));
    expect(url.origin + url.pathname).toBe('https://calendar.google.com/calendar/render');
    expect(url.searchParams.get('action')).toBe('TEMPLATE');
    expect(url.searchParams.get('text')).toBe(sampleEvent.title);
    expect(url.searchParams.get('dates')).toBe('20261125T043000Z/20261126T043000Z');
    expect(url.searchParams.get('location')).toBe(sampleEvent.venue);
    expect(url.searchParams.get('details')).toContain('https://campus-grid.vercel.app/events/evt_123');
  });

  it('builds valid CRLF-delimited ICS content with escaped special characters', () => {
    const ics = buildEventIcsContent(sampleEvent, 'https://campus-grid.vercel.app');
    expect(ics).toContain('BEGIN:VCALENDAR\r\n');
    expect(ics).toContain('UID:event-evt_123@campusgrid.local\r\n');
    expect(ics).toContain('DTSTART:20261125T043000Z\r\n');
    expect(ics).toContain('DTEND:20261126T043000Z\r\n');
    expect(ics).toContain('SUMMARY:GridHack\\, 2026\\; Finals\r\n');
    expect(ics).toContain('LOCATION:Main Auditorium\\, Block A\r\n');
    expect(ics).toContain('Build something cool.\\nBring chargers.');
    expect(ics).toContain('END:VCALENDAR');
  });
});
