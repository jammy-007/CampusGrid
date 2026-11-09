/** Shape of a certificate record in CampusGrid. */
export interface CertificateDTO {
  id: string;
  registrationId: string;
  serial: string;
  verifyCode: string;
  issuedById: string;
  issuedAt: string;
  studentName: string;
  studentEmail?: string;
  studentUsn: string | null;
  eventTitle: string;
  eventStartsAt: string;
  eventEndsAt: string;
  eventVenue?: string;
  institutionName: string;
  issuerName: string;
  achievement?: string | null;
  teamName?: string | null;
}

/** Response for POST /api/events/:eventId/certificates/issue */
export interface IssueCertificatesResponse {
  count: number;
  certificates: CertificateDTO[];
}

/** Student attendance & certificate claim eligibility for a registered event */
export interface EligibleCertificateRegistrationDTO {
  registrationId: string;
  eventId: string;
  eventTitle: string;
  eventStatus: string;
  eventStartsAt: string;
  eventEndsAt: string;
  checkoutOpensAt: string | null;
  checkedInAt: string | null;
  checkedOutAt: string | null;
  canClaim: boolean;
  certificateId: string | null;
}

/** Response for public GET /api/verify/:verifyCode */
export interface VerifyCertificateResponse {
  valid: boolean;
  certificate?: {
    serial: string;
    verifyCode: string;
    studentName: string;
    usn: string | null;
    eventTitle: string;
    eventStartsAt: string;
    eventEndsAt: string;
    institutionName: string;
    issuedAt: string;
    issuerName: string;
    achievement?: string | null;
    teamName?: string | null;
  };
  error?: {
    code: string;
    message: string;
  };
}
