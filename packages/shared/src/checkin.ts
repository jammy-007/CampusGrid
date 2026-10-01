import { z } from 'zod';

/** Registration item included in the offline scanner bundle. */
export interface CheckinAttendeeDTO {
  rid: string;
  uid: string;
  name: string;
  usn: string | null;
}

/** Offline scanner bundle returned by GET /api/events/:eventId/checkin/bundle */
export interface CheckinBundleDTO {
  publicKey: string;
  eventId: string;
  registrations: CheckinAttendeeDTO[];
  alreadyCheckedIn: string[];
}

/** Single scan payload queued by the client scanner. */
export const checkinScanItemSchema = z.object({
  clientScanId: z.string().min(1),
  rid: z.string().min(1),
  scannedAt: z.union([z.string(), z.date()]).transform((val) => new Date(val).toISOString()),
  deviceId: z.string().min(1),
});
export type CheckinScanItem = z.infer<typeof checkinScanItemSchema>;

/** Request body for POST /api/checkin/sync */
export const checkinSyncRequestSchema = z.object({
  scans: z.array(checkinScanItemSchema),
});
export type CheckinSyncRequest = z.infer<typeof checkinSyncRequestSchema>;

export type CheckinScanStatus = 'ACCEPTED' | 'ALREADY_CHECKED_IN' | 'REJECTED';

export interface CheckinScanResult {
  clientScanId: string;
  rid: string;
  status: CheckinScanStatus;
  message?: string;
}

export interface CheckinSyncResponse {
  results: CheckinScanResult[];
  checkedInCount: number;
  registeredCount: number;
}

/** Individual attendee row on GET /api/events/:eventId/attendance */
export interface AttendanceAttendeeDTO {
  registrationId: string;
  userId: string;
  name: string;
  email: string;
  usn: string | null;
  teamName: string | null;
  checkedIn: boolean;
  scannedAt: string | null;
  scannedByName: string | null;
}

/** Response for GET /api/events/:eventId/attendance */
export interface AttendanceDTO {
  eventId: string;
  title: string;
  registeredCount: number;
  checkedInCount: number;
  attendees: AttendanceAttendeeDTO[];
}
