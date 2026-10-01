import { z } from 'zod';

export const ROLES = ['STUDENT', 'ORGANIZER', 'JUDGE', 'ADMIN'] as const;
export const roleSchema = z.enum(ROLES);
export type Role = z.infer<typeof roleSchema>;

/** Roles an ADMIN can create through POST /api/users (students self-register). */
export const STAFF_ROLES = ['ORGANIZER', 'JUDGE'] as const;
export const staffRoleSchema = z.enum(STAFF_ROLES);
