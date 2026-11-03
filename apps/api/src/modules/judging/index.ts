import { Router } from 'express';
import {
  assignJudgesSchema,
  type JudgeDTO,
  type JudgeQueueItemDTO,
  type RubricCriterionDTO,
  type RubricDTO,
  type ScoreDTO,
  updateRubricSchema,
  updateScoresSchema,
} from '@campusgrid/shared';
import { bus } from '../../lib/bus';
import { prisma } from '../../lib/prisma';
import { requireAuth, requireEventOrganizer } from '../../middleware/auth';

export const router = Router();

// ----------------------------------------------------------------------
// Helper: get or create rubric with criteria
// ----------------------------------------------------------------------
async function getOrCreateRubric(eventId: string) {
  let rubric = await prisma.rubric.findUnique({
    where: { eventId },
    include: { criteria: { orderBy: { order: 'asc' } } },
  });

  if (!rubric) {
    rubric = await prisma.rubric.create({
      data: {
        eventId,
        criteria: {
          create: [
            { name: 'Technical Depth', description: 'Code quality, architecture and technical complexity', weight: 2, maxScore: 10, order: 0 },
            { name: 'Originality & Innovation', description: 'Novelty of the solution and creative problem solving', weight: 1.5, maxScore: 10, order: 1 },
            { name: 'Completeness & Demo', description: 'Working prototype and user experience', weight: 1, maxScore: 10, order: 2 },
          ],
        },
      },
      include: { criteria: { orderBy: { order: 'asc' } } },
    });
  }

  return rubric;
}

// ----------------------------------------------------------------------
// GET /events/:eventId/rubric
// ----------------------------------------------------------------------
router.get('/events/:eventId/rubric', requireAuth, async (req, res) => {
  const eventId = String(req.params.eventId);

  const event = await prisma.event.findFirst({
    where: { id: eventId, institutionId: req.user!.institutionId },
  });
  if (!event) {
    res.status(404).json({ error: { code: 'EVENT_NOT_FOUND', message: 'Event not found' } });
    return;
  }

  const rubric = await getOrCreateRubric(eventId);
  const scoreCount = await prisma.score.count({
    where: { submission: { eventId } },
  });

  const dto: RubricDTO = {
    id: rubric.id,
    eventId: rubric.eventId,
    isLocked: scoreCount > 0,
    criteria: rubric.criteria.map((c) => ({
      id: c.id,
      rubricId: c.rubricId,
      name: c.name,
      description: c.description,
      weight: c.weight,
      maxScore: c.maxScore,
      order: c.order,
    })),
  };

  res.json({ rubric: dto });
});

// ----------------------------------------------------------------------
// PUT /events/:eventId/rubric
// ----------------------------------------------------------------------
router.put(
  '/events/:eventId/rubric',
  requireAuth,
  requireEventOrganizer('eventId'),
  async (req, res) => {
    const eventId = String(req.params.eventId);
    const parsed = updateRubricSchema.safeParse(req.body);
    if (!parsed.success) {
      res.status(400).json({
        error: {
          code: 'VALIDATION_ERROR',
          message: parsed.error.issues[0]?.message ?? 'Invalid rubric data',
        },
      });
      return;
    }

    const scoreCount = await prisma.score.count({
      where: { submission: { eventId } },
    });
    if (scoreCount > 0) {
      res.status(409).json({
        error: {
          code: 'RUBRIC_LOCKED',
          message: 'Rubric is locked because scoring has already started',
        },
      });
      return;
    }

    const existingRubric = await getOrCreateRubric(eventId);

    const updatedRubric = await prisma.$transaction(async (tx) => {
      await tx.rubricCriterion.deleteMany({
        where: { rubricId: existingRubric.id },
      });

      return tx.rubric.update({
        where: { id: existingRubric.id },
        data: {
          criteria: {
            create: parsed.data.criteria.map((c, index) => ({
              name: c.name,
              description: c.description || '',
              weight: c.weight,
              maxScore: c.maxScore,
              order: c.order !== undefined ? c.order : index,
            })),
          },
        },
        include: { criteria: { orderBy: { order: 'asc' } } },
      });
    });

    const dto: RubricDTO = {
      id: updatedRubric.id,
      eventId: updatedRubric.eventId,
      isLocked: false,
      criteria: updatedRubric.criteria.map((c) => ({
        id: c.id,
        rubricId: c.rubricId,
        name: c.name,
        description: c.description,
        weight: c.weight,
        maxScore: c.maxScore,
        order: c.order,
      })),
    };

    res.json({ rubric: dto });
  },
);

