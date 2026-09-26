import jwt from 'jsonwebtoken';
import type { CookieOptions } from 'express';
import { AUTH_TOKEN_TTL_SECONDS } from '@campusgrid/shared';
import { env } from './env';

interface TokenPayload {
  sub: string;
}

export function signToken(userId: string): string {
  return jwt.sign({ sub: userId } satisfies TokenPayload, env.jwtSecret, {
    expiresIn: AUTH_TOKEN_TTL_SECONDS,
  });
}

/** Returns the user id, or null when the token is missing, expired or forged. */
export function verifyToken(token: string | undefined): string | null {
  if (!token) return null;
  try {
    const payload = jwt.verify(token, env.jwtSecret);
    if (typeof payload === 'object' && typeof payload.sub === 'string') return payload.sub;
    return null;
  } catch {
    return null;
  }
}

export const authCookieOptions: CookieOptions = {
  httpOnly: true,
  sameSite: 'lax',
  secure: env.isProd,
  path: '/',
  maxAge: AUTH_TOKEN_TTL_SECONDS * 1000,
};
