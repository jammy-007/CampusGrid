import type { Server as HttpServer } from 'node:http';
import { Server, type Socket } from 'socket.io';
import { parse as parseCookie } from 'cookie';
import { AUTH_COOKIE, type SessionUser } from '@campusgrid/shared';
import { env } from '../lib/env';
import { verifyToken } from '../lib/jwt';
import { loadSessionUser } from '../lib/users';
import { registerChat } from './chat';
import { registerLeaderboard } from './leaderboard';

export interface SocketData {
  user: SessionUser;
}

export type AppSocket = Socket<Record<string, never>, Record<string, never>, Record<string, never>, SocketData>;

let io: Server | null = null;

/** Reads cg_token from the handshake cookie and sets socket.data.user; rejects otherwise. */
async function authenticate(socket: Socket, next: (err?: Error) => void) {
  try {
    const cookies = parseCookie(socket.handshake.headers.cookie ?? '');
    const userId = verifyToken(cookies[AUTH_COOKIE]);
    const user = userId ? await loadSessionUser(userId) : null;
    if (!user) return next(new Error('UNAUTHORIZED'));
    (socket.data as SocketData).user = user;
    next();
  } catch (err) {
    next(err instanceof Error ? err : new Error('UNAUTHORIZED'));
  }
}

export function initIO(server: HttpServer): Server {
  io = new Server(server, {
    cors: { origin: env.appUrl, credentials: true },
  });
  // Every namespace (/, /chat, /live) requires a signed-in user.
  io.use(authenticate);
  io.of('/chat').use(authenticate);
  io.of('/live').use(authenticate);

  registerChat(io);
  registerLeaderboard(io);
  return io;
}

/** The Socket.IO server; throws if called before the HTTP server started. */
export function getIO(): Server {
  if (!io) throw new Error('Socket.IO not initialised; call initIO(server) first');
  return io;
}

/** Test hook: close and forget the current server. */
export async function closeIO(): Promise<void> {
  if (io) {
    await io.close();
    io = null;
  }
}
