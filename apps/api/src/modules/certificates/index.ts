import { Router } from 'express';
import crypto from 'node:crypto';
import PDFDocument from 'pdfkit';
import QRCode from 'qrcode';
import type {
  CertificateDTO,
  EligibleCertificateRegistrationDTO,
  IssueCertificatesResponse,
  LeaderboardDTO,
  VerifyCertificateResponse,
} from '@campusgrid/shared';
import { requireAuth, requireEventOrganizer } from '../../middleware/auth';
import { prisma } from '../../lib/prisma';
import { badRequest, forbidden, notFound } from '../../lib/errors';
import { env } from '../../lib/env';
import { fetchAndComputeLeaderboard } from '../leaderboard/service';

export const router = Router();

const VERIFY_CODE_CHARS = '23456789ABCDEFGHJKLMNPQRSTUVWXYZ';

function generateRandomVerifyCode(length = 10): string {
  const bytes = crypto.randomBytes(length);
  let code = '';
  for (let i = 0; i < length; i++) {
    code += VERIFY_CODE_CHARS[bytes[i] % VERIFY_CODE_CHARS.length];
  }
  return code;
}

const isUniqueViolation = (err: unknown) =>
  typeof err === 'object' && err !== null && (err as { code?: string }).code === 'P2002';

/** Inserts a certificate, retrying when the serial or verify code collides. */
async function createCertificate(registrationId: string, issuedById: string) {
  const year = new Date().getFullYear();
  let next = (await prisma.certificate.count()) + 1;
  for (let attempt = 0; attempt < 10; attempt++) {
    try {
      return await prisma.certificate.create({
        data: {
          registrationId,
          serial: `CG-${year}-${String(next++).padStart(6, '0')}`,
          verifyCode: generateRandomVerifyCode(10),
          issuedById,
        },
      });
    } catch (err) {
      if (!isUniqueViolation(err)) throw err;
    }
  }
  throw new Error(`Failed to generate unique serial/code for registration ${registrationId}`);
}

function toCertificateDTO(
  c: { id: string; registrationId: string; serial: string; verifyCode: string; issuedById: string; issuedAt: Date },
  student: { name: string; email: string; usn: string | null },
  event: { title: string; startsAt: Date; endsAt: Date; venue: string; institution: { name: string } },
  issuerName: string,
  extra: { achievement?: string | null; teamName?: string | null } = {},
): CertificateDTO {
  return {
    id: c.id,
    registrationId: c.registrationId,
    serial: c.serial,
    verifyCode: c.verifyCode,
    issuedById: c.issuedById,
    issuedAt: c.issuedAt.toISOString(),
    studentName: student.name,
    studentEmail: student.email,
    studentUsn: student.usn,
    eventTitle: event.title,
    eventStartsAt: event.startsAt.toISOString(),
    eventEndsAt: event.endsAt.toISOString(),
    eventVenue: event.venue,
    institutionName: event.institution.name,
    issuerName,
    ...extra,
  };
}

// shortcut: per-process cache, 30s stale; use a shared cache if the API runs on many instances.
const leaderboardCache = new Map<string, { at: number; value: Promise<LeaderboardDTO | null> }>();
function cachedLeaderboard(eventId: string) {
  const hit = leaderboardCache.get(eventId);
  if (hit && Date.now() - hit.at < 30_000) return hit.value;
  const value = fetchAndComputeLeaderboard(eventId);
  value.catch(() => leaderboardCache.delete(eventId));
  leaderboardCache.set(eventId, { at: Date.now(), value });
  return value;
}

/**
 * Resolves Hackathon achievement title (1st/2nd/3rd place) for a team in an event.
 */
async function resolveTeamAchievement(
  eventId: string,
  eventType: string,
  teamId: string | null,
): Promise<string | null> {
  if (eventType !== 'HACKATHON' || !teamId) return null;
  const leaderboard = await cachedLeaderboard(eventId);
  if (!leaderboard) return null;
  const entry = leaderboard.rows.find((e) => e.teamId === teamId && e.judgesScored > 0);
  if (!entry) return null;
  if (entry.rank === 1) return '1ST PLACE WINNER';
  if (entry.rank === 2) return '2ND PLACE RUNNER-UP';
  if (entry.rank === 3) return '3RD PLACE WINNER';
  return null;
}

/**
 * Generates an elegant PDF certificate stream using pdfkit.
 */
