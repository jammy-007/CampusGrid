import { Router } from 'express';
import type {
  CheckinBundleDTO,
  CheckinSyncRequest,
  CheckinScanResult,
  AttendanceDTO,
  AttendanceAttendeeDTO,
} from '@campusgrid/shared';
import { checkinSyncRequestSchema } from '@campusgrid/shared';
import { requireAuth, requireEventOrganizer } from '../../middleware/auth';
import { prisma } from '../../lib/prisma';
import { parse } from '../../lib/validate';
import { notFound } from '../../lib/errors';
import { bus } from '../../lib/bus';
import { getIO } from '../../realtime/io';
import { getPassSigningPublicKeyHex } from '../passes/passCrypto';

export const router = Router();

// Ensure /live namespace supports live:subscribe for checkin counts
let liveListenerRegistered = false;
function ensureLiveSubscription() {
  if (liveListenerRegistered) return;
  try {
    const io = getIO();
    io.of('/live').on('connection', (socket) => {
      socket.on('live:subscribe', (data: { eventId?: string }) => {
        if (data?.eventId && typeof data.eventId === 'string') {
          socket.join(`event:${data.eventId}`);
        }
      });
    });
    liveListenerRegistered = true;
  } catch {
    // io may not be initialized yet (e.g. before server listen)
  }
}

/**
 * GET /api/events/:eventId/checkin/bundle
 * Returns the offline bundle for the scanner:
 * { publicKey, eventId, registrations: [{ rid, uid, name, usn }], alreadyCheckedIn: [rid] }
 * Accessible only by ORGANIZER of the event or ADMIN.
 */
router.get('/events/:eventId/checkin/bundle', requireAuth, requireEventOrganizer('eventId'), async (req, res) => {
  const eventId = req.params.eventId as string;

  const event = await prisma.event.findUnique({
    where: { id: eventId },
    select: { id: true, title: true, institutionId: true },
  });

  if (!event || event.institutionId !== req.user!.institutionId) {
    throw notFound('Event not found');
  }

  const registrations = await prisma.registration.findMany({
    where: {
      eventId,
      status: 'CONFIRMED',
    },
    select: {
      id: true,
      userId: true,
      user: {
        select: {
          id: true,
          name: true,
          usn: true,
        },
      },
    },
    orderBy: { createdAt: 'asc' },
  });

  const checkIns = await prisma.checkIn.findMany({
    where: { eventId },
    select: { registrationId: true },
  });

  const alreadyCheckedInSet = new Set<string>();
  for (const c of checkIns) {
    alreadyCheckedInSet.add(c.registrationId);
  }

  const bundle: CheckinBundleDTO = {
    publicKey: getPassSigningPublicKeyHex(),
    eventId: event.id,
    registrations: registrations.map((r) => ({
      rid: r.id,
      uid: r.userId,
      name: r.user.name,
      usn: r.user.usn,
    })),
    alreadyCheckedIn: Array.from(alreadyCheckedInSet),
  };

  res.json(bundle);
});

/**
 * POST /api/checkin/sync
 * Syncs scans queued by the client scanner.
 * Idempotent on clientScanId, keeps earliest check-in per registration.
 * Emits bus event `checkin.recorded` and realtime socket event `checkin:count`.
 */
