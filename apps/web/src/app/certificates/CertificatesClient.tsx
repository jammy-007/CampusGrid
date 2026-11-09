'use client';

import { useState } from 'react';
import Link from 'next/link';
import type { CertificateDTO, EligibleCertificateRegistrationDTO } from '@campusgrid/shared';
import { apiFetch, ApiError } from '@/lib/api';
import { Badge, Button, ButtonLink, buttonClass, Card, CardTitle } from '@/components/ui';

interface CertificatesClientProps {
  initialCertificates: CertificateDTO[];
  initialRegistrations: EligibleCertificateRegistrationDTO[];
}

export function CertificatesClient({
  initialCertificates,
  initialRegistrations,
}: CertificatesClientProps) {
  const [certificates, setCertificates] = useState<CertificateDTO[]>(initialCertificates);
  const [registrations, setRegistrations] =
    useState<EligibleCertificateRegistrationDTO[]>(initialRegistrations);
  const [claimingEventId, setClaimingEventId] = useState<string | null>(null);
  const [claimFeedback, setClaimFeedback] = useState<{ text: string; error?: boolean } | null>(null);

  const handleClaim = async (eventId: string) => {
    setClaimingEventId(eventId);
    setClaimFeedback(null);
    try {
      const res = await apiFetch<{ certificate: CertificateDTO }>(
        `/api/events/${eventId}/certificates/claim`,
        { method: 'POST' },
      );
      setCertificates((prev) => {
        if (prev.some((c) => c.id === res.certificate.id)) return prev;
        return [res.certificate, ...prev];
      });
      setRegistrations((prev) =>
        prev.map((r) =>
          r.eventId === eventId
            ? { ...r, canClaim: false, certificateId: res.certificate.id }
            : r,
        ),
      );
      setClaimFeedback({
        text: `Successfully claimed OD Certificate (${res.certificate.serial}) for ${res.certificate.eventTitle}!`,
      });
    } catch (err) {
      const msg = err instanceof ApiError ? err.message : 'Could not claim certificate';
      setClaimFeedback({ text: msg, error: true });
    } finally {
      setClaimingEventId(null);
    }
  };

  const pendingOrClaimable = registrations.filter((r) => !r.certificateId);

  return (
    <div className="space-y-8">
      {/* Attendance & Certificate Claim Progress Section */}
      {pendingOrClaimable.length > 0 && (
        <section className="space-y-3">
          <div>
            <h2 className="text-lg font-bold text-white">Event Attendance & Claim Eligibility</h2>
            <p className="text-xs text-slate-400">
              Scan your dynamic QR pass at both <strong>Entry (Check-In)</strong> and{' '}
              <strong>Exit (Check-Out)</strong> to unlock your OD certificate.
            </p>
          </div>

          {claimFeedback && (
            <div
              className={`rounded-xl border p-3 text-xs font-semibold ${
                claimFeedback.error
                  ? 'border-red-500/30 bg-red-950/40 text-red-200'
                  : 'border-emerald-500/30 bg-emerald-950/40 text-emerald-200'
              }`}
            >
              {claimFeedback.text}
            </div>
          )}

          <div className="grid gap-4 sm:grid-cols-2">
            {pendingOrClaimable.map((r) => (
              <Card key={r.registrationId} className="flex flex-col justify-between gap-4 p-5">
                <div className="space-y-2">
                  <div className="flex items-center justify-between gap-2">
                    <Link
                      href={`/events/${r.eventId}`}
                      className="font-bold text-white hover:text-sky-300"
                    >
                      {r.eventTitle}
                    </Link>
                    <Badge tone={r.checkedOutAt ? 'green' : r.checkedInAt ? 'amber' : 'neutral'}>
                      {r.checkedOutAt
                        ? 'Check-Out Complete'
                        : r.checkedInAt
                          ? 'Checked In · Awaiting Check-Out'
                          : 'Not Checked In'}
                    </Badge>
                  </div>

                  <div className="space-y-1 text-xs text-slate-400">
                    <div className="flex justify-between">
                      <span>1. Entry Check-In:</span>
                      <span className={r.checkedInAt ? 'font-mono text-emerald-400' : 'text-slate-500'}>
                        {r.checkedInAt
                          ? `✓ ${new Date(r.checkedInAt).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}`
                          : 'Pending'}
                      </span>
                    </div>
                    <div className="flex justify-between">
                      <span>2. Exit Check-Out:</span>
                      <span className={r.checkedOutAt ? 'font-mono text-emerald-400' : 'text-slate-500'}>
                        {r.checkedOutAt
                          ? `✓ ${new Date(r.checkedOutAt).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}`
                          : r.checkoutOpensAt
                            ? `Opens ${new Date(r.checkoutOpensAt).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}`
                            : 'Scan at event exit'}
                      </span>
                    </div>
                  </div>
                </div>

                <div className="flex items-center justify-between gap-2 border-t border-white/10 pt-3">
                  <ButtonLink href={`/pass/${r.registrationId}`} variant="secondary" size="sm">
                    Open QR Pass
                  </ButtonLink>

                  <Button
                    size="sm"
                    variant="primary"
                    disabled={!r.canClaim || claimingEventId === r.eventId}
                    loading={claimingEventId === r.eventId}
                    onClick={() => handleClaim(r.eventId)}
                  >
                    {r.canClaim ? 'Claim OD Certificate' : 'Scan Out to Unlock'}
                  </Button>
                </div>
              </Card>
            ))}
          </div>
        </section>
      )}

      {/* Issued / Claimed Certificates List */}
      <section className="space-y-3">
        <h2 className="text-lg font-bold text-white">Issued Certificates</h2>

        {certificates.length === 0 ? (
          <Card className="p-12 text-center">
            <div className="mx-auto mb-4 flex h-14 w-14 items-center justify-center rounded-full bg-sky-500/15 text-sky-400 ring-1 ring-sky-400/30">
              <svg className="h-7 w-7" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                <path
                  strokeLinecap="round"
                  strokeLinejoin="round"
                  strokeWidth={1.5}
                  d="M9 12h6m-6 4h6m2 5H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z"
                />
              </svg>
            </div>
            <CardTitle className="text-lg">No Certificates Issued Yet</CardTitle>
            <p className="mx-auto mt-2 max-w-sm text-sm text-slate-400">
              Certificates can be claimed after you scan your dynamic QR pass at both check-in and check-out.
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
              <Card key={cert.id} className="flex flex-col justify-between overflow-hidden p-0">
                <div className="border-b border-white/10 bg-slate-950/40 p-5">
                  <div className="flex flex-wrap items-center justify-between gap-2">
                    <div className="flex flex-wrap items-center gap-2">
                      <Badge tone="brand" className="font-mono font-bold">
                        {cert.serial}
                      </Badge>
                      {cert.achievement && (
                        <Badge tone="amber" className="font-bold">
                          🏆 {cert.achievement}
                        </Badge>
                      )}
                    </div>
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
                  {cert.teamName && (
                    <div className="flex justify-between">
                      <span className="text-slate-400">Team:</span>
                      <span className="font-semibold text-sky-300">{cert.teamName}</span>
                    </div>
                  )}
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
                  <div className="flex items-center justify-between border-t border-white/10 pt-2">
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
                      <path
                        strokeLinecap="round"
                        strokeLinejoin="round"
                        strokeWidth={2}
                        d="M4 16v1a3 3 0 003 3h10a3 3 0 003-3v-1m-4-4l-4 4m0 0l-4-4m4 4V4"
                      />
                    </svg>
                    Download PDF
                  </a>
                </div>
              </Card>
            ))}
          </div>
        )}
      </section>
    </div>
  );
}
