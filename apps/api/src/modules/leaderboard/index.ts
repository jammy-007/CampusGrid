import { Router } from 'express';
import { requireAuth } from '../../middleware/auth';
import { fetchAndComputeLeaderboard } from './service';

export const router = Router();

// ----------------------------------------------------------------------
// GET /events/:eventId/leaderboard
// ----------------------------------------------------------------------
router.get('/events/:eventId/leaderboard', requireAuth, async (req, res) => {
  const eventId = String(req.params.eventId);

  const leaderboard = await fetchAndComputeLeaderboard(
    eventId,
    req.user!.institutionId,
  );

  if (!leaderboard) {
    res.status(404).json({
      error: { code: 'EVENT_NOT_FOUND', message: 'Event not found' },
    });
    return;
  }

  res.json({ leaderboard });
});
