import { Router } from 'express';
import { Prisma } from '@prisma/client';
import { createTeamSchema, joinTeamSchema, updateTeamSchema } from '@campusgrid/shared';
import { prisma } from '../../lib/prisma';
import { bus } from '../../lib/bus';
import { parse } from '../../lib/validate';
import { badRequest, conflict, forbidden, notFound } from '../../lib/errors';
import { requireAuth, requireRole } from '../../middleware/auth';
import { assertRegistrationOpen, confirmRegistration, getVisibleEvent, isEventManager, lockEvent } from '../events/service';
import { generateInviteCode, leaveTeam, teamInclude, toTeamDTO } from './service';

export const router = Router();

/** Lists open teams with available member slots for a team event. */
router.get('/events/:eventId/open-teams', requireAuth, async (req, res) => {
  const user = req.user!;
  const event = await getVisibleEvent(user, req.params.eventId as string);
  if (!event.isTeamEvent) {
    return res.json({ teams: [] });
  }

  const teams = await prisma.team.findMany({
    where: { eventId: event.id, isOpen: true },
    include: teamInclude,
    orderBy: { createdAt: 'desc' },
    take: 50,
  });

  const openTeams = teams
    .filter((t) => t.members.length < event.maxTeamSize)
    .map((t) => toTeamDTO(t, false));

  res.json({ teams: openTeams });
});

/** Creates a team with the caller as leader; registers them for the event. */
router.post('/events/:eventId/teams', requireAuth, requireRole('STUDENT'), async (req, res) => {
  const user = req.user!;
  const { name, isOpen } = parse(createTeamSchema, req.body);
  const visible = await getVisibleEvent(user, req.params.eventId as string);
  if (!visible.isTeamEvent) throw badRequest('This event is for individuals; register directly', 'NOT_TEAM_EVENT');

  for (let attempt = 0; ; attempt++) {
    try {
      const { team, registration, created } = await prisma.$transaction(async (tx) => {
        const event = await lockEvent(tx, visible.id);
        assertRegistrationOpen(event);
        await assertNotInTeam(tx, event.id, user.id);
        if (await tx.team.findUnique({ where: { eventId_name: { eventId: event.id, name } } })) {
          throw conflict('A team with that name already exists for this event', 'TEAM_NAME_TAKEN');
        }
        const team = await tx.team.create({
          data: { eventId: event.id, name, inviteCode: generateInviteCode(), leaderId: user.id, isOpen },
        });
        await tx.teamMember.create({ data: { teamId: team.id, userId: user.id } });
        const { registration, created } = await confirmRegistration(tx, event, user.id, team.id);
        return { team, registration, created };
      });

      if (created) bus.emit('registration.created', { registrationId: registration.id, eventId: team.eventId, userId: user.id });
      bus.emit('team.created', { teamId: team.id, eventId: team.eventId, leaderId: user.id });
      const full = await prisma.team.findUniqueOrThrow({ where: { id: team.id }, include: teamInclude });
      res.status(201).json({ team: toTeamDTO(full, true) });
      return;
    } catch (err) {
      // Invite code collision (1 in 32^8): try a fresh code.
      const isCodeClash =
        err instanceof Prisma.PrismaClientKnownRequestError &&
        err.code === 'P2002' &&
        String(err.meta?.target ?? '').includes('inviteCode');
      if (!isCodeClash || attempt >= 4) throw err;
    }
  }
});

