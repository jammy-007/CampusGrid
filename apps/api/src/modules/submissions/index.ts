import { Router } from 'express';
import {
  type SubmissionDTO,
  submitHackathonSchema,
} from '@campusgrid/shared';
import { prisma } from '../../lib/prisma';
import { requireAuth } from '../../middleware/auth';
import {
  GitHubValidationError,
  validateGithubRepository,
} from './githubValidator';

export const router = Router();

function toSubmissionDTO(
  sub: {
    id: string;
    eventId: string;
    teamId: string;
    repoUrl: string;
    repoOwner: string;
    repoName: string;
    defaultBranch: string;
    lastCommitSha: string;
    lastCommitAt: Date;
    demoUrl: string | null;
    description: string;
    validatedAt: Date;
    submittedAt: Date;
    updatedAt: Date;
    team?: { name: string };
    event?: { endsAt: Date };
  },
  eventEndsAt?: Date,
): SubmissionDTO {
  const deadline = eventEndsAt || sub.event?.endsAt;
  const isLate = deadline ? sub.lastCommitAt.getTime() > deadline.getTime() : false;
  return {
    id: sub.id,
    eventId: sub.eventId,
    teamId: sub.teamId,
    teamName: sub.team?.name,
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
    commitsAfterDeadline: isLate,
  };
}

// ----------------------------------------------------------------------
// PUT /events/:eventId/submissions/mine
// ----------------------------------------------------------------------
router.put('/events/:eventId/submissions/mine', requireAuth, async (req, res) => {
  const eventId = String(req.params.eventId);
  const parsed = submitHackathonSchema.safeParse(req.body);
  if (!parsed.success) {
    res.status(400).json({
      error: {
        code: 'VALIDATION_ERROR',
        message: parsed.error.issues[0]?.message ?? 'Invalid submission data',
      },
    });
    return;
  }
  const input = parsed.data;

  const event = await prisma.event.findFirst({
    where: { id: eventId, institutionId: req.user!.institutionId },
  });
  if (!event) {
    res.status(404).json({ error: { code: 'EVENT_NOT_FOUND', message: 'Event not found' } });
    return;
  }
  if (event.type !== 'HACKATHON') {
    res.status(400).json({
      error: { code: 'NOT_A_HACKATHON', message: 'Submissions are only allowed for hackathons' },
    });
    return;
  }

  // Check deadline
  if (new Date() > event.endsAt) {
    res.status(400).json({
      error: {
        code: 'SUBMISSIONS_CLOSED',
        message: 'Submissions are closed as the event deadline has passed',
      },
    });
    return;
  }

  // Check team membership
  const reg = await prisma.registration.findUnique({
    where: { eventId_userId: { eventId, userId: req.user!.id } },
    include: { team: true },
  });

  if (!reg || reg.status !== 'CONFIRMED' || !reg.teamId) {
    res.status(400).json({
      error: {
        code: 'NO_TEAM',
        message: 'You must be part of a registered team to make a submission',
      },
    });
    return;
  }

  // Validate GitHub repo
  let validation;
  try {
    validation = await validateGithubRepository({
      repoUrl: input.repoUrl,
      startsAt: event.startsAt,
      endsAt: event.endsAt,
    });
  } catch (err) {
    if (err instanceof GitHubValidationError) {
      res.status(err.statusCode).json({
        error: { code: err.code, message: err.message },
      });
      return;
    }
    res.status(503).json({
      error: { code: 'GITHUB_UNAVAILABLE', message: 'GitHub validation service error' },
    });
    return;
  }

  const submission = await prisma.submission.upsert({
    where: { teamId: reg.teamId },
    create: {
      eventId,
      teamId: reg.teamId,
      repoUrl: input.repoUrl,
      repoOwner: validation.owner,
      repoName: validation.repo,
      defaultBranch: validation.defaultBranch,
      lastCommitSha: validation.lastCommitSha,
      lastCommitAt: validation.lastCommitAt,
      demoUrl: input.demoUrl || null,
      description: input.description,
      validatedAt: validation.validatedAt,
    },
    update: {
      repoUrl: input.repoUrl,
      repoOwner: validation.owner,
      repoName: validation.repo,
      defaultBranch: validation.defaultBranch,
      lastCommitSha: validation.lastCommitSha,
      lastCommitAt: validation.lastCommitAt,
      demoUrl: input.demoUrl || null,
      description: input.description,
      validatedAt: validation.validatedAt,
    },
    include: { team: true },
  });

  res.json({ submission: toSubmissionDTO(submission, event.endsAt) });
});

