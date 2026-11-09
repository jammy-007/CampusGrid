import type { Event, EventStatus, Prisma, Registration } from '@prisma/client';
import type { EventDTO, MyRegistrationDTO, SessionUser } from '@campusgrid/shared';
import { prisma } from '../../lib/prisma';
import { conflict, notFound } from '../../lib/errors';

type Tx = Prisma.TransactionClient;

/** Statuses students and judges can see (organizers/admins see more, see visibleEventsWhere). */
export const PUBLIC_STATUSES: EventStatus[] = ['PUBLISHED', 'ONGOING'];
/** Statuses that accept registrations and team changes (still bounded by the deadline). */
export const OPEN_STATUSES: EventStatus[] = ['PUBLISHED', 'ONGOING'];

/** Prisma filter for the events a user may see, always scoped to their institution. */
export function visibleEventsWhere(user: SessionUser): Prisma.EventWhereInput {
  const scope = { institutionId: user.institutionId };
  switch (user.role) {
    case 'ADMIN':
      return scope;
    case 'ORGANIZER':
      // Everyone's non-draft events plus their own drafts.
      return { ...scope, OR: [{ status: { not: 'DRAFT' } }, { organizerId: user.id }] };
    default:
      return { ...scope, status: { in: PUBLIC_STATUSES } };
  }
}

export function isEventManager(user: SessionUser, event: Pick<Event, 'organizerId' | 'institutionId'>) {
  return event.institutionId === user.institutionId && (user.role === 'ADMIN' || event.organizerId === user.id);
}

/** The event if the user may see it, else 404 (never leaks other campuses' events). */
export async function getVisibleEvent(user: SessionUser, eventId: string) {
  const event = await prisma.event.findFirst({ where: { AND: [{ id: eventId }, visibleEventsWhere(user)] } });
  if (!event) throw notFound('Event not found');
  return event;
}

export function toEventDTO(
  event: Event & { organizer?: { name: string } | null },
  extra: { registeredCount?: number; myRegistration?: (Registration & { waitlistPosition?: number }) | null } = {},
): EventDTO {
  const my: MyRegistrationDTO | null | undefined =
    extra.myRegistration === undefined
      ? undefined
      : extra.myRegistration && {
          id: extra.myRegistration.id,
          status: extra.myRegistration.status,
          teamId: extra.myRegistration.teamId,
          ...(extra.myRegistration.waitlistPosition !== undefined
            ? { waitlistPosition: extra.myRegistration.waitlistPosition }
            : {}),
        };
  return {
    id: event.id,
    institutionId: event.institutionId,
    organizerId: event.organizerId,
    organizerName: event.organizer?.name,
    title: event.title,
    description: event.description,
    type: event.type,
    venue: event.venue,
    startsAt: event.startsAt.toISOString(),
    endsAt: event.endsAt.toISOString(),
    checkoutOpensAt: event.checkoutOpensAt ? event.checkoutOpensAt.toISOString() : null,
    registrationDeadline: event.registrationDeadline.toISOString(),
    isTeamEvent: event.isTeamEvent,
    minTeamSize: event.minTeamSize,
    maxTeamSize: event.maxTeamSize,
    capacity: event.capacity,
    status: event.status,
    createdAt: event.createdAt.toISOString(),
    registeredCount: extra.registeredCount,
    myRegistration: my,
  };
}

/** Confirmed registrations per event id. */
export async function confirmedCounts(eventIds: string[]): Promise<Map<string, number>> {
  if (eventIds.length === 0) return new Map();
  const rows = await prisma.registration.groupBy({
    by: ['eventId'],
    where: { eventId: { in: eventIds }, status: 'CONFIRMED' },
    _count: { _all: true },
  });
  return new Map(rows.map((r) => [r.eventId, r._count._all]));
}

/**
 * Locks the event row for the rest of the transaction so concurrent registrations
 * and team joins for the same event run one at a time (capacity / team size checks).
 */
export async function lockEvent(tx: Tx, eventId: string): Promise<Event> {
  await tx.$queryRaw`SELECT id FROM "Event" WHERE id = ${eventId} FOR UPDATE`;
  const event = await tx.event.findUnique({ where: { id: eventId } });
  if (!event) throw notFound('Event not found');
  return event;
}

/** 409 unless the event is open for sign-ups and changes right now. */
export function assertRegistrationOpen(event: Event, now = new Date()) {
  if (!OPEN_STATUSES.includes(event.status)) {
    throw conflict('This event is not open for registration', 'REGISTRATION_CLOSED');
  }
  if (now > event.registrationDeadline) {
    throw conflict('The registration deadline has passed', 'REGISTRATION_CLOSED');
  }
}

/** 409 when the event is full (call inside a transaction after lockEvent). */
export async function assertCapacity(tx: Tx, event: Event) {
  if (event.capacity === null) return;
  const taken = await tx.registration.count({ where: { eventId: event.id, status: 'CONFIRMED' } });
  if (taken >= event.capacity) throw conflict('This event is full', 'EVENT_FULL');
}

/**
 * Confirms the user's registration for the event (creating it, or reviving a cancelled one),
 * enforcing capacity. When `allowWaitlist` is true and the event is full, places the user
 * on the waitlist (`WAITLISTED`).
 */
export async function confirmRegistration(
  tx: Tx,
  event: Event,
  userId: string,
  teamId: string | null,
  allowWaitlist = false,
) {
  const existing = await tx.registration.findUnique({ where: { eventId_userId: { eventId: event.id, userId } } });
  if (existing?.status === 'CONFIRMED') {
    const registration = await tx.registration.update({ where: { id: existing.id }, data: { teamId } });
    return { registration, created: false };
  }
  if (existing?.status === 'WAITLISTED' && allowWaitlist) {
    return { registration: existing, created: false };
  }

  let isFull = false;
  if (event.capacity !== null) {
    const taken = await tx.registration.count({ where: { eventId: event.id, status: 'CONFIRMED' } });
    isFull = taken >= event.capacity;
  }

  if (isFull && !allowWaitlist) {
    throw conflict('This event is full', 'EVENT_FULL');
  }

  const targetStatus = isFull ? 'WAITLISTED' : 'CONFIRMED';
  const registration = existing
    ? await tx.registration.update({
        where: { id: existing.id },
        data: { status: targetStatus, teamId, createdAt: new Date() },
      })
    : await tx.registration.create({ data: { eventId: event.id, userId, teamId, status: targetStatus } });
  return { registration, created: true };
}

/**
 * Promotes the earliest WAITLISTED registration for an event to CONFIRMED when a spot opens up.
 */
export async function promoteNextWaitlisted(tx: Tx, event: Event): Promise<Registration | null> {
  if (event.capacity !== null) {
    const taken = await tx.registration.count({ where: { eventId: event.id, status: 'CONFIRMED' } });
    if (taken >= event.capacity) return null;
  }

  const nextInLine = await tx.registration.findFirst({
    where: { eventId: event.id, status: 'WAITLISTED' },
    orderBy: { createdAt: 'asc' },
  });
  if (!nextInLine) return null;

  return tx.registration.update({
    where: { id: nextInLine.id },
    data: { status: 'CONFIRMED' },
  });
}