async function generateCertificatePdf(cert: {
  serial: string;
  verifyCode: string;
  issuedAt: Date;
  studentName: string;
  studentUsn: string | null;
  eventTitle: string;
  eventStartsAt: Date;
  eventEndsAt: Date;
  venue: string;
  institutionName: string;
  issuerName: string;
  achievement?: string | null;
  teamName?: string | null;
}): Promise<Buffer> {
  const verifyUrl = `${env.appUrl}/verify/${cert.verifyCode}`;
  const qrBuffer = await QRCode.toBuffer(verifyUrl, {
    width: 140,
    margin: 1,
    color: {
      dark: '#1e293b',
      light: '#ffffff',
    },
  });

  return new Promise((resolve, reject) => {
    const doc = new PDFDocument({
      size: 'A4',
      layout: 'landscape',
      margins: { top: 36, bottom: 36, left: 36, right: 36 },
      info: {
        Title: `Duty Leave Certificate - ${cert.studentName}`,
        Author: 'CampusGrid',
        Subject: cert.eventTitle,
      },
    });

    const chunks: Buffer[] = [];
    doc.on('data', (c) => chunks.push(c));
    doc.on('end', () => resolve(Buffer.concat(chunks)));
    doc.on('error', (err) => reject(err));

    const width = 841.89;
    const height = 595.28;

    // Outer borders
    doc.rect(20, 20, width - 40, height - 40).lineWidth(3).strokeColor('#1e3a8a').stroke();
    doc.rect(26, 26, width - 52, height - 52).lineWidth(1).strokeColor('#94a3b8').stroke();

    // Corner decorative accents
    const accentLen = 30;
    doc.lineWidth(2).strokeColor('#2563eb');
    doc.moveTo(35, 35 + accentLen).lineTo(35, 35).lineTo(35 + accentLen, 35).stroke();
    doc.moveTo(width - 35 - accentLen, 35).lineTo(width - 35, 35).lineTo(width - 35, 35 + accentLen).stroke();
    doc.moveTo(35, height - 35 - accentLen).lineTo(35, height - 35).lineTo(35 + accentLen, height - 35).stroke();
    doc.moveTo(width - 35 - accentLen, height - 35).lineTo(width - 35, height - 35).lineTo(width - 35, height - 35 - accentLen).stroke();

    // Institution Name
    doc.fillColor('#1e293b').fontSize(18).font('Helvetica-Bold')
      .text(cert.institutionName.toUpperCase(), 0, 55, { align: 'center', width });

    // Certificate Title
    doc.fillColor('#2563eb').fontSize(24).font('Helvetica-Bold')
      .text('ON DUTY (OD) / DUTY LEAVE CERTIFICATE', 0, 85, { align: 'center', width });

    doc.fillColor('#64748b').fontSize(11).font('Helvetica')
      .text('OFFICIAL VERIFIED PARTICIPATION & ATTENDANCE RECORD', 0, 118, { align: 'center', width });

    // Decorative line
    doc.strokeColor('#cbd5e1').lineWidth(1)
      .moveTo(180, 140).lineTo(width - 180, 140).stroke();

    // Body
    doc.fillColor('#475569').fontSize(13).font('Helvetica')
      .text('This is to certify that', 0, 160, { align: 'center', width });

    // Student Name
    doc.fillColor('#0f172a').fontSize(22).font('Helvetica-Bold')
      .text(cert.studentName, 0, 185, { align: 'center', width });

    // Student USN / ID
    const usnBase = cert.studentUsn ? `USN: ${cert.studentUsn}` : 'Student Participant';
    const usnText = cert.teamName ? `${usnBase}  ·  Team: ${cert.teamName}` : usnBase;
    doc.fillColor('#64748b').fontSize(12).font('Helvetica')
      .text(usnText, 0, 212, { align: 'center', width });

    if (cert.achievement) {
      doc.fillColor('#b45309').fontSize(13).font('Helvetica-Bold')
        .text(`★ ${cert.achievement} ★`, 0, 230, { align: 'center', width });
    }

    // Description text
    const dateStr = cert.eventStartsAt.toLocaleDateString('en-US', {
      year: 'numeric',
      month: 'short',
      day: 'numeric',
    });
    const endDateStr = cert.eventEndsAt.toLocaleDateString('en-US', {
      year: 'numeric',
      month: 'short',
      day: 'numeric',
    });
    const dateRange = dateStr === endDateStr ? dateStr : `${dateStr} to ${endDateStr}`;

    doc.fillColor('#334155').fontSize(13).font('Helvetica')
      .text('has successfully checked in and attended the event', 0, 245, { align: 'center', width });

    doc.fillColor('#1e40af').fontSize(18).font('Helvetica-Bold')
      .text(`"${cert.eventTitle}"`, 0, 270, { align: 'center', width });

    doc.fillColor('#475569').fontSize(12).font('Helvetica')
      .text(`Held on ${dateRange} at ${cert.venue}`, 0, 302, { align: 'center', width });

    doc.fillColor('#64748b').fontSize(10).font('Helvetica-Oblique')
      .text(
        'This certificate serves as official verification for academic Duty Leave / On Duty (OD) sanction.',
        0,
        328,
        { align: 'center', width },
      );

    // Bottom section: Serial, Issuer, and QR verification
    const bottomY = 380;
    doc.strokeColor('#e2e8f0').lineWidth(1)
      .moveTo(50, bottomY - 15).lineTo(width - 50, bottomY - 15).stroke();

    // Left: Serial & Date
    doc.fillColor('#64748b').fontSize(10).font('Helvetica')
      .text('Certificate Serial:', 60, bottomY);
    doc.fillColor('#0f172a').fontSize(11).font('Helvetica-Bold')
      .text(cert.serial, 60, bottomY + 16);

    doc.fillColor('#64748b').fontSize(10).font('Helvetica')
      .text('Date of Issue:', 60, bottomY + 38);
    doc.fillColor('#0f172a').fontSize(10).font('Helvetica')
      .text(cert.issuedAt.toLocaleDateString('en-US', { year: 'numeric', month: 'short', day: 'numeric' }), 60, bottomY + 52);

    // Middle: Issuing Authority
    doc.fillColor('#64748b').fontSize(10).font('Helvetica')
      .text('Issued By:', 300, bottomY);
    doc.fillColor('#0f172a').fontSize(12).font('Helvetica-Bold')
      .text(cert.issuerName, 300, bottomY + 16);
    doc.fillColor('#64748b').fontSize(9).font('Helvetica')
      .text('Authorized Event Coordinator / Admin', 300, bottomY + 34);
    doc.strokeColor('#94a3b8').lineWidth(1)
      .moveTo(300, bottomY + 65).lineTo(480, bottomY + 65).stroke();
    doc.fontSize(8).fillColor('#94a3b8')
      .text('Authorized Signature', 300, bottomY + 70);

    // Right: QR Code + Verification
    const qrX = width - 190;
    doc.image(qrBuffer, qrX, bottomY - 10, { width: 100 });
    doc.fillColor('#64748b').fontSize(8).font('Helvetica')
      .text('Scan to verify genuine OD at', qrX - 25, bottomY + 95, { width: 150, align: 'center' });
    doc.fillColor('#2563eb').fontSize(8).font('Helvetica-Bold')
      .text(cert.verifyCode, qrX - 25, bottomY + 107, { width: 150, align: 'center' });

    doc.end();
  });
}

