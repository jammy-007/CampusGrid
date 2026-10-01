import { Router } from 'express';
import type { PassTokenResponse } from '@campusgrid/shared';
import { requireAuth } from '../../middleware/auth';
import { prisma } from '../../lib/prisma';
import { badRequest, forbidden, notFound } from '../../lib/errors';
import { signPassToken } from './passCrypto';

export const router = Router();

/**
 * GET /api/passes/:registrationId/token
 * Returns a fresh dynamic signed pass token for a confirmed registration.
 * Accessible only by the registration owner (student) or an ADMIN.
 * Token expires in 60 seconds.
 */
router.get('/passes/:registrationId/token', requireAuth, async (req, res) => {
  const registrationId = req.params.registrationId as string;
  const user = req.user!;

  const registration = await prisma.registration.findUnique({
    where: { id: registrationId },
    include: {
      user: {
        select: { id: true, name: true, usn: true, email: true, institutionId: true },
      },
      event: {
        select: { id: true, title: true, institutionId: true, status: true },
      },
      pass: true,
    },
  });

  if (!registration) {
    throw notFound('Registration not found');
  }

  // Multi-tenant check: must belong to user's institution
  if (registration.event.institutionId !== user.institutionId) {
    throw notFound('Registration not found');
  }

  // Ownership check: must be the student or an ADMIN
  const isOwner = registration.userId === user.id;
  const isAdmin = user.role === 'ADMIN';
  if (!isOwner && !isAdmin) {
    throw forbidden('Only the registered student can access this pass');
  }

  // Registration status check: must be CONFIRMED
  if (registration.status !== 'CONFIRMED') {
    throw badRequest('Pass is only available for confirmed registrations', 'REGISTRATION_NOT_CONFIRMED');
  }

  // Pass revocation check
  if (registration.pass?.revokedAt) {
    throw badRequest('This pass has been revoked', 'PASS_REVOKED');
  }

  // Ensure EventPass row exists
  if (!registration.pass) {
    await prisma.eventPass.create({
      data: {
        registrationId: registration.id,
      },
    });
  }

  const nowSec = Math.floor(Date.now() / 1000);
  const payload = {
    v: 1 as const,
    rid: registration.id,
    eid: registration.eventId,
    uid: registration.userId,
    name: registration.user.name,
    iat: nowSec,
    exp: nowSec + 60,
  };

  const token = signPassToken(payload);
  const response: PassTokenResponse = {
    token,
    expiresIn: 60,
  };

  res.json(response);
});

/**
 * GET /api/passes/:registrationId
 * Returns pass details and status (useful for UI to check registration info).
 */
router.get('/passes/:registrationId', requireAuth, async (req, res) => {
  const registrationId = req.params.registrationId as string;
  const user = req.user!;

  const registration = await prisma.registration.findUnique({
    where: { id: registrationId },
    include: {
      user: {
        select: { id: true, name: true, usn: true, email: true },
      },
      event: {
        select: {
          id: true,
          title: true,
          type: true,
          venue: true,
          startsAt: true,
          endsAt: true,
          institutionId: true,
        },
      },
      pass: true,
      checkIns: {
        select: { id: true, scannedAt: true },
        take: 1,
      },
    },
  });

  if (!registration || registration.event.institutionId !== user.institutionId) {
    throw notFound('Registration not found');
  }

  const isOwner = registration.userId === user.id;
  const isAdmin = user.role === 'ADMIN';
  if (!isOwner && !isAdmin) {
    throw forbidden('Only the registered student can access this pass');
  }

  res.json({
    registration: {
      id: registration.id,
      eventId: registration.eventId,
      status: registration.status,
      user: registration.user,
      event: registration.event,
      checkedIn: registration.checkIns.length > 0,
      revoked: !!registration.pass?.revokedAt,
    },
  });
});