// ----------------------------------------------------------------------
// GET /events/:eventId/judges
// ----------------------------------------------------------------------
router.get('/events/:eventId/judges', requireAuth, async (req, res) => {
  const eventId = String(req.params.eventId);

  const event = await prisma.event.findFirst({
    where: { id: eventId, institutionId: req.user!.institutionId },
  });
  if (!event) {
    res.status(404).json({ error: { code: 'EVENT_NOT_FOUND', message: 'Event not found' } });
    return;
  }

  // Find all faculty users with JUDGE role in same institution
  const judgeUsers = await prisma.user.findMany({
    where: {
      institutionId: req.user!.institutionId,
      role: { in: ['JUDGE', 'ADMIN'] },
    },
    orderBy: { name: 'asc' },
  });

  const assignments = await prisma.judgeAssignment.findMany({
    where: { eventId },
  });
  const assignedSet = new Set(assignments.map((a) => a.judgeId));

  const judges: JudgeDTO[] = judgeUsers.map((u) => ({
    id: u.id,
    name: u.name,
    email: u.email,
    assigned: assignedSet.has(u.id),
  }));

  res.json({ judges });
});

// ----------------------------------------------------------------------
// PUT /events/:eventId/judges
// ----------------------------------------------------------------------
router.put(
  '/events/:eventId/judges',
  requireAuth,
  requireEventOrganizer('eventId'),
  async (req, res) => {
    const eventId = String(req.params.eventId);
    const parsed = assignJudgesSchema.safeParse(req.body);
    if (!parsed.success) {
      res.status(400).json({
        error: {
          code: 'VALIDATION_ERROR',
          message: parsed.error.issues[0]?.message ?? 'Invalid judge assignment data',
        },
      });
      return;
    }

    const { judgeIds } = parsed.data;

    // Verify all judge IDs belong to institution
    const validJudges = await prisma.user.findMany({
      where: {
        id: { in: judgeIds },
        institutionId: req.user!.institutionId,
        role: { in: ['JUDGE', 'ADMIN'] },
      },
    });

    if (validJudges.length !== judgeIds.length) {
      res.status(400).json({
        error: { code: 'INVALID_JUDGES', message: 'One or more selected judges are invalid' },
      });
      return;
    }

    await prisma.$transaction(async (tx) => {
      await tx.judgeAssignment.deleteMany({ where: { eventId } });
      if (judgeIds.length > 0) {
        await tx.judgeAssignment.createMany({
          data: judgeIds.map((judgeId) => ({ eventId, judgeId })),
        });
      }
    });

    // Re-fetch all judges to return current state
    const allJudges = await prisma.user.findMany({
      where: {
        institutionId: req.user!.institutionId,
        role: { in: ['JUDGE', 'ADMIN'] },
      },
      orderBy: { name: 'asc' },
    });
    const assignedSet = new Set(judgeIds);

    const judges: JudgeDTO[] = allJudges.map((u) => ({
      id: u.id,
      name: u.name,
      email: u.email,
      assigned: assignedSet.has(u.id),
    }));

    res.json({ judges });
  },
);

