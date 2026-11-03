import { z } from 'zod';

// ==========================================
// GitHub URL Validation & Parsing
// ==========================================

export const GITHUB_REPO_REGEX =
  /^https?:\/\/(?:www\.)?github\.com\/([a-zA-Z0-9_.-]+)\/([a-zA-Z0-9_.-]+?)(?:\.git|\/)?$/;

export function parseGithubUrl(url: string): { owner: string; repo: string } | null {
  const match = url.trim().match(GITHUB_REPO_REGEX);
  if (!match) return null;
  const owner = match[1];
  let repo = match[2];
  if (repo.endsWith('.git')) repo = repo.slice(0, -4);
  return { owner, repo };
}

export const githubUrlSchema = z
  .string()
  .trim()
  .refine((val) => parseGithubUrl(val) !== null, {
    message: 'Must be a valid public GitHub repository URL (e.g. https://github.com/owner/repo)',
  });

// ==========================================
// Submission Schemas & DTOs
// ==========================================

export const submitHackathonSchema = z.object({
  repoUrl: githubUrlSchema,
  demoUrl: z.string().trim().url('Must be a valid URL').optional().or(z.literal('')),
  description: z.string().trim().max(5000, 'Description must be under 5000 characters').default(''),
});
export type SubmitHackathonInput = z.infer<typeof submitHackathonSchema>;

export interface SubmissionDTO {
  id: string;
  eventId: string;
  teamId: string;
  teamName?: string;
  repoUrl: string;
  repoOwner: string;
  repoName: string;
  defaultBranch: string;
  lastCommitSha: string;
  lastCommitAt: string;
  demoUrl: string | null;
  description: string;
  validatedAt: string;
  submittedAt: string;
  updatedAt: string;
  commitsAfterDeadline?: boolean;
}

// ==========================================
// Rubric & Judging Schemas & DTOs
// ==========================================

export const rubricCriterionSchema = z.object({
  id: z.string().optional(),
  name: z.string().trim().min(1, 'Name is required').max(100),
  description: z.string().trim().max(1000).default(''),
  weight: z.number().positive('Weight must be positive').default(1),
  maxScore: z.number().int().positive('Max score must be positive').default(10),
  order: z.number().int().default(0),
});
export type RubricCriterionInput = z.infer<typeof rubricCriterionSchema>;

export const updateRubricSchema = z.object({
  criteria: z.array(rubricCriterionSchema).min(1, 'At least one criterion is required'),
});
export type UpdateRubricInput = z.infer<typeof updateRubricSchema>;

export interface RubricCriterionDTO {
  id: string;
  rubricId: string;
  name: string;
  description: string;
  weight: number;
  maxScore: number;
  order: number;
}

export interface RubricDTO {
  id: string;
  eventId: string;
  criteria: RubricCriterionDTO[];
  isLocked: boolean;
}

export const assignJudgesSchema = z.object({
  judgeIds: z.array(z.string()),
});
export type AssignJudgesInput = z.infer<typeof assignJudgesSchema>;

export interface JudgeDTO {
  id: string;
  name: string;
  email: string;
  assigned: boolean;
}

export const singleScoreInputSchema = z.object({
  criterionId: z.string().min(1),
  value: z.number().int().min(0),
  comment: z.string().trim().max(1000).optional().nullable(),
});

export const updateScoresSchema = z.object({
  scores: z.array(singleScoreInputSchema),
});
export type UpdateScoresInput = z.infer<typeof updateScoresSchema>;

export interface ScoreDTO {
  id: string;
  submissionId: string;
  judgeId: string;
  criterionId: string;
  value: number;
  comment: string | null;
  updatedAt: string;
}

export interface JudgeQueueItemDTO {
  submission: SubmissionDTO;
  scores: Array<{
    criterionId: string;
    value: number;
    comment: string | null;
  }>;
  isFullyScored: boolean;
}

// ==========================================
// Leaderboard & Realtime Schemas & DTOs
// ==========================================

export const liveSubscribeSchema = z.object({
  eventId: z.string().min(1),
});
export type LiveSubscribeInput = z.infer<typeof liveSubscribeSchema>;

export interface LeaderboardCriterionAvgDTO {
  criterionId: string;
  criterionName: string;
  averageScore: number;
  maxScore: number;
  weight: number;
}

export interface LeaderboardRowDTO {
  rank: number;
  teamId: string;
  teamName: string;
  submissionId: string;
  score: number;
  judgesScored: number;
  judgesAssigned: number;
  submittedAt: string;
  perCriterion: LeaderboardCriterionAvgDTO[];
}

