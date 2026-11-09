import type { Metadata } from 'next';
import type { CertificateDTO, EligibleCertificateRegistrationDTO } from '@campusgrid/shared';
import { apiServer } from '@/lib/server';
import { getSession } from '@/lib/session';
import { ButtonLink } from '@/components/ui';
import { CertificatesClient } from './CertificatesClient';

export const metadata: Metadata = {
  title: 'My OD Certificates — CampusGrid',
  description: 'View and download official Duty Leave (OD) certificates',
};

export default async function StudentCertificatesPage() {
  await getSession();
  const { certificates, eligibleRegistrations = [] } = await apiServer<{
    certificates: CertificateDTO[];
    eligibleRegistrations?: EligibleCertificateRegistrationDTO[];
  }>('/api/me/certificates', '/certificates');

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

      <CertificatesClient
        initialCertificates={certificates}
        initialRegistrations={eligibleRegistrations}
      />
    </div>
  );
}