/**
 * POST /api/events/:eventId/certificates/issue
 * Creates a Certificate for every checked-in registration without one.
 * Accessible only by ORGANIZER of the event or ADMIN.
 * Event must be ONGOING or COMPLETED.
 * Serial format: CG-<YEAR>-<6 digits>, random 10-char verifyCode.
 */
router.post('/events/:eventId/certificates/issue', requireAuth, requireEventOrganizer('eventId'), async (req, res) => {
  const eventId = req.params.eventId as string;
  const user = req.user!;

  const event = await prisma.event.findUnique({
    where: { id: eventId },
    include: {
      institution: true,
    },
  });

  if (!event || event.institutionId !== user.institutionId) {
    throw notFound('Event not found');
  }

  // Contract requirement: event COMPLETED or ONGOING
  if (event.status !== 'COMPLETED' && event.status !== 'ONGOING') {
    throw badRequest('Certificates can only be issued for ONGOING or COMPLETED events', 'EVENT_NOT_ELIGIBLE');
  }

  // Confirmed registrations with check-in AND check-out done, but no certificate yet
  const eligibleWithoutCert = await prisma.registration.findMany({
    where: {
      eventId,
      status: 'CONFIRMED',
      checkIns: { some: { checkedOutAt: { not: null } } },
      certificate: null,
    },
    select: { id: true },
  });

  for (const reg of eligibleWithoutCert) await createCertificate(reg.id, user.id);

  const allCertificates = await prisma.certificate.findMany({
    where: { registration: { eventId } },
    include: {
      registration: { include: { user: true, event: { include: { institution: true } } } },
      issuedBy: true,
    },
    orderBy: { issuedAt: 'asc' },
  });

  const response: IssueCertificatesResponse = {
    count: eligibleWithoutCert.length,
    certificates: allCertificates.map((c) =>
      toCertificateDTO(c, c.registration.user, c.registration.event, c.issuedBy.name),
    ),
  };

  res.json(response);
});

