import { z } from 'zod';
import { roleSchema, staffRoleSchema } from './roles';

const email = z.string().trim().toLowerCase().email();
const password = z.string().min(8, 'Password must be at least 8 characters').max(128);

export const registerSchema = z.object({
  institutionSlug: z.string().trim().min(1),
  name: z.string().trim().min(1).max(100),
  email,
  password,
  usn: z.string().trim().max(32).optional(),
});
export type RegisterInput = z.infer<typeof registerSchema>;

export const loginSchema = z.object({
  email,
  password: z.string().min(1),
});
export type LoginInput = z.infer<typeof loginSchema>;

/** ADMIN creates ORGANIZER / JUDGE accounts in their own institution. */
export const createUserSchema = z.object({
  name: z.string().trim().min(1).max(100),
  email,
  password,
  role: staffRoleSchema,
});
export type CreateUserInput = z.infer<typeof createUserSchema>;

/** Shape of req.user on the API and of GET /api/auth/me. */
export const sessionUserSchema = z.object({
  id: z.string(),
  role: roleSchema,
  institutionId: z.string(),
  name: z.string(),
  email: z.string(),
});
export type SessionUser = z.infer<typeof sessionUserSchema>;

export interface InstitutionDTO {
  id: string;
  name: string;
  slug: string;
}

export const AUTH_COOKIE = 'cg_token';
export const AUTH_TOKEN_TTL_SECONDS = 60 * 60 * 24 * 7;
