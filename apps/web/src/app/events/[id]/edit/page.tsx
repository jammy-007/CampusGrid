import type { Metadata } from 'next';
import { redirect } from 'next/navigation';
import type { EventDTO } from '@campusgrid/shared';
import { apiServer } from '@/lib/server';
import { getSession } from '@/lib/session';
import { EventForm } from '../../_components/EventForm';

export const metadata: Metadata = { title: 'Edit event' };

export default async function EditEventPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const { event } = await apiServer<{ event: EventDTO }>(`/api/events/${id}`, `/events/${id}/edit`);
  const user = await getSession();
  if (!user || (user.role !== 'ADMIN' && user.id !== event.organizerId)) redirect(`/events/${id}`);
  return (
    <div className="space-y-4">
      <h1 className="text-2xl font-semibold">Edit {event.title}</h1>
      <EventForm event={event} />
    </div>
  );
}