/**
 * POST /api/events/:eventId/certificates/claim
 * Allows a signed-in student to claim their own OD certificate for an event,
 * provided they have both checked in AND checked out (at/after checkoutOpensAt).
 */
router.post('/events/:eventId/certificates/claim', requireAuth, async (req, res) => {
  const eventId = req.params.eventId as string;
  const user = req.user!;

  const event = await prisma.event.findUnique({
    where: { id: eventId },
    include: {
      institution: true,
      organizer: true,
    },
  });

  if (!event || event.institutionId !== user.institutionId) {
    throw notFound('Event not found');
  }

  if (event.status !== 'COMPLETED' && event.status !== 'ONGOING') {
    throw badRequest('Certificates can only be claimed for ONGOING or COMPLETED events', 'EVENT_NOT_ELIGIBLE');
  }

  const registration = await prisma.registration.findFirst({
    where: {
      eventId,
      userId: user.id,
      status: 'CONFIRMED',
    },
    include: {
      user: true,
      checkIns: {
        orderBy: { scannedAt: 'asc' },
        take: 1,
      },
      certificate: {
        include: { issuedBy: true },
      },
    },
  });

  if (!registration) {
    throw notFound('Confirmed registration not found for this event');
  }

  // If already claimed/issued, return existing certificate idempotently
  if (registration.certificate) {
    const c = registration.certificate;
    return res.json({ certificate: toCertificateDTO(c, registration.user, event, c.issuedBy.name) });
  }

  const checkIn = registration.checkIns[0];
  if (!checkIn) {
    throw badRequest(
      'You must scan your QR pass at event entry (Check-In) before claiming a certificate',
      'CHECKIN_REQUIRED',
    );
  }

  if (!checkIn.checkedOutAt) {
    throw badRequest(
      'You must scan your QR pass at check-out time before claiming a certificate',
      'CHECKOUT_REQUIRED',
    );
  }

  if (event.checkoutOpensAt && checkIn.checkedOutAt < event.checkoutOpensAt) {
    throw badRequest(
      'Your check-out scan was recorded before the official check-out window opened',
      'CHECKOUT_TOO_EARLY',
    );
  }

  const cert = await createCertificate(registration.id, event.organizerId);
  return res
    .status(201)
    .json({ certificate: toCertificateDTO(cert, registration.user, event, event.organizer.name) });
});

/**
 * GET /api/certificates/:id/pdf
 * Generates and streams PDF on request using pdfkit.
 * Accessible by certificate owner (student), event organizer, or ADMIN.
 */
router.get('/certificates/:id/pdf', requireAuth, async (req, res) => {
  const id = req.params.id as string;
  const user = req.user!;

  const cert = await prisma.certificate.findUnique({
    where: { id },
    include: {
      registration: {
        include: {
          user: true,
          team: true,
          event: {
            include: { institution: true },
          },
        },
      },
      issuedBy: true,
    },
  });

  if (!cert) {
    throw notFound('Certificate not found');
  }

  // Authorization check
  const isStudent = cert.registration.userId === user.id;
  const isEventOrganizer = cert.registration.event.organizerId === user.id;
  const isAdmin = user.role === 'ADMIN' && cert.registration.event.institutionId === user.institutionId;

  if (!isStudent && !isEventOrganizer && !isAdmin) {
    throw forbidden('Not authorized to access this certificate');
  }

  const achievement = await resolveTeamAchievement(
    cert.registration.eventId,
    cert.registration.event.type,
    cert.registration.teamId,
  );

  const pdfBuffer = await generateCertificatePdf({
    serial: cert.serial,
    verifyCode: cert.verifyCode,
    issuedAt: cert.issuedAt,
    studentName: cert.registration.user.name,
    studentUsn: cert.registration.user.usn,
    eventTitle: cert.registration.event.title,
    eventStartsAt: cert.registration.event.startsAt,
    eventEndsAt: cert.registration.event.endsAt,
    venue: cert.registration.event.venue,
    institutionName: cert.registration.event.institution.name,
    issuerName: cert.issuedBy.name,
    achievement,
    teamName: cert.registration.team?.name ?? null,
  });

  res.setHeader('Content-Type', 'application/pdf');
  res.setHeader('Content-Disposition', `inline; filename="certificate-${cert.serial}.pdf"`);
  res.send(pdfBuffer);
});

