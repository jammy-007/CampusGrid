import type { Server, Socket } from 'socket.io';
import {
  type LeaderboardDTO,
  liveSubscribeSchema,
  type SessionUser,
} from '@campusgrid/shared';
import { bus } from '../lib/bus';
import { prisma } from '../lib/prisma';
import { fetchAndComputeLeaderboard } from '../modules/leaderboard/service';

interface LiveServerToClientEvents {
  'leaderboard:update': (leaderboard: LeaderboardDTO) => void;
  'checkin:count': (data: { eventId: string; checkedIn: number; registered: number }) => void;
}

interface LiveClientToServerEvents {
  'live:subscribe': (data: { eventId: string }) => void;
}

type LiveSocket = Socket<
  LiveClientToServerEvents,
  LiveServerToClientEvents,
  Record<string, never>,
  { user: SessionUser }
>;

const debounceTimers = new Map<string, NodeJS.Timeout>();

export function registerLeaderboard(io: Server): void {
  const nsp = io.of('/live');

  // Listen for score updates across the institution
  bus.on('score.updated', ({ eventId }) => {
    const existing = debounceTimers.get(eventId);
    if (existing) clearTimeout(existing);

    const timer = setTimeout(async () => {
      debounceTimers.delete(eventId);
      try {
        const leaderboard = await fetchAndComputeLeaderboard(eventId);
        if (leaderboard) {
          nsp.to(`event:${eventId}`).emit('leaderboard:update', leaderboard);
        }
      } catch (err) {
        console.error('[live:leaderboard] Failed to broadcast leaderboard update:', err);
      }
    }, 1000);

    debounceTimers.set(eventId, timer);
  });

  nsp.on('connection', (raw) => {
    const socket = raw as unknown as LiveSocket;
    const user = socket.data.user;

    socket.on('live:subscribe', async (payload: unknown) => {
      try {
        const parsed = liveSubscribeSchema.safeParse(payload);
        if (!parsed.success) return;

        const { eventId } = parsed.data;

        // Verify event exists and matches user's institution
        const event = await prisma.event.findFirst({
          where: { id: eventId, institutionId: user.institutionId },
        });
        if (!event) return;

        const room = `event:${eventId}`;
        await socket.join(room);

        // Send initial leaderboard state immediately to subscriber
        const leaderboard = await fetchAndComputeLeaderboard(eventId, user.institutionId);
        if (leaderboard) {
          socket.emit('leaderboard:update', leaderboard);
        }
      } catch (err) {
        console.error('[live:subscribe] Error handling subscribe:', err);
      }
    });
  });
}
