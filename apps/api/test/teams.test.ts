import { afterEach, beforeAll, describe, expect, it } from 'vitest';
import { bus } from '../src/lib/bus';
import { prisma } from '../src/lib/prisma';
import { as, makeEvent, makeInstitution, makeUser, resetDb } from './helpers';

describe('teams', () => {
  let inst: string;
  let org: string;

  beforeAll(async () => {
    await resetDb();
    inst = (await makeInstitution()).id;
    org = (await makeUser(inst, 'ORGANIZER')).id;
  });
  afterEach(() => bus.removeAllListeners());

  const hackathon = (overrides = {}) =>
    makeEvent(inst, org, { type: 'HACKATHON', isTeamEvent: true, minTeamSize: 2, maxTeamSize: 3, ...overrides });

  async function createTeam(eventId: string, leaderId: string, name = 'Team') {
    const res = await as(leaderId).post(`/api/events/${eventId}/teams`).send({ name });
    expect(res.status).toBe(201);
    return res.body.team as { id: string; inviteCode: string; members: { userId: string }[] };
  }

  it('creating a team registers the leader and returns an 8-char invite code', async () => {
    const e = await hackathon();
    const leader = (await makeUser(inst)).id;
    const seen: string[] = [];
    bus.on('team.created', (p) => void seen.push(`team.created:${p.leaderId === leader}`));
    bus.on('registration.created', () => void seen.push('registration.created'));

    const team = await createTeam(e.id, leader, 'Null Pointers');
    expect(team.inviteCode).toMatch(/^[A-HJ-NP-Z2-9]{8}$/);
    expect(team.members.map((m) => m.userId)).toEqual([leader]);
    const reg = await prisma.registration.findUniqueOrThrow({ where: { eventId_userId: { eventId: e.id, userId: leader } } });
    expect(reg).toMatchObject({ status: 'CONFIRMED', teamId: team.id });
    expect(seen).toEqual(['registration.created', 'team.created:true']);

    const dupName = await as((await makeUser(inst)).id).post(`/api/events/${e.id}/teams`).send({ name: 'Null Pointers' });
    expect(dupName.body.error.code).toBe('TEAM_NAME_TAKEN');
    const second = await as(leader).post(`/api/events/${e.id}/teams`).send({ name: 'Another' });
    expect(second.body.error.code).toBe('ALREADY_IN_TEAM');
  });

  it('join enforces invite code, one team per event, max size and deadline', async () => {
    const e = await hackathon();
    const [leader, a, b, c] = await Promise.all([1, 2, 3, 4].map(() => makeUser(inst)));
    const team = await createTeam(e.id, leader!.id);
    const joined: string[] = [];
    bus.on('team.member_joined', (p) => void joined.push(p.userId));

    expect((await as(a!.id).post('/api/teams/join').send({ inviteCode: 'ZZZZZZZZ' })).body.error.code).toBe(
      'INVALID_INVITE_CODE',
    );
    const ok = await as(a!.id).post('/api/teams/join').send({ inviteCode: team.inviteCode.toLowerCase() });
    expect(ok.status).toBe(200);
    expect(ok.body.team.members).toHaveLength(2);
    expect((await as(a!.id).post('/api/teams/join').send({ inviteCode: team.inviteCode })).body.error.code).toBe(
      'ALREADY_IN_TEAM',
    );
    expect((await as(b!.id).post('/api/teams/join').send({ inviteCode: team.inviteCode })).status).toBe(200);
    expect((await as(c!.id).post('/api/teams/join').send({ inviteCode: team.inviteCode })).body.error.code).toBe(
      'TEAM_FULL',
    );
    expect(joined).toEqual([a!.id, b!.id]);

    const closed = await hackathon({ registrationDeadline: new Date(Date.now() + 2000) });
    const t2 = await createTeam(closed.id, c!.id);
    await prisma.event.update({ where: { id: closed.id }, data: { registrationDeadline: new Date(Date.now() - 1000) } });
    expect((await as(a!.id).post('/api/teams/join').send({ inviteCode: t2.inviteCode })).body.error.code).toBe(
      'REGISTRATION_CLOSED',
    );
  });

  it('never exceeds maxTeamSize under concurrent joins', async () => {
    const e = await hackathon({ maxTeamSize: 4 });
    const leader = await makeUser(inst);
    const team = await createTeam(e.id, leader.id);
    const joiners = await Promise.all(Array.from({ length: 10 }, () => makeUser(inst)));
    const results = await Promise.all(
      joiners.map((u) => as(u.id).post('/api/teams/join').send({ inviteCode: team.inviteCode })),
    );
    expect(results.filter((r) => r.status === 200)).toHaveLength(3);
    expect(await prisma.teamMember.count({ where: { teamId: team.id } })).toBe(4);
  });

  it('rejects invite codes from another campus', async () => {
    const e = await hackathon();
    const team = await createTeam(e.id, (await makeUser(inst)).id);
    const outsider = await makeUser((await makeInstitution()).id);
    expect((await as(outsider.id).post('/api/teams/join').send({ inviteCode: team.inviteCode })).status).toBe(404);
  });

  it('leader removes members; members leave; the leader leaves last', async () => {
    const e = await hackathon();
    const [leader, a, b] = await Promise.all([1, 2, 3].map(() => makeUser(inst)));
    const team = await createTeam(e.id, leader!.id);
    for (const u of [a!, b!]) await as(u.id).post('/api/teams/join').send({ inviteCode: team.inviteCode });
    const left: string[] = [];
    bus.on('team.member_left', (p) => void left.push(p.userId));

    expect((await as(a!.id).delete(`/api/teams/${team.id}/members/${b!.id}`)).status).toBe(403);
    expect((await as(leader!.id).delete(`/api/teams/${team.id}/members/${leader!.id}`)).body.error.code).toBe(
      'LEADER_HAS_MEMBERS',
    );
    expect((await as(leader!.id).delete(`/api/teams/${team.id}/members/${b!.id}`)).status).toBe(204);
    expect((await as(a!.id).delete(`/api/events/${e.id}/register`)).status).toBe(204);
    expect(left).toEqual([b!.id, a!.id]);

    const regs = await prisma.registration.findMany({ where: { eventId: e.id }, orderBy: { createdAt: 'asc' } });
    expect(regs.map((r) => r.status)).toEqual(['CONFIRMED', 'CANCELLED', 'CANCELLED']);

    expect((await as(leader!.id).delete(`/api/teams/${team.id}/members/${leader!.id}`)).status).toBe(204);
    expect(await prisma.team.findUnique({ where: { id: team.id } })).toBeNull();
  });

  it('shows the invite code to members only; outsiders get 404', async () => {
    const e = await hackathon();
    const [leader, student] = await Promise.all([makeUser(inst), makeUser(inst)]);
    const team = await createTeam(e.id, leader.id);
    expect((await as(leader.id).get(`/api/teams/${team.id}`)).body.team.inviteCode).toBe(team.inviteCode);
    const orgView = await as(org).get(`/api/teams/${team.id}`);
    expect(orgView.status).toBe(200);
    expect(orgView.body.team.inviteCode).toBeUndefined();
    expect((await as(student.id).get(`/api/teams/${team.id}`)).status).toBe(404);
    expect((await as(leader.id).get('/api/me/teams')).body.teams.map((t: { id: string }) => t.id)).toContain(team.id);
  });
});