// ----------------------------------------------------------------------
// GET /events/:eventId/submissions/mine
// ----------------------------------------------------------------------
router.get('/events/:eventId/submissions/mine', requireAuth, async (req, res) => {
  const eventId = String(req.params.eventId);

  const reg = await prisma.registration.findUnique({
    where: { eventId_userId: { eventId, userId: req.user!.id } },
  });

  if (!reg || !reg.teamId) {
    res.json({ submission: null });
    return;
  }

  const submission = await prisma.submission.findUnique({
    where: { teamId: reg.teamId },
    include: { team: true, event: true },
  });

  if (!submission) {
    res.json({ submission: null });
    return;
  }

  res.json({ submission: toSubmissionDTO(submission) });
});

// ----------------------------------------------------------------------
// GET /events/:eventId/submissions
// ----------------------------------------------------------------------
router.get('/events/:eventId/submissions', requireAuth, async (req, res) => {
  const eventId = String(req.params.eventId);

  const event = await prisma.event.findFirst({
    where: { id: eventId, institutionId: req.user!.institutionId },
  });
  if (!event) {
    res.status(404).json({ error: { code: 'EVENT_NOT_FOUND', message: 'Event not found' } });
    return;
  }

  const submissions = await prisma.submission.findMany({
    where: { eventId },
    include: { team: true },
    orderBy: { submittedAt: 'asc' },
  });

  res.json({
    submissions: submissions.map((s) => toSubmissionDTO(s, event.endsAt)),
  });
});

// ----------------------------------------------------------------------
// POST /submissions/:id/revalidate
// ----------------------------------------------------------------------
router.post('/submissions/:id/revalidate', requireAuth, async (req, res) => {
  const id = String(req.params.id);

  const submission = await prisma.submission.findUnique({
    where: { id },
    include: { event: true, team: true },
  });

  if (!submission || submission.event.institutionId !== req.user!.institutionId) {
    res.status(404).json({ error: { code: 'SUBMISSION_NOT_FOUND', message: 'Submission not found' } });
    return;
  }

  const isOrganizer = req.user!.role === 'ADMIN' || req.user!.id === submission.event.organizerId;
  if (!isOrganizer) {
    res.status(403).json({
      error: { code: 'FORBIDDEN', message: 'Only organizers can trigger submission revalidation' },
    });
    return;
  }

  let validation;
  try {
    validation = await validateGithubRepository({
      repoUrl: submission.repoUrl,
      startsAt: submission.event.startsAt,
      endsAt: submission.event.endsAt,
      bypassCache: true,
    });
  } catch (err) {
    if (err instanceof GitHubValidationError) {
      res.status(err.statusCode).json({
        error: { code: err.code, message: err.message },
      });
      return;
    }
    res.status(503).json({
      error: { code: 'GITHUB_UNAVAILABLE', message: 'GitHub validation service error' },
    });
    return;
  }

  const updated = await prisma.submission.update({
    where: { id },
    data: {
      defaultBranch: validation.defaultBranch,
      lastCommitSha: validation.lastCommitSha,
      lastCommitAt: validation.lastCommitAt,
      validatedAt: validation.validatedAt,
    },
    include: { team: true },
  });

  res.json({
    submission: toSubmissionDTO(updated, submission.event.endsAt),
    commitsAfterDeadline: validation.commitsAfterDeadline,
  });
});
