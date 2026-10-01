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
}

/** Response for POST /api/events/:eventId/certificates/issue */
export interface IssueCertificatesResponse {
  count: number;
  certificates: CertificateDTO[];
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
  };
  error?: {
    code: string;
    message: string;
  };
}
