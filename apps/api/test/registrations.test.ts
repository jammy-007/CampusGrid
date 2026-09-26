import { afterEach, beforeAll, describe, expect, it } from 'vitest';
import { bus } from '../src/lib/bus';
import { prisma } from '../src/lib/prisma';
import { as, makeEvent, makeInstitution, makeUser, resetDb } from './helpers';

describe('registrations', () => {
  let inst: string;
  let org: string;

  beforeAll(async () => {
    await resetDb();
    inst = (await makeInstitution()).id;
    org = (await makeUser(inst, 'ORGANIZER')).id;
  });
  afterEach(() => bus.removeAllListeners());

  it('registers, is idempotent, cancels and re-registers, emitting bus events', async () => {
    const e = await makeEvent(inst, org);
    const s = (await makeUser(inst)).id;
    const seen: string[] = [];
    bus.on('registration.created', () => void seen.push('created'));
    bus.on('registration.cancelled', () => void seen.push('cancelled'));

    const first = await as(s).post(`/api/events/${e.id}/register`);
    expect(first.status).toBe(201);
    expect((await as(s).post(`/api/events/${e.id}/register`)).status).toBe(200);
    expect((await as(s).delete(`/api/events/${e.id}/register`)).status).toBe(204);
    expect((await as(s).delete(`/api/events/${e.id}/register`)).status).toBe(404);
    const again = await as(s).post(`/api/events/${e.id}/register`);
    expect(again.status).toBe(201);
    expect(again.body.registration.id).toBe(first.body.registration.id);
    expect(seen).toEqual(['created', 'cancelled', 'created']);
  });

  it('rejects non-students, drafts, team events and past deadlines', async () => {
    const s = (await makeUser(inst)).id;
    const judge = (await makeUser(inst, 'JUDGE')).id;
    const e = await makeEvent(inst, org);
    expect((await as(judge).post(`/api/events/${e.id}/register`)).status).toBe(403);

    const draft = await makeEvent(inst, org, { status: 'DRAFT' });
    expect((await as(s).post(`/api/events/${draft.id}/register`)).status).toBe(404);

    const team = await makeEvent(inst, org, { isTeamEvent: true, maxTeamSize: 3 });
    expect((await as(s).post(`/api/events/${team.id}/register`)).body.error.code).toBe('TEAM_EVENT');

    const closed = await makeEvent(inst, org, { registrationDeadline: new Date(Date.now() - 1000) });
    const res = await as(s).post(`/api/events/${closed.id}/register`);
    expect(res.status).toBe(409);
    expect(res.body.error.code).toBe('REGISTRATION_CLOSED');
  });

  it('never oversells capacity under concurrent registrations', async () => {
    const capacity = 5;
    const e = await makeEvent(inst, org, { capacity });
    const students = await Promise.all(Array.from({ length: 20 }, () => makeUser(inst)));

    const results = await Promise.all(students.map((s) => as(s.id).post(`/api/events/${e.id}/register`)));
    const codes = results.map((r) => r.status);
    expect(codes.filter((c) => c === 201)).toHaveLength(capacity);
    expect(results.filter((r) => r.status === 409).every((r) => r.body.error.code === 'EVENT_FULL')).toBe(true);
    expect(await prisma.registration.count({ where: { eventId: e.id, status: 'CONFIRMED' } })).toBe(capacity);
  });

  it('lists registrations for the organizer only, and mine for the student', async () => {
    const e = await makeEvent(inst, org);
    const s = await makeUser(inst);
    await as(s.id).post(`/api/events/${e.id}/register`);

    expect((await as(s.id).get(`/api/events/${e.id}/registrations`)).status).toBe(403);
    const list = await as(org).get(`/api/events/${e.id}/registrations`);
    expect(list.body.registrations).toHaveLength(1);
    expect(list.body.registrations[0].user).toMatchObject({ id: s.id, email: s.email });

    const mine = await as(s.id).get('/api/me/registrations');
    expect(mine.body.registrations.map((r: { eventId: string }) => r.eventId)).toContain(e.id);
    expect(mine.body.registrations[0].event.title).toBeDefined();
  });
});
