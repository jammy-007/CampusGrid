import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest';
import { createServer, type Server as HttpServer } from 'node:http';
import type { AddressInfo } from 'node:net';
import { io as connect, type Socket } from 'socket.io-client';
import type { ChatAckResult, ChatErrorDTO, ChatMessageDTO, ChatTypingDTO } from '@campusgrid/shared';
import { bus } from '../src/lib/bus';
import { prisma } from '../src/lib/prisma';
import { closeIO, initIO } from '../src/realtime/io';
import { ensureRoom, sendLimiter } from '../src/modules/chat/service';
import { app, as, authCookie, makeEvent, makeInstitution, makeUser, resetDb } from './helpers';

async function waitFor<T>(fn: () => Promise<T | null | undefined | false>, timeout = 3000): Promise<T> {
  const until = Date.now() + timeout;
  for (;;) {
    const v = await fn();
    if (v) return v;
    if (Date.now() > until) throw new Error('waitFor timed out');
    await new Promise((r) => setTimeout(r, 25));
  }
}

function nextEvent<T>(socket: Socket, event: string, timeout = 2000): Promise<T> {
  return new Promise((resolve, reject) => {
    const timer = setTimeout(() => reject(new Error(`no ${event} within ${timeout}ms`)), timeout);
    socket.once(event, (payload: T) => {
      clearTimeout(timer);
      resolve(payload);
    });
  });
}