router.post('/checkin/sync', requireAuth, async (req, res) => {
  ensureLiveSubscription();
  const input = parse(checkinSyncRequestSchema, req.body) as CheckinSyncRequest;
  const user = req.user!;
  const isAdmin = user.role === 'ADMIN';

  const results: CheckinScanResult[] = [];
  const affectedEventIds = new Set<string>();

  for (const scan of input.scans) {
    // 1. Idempotency check: same clientScanId already processed?
    const existingByClientScanId = await prisma.checkIn.findUnique({
      where: { clientScanId: scan.clientScanId },
    });

    if (existingByClientScanId) {
      results.push({
        clientScanId: scan.clientScanId,
        rid: scan.rid,
        status: 'ACCEPTED',
        message: 'Already processed',
      });
      continue;
    }

    // 2. Fetch registration
    const registration = await prisma.registration.findUnique({
      where: { id: scan.rid },
      include: {
        event: {
          select: { id: true, organizerId: true, institutionId: true },
        },
      },
    });

    if (!registration || registration.event.institutionId !== user.institutionId) {
      results.push({
        clientScanId: scan.clientScanId,
        rid: scan.rid,
        status: 'REJECTED',
        message: 'Registration not found',
      });
      continue;
    }

    // Authorization check: must be organizer of this event or ADMIN
    if (!isAdmin && registration.event.organizerId !== user.id) {
      results.push({
        clientScanId: scan.clientScanId,
        rid: scan.rid,
        status: 'REJECTED',
        message: 'Not authorized to scan for this event',
      });
      continue;
    }

    if (registration.status !== 'CONFIRMED') {
      results.push({
        clientScanId: scan.clientScanId,
        rid: scan.rid,
        status: 'REJECTED',
        message: 'Registration is not confirmed',
      });
      continue;
    }

    // 3. Check if registration already checked in
    const existingCheckIn = await prisma.checkIn.findFirst({
      where: { registrationId: scan.rid },
    });

    const scanDate = new Date(scan.scannedAt);

    if (existingCheckIn) {
      // Keep earliest check-in time
      if (scanDate < existingCheckIn.scannedAt) {
        await prisma.checkIn.update({
          where: { id: existingCheckIn.id },
          data: {
            scannedAt: scanDate,
            scannedById: user.id,
            deviceId: scan.deviceId,
          },
        });
      }

      results.push({
        clientScanId: scan.clientScanId,
        rid: scan.rid,
        status: 'ALREADY_CHECKED_IN',
        message: 'Registration already checked in',
      });
      continue;
    }

    // 4. Record new check-in
    try {
      await prisma.checkIn.create({
        data: {
          registrationId: scan.rid,
          eventId: registration.eventId,
          scannedById: user.id,
          scannedAt: scanDate,
          deviceId: scan.deviceId,
          clientScanId: scan.clientScanId,
        },
      });

      affectedEventIds.add(registration.eventId);

      // Emit internal bus event as defined in CONTRACT.md
      bus.emit('checkin.recorded', {
        eventId: registration.eventId,
        registrationId: scan.rid,
        scannedAt: scanDate,
      });

      results.push({
        clientScanId: scan.clientScanId,
        rid: scan.rid,
        status: 'ACCEPTED',
      });
    } catch (err: unknown) {
      // Handle unique constraint conflict gracefully
      if (err && typeof err === 'object' && 'code' in err && (err as { code: string }).code === 'P2002') {
        results.push({
          clientScanId: scan.clientScanId,
          rid: scan.rid,
          status: 'ACCEPTED',
          message: 'Already recorded',
        });
      } else {
        results.push({
          clientScanId: scan.clientScanId,
          rid: scan.rid,
          status: 'REJECTED',
          message: 'Failed to record check-in',
        });
      }
    }
  }

  // 5. Emit live updates for affected events
  for (const eventId of affectedEventIds) {
    try {
      const [registered, checkedIns] = await Promise.all([
        prisma.registration.count({
          where: { eventId, status: 'CONFIRMED' },
        }),
        prisma.checkIn.groupBy({
          by: ['registrationId'],
          where: { eventId },
        }),
      ]);

      const checkedIn = checkedIns.length;
      const io = getIO();
      io.of('/live').to(`event:${eventId}`).emit('checkin:count', {
        eventId,
        checkedIn,
        registered,
      });
    } catch {
      // Ignore if socket server not running in test
    }
  }

  res.json({ results });
});

/** Helper to format CSV field */
function escapeCsv(val: unknown): string {
  if (val === null || val === undefined) return '';
  const str = String(val);
  if (str.includes(',') || str.includes('"') || str.includes('\n') || str.includes('\r')) {
    return `"${str.replace(/"/g, '""')}"`;
  }
  return str;
}

/**
 * GET /api/events/:eventId/attendance
 * Returns attendance list.
 * Supports ?format=csv: name, USN, email, team, checked-in at, scanned by.
 */
router.get('/events/:eventId/attendance', requireAuth, requireEventOrganizer('eventId'), async (req, res) => {
  const eventId = req.params.eventId as string;
  const { format } = req.query;

  const event = await prisma.event.findUnique({
    where: { id: eventId },
    select: { id: true, title: true, institutionId: true },
  });

  if (!event || event.institutionId !== req.user!.institutionId) {
    throw notFound('Event not found');
  }

  const registrations = await prisma.registration.findMany({
    where: {
      eventId,
      status: 'CONFIRMED',
    },
    include: {
      user: {
        select: { id: true, name: true, email: true, usn: true },
      },
      team: {
        select: { id: true, name: true },
      },
      checkIns: {
        select: {
          scannedAt: true,
          scannedBy: {
            select: { name: true },
          },
        },
        orderBy: { scannedAt: 'asc' },
        take: 1,
      },
    },
    orderBy: { createdAt: 'asc' },
  });

  if (format === 'csv') {
    res.setHeader('Content-Type', 'text/csv; charset=utf-8');
    res.setHeader('Content-Disposition', `attachment; filename="attendance-${eventId}.csv"`);

    const header = 'Name,USN,Email,Team,Checked In At,Scanned By\r\n';
    const rows = registrations.map((r) => {
      const checkIn = r.checkIns[0];
      const name = escapeCsv(r.user.name);
      const usn = escapeCsv(r.user.usn ?? '');
      const email = escapeCsv(r.user.email);
      const team = escapeCsv(r.team?.name ?? '');
      const checkedInAt = escapeCsv(checkIn ? checkIn.scannedAt.toISOString() : '');
      const scannedBy = escapeCsv(checkIn ? checkIn.scannedBy.name : '');
      return `${name},${usn},${email},${team},${checkedInAt},${scannedBy}`;
    });

    res.send(header + rows.join('\r\n'));
    return;
  }

  const attendees: AttendanceAttendeeDTO[] = registrations.map((r) => {
    const checkIn = r.checkIns[0];
    return {
      registrationId: r.id,
      userId: r.user.id,
      name: r.user.name,
      email: r.user.email,
      usn: r.user.usn,
      teamName: r.team?.name ?? null,
      checkedIn: !!checkIn,
      scannedAt: checkIn ? checkIn.scannedAt.toISOString() : null,
      scannedByName: checkIn ? checkIn.scannedBy.name : null,
    };
  });

  const checkedInCount = attendees.filter((a) => a.checkedIn).length;

  const response: AttendanceDTO = {
    eventId: event.id,
    title: event.title,
    registeredCount: attendees.length,
    checkedInCount,
    attendees,
  };

  res.json(response);
});
