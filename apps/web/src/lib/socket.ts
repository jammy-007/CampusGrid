'use client';

import { io, type Socket } from 'socket.io-client';

const WS_URL = process.env.NEXT_PUBLIC_WS_URL ?? 'http://localhost:4000';
const sockets = new Map<string, Socket>();

/**
 * One shared, cookie-authenticated Socket.IO connection per namespace ('/chat', '/live').
 * The server rejects the connection with 'UNAUTHORIZED' when not signed in.
 */
export function getSocket(namespace: '/chat' | '/live' | (string & {})): Socket {
  let socket = sockets.get(namespace);
  if (!socket) {
    socket = io(`${WS_URL}${namespace}`, { withCredentials: true, transports: ['websocket', 'polling'] });
    sockets.set(namespace, socket);
  }
  return socket;
}

/** Call on logout so the next getSocket() reconnects with the new cookie. */
export function disconnectSockets(): void {
  for (const socket of sockets.values()) socket.disconnect();
  sockets.clear();
}