// ----------------------------------------------------------------------
// GET /judge/events/:eventId/queue
// ----------------------------------------------------------------------
router.get('/judge/events/:eventId/queue', requireAuth, async (req, res) => {
  const eventId = String(req.params.eventId);

  if (req.user!.role !== 'JUDGE' && req.user!.role !== 'ADMIN') {
    res.status(403).json({
      error: { code: 'FORBIDDEN', message: 'Only judges can access the judging queue' },
    });
    return;
  }

  const event = await prisma.event.findFirst({
    where: { id: eventId, institutionId: req.user!.institutionId },
  });
  if (!event) {
    res.status(404).json({ error: { code: 'EVENT_NOT_FOUND', message: 'Event not found' } });
    return;
  }

  // Non-admins must be explicitly assigned to this event
  if (req.user!.role !== 'ADMIN') {
    const assignment = await prisma.judgeAssignment.findUnique({
      where: { eventId_judgeId: { eventId, judgeId: req.user!.id } },
    });
    if (!assignment) {
      res.status(403).json({
        error: { code: 'FORBIDDEN', message: 'You are not assigned as a judge for this event' },
      });
      return;
    }
  }

  const rubric = await getOrCreateRubric(eventId);
  const criteriaList: RubricCriterionDTO[] = rubric.criteria.map((c) => ({
    id: c.id,
    rubricId: c.rubricId,
    name: c.name,
    description: c.description,
    weight: c.weight,
    maxScore: c.maxScore,
    order: c.order,
  }));

  const submissions = await prisma.submission.findMany({
    where: { eventId },
    include: {
      team: true,
      scores: {
        where: { judgeId: req.user!.id },
      },
    },
    orderBy: { submittedAt: 'asc' },
  });

  const criteriaCount = criteriaList.length;

  const queue: JudgeQueueItemDTO[] = submissions.map((sub) => {
    const isFullyScored =
      criteriaCount > 0 &&
      criteriaList.every((c) => sub.scores.some((s) => s.criterionId === c.id));

    return {
      submission: {
        id: sub.id,
        eventId: sub.eventId,
        teamId: sub.teamId,
        teamName: sub.team.name,
        repoUrl: sub.repoUrl,
        repoOwner: sub.repoOwner,
        repoName: sub.repoName,
        defaultBranch: sub.defaultBranch,
        lastCommitSha: sub.lastCommitSha,
        lastCommitAt: sub.lastCommitAt.toISOString(),
        demoUrl: sub.demoUrl,
        description: sub.description,
        validatedAt: sub.validatedAt.toISOString(),
        submittedAt: sub.submittedAt.toISOString(),
        updatedAt: sub.updatedAt.toISOString(),
        commitsAfterDeadline: sub.lastCommitAt.getTime() > event.endsAt.getTime(),
      },
      scores: sub.scores.map((s) => ({
        criterionId: s.criterionId,
        value: s.value,
        comment: s.comment,
      })),
      isFullyScored,
    };
  });

  const scoredCount = queue.filter((item) => item.isFullyScored).length;

  res.json({
    event: {
      id: event.id,
      title: event.title,
      type: event.type,
      startsAt: event.startsAt.toISOString(),
      endsAt: event.endsAt.toISOString(),
    },
    criteria: criteriaList,
    queue,
    progress: {
      scored: scoredCount,
      total: queue.length,
    },
  });
});

// ----------------------------------------------------------------------
// PUT /submissions/:id/scores
// ----------------------------------------------------------------------
router.put('/submissions/:id/scores', requireAuth, async (req, res) => {
  const id = String(req.params.id);

  if (req.user!.role !== 'JUDGE' && req.user!.role !== 'ADMIN') {
    res.status(403).json({
      error: { code: 'FORBIDDEN', message: 'Only judges can score submissions' },
    });
    return;
  }

  const parsed = updateScoresSchema.safeParse(req.body);
  if (!parsed.success) {
    res.status(400).json({
      error: {
        code: 'VALIDATION_ERROR',
        message: parsed.error.issues[0]?.message ?? 'Invalid scores data',
      },
    });
    return;
  }

  const submission = await prisma.submission.findUnique({
    where: { id },
    include: { event: true },
  });

  if (!submission || submission.event.institutionId !== req.user!.institutionId) {
    res.status(404).json({ error: { code: 'SUBMISSION_NOT_FOUND', message: 'Submission not found' } });
    return;
  }

  if (req.user!.role !== 'ADMIN') {
    const assignment = await prisma.judgeAssignment.findUnique({
      where: {
        eventId_judgeId: { eventId: submission.eventId, judgeId: req.user!.id },
      },
    });
    if (!assignment) {
      res.status(403).json({
        error: { code: 'FORBIDDEN', message: 'You are not assigned as a judge for this event' },
      });
      return;
    }
  }

  const rubric = await getOrCreateRubric(submission.eventId);
  const criterionMap = new Map(rubric.criteria.map((c) => [c.id, c]));

  // Upsert each score
  const updatedScores: ScoreDTO[] = [];
  for (const item of parsed.data.scores) {
    const criterion = criterionMap.get(item.criterionId);
    if (!criterion) continue;

    const clampedValue = Math.min(Math.max(0, item.value), criterion.maxScore);

    const saved = await prisma.score.upsert({
      where: {
        submissionId_judgeId_criterionId: {
          submissionId: id,
          judgeId: req.user!.id,
          criterionId: item.criterionId,
        },
      },
      create: {
        submissionId: id,
        judgeId: req.user!.id,
        criterionId: item.criterionId,
        value: clampedValue,
        comment: item.comment || null,
      },
      update: {
        value: clampedValue,
        comment: item.comment || null,
      },
    });

    updatedScores.push({
      id: saved.id,
      submissionId: saved.submissionId,
      judgeId: saved.judgeId,
      criterionId: saved.criterionId,
      value: saved.value,
      comment: saved.comment,
      updatedAt: saved.updatedAt.toISOString(),
    });
  }

  // Emit score.updated on internal bus!
  bus.emit('score.updated', {
    eventId: submission.eventId,
    submissionId: submission.id,
  });

  res.json({ ok: true, scores: updatedScores });
});