export interface LeaderboardDTO {
  eventId: string;
  updatedAt: string;
  judgesAssigned: number;
  rows: LeaderboardRowDTO[];
}

// ==========================================
// Pure Scoring Logic
// ==========================================

export interface ScoringCriterion {
  id: string;
  name: string;
  weight: number;
  maxScore: number;
  order?: number;
}

export interface ScoringScore {
  judgeId: string;
  criterionId: string;
  value: number;
}

export interface ScoringSubmission {
  id: string;
  teamId: string;
  teamName: string;
  submittedAt: string | Date;
  scores: ScoringScore[];
}

/**
 * Calculates submission scores and leaderboard rankings according to Agent 4 specifications:
 * - per judge, judgeScore = Σ(value / maxScore × weight) / Σ weight × 100 over criteria scored
 * - submission score = mean of judgeScore over judges who scored it fully
 * - ties broken by earliest submittedAt
 * - returns per-criterion averages and number of judges
 */
export function calculateLeaderboard(params: {
  eventId: string;
  criteria: ScoringCriterion[];
  submissions: ScoringSubmission[];
  judgesAssignedCount: number;
}): LeaderboardDTO {
  const { eventId, criteria, submissions, judgesAssignedCount } = params;

  const criterionMap = new Map(criteria.map((c) => [c.id, c]));

  const rows: LeaderboardRowDTO[] = submissions.map((sub) => {
    // Group scores by judge
    const scoresByJudge = new Map<string, Map<string, number>>();
    // For per-criterion totals
    const criterionScoreSums = new Map<string, { sum: number; count: number }>();

    for (const c of criteria) {
      criterionScoreSums.set(c.id, { sum: 0, count: 0 });
    }

    for (const s of sub.scores) {
      const c = criterionMap.get(s.criterionId);
      if (!c) continue;
      const clampedValue = Math.min(Math.max(0, s.value), c.maxScore);

      if (!scoresByJudge.has(s.judgeId)) {
        scoresByJudge.set(s.judgeId, new Map());
      }
      scoresByJudge.get(s.judgeId)!.set(s.criterionId, clampedValue);

      const curr = criterionScoreSums.get(s.criterionId);
      if (curr) {
        curr.sum += clampedValue;
        curr.count += 1;
      }
    }

    // Evaluate judge scores for judges who scored fully
    const fullyScoredJudgeScores: number[] = [];

    for (const [, judgeScores] of scoresByJudge) {
      const isFullyScored = criteria.every((c) => judgeScores.has(c.id));
      if (!isFullyScored) continue;

      let weightedSum = 0;
      let weightsSum = 0;

      for (const c of criteria) {
        const val = judgeScores.get(c.id)!;
        const normalized = c.maxScore > 0 ? val / c.maxScore : 0;
        weightedSum += normalized * c.weight;
        weightsSum += c.weight;
      }

      const judgeScore = weightsSum > 0 ? (weightedSum / weightsSum) * 100 : 0;
      fullyScoredJudgeScores.push(judgeScore);
    }

    const finalScore =
      fullyScoredJudgeScores.length > 0
        ? fullyScoredJudgeScores.reduce((a, b) => a + b, 0) / fullyScoredJudgeScores.length
        : 0;

    const perCriterion: LeaderboardCriterionAvgDTO[] = criteria.map((c) => {
      const stats = criterionScoreSums.get(c.id);
      const avg = stats && stats.count > 0 ? stats.sum / stats.count : 0;
      return {
        criterionId: c.id,
        criterionName: c.name,
        averageScore: Math.round(avg * 100) / 100,
        maxScore: c.maxScore,
        weight: c.weight,
      };
    });

    const submittedAtISO =
      typeof sub.submittedAt === 'string' ? sub.submittedAt : sub.submittedAt.toISOString();

    return {
      rank: 0,
      teamId: sub.teamId,
      teamName: sub.teamName,
      submissionId: sub.id,
      score: Math.round(finalScore * 100) / 100,
      judgesScored: fullyScoredJudgeScores.length,
      judgesAssigned: judgesAssignedCount,
      submittedAt: submittedAtISO,
      perCriterion,
    };
  });

  // Sort rows: highest score first, ties broken by earliest submittedAt
  rows.sort((a, b) => {
    if (Math.abs(b.score - a.score) > 0.0001) {
      return b.score - a.score;
    }
    return new Date(a.submittedAt).getTime() - new Date(b.submittedAt).getTime();
  });

  // Assign ranks
  rows.forEach((row, index) => {
    row.rank = index + 1;
  });

  return {
    eventId,
    updatedAt: new Date().toISOString(),
    judgesAssigned: judgesAssignedCount,
    rows,
  };
}
