import type { Metadata } from 'next';
import Link from 'next/link';
import type { CertificateDTO } from '@campusgrid/shared';
import { apiServer } from '@/lib/server';
import { getSession } from '@/lib/session';
import { Badge, ButtonLink, buttonClass, Card, CardTitle } from '@/components/ui';

export const metadata: Metadata = {
  title: 'My OD Certificates — CampusGrid',
  description: 'View and download official Duty Leave (OD) certificates',
};

export default async function StudentCertificatesPage() {
  await getSession();
  const { certificates } = await apiServer<{ certificates: CertificateDTO[] }>('/api/me/certificates', '/certificates');

  return (
    <div className="mx-auto max-w-4xl space-y-6 py-6">
      <div className="flex flex-wrap items-center justify-between gap-4 border-b border-white/10 pb-5">
        <div>
          <h1 className="text-2xl font-bold tracking-tight text-white">Duty Leave (OD) Certificates</h1>
          <p className="mt-1 text-sm text-slate-400">
            Official verified certificates for attendance and academic leave sanction.
          </p>
        </div>
        <ButtonLink href="/dashboard" variant="secondary" size="sm">
          ← Dashboard
        </ButtonLink>
      </div>

      {certificates.length === 0 ? (
        <Card className="p-12 text-center">
          <div className="mx-auto mb-4 flex h-14 w-14 items-center justify-center rounded-full bg-sky-500/15 text-sky-400 ring-1 ring-sky-400/30">
            <svg className="h-7 w-7" fill="none" viewBox="0 0 24 24" stroke="currentColor">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M9 12h6m-6 4h6m2 5H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z" />
            </svg>
          </div>
          <CardTitle className="text-lg">No Certificates Issued Yet</CardTitle>
          <p className="mx-auto mt-2 max-w-sm text-sm text-slate-400">
            Certificates are issued by event organizers after you check in with your dynamic pass at an event.
          </p>
          <div className="mt-6">
            <ButtonLink href="/events" variant="primary" size="md">
              Browse Events
            </ButtonLink>
          </div>
        </Card>
      ) : (
        <div className="grid gap-5 sm:grid-cols-2">
          {certificates.map((cert) => (
            <Card
              key={cert.id}
              className="flex flex-col justify-between overflow-hidden p-0"
            >
              <div className="border-b border-white/10 bg-slate-950/40 p-5">
                <div className="flex items-center justify-between">
                  <Badge tone="brand" className="font-mono font-bold">
                    {cert.serial}
                  </Badge>
                  <span className="text-xs text-slate-400">
                    {new Date(cert.issuedAt).toLocaleDateString()}
                  </span>
                </div>
                <h3 className="mt-3 text-lg font-bold text-white">{cert.eventTitle}</h3>
                <p className="mt-1 text-xs text-slate-400">{cert.institutionName}</p>
              </div>

              <div className="space-y-2 p-5 text-xs text-slate-300">
                <div className="flex justify-between">
                  <span className="text-slate-400">Recipient:</span>
                  <span className="font-semibold text-white">{cert.studentName}</span>
                </div>
                {cert.studentUsn && (
                  <div className="flex justify-between">
                    <span className="text-slate-400">USN:</span>
                    <span className="font-mono text-white">{cert.studentUsn}</span>
                  </div>
                )}
                <div className="flex justify-between">
                  <span className="text-slate-400">Issued By:</span>
                  <span className="text-white">{cert.issuerName}</span>
                </div>
                <div className="flex justify-between items-center pt-2 border-t border-white/10">
                  <span className="text-slate-400">Verify Code:</span>
                  <Link
                    href={`/verify/${cert.verifyCode}`}
                    className="font-mono font-bold text-sky-400 hover:underline"
                    target="_blank"
                  >
                    {cert.verifyCode}
                  </Link>
                </div>
              </div>

              <div className="flex items-center justify-between border-t border-white/10 bg-slate-950/40 p-4">
                <Link
                  href={`/verify/${cert.verifyCode}`}
                  className="text-xs font-semibold text-slate-400 hover:text-sky-300"
                  target="_blank"
                >
                  Verify Publicly ↗
                </Link>

                <a
                  href={`/api/certificates/${cert.id}/pdf`}
                  target="_blank"
                  rel="noreferrer"
                  className={buttonClass('primary', 'sm')}
                >
                  <svg className="h-4 w-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 16v1a3 3 0 003 3h10a3 3 0 003-3v-1m-4-4l-4 4m0 0l-4-4m4 4V4" />
                  </svg>
                  Download PDF
                </a>
              </div>
            </Card>
          ))}
        </div>
      )}
    </div>
  );
}