describe('team chat', () => {
  let server: HttpServer;
  let url: string;
  let inst: string;
  let eventId: string;
  let leader: string;
  let member: string;
  let outsider: string;
  let teamId: string;
  let inviteCode: string;
  const sockets: Socket[] = [];

  beforeAll(async () => {
    await resetDb();
    inst = (await makeInstitution()).id;
    const org = (await makeUser(inst, 'ORGANIZER')).id;
    eventId = (await makeEvent(inst, org, { type: 'HACKATHON', isTeamEvent: true, minTeamSize: 2, maxTeamSize: 4 })).id;
    leader = (await makeUser(inst, 'STUDENT', 'Asha')).id;
    member = (await makeUser(inst, 'STUDENT', 'Priya')).id;
    outsider = (await makeUser(inst, 'STUDENT', 'Ravi')).id;

    server = createServer(app);
    initIO(server); // registers /chat and subscribes chat to the bus
    await new Promise<void>((r) => server.listen(0, r));
    url = `http://localhost:${(server.address() as AddressInfo).port}`;

    const res = await as(leader).post(`/api/events/${eventId}/teams`).send({ name: 'Null Pointers' });
    expect(res.status).toBe(201);
    teamId = res.body.team.id;
    inviteCode = res.body.team.inviteCode;
    expect((await as(member).post('/api/teams/join').send({ inviteCode })).status).toBe(200);
  });

  beforeEach(() => sendLimiter.reset());

  afterAll(async () => {
    sockets.forEach((s) => s.close());
    await closeIO();
    await new Promise((r) => server.close(r));
  });

  function open(userId: string): Promise<Socket> {
    return new Promise((resolve, reject) => {
      const socket = connect(`${url}/chat`, {
        transports: ['websocket'],
        extraHeaders: { Cookie: authCookie(userId) },
        reconnection: false,
      });
      sockets.push(socket);
      socket.on('connect', () => resolve(socket));
      socket.on('connect_error', reject);
    });
  }

  const join = (socket: Socket, id = teamId) =>
    socket.timeout(2000).emitWithAck('chat:join', { teamId: id }) as Promise<ChatAckResult>;

  const systemBodies = async () =>
    (
      await prisma.chatMessage.findMany({
        where: { room: { teamId }, senderId: null },
        orderBy: [{ createdAt: 'asc' }, { id: 'asc' }],
      })
    ).map((m) => m.body);

  it('provisions the room on team.created and posts system messages for joins', async () => {
    const bodies = await waitFor(async () => {
      const b = await systemBodies();
      return b.length >= 2 && b;
    });
    expect(bodies).toEqual(['Team Null Pointers created. Share invite code with teammates.', 'Priya joined the team']);
  });

  it('provisioning is idempotent', async () => {
    bus.emit('team.created', { teamId, eventId, leaderId: leader });
    bus.emit('team.created', { teamId, eventId, leaderId: leader });
    await Promise.all([ensureRoom(teamId), ensureRoom(teamId), ensureRoom(teamId)]);
    await new Promise((r) => setTimeout(r, 100));
    expect(await prisma.chatRoom.count({ where: { teamId } })).toBe(1);
    expect((await systemBodies()).filter((b) => b.startsWith('Team Null Pointers created'))).toHaveLength(1);
  });

  it('creates a missing room lazily when a member opens history', async () => {
    const lazyLeader = (await makeUser(inst)).id;
    const team = await prisma.team.create({
      data: { eventId, name: 'Legacy', inviteCode: 'LEGACY22', leaderId: lazyLeader, members: { create: { userId: lazyLeader } } },
    });
    const res = await as(lazyLeader).get(`/api/teams/${team.id}/chat/messages`);
    expect(res.status).toBe(200);
    expect(await prisma.chatRoom.count({ where: { teamId: team.id } })).toBe(1);
  });

  it('non-members cannot read history; other campuses get 404', async () => {
    expect((await as(outsider).get(`/api/teams/${teamId}/chat/messages`)).status).toBe(403);
    const other = (await makeUser((await makeInstitution()).id)).id;
    expect((await as(other).get(`/api/teams/${teamId}/chat/messages`)).status).toBe(404);
    expect((await as(member).get(`/api/teams/${teamId}/chat/messages?limit=0`)).status).toBe(400);
  });

  it('paginates newest first without skipping messages that share a timestamp', async () => {
    const room = await prisma.chatRoom.findUniqueOrThrow({ where: { teamId } });
    await prisma.chatMessage.deleteMany({ where: { roomId: room.id } });
    const base = new Date('2026-01-01T10:00:00Z').getTime();
    // Messages 2-4 share one timestamp.
    const stamps = [0, 1000, 2000, 2000, 2000, 3000];
    for (const [i, offset] of stamps.entries()) {
      await prisma.chatMessage.create({
        data: { roomId: room.id, senderId: leader, body: `m${i}`, createdAt: new Date(base + offset) },
      });
    }

    const seen: string[] = [];
    let query = '?limit=2';
    for (let page = 0; page < 5; page++) {
      const res = await as(member).get(`/api/teams/${teamId}/chat/messages${query}`);
      expect(res.status).toBe(200);
      const msgs = res.body.messages as ChatMessageDTO[];
      seen.push(...msgs.map((m) => m.body));
      if (!res.body.hasMore) break;
      const last = msgs[msgs.length - 1]!;
      query = `?limit=2&before=${encodeURIComponent(last.createdAt)}&beforeId=${last.id}`;
    }
    expect(seen).toHaveLength(6);
    expect(new Set(seen).size).toBe(6);
    expect(seen[0]).toBe('m5');
    expect(seen[5]).toBe('m0');
    const first = (await as(member).get(`/api/teams/${teamId}/chat/messages`)).body.messages as ChatMessageDTO[];
    expect(first[0]!.sender).toEqual({ id: leader, name: 'Asha' });
  });

  it('non-members cannot join the socket room', async () => {
    const s = await open(outsider);
    const ack = await join(s);
    expect(ack).toMatchObject({ ok: false, error: { code: 'FORBIDDEN' } });
    // Without an ack the server emits chat:error.
    const err = nextEvent<ChatErrorDTO>(s, 'chat:error');
    s.emit('chat:join', { teamId });
    expect((await err).code).toBe('FORBIDDEN');
    const sendErr = nextEvent<ChatErrorDTO>(s, 'chat:error');
    s.emit('chat:send', { teamId, body: 'hi', clientId: 'x1' });
    expect(await sendErr).toMatchObject({ code: 'FORBIDDEN', clientId: 'x1' });
  });

  it('broadcasts messages with clientId and typing to others only', async () => {
    const a = await open(leader);
    const b = await open(member);
    expect(await join(a)).toEqual({ ok: true });
    expect(await join(b)).toEqual({ ok: true });

    const atB = nextEvent<ChatMessageDTO>(b, 'chat:message');
    const atA = nextEvent<ChatMessageDTO>(a, 'chat:message');
    const ack = (await a.timeout(2000).emitWithAck('chat:send', { teamId, body: '  hello team  ', clientId: 'c-1' })) as ChatAckResult<{
      message: ChatMessageDTO;
    }>;
    expect(ack.ok).toBe(true);
    const received = await atB;
    expect(received).toMatchObject({ teamId, body: 'hello team', clientId: 'c-1', sender: { id: leader, name: 'Asha' } });
    expect((await atA).id).toBe(received.id);

    const typingAtB = nextEvent<ChatTypingDTO>(b, 'chat:typing');
    let typingAtA = false;
    a.on('chat:typing', () => (typingAtA = true));
    a.emit('chat:typing', { teamId });
    expect(await typingAtB).toEqual({ teamId, userId: leader, name: 'Asha' });
    await new Promise((r) => setTimeout(r, 100));
    expect(typingAtA).toBe(false);

    const bad = (await a.timeout(2000).emitWithAck('chat:send', { teamId, body: '   ' })) as ChatAckResult;
    expect(bad).toMatchObject({ ok: false, error: { code: 'VALIDATION_ERROR' } });
    const long = (await a.timeout(2000).emitWithAck('chat:send', { teamId, body: 'x'.repeat(2001) })) as ChatAckResult;
    expect(long).toMatchObject({ ok: false, error: { code: 'VALIDATION_ERROR' } });
  });

  it('rate-limits to 10 messages per 10 seconds per user', async () => {
    const a = await open(leader);
    await join(a);
    const results: ChatAckResult[] = [];
    for (let i = 0; i < 11; i++) {
      results.push((await a.timeout(2000).emitWithAck('chat:send', { teamId, body: `burst ${i}` })) as ChatAckResult);
    }
    expect(results.slice(0, 10).every((r) => r.ok)).toBe(true);
    expect(results[10]).toMatchObject({ ok: false, error: { code: 'RATE_LIMITED' } });
  });

  it('drops a removed member from the room and announces it', async () => {
    const third = (await makeUser(inst, 'STUDENT', 'Kiran')).id;
    expect((await as(third).post('/api/teams/join').send({ inviteCode })).status).toBe(200);
    const leaderSocket = await open(leader);
    const thirdSocket = await open(third);
    await join(leaderSocket);
    expect(await join(thirdSocket)).toEqual({ ok: true });

    const kicked = nextEvent<ChatErrorDTO>(thirdSocket, 'chat:error');
    const announced = waitFor(async () => {
      const b = await systemBodies();
      return b.includes('Kiran left the team');
    });
    expect((await as(leader).delete(`/api/teams/${teamId}/members/${third}`)).status).toBeLessThan(300);
    expect(await kicked).toMatchObject({ code: 'FORBIDDEN', teamId });
    await announced;

    let leaked = false;
    thirdSocket.on('chat:message', () => (leaked = true));
    await leaderSocket.timeout(2000).emitWithAck('chat:send', { teamId, body: 'after removal' });
    await new Promise((r) => setTimeout(r, 150));
    expect(leaked).toBe(false);
    expect((await as(third).get(`/api/teams/${teamId}/chat/messages`)).status).toBe(403);
  });
});
