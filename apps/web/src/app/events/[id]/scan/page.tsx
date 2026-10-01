import type { Metadata } from 'next';
import { redirect } from 'next/navigation';
import type { EventDTO } from '@campusgrid/shared';
import { apiServer } from '@/lib/server';
import { getSession } from '@/lib/session';
import { ScannerClient } from './ScannerClient';

export const metadata: Metadata = {
  title: 'Pass Scanner — CampusGrid',
  description: 'Offline-capable camera QR pass scanner',
};

interface ScanPageProps {
  params: Promise<{ id: string }>;
}

export default async function ScanPage({ params }: ScanPageProps) {
  const { id } = await params;
  const from = `/events/${id}/scan`;

  const [{ event }, user] = await Promise.all([
    apiServer<{ event: EventDTO }>(`/api/events/${id}`, from),
    getSession(),
  ]);

  if (!user || (user.role !== 'ADMIN' && user.id !== event.organizerId)) {
    redirect(`/events/${id}`);
  }

  return (
    <div className="py-4">
      <ScannerClient eventId={id} />
    </div>
  );
}