router.post('/teams/join', requireAuth, requireRole('STUDENT'), async (req, res) => {
  const user = req.user!;
  const { inviteCode, teamId } = parse(joinTeamSchema, req.body);
  const found = inviteCode
    ? await prisma.team.findUnique({ where: { inviteCode }, include: { event: true } })
    : await prisma.team.findUnique({ where: { id: teamId! }, include: { event: true } });

  if (!found || found.event.institutionId !== user.institutionId) {
    throw notFound(inviteCode ? 'No team has that invite code' : 'Team not found', 'INVALID_INVITE_CODE');
  }
  if (!inviteCode && !found.isOpen) {
    throw conflict('This team is invite-only', 'TEAM_CLOSED');
  }
  await getVisibleEvent(user, found.eventId);

  const { registration, created } = await prisma.$transaction(async (tx) => {
    const event = await lockEvent(tx, found.eventId);
    assertRegistrationOpen(event);
    await assertNotInTeam(tx, event.id, user.id);
    const size = await tx.teamMember.count({ where: { teamId: found.id } });
    if (size >= event.maxTeamSize) throw conflict(`This team is full (${event.maxTeamSize} max)`, 'TEAM_FULL');
    await tx.teamMember.create({ data: { teamId: found.id, userId: user.id } });
    return confirmRegistration(tx, event, user.id, found.id);
  });

  if (created) bus.emit('registration.created', { registrationId: registration.id, eventId: found.eventId, userId: user.id });
  bus.emit('team.member_joined', { teamId: found.id, userId: user.id });
  const full = await prisma.team.findUniqueOrThrow({ where: { id: found.id }, include: teamInclude });
  res.json({ team: toTeamDTO(full, true) });
});

router.patch('/teams/:teamId', requireAuth, async (req, res) => {
  const user = req.user!;
  const { isOpen } = parse(updateTeamSchema, req.body);
  const team = await prisma.team.findUnique({
    where: { id: req.params.teamId as string },
    include: { event: true },
  });
  if (!team || team.event.institutionId !== user.institutionId) throw notFound('Team not found');
  if (team.leaderId !== user.id && !isEventManager(user, team.event)) {
    throw forbidden('Only the team leader can change team settings');
  }
  const updated = await prisma.team.update({
    where: { id: team.id },
    data: { isOpen },
    include: teamInclude,
  });
  res.json({ team: toTeamDTO(updated, true) });
});

/** Members, the event's organizer and campus admins can view a team; only members see the invite code. */
router.get('/teams/:teamId', requireAuth, async (req, res) => {
  const user = req.user!;
  const team = await prisma.team.findUnique({
    where: { id: req.params.teamId as string },
    include: { ...teamInclude, event: { select: { title: true, organizerId: true, institutionId: true } } },
  });
  if (!team || team.event.institutionId !== user.institutionId) throw notFound('Team not found');
  const isMember = team.members.some((m) => m.userId === user.id);
  if (!isMember && !isEventManager(user, team.event)) throw notFound('Team not found');
  res.json({ team: toTeamDTO(team, isMember) });
});

/** The leader removes a member, or a member leaves (userId = self). */
router.delete('/teams/:teamId/members/:userId', requireAuth, async (req, res) => {
  const user = req.user!;
  const teamId = req.params.teamId as string;
  const targetId = req.params.userId as string;
  const team = await prisma.team.findUnique({ where: { id: teamId }, include: { event: true } });
  if (!team || team.event.institutionId !== user.institutionId) throw notFound('Team not found');

  const result = await prisma.$transaction(async (tx) => {
    const event = await lockEvent(tx, team.eventId);
    assertRegistrationOpen(event);
    return leaveTeam(tx, teamId, targetId, user.id);
  });

  if (!result.teamDeleted) bus.emit('team.member_left', { teamId, userId: targetId });
  if (result.registrationId) bus.emit('registration.cancelled', { registrationId: result.registrationId });
  res.status(204).end();
});

router.get('/me/teams', requireAuth, async (req, res) => {
  const teams = await prisma.team.findMany({
    where: { members: { some: { userId: req.user!.id } }, event: { institutionId: req.user!.institutionId } },
    include: teamInclude,
    orderBy: { createdAt: 'desc' },
  });
  res.json({ teams: teams.map((t) => toTeamDTO(t, true)) });
});

async function assertNotInTeam(tx: Prisma.TransactionClient, eventId: string, userId: string) {
  const existing = await tx.teamMember.findFirst({ where: { userId, team: { eventId } } });
  if (existing) throw conflict('You are already in a team for this event', 'ALREADY_IN_TEAM');
}
