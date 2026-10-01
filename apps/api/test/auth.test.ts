import { beforeAll, describe, expect, it } from 'vitest';
import request from 'supertest';
import { AUTH_COOKIE } from '@campusgrid/shared';
import { app, makeInstitution, makeUser, PASSWORD, resetDb } from './helpers';

function tokenCookie(res: request.Response): string | undefined {
  const raw = res.headers['set-cookie'] as unknown as string[] | undefined;
  return raw?.find((c) => c.startsWith(`${AUTH_COOKIE}=`));
}

describe('auth', () => {
  let slug: string;
  beforeAll(async () => {
    await resetDb();
    slug = (await makeInstitution('auth-campus')).slug;
  });

  it('lists institutions publicly', async () => {
    const res = await request(app).get('/api/institutions');
    expect(res.status).toBe(200);
    expect(res.body.institutions.map((i: { slug: string }) => i.slug)).toContain(slug);
  });

  it('registers a student, sets an httpOnly SameSite=Lax cookie, and /me returns them', async () => {
    const res = await request(app)
      .post('/api/auth/register')
      .send({ institutionSlug: slug, name: 'Asha', email: 'Asha@Test.edu', password: 'longenough' });
    expect(res.status).toBe(201);
    expect(res.body.user).toMatchObject({ name: 'Asha', email: 'asha@test.edu', role: 'STUDENT' });
    expect(res.body.user.passwordHash).toBeUndefined();

    const cookie = tokenCookie(res);
    expect(cookie).toMatch(/HttpOnly/i);
    expect(cookie).toMatch(/SameSite=Lax/i);
    expect(cookie).toMatch(/Max-Age=604800/);

    const me = await request(app).get('/api/auth/me').set('Cookie', cookie!.split(';')[0]!);
    expect(me.status).toBe(200);
    expect(me.body.user.email).toBe('asha@test.edu');
  });

  it('ignores a role in the register body (always STUDENT)', async () => {
    const res = await request(app)
      .post('/api/auth/register')
      .send({ institutionSlug: slug, name: 'Sneaky', email: 'sneaky@test.edu', password: 'longenough', role: 'ADMIN' });
    expect(res.status).toBe(201);
    expect(res.body.user.role).toBe('STUDENT');
  });

  it('rejects a duplicate email and an unknown institution', async () => {
    const dup = await request(app)
      .post('/api/auth/register')
      .send({ institutionSlug: slug, name: 'Asha 2', email: 'asha@test.edu', password: 'longenough' });
    expect(dup.status).toBe(409);
    expect(dup.body.error.code).toBe('EMAIL_TAKEN');

    const unknown = await request(app)
      .post('/api/auth/register')
      .send({ institutionSlug: 'nope', name: 'X', email: 'x@test.edu', password: 'longenough' });
    expect(unknown.status).toBe(400);
    expect(unknown.body.error.code).toBe('UNKNOWN_INSTITUTION');
  });

  it('returns the contract error shape for invalid input', async () => {
    const res = await request(app).post('/api/auth/register').send({ email: 'not-an-email' });
    expect(res.status).toBe(400);
    expect(res.body).toEqual({
      error: { code: 'VALIDATION_ERROR', message: expect.any(String), details: expect.any(Array) },
    });
  });

  it('logs in with the right password only', async () => {
    const inst = await makeInstitution();
    const user = await makeUser(inst.id, 'ORGANIZER');

    const bad = await request(app).post('/api/auth/login').send({ email: user.email, password: 'wrong-password' });
    expect(bad.status).toBe(401);
    expect(bad.body.error.code).toBe('INVALID_CREDENTIALS');

    const ok = await request(app).post('/api/auth/login').send({ email: user.email.toUpperCase(), password: PASSWORD });
    expect(ok.status).toBe(200);
    expect(ok.body.user).toMatchObject({ id: user.id, role: 'ORGANIZER', institutionId: inst.id });
    expect(tokenCookie(ok)).toBeDefined();
  });

  it('logout clears the cookie', async () => {
    const res = await request(app).post('/api/auth/logout');
    expect(res.status).toBe(204);
    expect(tokenCookie(res)).toMatch(/Expires=Thu, 01 Jan 1970/);
  });

  it('/me is 401 without a cookie or with a forged one', async () => {
    expect((await request(app).get('/api/auth/me')).status).toBe(401);
    const forged = await request(app).get('/api/auth/me').set('Cookie', `${AUTH_COOKIE}=abc.def.ghi`);
    expect(forged.status).toBe(401);
    expect(forged.body.error.code).toBe('UNAUTHORIZED');
  });
});
