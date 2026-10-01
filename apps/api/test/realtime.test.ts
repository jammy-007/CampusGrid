import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { createServer, type Server as HttpServer } from 'node:http';
import type { AddressInfo } from 'node:net';
import { io as connect, type Socket } from 'socket.io-client';
import { closeIO, getIO, initIO } from '../src/realtime/io';
import { app, authCookie, makeInstitution, makeUser, resetDb } from './helpers';

describe('realtime/io', () => {
  let server: HttpServer;
  let url: string;
  let userId: string;

  beforeAll(async () => {
    await resetDb();
    const inst = await makeInstitution();
    userId = (await makeUser(inst.id)).id;
    server = createServer(app);
    initIO(server);
    await new Promise<void>((r) => server.listen(0, r));
    url = `http://localhost:${(server.address() as AddressInfo).port}`;
  });

  afterAll(async () => {
    await closeIO();
    await new Promise((r) => server.close(r));
  });

  function open(namespace: string, cookie?: string): Promise<Socket> {
    return new Promise((resolve, reject) => {
      const socket = connect(`${url}${namespace}`, {
        transports: ['websocket'],
        extraHeaders: cookie ? { Cookie: cookie } : {},
        reconnection: false,
      });
      socket.on('connect', () => resolve(socket));
      socket.on('connect_error', (err) => {
        socket.close();
        reject(err);
      });
    });
  }

  it('rejects connections without a valid cg_token', async () => {
    await expect(open('/chat')).rejects.toThrow('UNAUTHORIZED');
    await expect(open('/live', 'cg_token=forged')).rejects.toThrow('UNAUTHORIZED');
  });

  it('accepts /chat and /live with the cookie and sets socket.data.user', async () => {
    let seenUserId: string | undefined;
    getIO()
      .of('/live')
      .once('connection', (s) => {
        seenUserId = s.data.user.id;
      });
    const live = await open('/live', authCookie(userId));
    const chat = await open('/chat', authCookie(userId));
    expect(live.connected && chat.connected).toBe(true);
    expect(seenUserId).toBe(userId);
    live.close();
    chat.close();
  });
});
