import { z } from 'zod';

/** A-Z and 2-9 without the look-alikes 0/O/1/I. */
export const INVITE_CODE_ALPHABET = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789';
export const INVITE_CODE_LENGTH = 8;
export const inviteCodeSchema = z
  .string()
  .trim()
  .toUpperCase()
  .regex(/^[A-HJ-NP-Z2-9]{8}$/, 'Invite codes are 8 letters/digits');

export const createTeamSchema = z.object({
  name: z.string().trim().min(1).max(60),
});
export type CreateTeamInput = z.infer<typeof createTeamSchema>;

export const joinTeamSchema = z.object({
  inviteCode: inviteCodeSchema,
});
export type JoinTeamInput = z.infer<typeof joinTeamSchema>;

export interface TeamMemberDTO {
  userId: string;
  name: string;
  email: string;
  joinedAt: string;
  isLeader: boolean;
}

export interface TeamDTO {
  id: string;
  eventId: string;
  eventTitle?: string;
  name: string;
  /** Only returned to team members. */
  inviteCode?: string;
  leaderId: string;
  createdAt: string;
  members: TeamMemberDTO[];
}
