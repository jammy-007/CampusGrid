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
  isOpen: z.boolean().optional().default(true),
});
export type CreateTeamInput = z.infer<typeof createTeamSchema>;

export const updateTeamSchema = z.object({
  isOpen: z.boolean(),
});
export type UpdateTeamInput = z.infer<typeof updateTeamSchema>;

export const joinTeamSchema = z.object({
  inviteCode: inviteCodeSchema.optional(),
  teamId: z.string().min(1).optional(),
}).refine((d) => Boolean(d.inviteCode || d.teamId), {
  message: 'Provide either an invite code or a teamId',
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
  isOpen?: boolean;
  createdAt: string;
  members: TeamMemberDTO[];
}
