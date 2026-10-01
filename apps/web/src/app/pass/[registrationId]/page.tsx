import type { Metadata } from 'next';
import { DynamicPassClient } from './DynamicPassClient';

export const metadata: Metadata = {
  title: 'Event Pass — CampusGrid',
  description: 'Cryptographically signed dynamic event admission pass',
};

interface PassPageProps {
  params: Promise<{ registrationId: string }>;
}

export default async function PassPage({ params }: PassPageProps) {
  const { registrationId } = await params;

  return (
    <div className="py-6">
      <DynamicPassClient registrationId={registrationId} />
    </div>
  );
}
