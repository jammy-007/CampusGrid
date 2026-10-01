import { beforeAll, describe, expect, it } from 'vitest';
import express from 'express';
import cookieParser from 'cookie-parser';
import request from 'supertest';
import { requireAuth, requireEventOrganizer, requireRole } from '../src/middleware/auth';
import { errorHandler } from '../src/middleware/error';
import { authCookie, makeEvent, makeInstitution, makeUser, resetDb } from './helpers';

/** A tiny app exercising the guards exactly as module routers use them. */
const guarded = express();
guarded.use(cookieParser());
guarded.get('/any', requireAuth, (req, res) => void res.json({ user: req.user }));
guarded.get('/staff', requireAuth, requireRole('ORGANIZER', 'ADMIN'), (_req, res) => void res.json({ ok: true }));
guarded.get('/events/:eventId/manage', requireAuth, requireEventOrganizer(), (_req, res) => void res.json({ ok: true }));
guarded.get('/other/:id', requireAuth, requireEventOrganizer('id'), (_req, res) => void res.json({ ok: true }));
guarded.use(errorHandler);

const get = (url: string, userId?: string) => {
  const r = request(guarded).get(url);
  return userId ? r.set('Cookie', authCookie(userId)) : r;
};

describe('RBAC guards', () => {
  let student: { id: string };
  let organizer: { id: string };
  let otherOrganizer: { id: string };
  let admin: { id: string };
  let foreignAdmin: { id: string };
  let eventId: string;

  beforeAll(async () => {
    await resetDb();
    const inst = await makeInstitution();
    const other = await makeInstitution();
    student = await makeUser(inst.id, 'STUDENT');
    organizer = await makeUser(inst.id, 'ORGANIZER');
    otherOrganizer = await makeUser(inst.id, 'ORGANIZER');
    admin = await makeUser(inst.id, 'ADMIN');
    foreignAdmin = await makeUser(other.id, 'ADMIN');
    eventId = (await makeEvent(inst.id, organizer.id)).id;
  });

  it('requireAuth sets req.user with the contract fields', async () => {
    const res = await get('/any', student.id);
    expect(res.status).toBe(200);
    expect(Object.keys(res.body.user).sort()).toEqual(['email', 'id', 'institutionId', 'name', 'role']);
  });

  it('requireAuth is 401 when signed out', async () => {
    const res = await get('/any');
    expect(res.status).toBe(401);
    expect(res.body.error.code).toBe('UNAUTHORIZED');
  });

  it('requireRole is 403 for other roles', async () => {
    expect((await get('/staff', student.id)).status).toBe(403);
    expect((await get('/staff', organizer.id)).status).toBe(200);
    expect((await get('/staff', admin.id)).status).toBe(200);
  });

  it('requireEventOrganizer allows the organizer and same-campus ADMIN only', async () => {
    expect((await get(`/events/${eventId}/manage`, organizer.id)).status).toBe(200);
    expect((await get(`/events/${eventId}/manage`, admin.id)).status).toBe(200);
    expect((await get(`/events/${eventId}/manage`, otherOrganizer.id)).status).toBe(403);
    expect((await get(`/events/${eventId}/manage`, student.id)).status).toBe(403);
  });

  it('requireEventOrganizer hides other campuses’ events (404)', async () => {
    expect((await get(`/events/${eventId}/manage`, foreignAdmin.id)).status).toBe(404);
    expect((await get(`/events/does-not-exist/manage`, organizer.id)).status).toBe(404);
  });

  it('requireEventOrganizer reads a custom param name', async () => {
    expect((await get(`/other/${eventId}`, organizer.id)).status).toBe(200);
    expect((await get(`/other/${eventId}`, otherOrganizer.id)).status).toBe(403);
  });
});
