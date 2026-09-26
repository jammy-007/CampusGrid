import type { SessionUser } from '@campusgrid/shared';
import { prisma } from './prisma';

/** Loads the session user for a token's user id (shared by HTTP and Socket.IO auth). */
export async function loadSessionUser(userId: string): Promise<SessionUser | null> {
  const user = await prisma.user.findUnique({
    where: { id: userId },
    select: { id: true, role: true, institutionId: true, name: true, email: true },
  });
  return user;
}
