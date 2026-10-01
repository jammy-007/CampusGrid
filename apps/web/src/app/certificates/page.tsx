import type { Metadata } from 'next';
import Link from 'next/link';
import type { CertificateDTO } from '@campusgrid/shared';
import { apiServer } from '@/lib/server';
import { getSession } from '@/lib/session';

export const metadata: Metadata = {
  title: 'My OD Certificates — CampusGrid',
  description: 'View and download official Duty Leave (OD) certificates',
};

export default async function StudentCertificatesPage() {
  await getSession();
  const { certificates } = await apiServer<{ certificates: CertificateDTO[] }>('/api/me/certificates', '/certificates');

  return (
    <div className="mx-auto max-w-4xl space-y-6 py-6">
      <div className="flex flex-wrap items-center justify-between gap-4 border-b border-slate-200 pb-5">
        <div>
          <h1 className="text-2xl font-bold tracking-tight text-slate-900">Duty Leave (OD) Certificates</h1>
          <p className="mt-1 text-sm text-slate-500">
            Official verified certificates for attendance and academic leave sanction.
          </p>
        </div>
        <Link
          href="/dashboard"
          className="rounded-lg bg-slate-100 px-3.5 py-2 text-xs font-semibold text-slate-700 hover:bg-slate-200"
        >
          ← Dashboard
        </Link>
      </div>

      {certificates.length === 0 ? (
        <div className="rounded-2xl border border-slate-200 bg-white p-12 text-center shadow-sm">
          <div className="mx-auto mb-4 flex h-14 w-14 items-center justify-center rounded-full bg-blue-50 text-blue-600">
            <svg className="h-7 w-7" fill="none" viewBox="0 0 24 24" stroke="currentColor">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M9 12h6m-6 4h6m2 5H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z" />
            </svg>
          </div>
          <h2 className="text-lg font-semibold text-slate-900">No Certificates Issued Yet</h2>
          <p className="mx-auto mt-2 max-w-sm text-sm text-slate-500">
            Certificates are issued by event organizers after you check in with your dynamic pass at an event.
          </p>
          <Link
            href="/events"
            className="mt-6 inline-flex items-center gap-2 rounded-lg bg-brand-600 px-4 py-2 text-sm font-semibold text-white shadow-sm hover:bg-brand-500"
          >
            Browse Events
          </Link>
        </div>
      ) : (
        <div className="grid gap-5 sm:grid-cols-2">
          {certificates.map((cert) => (
            <div
              key={cert.id}
              className="flex flex-col justify-between overflow-hidden rounded-2xl border border-slate-200 bg-white shadow-sm transition hover:shadow-md"
            >
              <div className="border-b border-slate-100 bg-gradient-to-r from-blue-50 to-indigo-50/50 p-5">
                <div className="flex items-center justify-between">
                  <span className="rounded-full bg-blue-600/10 px-2.5 py-0.5 font-mono text-xs font-bold text-blue-700">
                    {cert.serial}
                  </span>
                  <span className="text-xs text-slate-500">
                    {new Date(cert.issuedAt).toLocaleDateString()}
                  </span>
                </div>
                <h3 className="mt-3 text-lg font-bold text-slate-900">{cert.eventTitle}</h3>
                <p className="mt-1 text-xs text-slate-600">{cert.institutionName}</p>
              </div>

              <div className="space-y-2 p-5 text-xs text-slate-600">
                <div className="flex justify-between">
                  <span className="text-slate-400">Recipient:</span>
                  <span className="font-semibold text-slate-800">{cert.studentName}</span>
                </div>
                {cert.studentUsn && (
                  <div className="flex justify-between">
                    <span className="text-slate-400">USN:</span>
                    <span className="font-mono text-slate-800">{cert.studentUsn}</span>
                  </div>
                )}
                <div className="flex justify-between">
                  <span className="text-slate-400">Issued By:</span>
                  <span className="text-slate-800">{cert.issuerName}</span>
                </div>
                <div className="flex justify-between items-center pt-1 border-t border-slate-100">
                  <span className="text-slate-400">Verify Code:</span>
                  <Link
                    href={`/verify/${cert.verifyCode}`}
                    className="font-mono font-bold text-brand-600 hover:underline"
                    target="_blank"
                  >
                    {cert.verifyCode}
                  </Link>
                </div>
              </div>

              <div className="flex items-center justify-between border-t border-slate-100 bg-slate-50 p-4">
                <Link
                  href={`/verify/${cert.verifyCode}`}
                  className="text-xs font-semibold text-slate-600 hover:text-slate-900"
                  target="_blank"
                >
                  Verify Publicly ↗
                </Link>

                <a
                  href={`/api/certificates/${cert.id}/pdf`}
                  target="_blank"
                  rel="noreferrer"
                  className="inline-flex items-center gap-1.5 rounded-lg bg-blue-600 px-3.5 py-1.5 text-xs font-semibold text-white shadow-sm hover:bg-blue-500 active:scale-[0.98]"
                >
                  <svg className="h-4 w-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 16v1a3 3 0 003 3h10a3 3 0 003-3v-1m-4-4l-4 4m0 0l-4-4m4 4V4" />
                  </svg>
                  Download PDF
                </a>
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
