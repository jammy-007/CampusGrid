import type { Metadata } from 'next';
import { redirect } from 'next/navigation';
import { getSession } from '@/lib/session';
import { EventForm } from '../_components/EventForm';

export const metadata: Metadata = { title: 'Create event' };

export default async function NewEventPage() {
  const user = await getSession();
  if (!user) redirect('/login?next=/events/new');
  if (user.role !== 'ORGANIZER' && user.role !== 'ADMIN') redirect('/events');
  return (
    <div className="space-y-4">
      <h1 className="text-2xl font-semibold">Create event</h1>
      <EventForm />
    </div>
  );
}
