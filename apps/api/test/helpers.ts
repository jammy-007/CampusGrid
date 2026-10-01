import bcrypt from 'bcryptjs';
import request from 'supertest';
import type { Role } from '@prisma/client';
import { AUTH_COOKIE } from '@campusgrid/shared';
import { createApp } from '../src/app';
import { prisma } from '../src/lib/prisma';
import { signToken } from '../src/lib/jwt';

export const app = createApp();
export const PASSWORD = 'password123';
const passwordHash = bcrypt.hashSync(PASSWORD, 4);

/** Empties every table (all agents' models) between test files. */
export async function resetDb() {
  const tables = await prisma.$queryRaw<{ tablename: string }[]>`
    SELECT tablename FROM pg_tables WHERE schemaname = 'public' AND tablename <> '_prisma_migrations'`;
  if (tables.length) {
    await prisma.$executeRawUnsafe(
      `TRUNCATE ${tables.map((t) => `"public"."${t.tablename}"`).join(', ')} RESTART IDENTITY CASCADE`,
    );
  }
}

let seq = 0;
export async function makeInstitution(slug = `inst-${++seq}`) {
  return prisma.institution.create({ data: { name: `Institution ${slug}`, slug } });
}

export async function makeUser(institutionId: string, role: Role = 'STUDENT', name?: string) {
  const n = ++seq;
  return prisma.user.create({
    data: { institutionId, role, name: name ?? `${role.toLowerCase()} ${n}`, email: `user${n}@test.edu`, passwordHash },
  });
}

/** Cookie header value that signs requests in as userId. */
export function authCookie(userId: string) {
  return `${AUTH_COOKIE}=${signToken(userId)}`;
}

/** supertest agent pre-signed-in as userId. */
export function as(userId: string) {
  const cookie = authCookie(userId);
  const r = request(app);
  return {
    get: (url: string) => r.get(url).set('Cookie', cookie),
    post: (url: string) => r.post(url).set('Cookie', cookie),
    patch: (url: string) => r.patch(url).set('Cookie', cookie),
    put: (url: string) => r.put(url).set('Cookie', cookie),
    delete: (url: string) => r.delete(url).set('Cookie', cookie),
  };
}

const HOUR = 60 * 60 * 1000;

export async function makeEvent(
  institutionId: string,
  organizerId: string,
  overrides: Partial<Parameters<typeof prisma.event.create>[0]['data']> = {},
) {
  const now = Date.now();
  return prisma.event.create({
    data: {
      institutionId,
      organizerId,
      title: `Event ${++seq}`,
      type: 'FEST',
      venue: 'Hall',
      startsAt: new Date(now + 48 * HOUR),
      endsAt: new Date(now + 50 * HOUR),
      registrationDeadline: new Date(now + 24 * HOUR),
      status: 'PUBLISHED',
      ...overrides,
    } as Parameters<typeof prisma.event.create>[0]['data'],
  });
}
