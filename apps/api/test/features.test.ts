import { beforeEach, describe, expect, it } from 'vitest';
import request from 'supertest';
import { app, as, makeEvent, makeInstitution, makeUser, resetDb } from './helpers';
import { prisma } from '../src/lib/prisma';

describe('Extended CampusGrid Modules — Announcements, Feedback, Waitlists, Verify & CSV Safety', () => {
  beforeEach(async () => {
    await resetDb();
  });

  it('allows organizers to broadcast announcements and students to read them, blocking student posts', async () => {
    const inst = await makeInstitution();
    const org = await makeUser(inst.id, 'ORGANIZER', 'Olivia Org');
    const student = await makeUser(inst.id, 'STUDENT', 'Sam Student');
    const event = await makeEvent(inst.id, org.id);

    const forbiddenPost = await as(student.id)
      .post(`/api/events/${event.id}/announcements`)
      .send({ title: 'Unauthorized', body: 'Should fail', priority: 'INFO' });
    expect(forbiddenPost.status).toBe(403);

    const created = await as(org.id)
      .post(`/api/events/${event.id}/announcements`)
      .send({ title: 'Gate B Open', body: 'Check-out scanning has started.', priority: 'URGENT' });
    expect(created.status).toBe(201);
    expect(created.body.announcement.title).toBe('Gate B Open');
    expect(created.body.announcement.priority).toBe('URGENT');

    const listed = await as(student.id).get(`/api/events/${event.id}/announcements`);
    expect(listed.status).toBe(200);
    expect(listed.body.announcements).toHaveLength(1);
    expect(listed.body.announcements[0].authorName).toBe('Olivia Org');
  });

  it('allows confirmed students to submit and update event feedback, computing average rating', async () => {
    const inst = await makeInstitution();
    const org = await makeUser(inst.id, 'ORGANIZER');
    const s1 = await makeUser(inst.id, 'STUDENT', 'Student One');
    const s2 = await makeUser(inst.id, 'STUDENT', 'Student Two');
    const outsider = await makeUser(inst.id, 'STUDENT', 'Outsider');
    const event = await makeEvent(inst.id, org.id, { status: 'COMPLETED' });

    await prisma.registration.createMany({
      data: [
        { eventId: event.id, userId: s1.id, status: 'CONFIRMED' },
        { eventId: event.id, userId: s2.id, status: 'CONFIRMED' },
      ],
    });

    const blocked = await as(outsider.id)
      .post(`/api/events/${event.id}/feedback`)
      .send({ rating: 5, comment: 'Never registered' });
    expect(blocked.status).toBe(403);

    const r1 = await as(s1.id)
      .post(`/api/events/${event.id}/feedback`)
      .send({ rating: 4, comment: 'Great event!' });
    expect(r1.status).toBe(201);

    const r2 = await as(s2.id)
      .post(`/api/events/${event.id}/feedback`)
      .send({ rating: 5, comment: 'Loved it!' });
    expect(r2.status).toBe(201);

    // Upsert updates existing rating
    const updated = await as(s1.id)
      .post(`/api/events/${event.id}/feedback`)
      .send({ rating: 5, comment: 'Updated to 5 stars!' });
    expect(updated.status).toBe(201);

    const summary = await as(s1.id).get(`/api/events/${event.id}/feedback`);
    expect(summary.status).toBe(200);
    expect(summary.body.totalCount).toBe(2);
    expect(summary.body.averageRating).toBe(5);
    expect(summary.body.myFeedback.comment).toBe('Updated to 5 stars!');
  });

  it('places overflow students on WAITLISTED and auto-promotes when a confirmed student cancels', async () => {
    const inst = await makeInstitution();
    const org = await makeUser(inst.id, 'ORGANIZER');
    const s1 = await makeUser(inst.id, 'STUDENT', 'First');
    const s2 = await makeUser(inst.id, 'STUDENT', 'Second');
    const event = await makeEvent(inst.id, org.id, { capacity: 1 });

    const reg1 = await as(s1.id).post(`/api/events/${event.id}/register`);
    expect(reg1.status).toBe(201);
    expect(reg1.body.registration.status).toBe('CONFIRMED');

    const reg2 = await as(s2.id).post(`/api/events/${event.id}/register`);
    expect(reg2.status).toBe(201);
    expect(reg2.body.registration.status).toBe('WAITLISTED');

    // First student cancels -> Second student is auto-promoted
    const cancel = await as(s1.id).delete(`/api/events/${event.id}/register`);
    expect(cancel.status).toBe(204);

    const promoted = await prisma.registration.findUniqueOrThrow({
      where: { eventId_userId: { eventId: event.id, userId: s2.id } },
    });
    expect(promoted.status).toBe('CONFIRMED');
  });

  it('escapes CSV formula-injection prefixes in attendance export', async () => {
    const inst = await makeInstitution();
    const org = await makeUser(inst.id, 'ORGANIZER');
    const student = await makeUser(inst.id, 'STUDENT', '=HYPERLINK("http://evil")');
    const event = await makeEvent(inst.id, org.id, { status: 'ONGOING' });

    await prisma.registration.create({
      data: { eventId: event.id, userId: student.id, status: 'CONFIRMED' },
    });

    const csvRes = await as(org.id).get(`/api/events/${event.id}/attendance?format=csv`);
    expect(csvRes.status).toBe(200);
    expect(csvRes.text).toContain("'=HYPERLINK");
  });

  it('verifies public certificates via /api/verify/:code and returns 404 for unknown codes', async () => {
    const inst = await makeInstitution();
    const org = await makeUser(inst.id, 'ORGANIZER', 'Olivia');
    const student = await makeUser(inst.id, 'STUDENT', 'Priya');
    const event = await makeEvent(inst.id, org.id, {
      status: 'COMPLETED',
      checkoutOpensAt: new Date(Date.now() - 60_000),
    });

    const reg = await prisma.registration.create({
      data: { eventId: event.id, userId: student.id, status: 'CONFIRMED' },
    });
    await prisma.checkIn.create({
      data: {
        registrationId: reg.id,
        eventId: event.id,
        scannedById: org.id,
        scannedAt: new Date(Date.now() - 120_000),
        deviceId: 'dev-1',
        clientScanId: 'scan-in-1',
        checkedOutAt: new Date(Date.now() - 30_000),
        checkedOutById: org.id,
        checkoutDeviceId: 'dev-1',
        checkoutClientScanId: 'scan-out-1',
      },
    });

    const claim = await as(student.id).post(`/api/registrations/${reg.id}/certificate/claim`);
    expect(claim.status).toBe(201);
    const verifyCode = claim.body.certificate.verifyCode as string;

    // Public verification needs no auth cookie
    const verifyRes = await request(app).get(`/api/verify/${verifyCode}`);
    expect(verifyRes.status).toBe(200);
    expect(verifyRes.body.valid).toBe(true);
    expect(verifyRes.body.certificate.studentName).toBe('Priya');

    const missing = await request(app).get('/api/verify/INVALID999');
    expect(missing.status).toBe(404);

    // Cumulative OD transcript PDF downloads cleanly
    const transcript = await as(student.id).get('/api/me/transcript/pdf');
    expect(transcript.status).toBe(200);
    expect(transcript.headers['content-type']).toContain('application/pdf');
  });
});
