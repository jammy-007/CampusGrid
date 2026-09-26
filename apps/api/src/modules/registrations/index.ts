import { Router } from 'express';
import type { RegistrationDTO } from '@campusgrid/shared';
import { prisma } from '../../lib/prisma';
import { bus } from '../../lib/bus';
import { badRequest, notFound } from '../../lib/errors';
import { requireAuth, requireEventOrganizer, requireRole } from '../../middleware/auth';
import {
  assertRegistrationOpen,
  confirmRegistration,
  getVisibleEvent,
  lockEvent,
  toEventDTO,
} from '../events/service';
import { leaveTeam } from '../teams/service';

export const router = Router();

/** Individual events only; team events register through POST /events/:eventId/teams or /teams/join. */
router.post('/events/:eventId/register', requireAuth, requireRole('STUDENT'), async (req, res) => {
  const user = req.user!;
  const visible = await getVisibleEvent(user, req.params.eventId as string);
  if (visible.isTeamEvent) {
    throw badRequest('This is a team event: create a team or join one with an invite code', 'TEAM_EVENT');
  }

  const { registration, created } = await prisma.$transaction(async (tx) => {
    const event = await lockEvent(tx, visible.id);
    assertRegistrationOpen(event);
    return confirmRegistration(tx, event, user.id, null);
  });

  if (created) {
    bus.emit('registration.created', { registrationId: registration.id, eventId: registration.eventId, userId: user.id });
  }
  res.status(created ? 201 : 200).json({ registration: toRegistrationDTO(registration) });
});

/** Cancels the caller's registration. On team events this also leaves the team. */
router.delete('/events/:eventId/register', requireAuth, async (req, res) => {
  const user = req.user!;
  const visible = await getVisibleEvent(user, req.params.eventId as string);

  const result = await prisma.$transaction(async (tx) => {
    const event = await lockEvent(tx, visible.id);
    const registration = await tx.registration.findUnique({
      where: { eventId_userId: { eventId: event.id, userId: user.id } },
    });
    if (!registration || registration.status !== 'CONFIRMED') throw notFound('You are not registered for this event');
    assertRegistrationOpen(event);

    if (registration.teamId) {
      return leaveTeam(tx, registration.teamId, user.id, user.id);
    }
    await tx.registration.update({ where: { id: registration.id }, data: { status: 'CANCELLED' } });
    return { registrationId: registration.id, teamId: null, teamDeleted: false };
  });

  if (result.teamId && !result.teamDeleted) bus.emit('team.member_left', { teamId: result.teamId, userId: user.id });
  bus.emit('registration.cancelled', { registrationId: result.registrationId });
  res.status(204).end();
});

router.get('/events/:eventId/registrations', requireAuth, requireEventOrganizer(), async (req, res) => {
  const registrations = await prisma.registration.findMany({
    where: { eventId: req.params.eventId as string },
    include: {
      user: { select: { id: true, name: true, email: true, usn: true } },
      team: { select: { id: true, name: true } },
    },
    orderBy: [{ status: 'asc' }, { createdAt: 'asc' }],
  });
  res.json({
    registrations: registrations.map((r) => ({ ...toRegistrationDTO(r), user: r.user, team: r.team })),
  });
});

router.get('/me/registrations', requireAuth, async (req, res) => {
  const registrations = await prisma.registration.findMany({
    where: { userId: req.user!.id, status: 'CONFIRMED', event: { institutionId: req.user!.institutionId } },
    include: { event: true, team: { select: { id: true, name: true } } },
    orderBy: { event: { startsAt: 'asc' } },
  });
  res.json({
    registrations: registrations.map((r) => ({
      ...toRegistrationDTO(r),
      team: r.team,
      event: toEventDTO(r.event),
    })),
  });
});

function toRegistrationDTO(r: {
  id: string;
  eventId: string;
  userId: string;
  teamId: string | null;
  status: 'CONFIRMED' | 'CANCELLED';
  createdAt: Date;
}): RegistrationDTO {
  return {
    id: r.id,
    eventId: r.eventId,
    userId: r.userId,
    teamId: r.teamId,
    status: r.status,
    createdAt: r.createdAt.toISOString(),
  };
}

