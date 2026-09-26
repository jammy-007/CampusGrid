import { beforeAll, describe, expect, it } from 'vitest';
import { as, makeEvent, makeInstitution, makeUser, resetDb } from './helpers';

const future = (h: number) => new Date(Date.now() + h * 3600_000).toISOString();
const body = {
  title: 'RoboWars',
  type: 'WORKSHOP',
  venue: 'Lab 2',
  startsAt: future(48),
  endsAt: future(50),
  registrationDeadline: future(24),
};

describe('events', () => {
  let inst: string;
  let org: string;
  let org2: string;
  let student: string;
  let admin: string;
  let foreignStudent: string;

  beforeAll(async () => {
    await resetDb();
    inst = (await makeInstitution()).id;
    org = (await makeUser(inst, 'ORGANIZER')).id;
    org2 = (await makeUser(inst, 'ORGANIZER')).id;
    student = (await makeUser(inst, 'STUDENT')).id;
    admin = (await makeUser(inst, 'ADMIN')).id;
    foreignStudent = (await makeUser((await makeInstitution()).id, 'STUDENT')).id;
  });

  it('only organizers and admins create events, as DRAFT', async () => {
    expect((await as(student).post('/api/events').send(body)).status).toBe(403);
    const res = await as(org).post('/api/events').send({ ...body, capacity: 10 });
    expect(res.status).toBe(201);
    expect(res.body.event).toMatchObject({ status: 'DRAFT', organizerId: org, isTeamEvent: false, maxTeamSize: 1, capacity: 10 });
  });

  it('keeps drafts hidden from students and other organizers until published', async () => {
    const { body: created } = await as(org).post('/api/events').send(body);
    const id = created.event.id;
    expect((await as(student).get(`/api/events/${id}`)).status).toBe(404);
    expect((await as(org2).get(`/api/events/${id}`)).status).toBe(404);
    expect((await as(admin).get(`/api/events/${id}`)).status).toBe(200);

    expect((await as(org2).post(`/api/events/${id}/publish`)).status).toBe(403);
    const pub = await as(org).post(`/api/events/${id}/publish`);
    expect(pub.body.event.status).toBe('PUBLISHED');
    expect((await as(student).get(`/api/events/${id}`)).status).toBe(200);
    expect((await as(org).post(`/api/events/${id}/publish`)).body.error.code).toBe('INVALID_STATUS_CHANGE');
  });

  it('students only see PUBLISHED/ONGOING events of their own campus', async () => {
    await makeEvent(inst, org, { title: 'Done', status: 'COMPLETED' });
    const ongoing = await makeEvent(inst, org, { title: 'Live', status: 'ONGOING' });
    const list = await as(student).get('/api/events');
    const statuses = new Set(list.body.events.map((e: { status: string }) => e.status));
    expect([...statuses].every((s) => s === 'PUBLISHED' || s === 'ONGOING')).toBe(true);
    expect(list.body.events.some((e: { id: string }) => e.id === ongoing.id)).toBe(true);
    expect((await as(foreignStudent).get('/api/events')).body.events).toHaveLength(0);
    expect((await as(foreignStudent).get(`/api/events/${ongoing.id}`)).status).toBe(404);
  });

  it('filters by type and upcoming/past', async () => {
    const past = await makeEvent(inst, org, {
      type: 'SYMPOSIUM',
      startsAt: new Date(Date.now() - 10 * 3600_000),
      endsAt: new Date(Date.now() - 8 * 3600_000),
      registrationDeadline: new Date(Date.now() - 20 * 3600_000),
    });
    const pastIds = (await as(student).get('/api/events?when=past')).body.events.map((e: { id: string }) => e.id);
    expect(pastIds).toEqual([past.id]);
    const upcoming = (await as(student).get('/api/events?when=upcoming')).body.events;
    expect(upcoming.some((e: { id: string }) => e.id === past.id)).toBe(false);
    const sym = (await as(student).get('/api/events?type=SYMPOSIUM')).body.events;
    expect(sym.map((e: { id: string }) => e.id)).toEqual([past.id]);
    expect((await as(student).get('/api/events?type=NOPE')).status).toBe(400);
  });

  it('PATCH validates merged dates and forward-only status moves', async () => {
    const e = await makeEvent(inst, org);
    expect((await as(org).patch(`/api/events/${e.id}`).send({ endsAt: future(1) })).status).toBe(400);
    expect((await as(org).patch(`/api/events/${e.id}`).send({ status: 'COMPLETED' })).body.error.code).toBe(
      'INVALID_STATUS_CHANGE',
    );
    const ok = await as(org).patch(`/api/events/${e.id}`).send({ status: 'ONGOING', title: 'Renamed' });
    expect(ok.body.event).toMatchObject({ status: 'ONGOING', title: 'Renamed' });
    expect((await as(org2).patch(`/api/events/${e.id}`).send({ title: 'x' })).status).toBe(403);
  });

  it('deletes only events without registrations', async () => {
    const e = await makeEvent(inst, org);
    await as(student).post(`/api/events/${e.id}/register`);
    expect((await as(org).delete(`/api/events/${e.id}`)).body.error.code).toBe('EVENT_HAS_REGISTRATIONS');
    const empty = await makeEvent(inst, org);
    expect((await as(org).delete(`/api/events/${empty.id}`)).status).toBe(204);
  });
});
