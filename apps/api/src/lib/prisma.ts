import path from 'node:path';
import { PrismaClient } from '@prisma/client';

try {
  process.loadEnvFile?.(path.resolve(import.meta.dirname, '../../../../.env'));
} catch {
  // Ignore if root .env is absent
}

const globalForPrisma = globalThis as unknown as { prisma?: PrismaClient };

export const prisma = globalForPrisma.prisma ?? new PrismaClient();

if (process.env.NODE_ENV !== 'production') globalForPrisma.prisma = prisma;
