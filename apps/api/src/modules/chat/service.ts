import type { Prisma } from '@prisma/client';
import { CHAT_RATE_LIMIT, type ChatHistoryDTO, type ChatHistoryQuery, type ChatMessageDTO } from '@campusgrid/shared';
import { bus } from '../../lib/bus';
import { prisma } from '../../lib/prisma';
import { getIO } from '../../realtime/io';
import { SlidingWindowLimiter } from './rateLimit';

export const sendLimiter = new SlidingWindowLimiter(CHAT_RATE_LIMIT.max, CHAT_RATE_LIMIT.windowMs);

export const teamRoom = (teamId: string) => `team:${teamId}`;
export const userRoom = (userId: string) => `user:${userId}`;

const messageInclude = {
  room: { select: { teamId: true } },
  sender: { select: { id: true, name: true } },
} satisfies Prisma.ChatMessageInclude;

type MessageRow = Prisma.ChatMessageGetPayload<{ include: typeof messageInclude }>;

export function toMessageDTO(m: MessageRow, clientId?: string): ChatMessageDTO {
  return {
    id: m.id,
    teamId: m.room.teamId,
    sender: m.sender ? { id: m.sender.id, name: m.sender.name } : null,
    body: m.body,
    createdAt: m.createdAt.toISOString(),
    ...(clientId ? { clientId } : {}),
  };
}

export async function isTeamMember(teamId: string, userId: string): Promise<boolean> {
  const member = await prisma.teamMember.findUnique({
    where: { teamId_userId: { teamId, userId } },
    select: { userId: true },
  });
  return member !== null;
}

/** The /chat namespace when the socket server is running (not in HTTP-only tests). */
function chatNamespace() {
  try {
    return getIO().of('/chat');
  } catch {
    return null;
  }
}

/**
 * Creates the team's room if missing (idempotent, race-safe) and returns its id.
 * A newly created room gets the "Team created" system message.
 */
export async function ensureRoom(teamId: string): Promise<string | null> {
  const existing = await prisma.chatRoom.findUnique({ where: { teamId }, select: { id: true } });
  if (existing) return existing.id;

  const team = await prisma.team.findUnique({ where: { id: teamId }, select: { name: true } });
  if (!team) return null;
  const { count } = await prisma.chatRoom.createMany({ data: [{ teamId }], skipDuplicates: true });
  const room = await prisma.chatRoom.findUnique({ where: { teamId }, select: { id: true } });
  if (!room) return null;
  if (count === 1) {
    await postSystemMessage(teamId, `Team ${team.name} created. Share invite code with teammates.`, room.id);
  }
  return room.id;
}

/** Persists a message and broadcasts it to the team room. */
export async function createMessage(teamId: string, senderId: string | null, body: string, clientId?: string) {
  const roomId = await ensureRoom(teamId);
  if (!roomId) return null;
  return insertAndBroadcast(roomId, senderId, body, clientId);
}

async function postSystemMessage(teamId: string, body: string, roomId?: string) {
  const id = roomId ?? (await ensureRoom(teamId));
  if (!id) return null;
  return insertAndBroadcast(id, null, body);
}

async function insertAndBroadcast(roomId: string, senderId: string | null, body: string, clientId?: string) {
  const row = await prisma.chatMessage.create({ data: { roomId, senderId, body }, include: messageInclude });
  const dto = toMessageDTO(row, clientId);
  chatNamespace()?.to(teamRoom(dto.teamId)).emit('chat:message', dto);
  return dto;
}

/** History page, newest first. (createdAt, id) is the sort key so equal timestamps never skip messages. */
export async function listMessages(teamId: string, q: ChatHistoryQuery): Promise<ChatHistoryDTO> {
  const where: Prisma.ChatMessageWhereInput = { room: { teamId } };
  if (q.before) {
    where.OR = q.beforeId
      ? [{ createdAt: { lt: q.before } }, { createdAt: q.before, id: { lt: q.beforeId } }]
      : [{ createdAt: { lt: q.before } }];
  }
  const rows = await prisma.chatMessage.findMany({
    where,
    include: messageInclude,
    orderBy: [{ createdAt: 'desc' }, { id: 'desc' }],
    take: q.limit + 1,
  });
  return { messages: rows.slice(0, q.limit).map((r) => toMessageDTO(r)), hasMore: rows.length > q.limit };
}

async function userName(userId: string) {
  const user = await prisma.user.findUnique({ where: { id: userId }, select: { name: true } });
  return user?.name ?? 'Someone';
}

let unsubscribe: (() => void) | null = null;

/** Subscribes chat provisioning to team events on the bus. Idempotent; returns an unsubscribe function. */
export function subscribeChatToBus(): () => void {
  if (unsubscribe) return unsubscribe;
  const offs = [
    bus.on('team.created', async ({ teamId }) => {
      await ensureRoom(teamId);
    }),
    bus.on('team.member_joined', async ({ teamId, userId }) => {
      await postSystemMessage(teamId, `${await userName(userId)} joined the team`);
    }),
    bus.on('team.member_left', async ({ teamId, userId }) => {
      // Cut the removed member off before announcing it, so they don't receive it.
      const nsp = chatNamespace();
      if (nsp) {
        nsp.in(userRoom(userId)).socketsLeave(teamRoom(teamId));
        nsp.to(userRoom(userId)).emit('chat:error', {
          code: 'FORBIDDEN',
          message: 'You are no longer a member of this team',
          teamId,
        });
      }
      await postSystemMessage(teamId, `${await userName(userId)} left the team`);
    }),
  ];
  unsubscribe = () => {
    offs.forEach((off) => off());
    unsubscribe = null;
  };
  return unsubscribe;
}
