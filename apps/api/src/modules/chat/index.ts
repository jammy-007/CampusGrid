import { Router } from 'express';
import { chatHistoryQuerySchema } from '@campusgrid/shared';
import { requireAuth } from '../../middleware/auth';
import { prisma } from '../../lib/prisma';
import { forbidden, notFound } from '../../lib/errors';
import { parse } from '../../lib/validate';
import { ensureRoom, isTeamMember, listMessages } from './service';

/** Owned by Agent 3. Mounted at /api in app.ts. */
export const router = Router();

/** History for team members, newest first: ?before=<iso>&beforeId=<id>&limit=50. */
router.get('/teams/:teamId/chat/messages', requireAuth, async (req, res) => {
  const user = req.user!;
  const teamId = String(req.params.teamId);
  const query = parse(chatHistoryQuerySchema, req.query);

  if (!(await isTeamMember(teamId, user.id))) {
    const team = await prisma.team.findUnique({ where: { id: teamId }, select: { event: { select: { institutionId: true } } } });
    if (!team || team.event.institutionId !== user.institutionId) throw notFound('Team not found');
    throw forbidden('Only team members can read this chat');
  }

  // Teams created before chat existed get their room on first open.
  await ensureRoom(teamId);
  res.json(await listMessages(teamId, query));
});
