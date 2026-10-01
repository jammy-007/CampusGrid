import type { Server, Socket } from 'socket.io';
import {
  chatJoinSchema,
  chatSendSchema,
  chatTypingSchema,
  type ChatAckResult,
  type ChatClientToServerEvents,
  type ChatErrorDTO,
  type ChatServerToClientEvents,
  type SessionUser,
} from '@campusgrid/shared';
import {
  createMessage,
  ensureRoom,
  isTeamMember,
  sendLimiter,
  subscribeChatToBus,
  teamRoom,
  userRoom,
} from '../modules/chat/service';

type ChatSocket = Socket<ChatClientToServerEvents, ChatServerToClientEvents, Record<string, never>, { user: SessionUser }>;

/**
 * Namespace /chat (Agent 3). socket.data.user is set by realtime/io.ts.
 * Each socket also joins user:<id> so a removed member's sockets can be dropped from the team room.
 */
export function registerChat(io: Server): void {
  subscribeChatToBus();
  const nsp = io.of('/chat');

  nsp.on('connection', (raw) => {
    const socket = raw as unknown as ChatSocket;
    const user = socket.data.user;
    void socket.join(userRoom(user.id));

    /** Replies on the ack when the client passed one, else emits chat:error. */
    function fail(error: ChatErrorDTO, ack?: (res: ChatAckResult<never>) => void) {
      if (typeof ack === 'function') ack({ ok: false, error });
      else socket.emit('chat:error', error);
    }

    socket.on('chat:join', async (payload, ack) => {
      try {
        const parsed = chatJoinSchema.safeParse(payload);
        if (!parsed.success) return fail({ code: 'VALIDATION_ERROR', message: 'teamId is required' }, ack);
        const { teamId } = parsed.data;
        if (!(await isTeamMember(teamId, user.id))) {
          return fail({ code: 'FORBIDDEN', message: 'Only team members can join this chat', teamId }, ack);
        }
        await ensureRoom(teamId);
        await socket.join(teamRoom(teamId));
        if (typeof ack === 'function') ack({ ok: true });
      } catch (err) {
        console.error('[chat] join failed', err);
        fail({ code: 'INTERNAL', message: 'Could not join the chat' }, ack);
      }
    });

    socket.on('chat:send', async (payload, ack) => {
      const clientId = typeof payload?.clientId === 'string' ? payload.clientId : undefined;
      const teamId = typeof payload?.teamId === 'string' ? payload.teamId : undefined;
      try {
        const parsed = chatSendSchema.safeParse(payload);
        if (!parsed.success) {
          const message = parsed.error.issues[0]?.message ?? 'Invalid message';
          return fail({ code: 'VALIDATION_ERROR', message, teamId, clientId }, ack);
        }
        const input = parsed.data;
        if (!sendLimiter.hit(user.id)) {
          const seconds = Math.ceil(sendLimiter.retryAfter(user.id) / 1000);
          return fail(
            { code: 'RATE_LIMITED', message: `Slow down: try again in ${seconds}s`, teamId: input.teamId, clientId },
            ack,
          );
        }
        if (!(await isTeamMember(input.teamId, user.id))) {
          void socket.leave(teamRoom(input.teamId));
          return fail({ code: 'FORBIDDEN', message: 'Only team members can send here', teamId: input.teamId, clientId }, ack);
        }
        const message = await createMessage(input.teamId, user.id, input.body, input.clientId);
        if (!message) return fail({ code: 'FORBIDDEN', message: 'Team not found', teamId: input.teamId, clientId }, ack);
        if (typeof ack === 'function') ack({ ok: true, message });
      } catch (err) {
        console.error('[chat] send failed', err);
        fail({ code: 'INTERNAL', message: 'Message not sent', teamId, clientId }, ack);
      }
    });

    socket.on('chat:typing', (payload) => {
      const parsed = chatTypingSchema.safeParse(payload);
      if (!parsed.success) return;
      const room = teamRoom(parsed.data.teamId);
      // Only sockets that passed the membership check on chat:join are in the room.
      if (!socket.rooms.has(room)) return;
      socket.to(room).emit('chat:typing', { teamId: parsed.data.teamId, userId: user.id, name: user.name });
    });
  });
}
