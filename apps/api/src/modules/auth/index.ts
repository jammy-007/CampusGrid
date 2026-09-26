import { Router } from 'express';
import bcrypt from 'bcryptjs';
import { AUTH_COOKIE, loginSchema, registerSchema, type InstitutionDTO } from '@campusgrid/shared';
import { prisma } from '../../lib/prisma';
import { authCookieOptions, signToken } from '../../lib/jwt';
import { parse } from '../../lib/validate';
import { badRequest, conflict, unauthorized } from '../../lib/errors';
import { requireAuth } from '../../middleware/auth';

export const router = Router();

const BCRYPT_ROUNDS = 10;

/** Public list for the register form's institution picker. */
router.get('/institutions', async (_req, res) => {
  const institutions: InstitutionDTO[] = await prisma.institution.findMany({
    select: { id: true, name: true, slug: true },
    orderBy: { name: 'asc' },
  });
  res.json({ institutions });
});

/** Students self-register; ORGANIZER / JUDGE accounts come from POST /api/users (ADMIN). */
router.post('/auth/register', async (req, res) => {
  const input = parse(registerSchema, req.body);
  const institution = await prisma.institution.findUnique({ where: { slug: input.institutionSlug } });
  if (!institution) throw badRequest('Unknown institution', 'UNKNOWN_INSTITUTION');

  const existing = await prisma.user.findUnique({ where: { email: input.email } });
  if (existing) throw conflict('An account with that email already exists', 'EMAIL_TAKEN');

  const user = await prisma.user.create({
    data: {
      institutionId: institution.id,
      email: input.email,
      name: input.name,
      usn: input.usn || null,
      role: 'STUDENT',
      passwordHash: await bcrypt.hash(input.password, BCRYPT_ROUNDS),
    },
    select: { id: true, role: true, institutionId: true, name: true, email: true },
  });

  res.cookie(AUTH_COOKIE, signToken(user.id), authCookieOptions);
  res.status(201).json({ user });
});

router.post('/auth/login', async (req, res) => {
  const input = parse(loginSchema, req.body);
  const user = await prisma.user.findUnique({ where: { email: input.email } });
  const ok = user ? await bcrypt.compare(input.password, user.passwordHash) : false;
  if (!user || !ok) throw unauthorized('Wrong email or password', 'INVALID_CREDENTIALS');

  res.cookie(AUTH_COOKIE, signToken(user.id), authCookieOptions);
  res.json({
    user: { id: user.id, role: user.role, institutionId: user.institutionId, name: user.name, email: user.email },
  });
});

router.post('/auth/logout', (_req, res) => {
  const { maxAge: _maxAge, ...clearOptions } = authCookieOptions;
  res.clearCookie(AUTH_COOKIE, clearOptions);
  res.status(204).end();
});

router.get('/auth/me', requireAuth, (req, res) => {
  res.json({ user: req.user });
});