/**
 * GET /api/me/certificates
 * Lists certificates earned by the signed-in student, plus attendance/claim status for their registrations.
 */
router.get('/me/certificates', requireAuth, async (req, res) => {
  const user = req.user!;

  const [certificates, registrations] = await Promise.all([
    prisma.certificate.findMany({
      where: {
        registration: {
          userId: user.id,
        },
      },
      include: {
        registration: {
          include: {
            user: true,
            team: true,
            event: {
              include: { institution: true },
            },
          },
        },
        issuedBy: true,
      },
      orderBy: { issuedAt: 'desc' },
    }),
    prisma.registration.findMany({
      where: {
        userId: user.id,
        status: 'CONFIRMED',
      },
      include: {
        event: true,
        checkIns: {
          orderBy: { scannedAt: 'asc' },
          take: 1,
        },
        certificate: true,
      },
      orderBy: { createdAt: 'desc' },
    }),
  ]);

  const dtoList: CertificateDTO[] = await Promise.all(
    certificates.map(async (c) => {
      const achievement = await resolveTeamAchievement(
        c.registration.eventId,
        c.registration.event.type,
        c.registration.teamId,
      );
      return toCertificateDTO(c, c.registration.user, c.registration.event, c.issuedBy.name, {
        achievement,
        teamName: c.registration.team?.name ?? null,
      });
    }),
  );

  const eligibleRegistrations: EligibleCertificateRegistrationDTO[] = registrations.map((r) => {
    const checkIn = r.checkIns[0];
    const eventEligible = r.event.status === 'ONGOING' || r.event.status === 'COMPLETED';
    const hasCheckedIn = !!checkIn;
    const hasCheckedOut =
      !!checkIn?.checkedOutAt &&
      (!r.event.checkoutOpensAt || checkIn.checkedOutAt >= r.event.checkoutOpensAt);

    return {
      registrationId: r.id,
      eventId: r.eventId,
      eventTitle: r.event.title,
      eventStatus: r.event.status,
      eventStartsAt: r.event.startsAt.toISOString(),
      eventEndsAt: r.event.endsAt.toISOString(),
      checkoutOpensAt: r.event.checkoutOpensAt ? r.event.checkoutOpensAt.toISOString() : null,
      checkedInAt: checkIn ? checkIn.scannedAt.toISOString() : null,
      checkedOutAt: checkIn?.checkedOutAt ? checkIn.checkedOutAt.toISOString() : null,
      canClaim: eventEligible && hasCheckedIn && hasCheckedOut && !r.certificate,
      certificateId: r.certificate?.id ?? null,
    };
  });

  res.json({ certificates: dtoList, eligibleRegistrations });
});

/**
 * GET /api/verify/:verifyCode
 * Public endpoint (no login required).
 * Returns genuine / not found certificate status.
 */
router.get('/verify/:verifyCode', async (req, res) => {
  const verifyCode = req.params.verifyCode as string;

  const cert = await prisma.certificate.findUnique({
    where: { verifyCode },
    include: {
      registration: {
        include: {
          user: true,
          team: true,
          event: {
            include: { institution: true },
          },
        },
      },
      issuedBy: true,
    },
  });

  if (!cert) {
    const errorResponse: VerifyCertificateResponse = {
      valid: false,
      error: {
        code: 'CERTIFICATE_NOT_FOUND',
        message: 'No certificate found with this verification code',
      },
    };
    return res.status(404).json(errorResponse);
  }

  const achievement = await resolveTeamAchievement(
    cert.registration.eventId,
    cert.registration.event.type,
    cert.registration.teamId,
  );

  const successResponse: VerifyCertificateResponse = {
    valid: true,
    certificate: {
      serial: cert.serial,
      verifyCode: cert.verifyCode,
      studentName: cert.registration.user.name,
      usn: cert.registration.user.usn,
      eventTitle: cert.registration.event.title,
      eventStartsAt: cert.registration.event.startsAt.toISOString(),
      eventEndsAt: cert.registration.event.endsAt.toISOString(),
      institutionName: cert.registration.event.institution.name,
      issuedAt: cert.issuedAt.toISOString(),
      issuerName: cert.issuedBy.name,
      achievement,
      teamName: cert.registration.team?.name ?? null,
    },
  };

  res.json(successResponse);
});
