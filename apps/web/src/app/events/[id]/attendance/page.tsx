import type { Metadata } from 'next';
import { redirect } from 'next/navigation';
import type { EventDTO, AttendanceDTO } from '@campusgrid/shared';
import { apiServer } from '@/lib/server';
import { getSession } from '@/lib/session';
import { AttendanceClient } from './AttendanceClient';

export const metadata: Metadata = {
  title: 'Attendance & OD Certificates — CampusGrid',
  description: 'Live attendance monitoring, CSV export, and OD certificate management',
};

interface AttendancePageProps {
  params: Promise<{ id: string }>;
}

export default async function AttendancePage({ params }: AttendancePageProps) {
  const { id } = await params;
  const from = `/events/${id}/attendance`;

  const [{ event }, user] = await Promise.all([
    apiServer<{ event: EventDTO }>(`/api/events/${id}`, from),
    getSession(),
  ]);

  if (!user || (user.role !== 'ADMIN' && user.id !== event.organizerId)) {
    redirect(`/events/${id}`);
  }

  const attendance = await apiServer<AttendanceDTO>(`/api/events/${id}/attendance`, from);

  return (
    <div className="py-4">
      <AttendanceClient
        eventId={id}
        initialAttendance={attendance}
        eventStatus={event.status}
      />
    </div>
  );
}
