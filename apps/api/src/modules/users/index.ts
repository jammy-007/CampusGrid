import { Router } from 'express';
import bcrypt from 'bcryptjs';
import { z } from 'zod';
import { createUserSchema, roleSchema } from '@campusgrid/shared';
import { prisma } from '../../lib/prisma';
import { parse } from '../../lib/validate';
import { conflict } from '../../lib/errors';
import { requireAuth, requireRole } from '../../middleware/auth';

export const router = Router();

const publicUser = { id: true, name: true, email: true, role: true, usn: true, createdAt: true } as const;

/** ADMIN creates ORGANIZER / JUDGE accounts in their own institution. */
router.post('/users', requireAuth, requireRole('ADMIN'), async (req, res) => {
  const input = parse(createUserSchema, req.body);
  if (await prisma.user.findUnique({ where: { email: input.email } })) {
    throw conflict('An account with that email already exists', 'EMAIL_TAKEN');
  }
  const user = await prisma.user.create({
    data: {
      institutionId: req.user!.institutionId,
      name: input.name,
      email: input.email,
      role: input.role,
      passwordHash: await bcrypt.hash(input.password, 10),
    },
    select: publicUser,
  });
  res.status(201).json({ user });
});

/** Campus users, optionally by role (e.g. ?role=JUDGE). ADMIN and ORGANIZER only. */
router.get('/users', requireAuth, requireRole('ADMIN', 'ORGANIZER'), async (req, res) => {
  const { role } = parse(z.object({ role: roleSchema.optional() }), req.query);
  const users = await prisma.user.findMany({
    where: { institutionId: req.user!.institutionId, ...(role ? { role } : {}) },
    select: publicUser,
    orderBy: { name: 'asc' },
  });
  res.json({ users });
});
