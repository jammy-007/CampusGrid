import { Router } from 'express';
import type { Prisma } from '@prisma/client';
import {
  createAnnouncementSchema,
  createEventSchema,
  EVENT_STATUS_FLOW,
  eventListQuerySchema,
  updateEventSchema,
  type EventAnnouncementDTO,
  type EventStatus,
} from '@campusgrid/shared';
import { prisma } from '../../lib/prisma';
import { parse } from '../../lib/validate';
import { badRequest, conflict } from '../../lib/errors';
import { requireAuth, requireEventOrganizer, requireRole } from '../../middleware/auth';
import { getIO } from '../../realtime/io';
import { confirmedCounts, getVisibleEvent, toEventDTO, visibleEventsWhere } from './service';

export const router = Router();

const organizerSelect = { organizer: { select: { name: true } } } as const;

router.get('/events', requireAuth, async (req, res) => {
  const user = req.user!;
  const query = parse(eventListQuerySchema, req.query);
  const now = new Date();

  const filters: Prisma.EventWhereInput[] = [visibleEventsWhere(user)];
  if (query.type) filters.push({ type: query.type });
  if (query.when === 'upcoming') filters.push({ endsAt: { gte: now } });
  if (query.when === 'past') filters.push({ endsAt: { lt: now } });
  if (query.mine === 'true') filters.push({ organizerId: user.id });

  const events = await prisma.event.findMany({
    where: { AND: filters },
    include: organizerSelect,
    orderBy: { startsAt: query.when === 'past' ? 'desc' : 'asc' },
    take: 200,
  });
  const ids = events.map((e) => e.id);
  const [counts, mine] = await Promise.all([
    confirmedCounts(ids),
    prisma.registration.findMany({ where: { userId: user.id, eventId: { in: ids } } }),
  ]);
  const mineByEvent = new Map(mine.map((r) => [r.eventId, r]));

  res.json({
    events: events.map((e) =>
      toEventDTO(e, { registeredCount: counts.get(e.id) ?? 0, myRegistration: mineByEvent.get(e.id) ?? null }),
    ),
  });
});

router.post('/events', requireAuth, requireRole('ORGANIZER', 'ADMIN'), async (req, res) => {
  const user = req.user!;
  const input = parse(createEventSchema, req.body);
  const team = input.isTeamEvent
    ? { minTeamSize: input.minTeamSize, maxTeamSize: input.maxTeamSize }
    : { minTeamSize: 1, maxTeamSize: 1 };

  const event = await prisma.event.create({
    data: {
      ...input,
      ...team,
      checkoutOpensAt: input.checkoutOpensAt ?? null,
      capacity: input.capacity ?? null,
      institutionId: user.institutionId,
      organizerId: user.id,
      status: 'DRAFT',
    },
    include: organizerSelect,
  });
  res.status(201).json({ event: toEventDTO(event, { registeredCount: 0, myRegistration: null }) });
});

router.get('/events/:eventId', requireAuth, async (req, res) => {
  const user = req.user!;
  const event = await getVisibleEvent(user, req.params.eventId as string);
  const [organizer, counts, myRegistration] = await Promise.all([
    prisma.user.findUnique({ where: { id: event.organizerId }, select: { name: true } }),
    confirmedCounts([event.id]),
    prisma.registration.findUnique({ where: { eventId_userId: { eventId: event.id, userId: user.id } } }),
  ]);

  let waitlistPosition: number | undefined;
  if (myRegistration?.status === 'WAITLISTED') {
    waitlistPosition =
      (await prisma.registration.count({
        where: {
          eventId: event.id,
          status: 'WAITLISTED',
          createdAt: { lt: myRegistration.createdAt },
        },
      })) + 1;
  }

  res.json({
    event: toEventDTO(
      { ...event, organizer },
      {
        registeredCount: counts.get(event.id) ?? 0,
        myRegistration: myRegistration ? { ...myRegistration, waitlistPosition } : null,
      },
    ),
  });
});

router.get('/events/:eventId/announcements', requireAuth, async (req, res) => {
  const user = req.user!;
  const event = await getVisibleEvent(user, req.params.eventId as string);
  const rows = await prisma.eventAnnouncement.findMany({
    where: { eventId: event.id },
    include: { author: { select: { name: true } } },
    orderBy: { createdAt: 'desc' },
    take: 50,
  });

  const announcements: EventAnnouncementDTO[] = rows.map((a) => ({
    id: a.id,
    eventId: a.eventId,
    authorId: a.authorId,
    authorName: a.author.name,
    title: a.title,
    body: a.body,
    priority: a.priority,
    createdAt: a.createdAt.toISOString(),
  }));

  res.json({ announcements });
});

