import type { RequestHandler } from 'express';
import { AUTH_COOKIE, type Role, type SessionUser } from '@campusgrid/shared';
import { prisma } from '../lib/prisma';
import { verifyToken } from '../lib/jwt';
import { loadSessionUser } from '../lib/users';
import { forbidden, notFound, unauthorized } from '../lib/errors';

declare global {
  // eslint-disable-next-line @typescript-eslint/no-namespace
  namespace Express {
    interface Request {
      /** Set by requireAuth / optionalAuth. */
      user?: SessionUser;
    }
  }
}

/** Sets req.user when a valid cg_token cookie is present; never rejects. */
export const optionalAuth: RequestHandler = async (req, _res, next) => {
  const userId = verifyToken(req.cookies?.[AUTH_COOKIE]);
  if (userId) {
    const user = await loadSessionUser(userId);
    if (user) req.user = user;
  }
  next();
};

/** 401 unless signed in; sets req.user = { id, role, institutionId, name, email }. */
export const requireAuth: RequestHandler = async (req, _res, next) => {
  if (!req.user) {
    const userId = verifyToken(req.cookies?.[AUTH_COOKIE]);
    const user = userId ? await loadSessionUser(userId) : null;
    if (!user) throw unauthorized();
    req.user = user;
  }
  next();
};

/** 403 unless req.user.role is one of roles. Use after requireAuth. */
export function requireRole(...roles: Role[]): RequestHandler {
  return (req, _res, next) => {
    if (!req.user) throw unauthorized();
    if (!roles.includes(req.user.role)) throw forbidden('Your role cannot do this');
    next();
  };
}

/**
 * 403 unless the user organizes the event in req.params[paramName] (ADMINs of the
 * same institution pass too). 404 when the event is not in the user's institution.
 * Use after requireAuth.
 */
export function requireEventOrganizer(paramName = 'eventId'): RequestHandler {
  return async (req, _res, next) => {
    if (!req.user) throw unauthorized();
    const eventId = req.params[paramName];
    if (typeof eventId !== 'string' || !eventId) throw notFound('Event not found');
    const event = await prisma.event.findUnique({
      where: { id: eventId },
      select: { organizerId: true, institutionId: true },
    });
    if (!event || event.institutionId !== req.user.institutionId) throw notFound('Event not found');
    const isAdmin = req.user.role === 'ADMIN';
    if (!isAdmin && event.organizerId !== req.user.id) throw forbidden('Only this event’s organizer can do this');
    next();
  };
}
