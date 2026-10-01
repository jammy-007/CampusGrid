import { randomInt } from 'node:crypto';
import type { Prisma } from '@prisma/client';
import { INVITE_CODE_ALPHABET, INVITE_CODE_LENGTH, type TeamDTO } from '@campusgrid/shared';
import { conflict, forbidden, notFound } from '../../lib/errors';

type Tx = Prisma.TransactionClient;

export function generateInviteCode(): string {
  let code = '';
  for (let i = 0; i < INVITE_CODE_LENGTH; i++) code += INVITE_CODE_ALPHABET[randomInt(INVITE_CODE_ALPHABET.length)];
  return code;
}

/**
 * Removes userId from the team and cancels their registration, as actorId.
 * Members may leave; the leader may remove others; the leader may leave only when alone,
 * which deletes the team. Call inside a transaction after lockEvent.
 */
export async function leaveTeam(tx: Tx, teamId: string, userId: string, actorId: string) {
  const team = await tx.team.findUnique({ where: { id: teamId }, include: { members: true } });
  if (!team) throw notFound('Team not found');
  if (!team.members.some((m) => m.userId === userId)) throw notFound('That person is not in this team');

  const isLeader = team.leaderId === actorId;
  if (actorId !== userId && !isLeader) throw forbidden('Only the team leader can remove members');
  if (userId === team.leaderId && team.members.length > 1) {
    throw conflict('Remove the other members before leaving your own team', 'LEADER_HAS_MEMBERS');
  }

  const registration = await tx.registration.findUnique({
    where: { eventId_userId: { eventId: team.eventId, userId } },
  });
  if (registration) {
    await tx.registration.update({ where: { id: registration.id }, data: { status: 'CANCELLED', teamId: null } });
  }

  const teamDeleted = userId === team.leaderId;
  if (teamDeleted) {
    await tx.team.delete({ where: { id: team.id } });
  } else {
    await tx.teamMember.delete({ where: { teamId_userId: { teamId, userId } } });
  }
  return { registrationId: registration?.id ?? '', teamId, teamDeleted };
}

type TeamWithMembers = Prisma.TeamGetPayload<{
  include: { members: { include: { user: { select: { id: true; name: true; email: true } } } }; event: { select: { title: true } } };
}>;

export const teamInclude = {
  members: { include: { user: { select: { id: true, name: true, email: true } } }, orderBy: { joinedAt: 'asc' } },
  event: { select: { title: true } },
} satisfies Prisma.TeamInclude;

export function toTeamDTO(team: TeamWithMembers, showInviteCode: boolean): TeamDTO {
  return {
    id: team.id,
    eventId: team.eventId,
    eventTitle: team.event.title,
    name: team.name,
    inviteCode: showInviteCode ? team.inviteCode : undefined,
    leaderId: team.leaderId,
    createdAt: team.createdAt.toISOString(),
    members: team.members.map((m) => ({
      userId: m.userId,
      name: m.user.name,
      email: m.user.email,
      joinedAt: m.joinedAt.toISOString(),
      isLeader: m.userId === team.leaderId,
    })),
  };
}
