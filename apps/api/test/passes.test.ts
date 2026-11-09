import { beforeEach, describe, expect, it } from 'vitest';
import request from 'supertest';
import { app, as, makeEvent, makeInstitution, makeUser, resetDb } from './helpers';
import { prisma } from '../src/lib/prisma';
import { verifyPassToken } from '../src/modules/passes/passCrypto';

describe('Agent 2 — Passes, Check-in & Certificates API', () => {
  beforeEach(async () => {
    await resetDb();
  });

  it('generates a signed dynamic pass token for confirmed registration', async () => {
    const inst = await makeInstitution();
    const organizer = await makeUser(inst.id, 'ORGANIZER');
    const student = await makeUser(inst.id, 'STUDENT', 'Alice');
    const event = await makeEvent(inst.id, organizer.id);

    const registration = await prisma.registration.create({
      data: {
        eventId: event.id,
        userId: student.id,
        status: 'CONFIRMED',
      },
    });

    const res = await as(student.id).get(`/api/passes/${registration.id}/token`);
    expect(res.status).toBe(200);
    expect(res.body.token).toBeDefined();
    expect(res.body.expiresIn).toBe(60);

    const verified = verifyPassToken(res.body.token, { eventId: event.id });
    expect(verified.valid).toBe(true);
    expect(verified.payload?.rid).toBe(registration.id);
    expect(verified.payload?.name).toBe('Alice');
    expect(verified.payload?.eid).toBe(event.id);
  });

  it('rejects pass token requests from other users', async () => {
    const inst = await makeInstitution();
    const organizer = await makeUser(inst.id, 'ORGANIZER');
    const student1 = await makeUser(inst.id, 'STUDENT', 'Alice');
    const student2 = await makeUser(inst.id, 'STUDENT', 'Bob');
    const event = await makeEvent(inst.id, organizer.id);

    const registration = await prisma.registration.create({
      data: {
        eventId: event.id,
        userId: student1.id,
        status: 'CONFIRMED',
      },
    });

    const res = await as(student2.id).get(`/api/passes/${registration.id}/token`);
    expect(res.status).toBe(403);
  });

  it('serves the offline scanner bundle with public key and registrations', async () => {
    const inst = await makeInstitution();
    const organizer = await makeUser(inst.id, 'ORGANIZER');
    const student = await makeUser(inst.id, 'STUDENT', 'Charlie');
    const event = await makeEvent(inst.id, organizer.id);

    const registration = await prisma.registration.create({
      data: {
        eventId: event.id,
        userId: student.id,
        status: 'CONFIRMED',
      },
    });

    const res = await as(organizer.id).get(`/api/events/${event.id}/checkin/bundle`);
    expect(res.status).toBe(200);
    expect(res.body.publicKey).toBeDefined();
    expect(res.body.eventId).toBe(event.id);
    expect(res.body.registrations).toHaveLength(1);
    expect(res.body.registrations[0].rid).toBe(registration.id);
    expect(res.body.alreadyCheckedIn).toEqual([]);
  });

  it('handles sync idempotency and records earliest check-in when two devices scan same pass', async () => {
    const inst = await makeInstitution();
    const organizer = await makeUser(inst.id, 'ORGANIZER');
    const student = await makeUser(inst.id, 'STUDENT', 'David');
    const event = await makeEvent(inst.id, organizer.id);

    const registration = await prisma.registration.create({
      data: {
        eventId: event.id,
        userId: student.id,
        status: 'CONFIRMED',
      },
    });

    const scanTime1 = new Date(Date.now() - 5000).toISOString();
    const scanTime2 = new Date(Date.now() - 1000).toISOString();

    // Device 1 scans
    const sync1 = await as(organizer.id)
      .post('/api/checkin/sync')
      .send({
        scans: [
          {
            clientScanId: 'scan-dev1-001',
            rid: registration.id,
            scannedAt: scanTime1,
            deviceId: 'scanner-phone-1',
          },
        ],
      });

    expect(sync1.status).toBe(200);
    expect(sync1.body.results[0].status).toBe('ACCEPTED');

    // Duplicate sync with same clientScanId (idempotent)
    const syncIdempotent = await as(organizer.id)
      .post('/api/checkin/sync')
      .send({
        scans: [
          {
            clientScanId: 'scan-dev1-001',
            rid: registration.id,
            scannedAt: scanTime1,
            deviceId: 'scanner-phone-1',
          },
        ],
      });

    expect(syncIdempotent.status).toBe(200);
    expect(syncIdempotent.body.results[0].status).toBe('ACCEPTED');

    // Device 2 scans the same pass later
    const sync2 = await as(organizer.id)
      .post('/api/checkin/sync')
      .send({
        scans: [
          {
            clientScanId: 'scan-dev2-002',
            rid: registration.id,
            scannedAt: scanTime2,
            deviceId: 'scanner-phone-2',
          },
        ],
      });

    expect(sync2.status).toBe(200);
    expect(sync2.body.results[0].status).toBe('ALREADY_CHECKED_IN');

    // Confirm only 1 check-in exists in database and has the earliest timestamp
    const checkIns = await prisma.checkIn.findMany({
      where: { registrationId: registration.id },
    });
    expect(checkIns).toHaveLength(1);
    expect(checkIns[0].scannedAt.toISOString()).toBe(scanTime1);
  });

  it('exports attendance as CSV and JSON', async () => {
    const inst = await makeInstitution();
    const organizer = await makeUser(inst.id, 'ORGANIZER');
    const student = await makeUser(inst.id, 'STUDENT', 'Eva');
    const event = await makeEvent(inst.id, organizer.id);

    const reg = await prisma.registration.create({
      data: {
        eventId: event.id,
        userId: student.id,
        status: 'CONFIRMED',
      },
    });

    await prisma.checkIn.create({
      data: {
        registrationId: reg.id,
        eventId: event.id,
        scannedById: organizer.id,
        scannedAt: new Date(),
        deviceId: 'device-test',
        clientScanId: 'scan-test-csv',
      },
    });

    // JSON format
    const jsonRes = await as(organizer.id).get(`/api/events/${event.id}/attendance`);
    expect(jsonRes.status).toBe(200);
    expect(jsonRes.body.checkedInCount).toBe(1);
    expect(jsonRes.body.checkedOutCount).toBe(0);
    expect(jsonRes.body.attendees[0].checkedIn).toBe(true);
    expect(jsonRes.body.attendees[0].checkedOut).toBe(false);

    // CSV format
    const csvRes = await as(organizer.id).get(`/api/events/${event.id}/attendance?format=csv`);
    expect(csvRes.status).toBe(200);
    expect(csvRes.headers['content-type']).toContain('text/csv');
    expect(csvRes.text).toContain('Name,USN,Email,Team,Checked In At,Scanned By,Checked Out At,Checked Out By');
    expect(csvRes.text).toContain('Eva');
  });

  it('requires both check-in and check-out (after checkoutOpensAt) to claim or issue OD certificates', async () => {
    const inst = await makeInstitution();
    const organizer = await makeUser(inst.id, 'ORGANIZER');
    const student = await makeUser(inst.id, 'STUDENT', 'Frank');
    const checkoutOpensAt = new Date(Date.now() + 60_000); // 1 min in the future
    const event = await makeEvent(inst.id, organizer.id, { status: 'ONGOING' });
    await prisma.event.update({
      where: { id: event.id },
      data: { checkoutOpensAt },
    });

    const reg = await prisma.registration.create({
      data: {
        eventId: event.id,
        userId: student.id,
        status: 'CONFIRMED',
      },
    });

    // 1. Attempting CHECK_OUT before CHECK_IN fails with NOT_CHECKED_IN
    const earlyCheckoutNoCheckin = await as(organizer.id)
      .post('/api/checkin/sync')
      .send({
        scans: [
          {
            clientScanId: 'scan-out-no-in',
            rid: reg.id,
            scannedAt: new Date(checkoutOpensAt.getTime() + 5000).toISOString(),
            deviceId: 'device-test',
            scanType: 'CHECK_OUT',
          },
        ],
      });
    expect(earlyCheckoutNoCheckin.status).toBe(200);
    expect(earlyCheckoutNoCheckin.body.results[0].status).toBe('NOT_CHECKED_IN');

    // 2. Record entry CHECK_IN
    await prisma.checkIn.create({
      data: {
        registrationId: reg.id,
        eventId: event.id,
        scannedById: organizer.id,
        scannedAt: new Date(),
        deviceId: 'device-test',
        clientScanId: 'scan-test-cert',
      },
    });

    // 3. Student cannot claim certificate with only CHECK_IN (no CHECK_OUT yet)
    const prematureClaim = await as(student.id).post(`/api/events/${event.id}/certificates/claim`);
    expect(prematureClaim.status).toBe(400);
    expect(prematureClaim.body.error.code).toBe('CHECKOUT_REQUIRED');

    // Organizer bulk issue also issues 0 certificates when student hasn't checked out
    const prematureIssue = await as(organizer.id).post(`/api/events/${event.id}/certificates/issue`);
    expect(prematureIssue.status).toBe(200);
    expect(prematureIssue.body.count).toBe(0);

    // 4. Attempting CHECK_OUT before checkoutOpensAt fails with CHECKOUT_TOO_EARLY
    const tooEarlyCheckout = await as(organizer.id)
      .post('/api/checkin/sync')
      .send({
        scans: [
          {
            clientScanId: 'scan-out-early',
            rid: reg.id,
            scannedAt: new Date(checkoutOpensAt.getTime() - 10_000).toISOString(),
            deviceId: 'device-test',
            scanType: 'CHECK_OUT',
          },
        ],
      });
    expect(tooEarlyCheckout.status).toBe(200);
    expect(tooEarlyCheckout.body.results[0].status).toBe('CHECKOUT_TOO_EARLY');

    // 5. Valid CHECK_OUT at/after checkoutOpensAt succeeds
    const validCheckout = await as(organizer.id)
      .post('/api/checkin/sync')
      .send({
        scans: [
          {
            clientScanId: 'scan-out-valid',
            rid: reg.id,
            scannedAt: new Date(checkoutOpensAt.getTime() + 5000).toISOString(),
            deviceId: 'device-test',
            scanType: 'CHECK_OUT',
          },
        ],
      });
    expect(validCheckout.status).toBe(200);
    expect(validCheckout.body.results[0].status).toBe('ACCEPTED');

    // 6. Student can now claim their certificate (or organizer can bulk issue)
    const claimRes = await as(student.id).post(`/api/events/${event.id}/certificates/claim`);
    expect(claimRes.status).toBe(201);
    const cert = claimRes.body.certificate;
    expect(cert.serial).toMatch(/^CG-\d{4}-\d{6}$/);
    expect(cert.verifyCode).toHaveLength(10);

    // Public verify endpoint (no login required)
    const verifyRes = await request(app).get(`/api/verify/${cert.verifyCode}`);
    expect(verifyRes.status).toBe(200);
    expect(verifyRes.body.valid).toBe(true);
    expect(verifyRes.body.certificate.studentName).toBe('Frank');
    expect(verifyRes.body.certificate.serial).toBe(cert.serial);

    // Non-existent verify code returns 404
    const notFoundRes = await request(app).get('/api/verify/DOESNOTEXIST99');
    expect(notFoundRes.status).toBe(404);
    expect(notFoundRes.body.valid).toBe(false);

    // Student lists their certificates & eligible registrations
    const myCertsRes = await as(student.id).get('/api/me/certificates');
    expect(myCertsRes.status).toBe(200);
    expect(myCertsRes.body.certificates).toHaveLength(1);
    expect(myCertsRes.body.certificates[0].id).toBe(cert.id);
    expect(myCertsRes.body.eligibleRegistrations).toHaveLength(1);
    expect(myCertsRes.body.eligibleRegistrations[0].certificateId).toBe(cert.id);

    // Download PDF
    const pdfRes = await as(student.id).get(`/api/certificates/${cert.id}/pdf`);
    expect(pdfRes.status).toBe(200);
    expect(pdfRes.headers['content-type']).toBe('application/pdf');
    expect(pdfRes.body.length).toBeGreaterThan(500);
  });
});
