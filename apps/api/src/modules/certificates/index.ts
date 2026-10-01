import { Router } from 'express';
import crypto from 'node:crypto';
import PDFDocument from 'pdfkit';
import QRCode from 'qrcode';
import type { CertificateDTO, IssueCertificatesResponse, VerifyCertificateResponse } from '@campusgrid/shared';
import { requireAuth, requireEventOrganizer } from '../../middleware/auth';
import { prisma } from '../../lib/prisma';
import { badRequest, forbidden, notFound } from '../../lib/errors';
import { env } from '../../lib/env';

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
    const usnText = cert.studentUsn ? `USN: ${cert.studentUsn}` : 'Student Participant';
    doc.fillColor('#64748b').fontSize(12).font('Helvetica')
      .text(usnText, 0, 215, { align: 'center', width });

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

  // Find all confirmed registrations with checkIns but no certificate
  const checkedInWithoutCert = await prisma.registration.findMany({
    where: {
      eventId,
      status: 'CONFIRMED',
      checkIns: { some: {} },
      certificate: null,
    },
    include: {
      user: true,
    },
  });

  if (checkedInWithoutCert.length === 0) {
    const existing = await prisma.certificate.findMany({
      where: {
        registration: { eventId },
      },
      include: {
        registration: {
          include: { user: true, event: { include: { institution: true } } },
        },
        issuedBy: true,
      },
      orderBy: { issuedAt: 'asc' },
    });

    const existingDTOs: CertificateDTO[] = existing.map((c) => ({
      id: c.id,
      registrationId: c.registrationId,
      serial: c.serial,
      verifyCode: c.verifyCode,
      issuedById: c.issuedById,
      issuedAt: c.issuedAt.toISOString(),
      studentName: c.registration.user.name,
      studentEmail: c.registration.user.email,
      studentUsn: c.registration.user.usn,
      eventTitle: c.registration.event.title,
      eventStartsAt: c.registration.event.startsAt.toISOString(),
      eventEndsAt: c.registration.event.endsAt.toISOString(),
      institutionName: c.registration.event.institution.name,
      issuerName: c.issuedBy.name,
    }));

    const response: IssueCertificatesResponse = {
      count: 0,
      certificates: existingDTOs,
    };
    return res.json(response);
  }

  const currentYear = new Date().getFullYear();
  const certCount = await prisma.certificate.count();
  let nextSerialNum = certCount + 1;

  const createdCertificates: CertificateDTO[] = [];

  for (const reg of checkedInWithoutCert) {
    let serial = '';
    let verifyCode = '';
    let inserted = false;

    // Retry in the rare event of collision
    for (let attempt = 0; attempt < 10; attempt++) {
      serial = `CG-${currentYear}-${String(nextSerialNum).padStart(6, '0')}`;
      verifyCode = generateRandomVerifyCode(10);
      nextSerialNum++;

      try {
        const cert = await prisma.certificate.create({
          data: {
            registrationId: reg.id,
            serial,
            verifyCode,
            issuedById: user.id,
          },
        });

        createdCertificates.push({
          id: cert.id,
          registrationId: cert.registrationId,
          serial: cert.serial,
          verifyCode: cert.verifyCode,
          issuedById: cert.issuedById,
          issuedAt: cert.issuedAt.toISOString(),
          studentName: reg.user.name,
          studentEmail: reg.user.email,
          studentUsn: reg.user.usn,
          eventTitle: event.title,
          eventStartsAt: event.startsAt.toISOString(),
          eventEndsAt: event.endsAt.toISOString(),
          institutionName: event.institution.name,
          issuerName: user.name,
        });

        inserted = true;
        break;
      } catch (err: unknown) {
        if (err && typeof err === 'object' && 'code' in err && (err as { code: string }).code === 'P2002') {
          continue;
        }
        throw err;
      }
    }

    if (!inserted) {
      throw new Error(`Failed to generate unique serial/code for registration ${reg.id}`);
    }
  }

  const response: IssueCertificatesResponse = {
    count: createdCertificates.length,
    certificates: createdCertificates,
  };

  res.json(response);
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
  });

  res.setHeader('Content-Type', 'application/pdf');
  res.setHeader('Content-Disposition', `inline; filename="certificate-${cert.serial}.pdf"`);
  res.send(pdfBuffer);
});

/**
 * GET /api/me/certificates
 * Lists certificates earned by the signed-in student.
 */
router.get('/me/certificates', requireAuth, async (req, res) => {
  const user = req.user!;

  const certificates = await prisma.certificate.findMany({
    where: {
      registration: {
        userId: user.id,
      },
    },
    include: {
      registration: {
        include: {
          user: true,
          event: {
            include: { institution: true },
          },
        },
      },
      issuedBy: true,
    },
    orderBy: { issuedAt: 'desc' },
  });

  const dtoList: CertificateDTO[] = certificates.map((c) => ({
    id: c.id,
    registrationId: c.registrationId,
    serial: c.serial,
    verifyCode: c.verifyCode,
    issuedById: c.issuedById,
    issuedAt: c.issuedAt.toISOString(),
    studentName: c.registration.user.name,
    studentEmail: c.registration.user.email,
    studentUsn: c.registration.user.usn,
    eventTitle: c.registration.event.title,
    eventStartsAt: c.registration.event.startsAt.toISOString(),
    eventEndsAt: c.registration.event.endsAt.toISOString(),
    eventVenue: c.registration.event.venue,
    institutionName: c.registration.event.institution.name,
    issuerName: c.issuedBy.name,
  }));

  res.json({ certificates: dtoList });
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
    },
  };

  res.json(successResponse);
});
