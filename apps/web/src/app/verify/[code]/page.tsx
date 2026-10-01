import type { Metadata } from 'next';
import Link from 'next/link';
import type { VerifyCertificateResponse } from '@campusgrid/shared';

interface VerifyPageProps {
  params: Promise<{ code: string }>;
}

export async function generateMetadata({ params }: VerifyPageProps): Promise<Metadata> {
  const { code } = await params;
  return {
    title: `Verify Certificate ${code} — CampusGrid`,
    description: 'Public duty leave and attendance certificate verification',
  };
}

export default async function VerifyCertificatePage({ params }: VerifyPageProps) {
  const { code } = await params;

  const apiUrl = process.env.API_URL ?? 'http://localhost:4000';
  let verification: VerifyCertificateResponse;

  try {
    const res = await fetch(`${apiUrl}/api/verify/${encodeURIComponent(code)}`, {
      cache: 'no-store',
    });
    verification = (await res.json()) as VerifyCertificateResponse;
  } catch {
    verification = {
      valid: false,
      error: { code: 'FETCH_ERROR', message: 'Unable to reach verification service' },
    };
  }

  const cert = verification.certificate;

  return (
    <div className="mx-auto max-w-xl py-12 px-4">
      {verification.valid && cert ? (
        <div className="overflow-hidden rounded-2xl border border-slate-200 bg-white shadow-xl">
          {/* Success Banner */}
          <div className="bg-gradient-to-r from-emerald-600 to-teal-700 p-6 text-center text-white">
            <div className="mx-auto mb-3 flex h-16 w-16 items-center justify-center rounded-full bg-white/20 backdrop-blur-md">
              <svg className="h-10 w-10 text-white" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={3} d="M5 13l4 4L19 7" />
              </svg>
            </div>
            <span className="inline-block rounded-full bg-white/20 px-3 py-1 text-xs font-bold uppercase tracking-wider backdrop-blur-sm">
              Official & Verified OD Certificate
            </span>
            <h1 className="mt-2 text-2xl font-black">Genuine Certificate</h1>
            <p className="mt-1 font-mono text-sm text-emerald-100">{cert.serial}</p>
          </div>

          {/* Certificate Data Grid */}
          <div className="space-y-4 p-6 text-sm">
            <div className="rounded-xl bg-slate-50 p-4 space-y-3">
              <div className="flex justify-between border-b border-slate-200/60 pb-2">
                <span className="text-slate-500">Student Name</span>
                <span className="font-bold text-slate-900">{cert.studentName}</span>
              </div>

              {cert.usn && (
                <div className="flex justify-between border-b border-slate-200/60 pb-2">
                  <span className="text-slate-500">University Seat No. (USN)</span>
                  <span className="font-mono font-semibold text-slate-900">{cert.usn}</span>
                </div>
              )}

              <div className="flex justify-between border-b border-slate-200/60 pb-2">
                <span className="text-slate-500">Institution</span>
                <span className="font-semibold text-slate-900 text-right">{cert.institutionName}</span>
              </div>

              <div className="flex justify-between border-b border-slate-200/60 pb-2">
                <span className="text-slate-500">Event Title</span>
                <span className="font-bold text-brand-700 text-right">{cert.eventTitle}</span>
              </div>

              <div className="flex justify-between border-b border-slate-200/60 pb-2">
                <span className="text-slate-500">Event Dates</span>
                <span className="text-slate-700 text-right">
                  {new Date(cert.eventStartsAt).toLocaleDateString()} — {new Date(cert.eventEndsAt).toLocaleDateString()}
                </span>
              </div>

              <div className="flex justify-between border-b border-slate-200/60 pb-2">
                <span className="text-slate-500">Issuing Authority</span>
                <span className="font-semibold text-slate-900">{cert.issuerName}</span>
              </div>

              <div className="flex justify-between">
                <span className="text-slate-500">Issue Date</span>
                <span className="text-slate-700">{new Date(cert.issuedAt).toLocaleDateString()}</span>
              </div>
            </div>

            <div className="rounded-lg border border-slate-200 bg-white p-3 text-center text-xs text-slate-500">
              <span className="font-mono font-semibold text-slate-700">Code: {cert.verifyCode}</span>
              <p className="mt-0.5 text-[11px] text-slate-400">
                Cryptographically registered on CampusGrid platform.
              </p>
            </div>
          </div>

          <div className="border-t border-slate-100 bg-slate-50 px-6 py-4 text-center">
            <Link
              href="/"
              className="text-xs font-semibold text-brand-600 hover:text-brand-500"
            >
              ← Back to CampusGrid
            </Link>
          </div>
        </div>
      ) : (
        /* Invalid or Not Found Card */
        <div className="overflow-hidden rounded-2xl border border-rose-200 bg-white shadow-xl">
          <div className="bg-gradient-to-r from-rose-600 to-red-700 p-6 text-center text-white">
            <div className="mx-auto mb-3 flex h-16 w-16 items-center justify-center rounded-full bg-white/20 backdrop-blur-md">
              <svg className="h-10 w-10 text-white" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={3} d="M6 18L18 6M6 6l12 12" />
              </svg>
            </div>
            <span className="inline-block rounded-full bg-white/20 px-3 py-1 text-xs font-bold uppercase tracking-wider backdrop-blur-sm">
              Invalid Certificate
            </span>
            <h1 className="mt-2 text-2xl font-black">Not Found or Invalid</h1>
            <p className="mt-1 font-mono text-sm text-red-100">{code}</p>
          </div>

          <div className="p-6 text-center text-sm text-slate-600 space-y-4">
            <p>
              No official certificate matching code <span className="font-mono font-bold text-slate-900">{code}</span> was found in the CampusGrid registry.
            </p>
            <p className="text-xs text-slate-400">
              Please double check the code from the QR scan or verify that the certificate was properly issued by the event coordinator.
            </p>
          </div>

          <div className="border-t border-slate-100 bg-slate-50 px-6 py-4 text-center">
            <Link
              href="/"
              className="text-xs font-semibold text-brand-600 hover:text-brand-500"
            >
              ← Back to CampusGrid
            </Link>
          </div>
        </div>
      )}
    </div>
  );
}
