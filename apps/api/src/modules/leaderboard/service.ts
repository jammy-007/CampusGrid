import {
  calculateLeaderboard,
  type LeaderboardDTO,
} from '@campusgrid/shared';
import { prisma } from '../../lib/prisma';

export async function fetchAndComputeLeaderboard(
  eventId: string,
  institutionId?: string,
): Promise<LeaderboardDTO | null> {
  const event = await prisma.event.findFirst({
    where: {
      id: eventId,
      ...(institutionId ? { institutionId } : {}),
    },
  });

  if (!event) return null;

  const rubric = await prisma.rubric.findUnique({
    where: { eventId },
    include: { criteria: { orderBy: { order: 'asc' } } },
  });

  const criteria = rubric ? rubric.criteria : [];
  const judgesAssignedCount = await prisma.judgeAssignment.count({
    where: { eventId },
  });

  const submissions = await prisma.submission.findMany({
    where: { eventId },
    include: {
      team: true,
      scores: true,
    },
  });

  const scoringSubmissions = submissions.map((sub) => ({
    id: sub.id,
    teamId: sub.teamId,
    teamName: sub.team.name,
    submittedAt: sub.submittedAt,
    scores: sub.scores.map((s) => ({
      judgeId: s.judgeId,
      criterionId: s.criterionId,
      value: s.value,
    })),
  }));

  return calculateLeaderboard({
    eventId,
    criteria: criteria.map((c) => ({
      id: c.id,
      name: c.name,
      weight: c.weight,
      maxScore: c.maxScore,
      order: c.order,
    })),
    submissions: scoringSubmissions,
    judgesAssignedCount,
  });
}