router.post('/events/:eventId/announcements', requireAuth, requireEventOrganizer(), async (req, res) => {
  const user = req.user!;
  const eventId = req.params.eventId as string;
  const input = parse(createAnnouncementSchema, req.body);

  const created = await prisma.eventAnnouncement.create({
    data: {
      eventId,
      authorId: user.id,
      title: input.title,
      body: input.body,
      priority: input.priority,
    },
    include: { author: { select: { name: true } } },
  });

  const dto: EventAnnouncementDTO = {
    id: created.id,
    eventId: created.eventId,
    authorId: created.authorId,
    authorName: created.author.name,
    title: created.title,
    body: created.body,
    priority: created.priority,
    createdAt: created.createdAt.toISOString(),
  };

  try {
    getIO().of('/live').to(`event:${eventId}`).emit('announcement:new', dto);
  } catch {
    // Socket server may not be initialized in unit tests
  }

  res.status(201).json({ announcement: dto });
});

router.patch('/events/:eventId', requireAuth, requireEventOrganizer(), async (req, res) => {
  const input = parse(updateEventSchema, req.body);
  const current = await prisma.event.findUniqueOrThrow({ where: { id: req.params.eventId as string } });

  // Re-check the cross-field rules against the merged event.
  const merged = { ...current, ...input };
  if (merged.isTeamEvent === false) {
    merged.minTeamSize = 1;
    merged.maxTeamSize = 1;
  }
  const check = updateEventSchema.safeParse({
    startsAt: merged.startsAt,
    endsAt: merged.endsAt,
    checkoutOpensAt: merged.checkoutOpensAt,
    registrationDeadline: merged.registrationDeadline,
    minTeamSize: merged.minTeamSize,
    maxTeamSize: merged.maxTeamSize,
  });
  if (!check.success) throw badRequest(check.error.issues[0]?.message ?? 'Invalid event', 'VALIDATION_ERROR');

  if (input.status && input.status !== current.status) assertStatusMove(current.status, input.status);

  const confirmed = await prisma.registration.count({ where: { eventId: current.id, status: 'CONFIRMED' } });
  if (input.isTeamEvent !== undefined && input.isTeamEvent !== current.isTeamEvent && confirmed > 0) {
    throw conflict('Team settings cannot change once people have registered', 'EVENT_HAS_REGISTRATIONS');
  }
  if (merged.capacity !== null && merged.capacity < confirmed) {
    throw conflict(`Capacity cannot be below the ${confirmed} people already registered`, 'CAPACITY_TOO_LOW');
  }

  const event = await prisma.event.update({
    where: { id: current.id },
    data: {
      ...input,
      minTeamSize: merged.minTeamSize,
      maxTeamSize: merged.maxTeamSize,
    },
    include: organizerSelect,
  });
  res.json({ event: toEventDTO(event, { registeredCount: confirmed }) });
});

router.delete('/events/:eventId', requireAuth, requireEventOrganizer(), async (req, res) => {
  const eventId = req.params.eventId as string;
  const confirmed = await prisma.registration.count({ where: { eventId, status: 'CONFIRMED' } });
  if (confirmed > 0) {
    throw conflict('Events with registrations cannot be deleted', 'EVENT_HAS_REGISTRATIONS');
  }
  await prisma.event.delete({ where: { id: eventId } });
  res.status(204).end();
});

router.post('/events/:eventId/publish', requireAuth, requireEventOrganizer(), async (req, res) => {
  const current = await prisma.event.findUniqueOrThrow({ where: { id: req.params.eventId as string } });
  assertStatusMove(current.status, 'PUBLISHED');
  const event = await prisma.event.update({
    where: { id: current.id },
    data: { status: 'PUBLISHED' },
    include: organizerSelect,
  });
  res.json({ event: toEventDTO(event) });
});

function assertStatusMove(from: EventStatus, to: EventStatus) {
  if (!EVENT_STATUS_FLOW[from].includes(to)) {
    throw conflict(`An event can't go from ${from} to ${to}`, 'INVALID_STATUS_CHANGE');
  }
}
