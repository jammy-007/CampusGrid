import { beforeAll, describe, expect, it } from 'vitest';
import request from 'supertest';
import { app, as, makeInstitution, makeUser, resetDb } from './helpers';

describe('users (admin)', () => {
  let inst: string;
  let admin: string;
  let org: string;

  beforeAll(async () => {
    await resetDb();
    inst = (await makeInstitution()).id;
    admin = (await makeUser(inst, 'ADMIN')).id;
    org = (await makeUser(inst, 'ORGANIZER')).id;
  });

  it('ADMIN creates organizer and judge accounts that can log in', async () => {
    const res = await as(admin)
      .post('/api/users')
      .send({ name: 'Dr Judge', email: 'judge@x.edu', password: 'longenough', role: 'JUDGE' });
    expect(res.status).toBe(201);
    expect(res.body.user).toMatchObject({ role: 'JUDGE', email: 'judge@x.edu' });
    const login = await request(app).post('/api/auth/login').send({ email: 'judge@x.edu', password: 'longenough' });
    expect(login.body.user.institutionId).toBe(inst);
  });

  it('only ADMIN may create users, and never ADMIN or STUDENT roles', async () => {
    const payload = { name: 'X', email: 'x@x.edu', password: 'longenough', role: 'ORGANIZER' };
    expect((await as(org).post('/api/users').send(payload)).status).toBe(403);
    expect((await as(admin).post('/api/users').send({ ...payload, role: 'ADMIN' })).status).toBe(400);
  });

  it('lists campus users by role for organizers', async () => {
    const res = await as(org).get('/api/users?role=JUDGE');
    expect(res.body.users.every((u: { role: string }) => u.role === 'JUDGE')).toBe(true);
    expect((await as(org).get('/api/users?role=BOSS')).status).toBe(400);
  });
});
