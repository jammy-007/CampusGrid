import { beforeAll, describe, expect, it } from 'vitest';
import { as, makeEvent, makeInstitution, makeUser, resetDb } from './helpers';
import { prisma } from '../src/lib/prisma';
import { clearGithubCache } from '../src/modules/submissions/githubValidator';

describe('hackathon module (Agent 4)', () => {
  let inst: string;
  let org: string;
  let student1: string;
  let student2: string;
  let judge1: string;
  let judge2: string;
  let unassignedJudge: string;
  let hackathonId: string;
  let teamId: string;
  let submissionId: string;

  beforeAll(async () => {
    await resetDb();
    clearGithubCache();

    inst = (await makeInstitution()).id;
    org = (await makeUser(inst, 'ORGANIZER', 'Organizer')).id;
    student1 = (await makeUser(inst, 'STUDENT', 'Student 1')).id;
    student2 = (await makeUser(inst, 'STUDENT', 'Student 2')).id;
    judge1 = (await makeUser(inst, 'JUDGE', 'Faculty Judge 1')).id;
    judge2 = (await makeUser(inst, 'JUDGE', 'Faculty Judge 2')).id;
    unassignedJudge = (await makeUser(inst, 'JUDGE', 'Unassigned Judge')).id;

    // Create HACKATHON event
    const now = Date.now();
    const event = await makeEvent(inst, org, {
      title: 'MegaHack 2026',
      type: 'HACKATHON',
      isTeamEvent: true,
      minTeamSize: 2,
      maxTeamSize: 4,
      status: 'PUBLISHED',
      startsAt: new Date(now - 24 * 3600_000), // started 24h ago
      endsAt: new Date(now + 24 * 3600_000), // ends in 24h
      registrationDeadline: new Date(now + 12 * 3600_000),
    });
    hackathonId = event.id;

    // Register student1 and student2
    await as(student1).post(`/api/events/${hackathonId}/register`);
    await as(student2).post(`/api/events/${hackathonId}/register`);

    // Create team
    const teamRes = await as(student1).post(`/api/events/${hackathonId}/teams`).send({ name: 'CodeWarriors' });
    teamId = teamRes.body.team.id;
    const inviteCode = teamRes.body.team.inviteCode;

    // student2 joins team
    await as(student2).post('/api/teams/join').send({ inviteCode });
  });

  describe('submissions', () => {
    it('rejects student with no team from submitting', async () => {
      const loner = (await makeUser(inst, 'STUDENT', 'Solo')).id;
      await as(loner).post(`/api/events/${hackathonId}/register`);

      const res = await as(loner).put(`/api/events/${hackathonId}/submissions/mine`).send({
        repoUrl: 'https://github.com/myteam/project',
      });
      expect(res.status).toBe(400);
      expect(res.body.error.code).toBe('NO_TEAM');
    });

    it('rejects invalid GitHub repo URL syntax', async () => {
      const res = await as(student1).put(`/api/events/${hackathonId}/submissions/mine`).send({
        repoUrl: 'https://gitlab.com/invalid/repo',
      });
      expect(res.status).toBe(400);
      expect(res.body.error.code).toBe('VALIDATION_ERROR');
    });

    it('creates a submission in the database for team', async () => {
      // Direct insertion or via API with a mock repo
      const sub = await prisma.submission.create({
        data: {
          eventId: hackathonId,
          teamId,
          repoUrl: 'https://github.com/codewarriors/hackathon-mvp',
          repoOwner: 'codewarriors',
          repoName: 'hackathon-mvp',
          defaultBranch: 'main',
          lastCommitSha: 'a1b2c3d4',
          lastCommitAt: new Date(),
          description: 'A revolutionary campus event tool',
          validatedAt: new Date(),
        },
      });
      submissionId = sub.id;

      // Now query through GET /api/events/:eventId/submissions/mine
      const mineRes = await as(student1).get(`/api/events/${hackathonId}/submissions/mine`);
      expect(mineRes.status).toBe(200);
      expect(mineRes.body.submission).toMatchObject({
        id: submissionId,
        repoOwner: 'codewarriors',
        repoName: 'hackathon-mvp',
      });

      // Teammate student2 should see the exact same submission
      const teammateRes = await as(student2).get(`/api/events/${hackathonId}/submissions/mine`);
      expect(teammateRes.body.submission.id).toBe(submissionId);
    });

    it('rejects submissions if event deadline has passed', async () => {
      const pastHackathon = await makeEvent(inst, org, {
        title: 'Past Hack',
        type: 'HACKATHON',
        isTeamEvent: true,
        startsAt: new Date(Date.now() - 48 * 3600_000),
        endsAt: new Date(Date.now() - 12 * 3600_000), // ended 12h ago
      });

      const res = await as(student1).put(`/api/events/${pastHackathon.id}/submissions/mine`).send({
        repoUrl: 'https://github.com/myteam/project',
      });
      expect(res.status).toBe(400);
      expect(res.body.error.code).toBe('SUBMISSIONS_CLOSED');
    });
  });

  describe('rubric and judge assignment', () => {
    it('creates and returns default rubric', async () => {
      const res = await as(org).get(`/api/events/${hackathonId}/rubric`);
      expect(res.status).toBe(200);
      expect(res.body.rubric.criteria.length).toBeGreaterThan(0);
      expect(res.body.rubric.isLocked).toBe(false);
    });

    it('organizer can update rubric criteria when unlocked', async () => {
      const newCriteria = [
        { name: 'Architecture', description: 'Clean code & tests', weight: 2, maxScore: 10, order: 0 },
        { name: 'UI / UX', description: 'Usability & polish', weight: 1, maxScore: 10, order: 1 },
      ];

      const res = await as(org).put(`/api/events/${hackathonId}/rubric`).send({
        criteria: newCriteria,
      });

      expect(res.status).toBe(200);
      expect(res.body.rubric.criteria).toHaveLength(2);
      expect(res.body.rubric.criteria[0].name).toBe('Architecture');
    });

    it('organizer can assign judges to the hackathon', async () => {
      const res = await as(org).put(`/api/events/${hackathonId}/judges`).send({
        judgeIds: [judge1, judge2],
      });

      expect(res.status).toBe(200);
      const assigned = res.body.judges.filter((j: { assigned: boolean }) => j.assigned);
      expect(assigned).toHaveLength(2);
      expect(assigned.map((j: { id: string }) => j.id)).toContain(judge1);
    });
  });

  describe('judging queue and scoring', () => {
    it('unassigned judge gets 403 when accessing queue', async () => {
      const res = await as(unassignedJudge).get(`/api/judge/events/${hackathonId}/queue`);
      expect(res.status).toBe(403);
      expect(res.body.error.code).toBe('FORBIDDEN');
    });

    it('assigned judge can access queue', async () => {
      const res = await as(judge1).get(`/api/judge/events/${hackathonId}/queue`);
      expect(res.status).toBe(200);
      expect(res.body.queue).toHaveLength(1);
      expect(res.body.queue[0].submission.id).toBe(submissionId);
      expect(res.body.queue[0].isFullyScored).toBe(false);
    });

    it('unassigned judge gets 403 on scoring', async () => {
      const rubricRes = await as(org).get(`/api/events/${hackathonId}/rubric`);
      const c1 = rubricRes.body.rubric.criteria[0].id;

      const res = await as(unassignedJudge).put(`/api/submissions/${submissionId}/scores`).send({
        scores: [{ criterionId: c1, value: 8 }],
      });
      expect(res.status).toBe(403);
      expect(res.body.error.code).toBe('FORBIDDEN');
    });

    it('assigned judge can score submission and scores are clamped', async () => {
      const rubricRes = await as(org).get(`/api/events/${hackathonId}/rubric`);
      const criteria = rubricRes.body.rubric.criteria;

      // Judge 1 scores submission (give 15 on maxScore 10 to test clamping)
      const res = await as(judge1).put(`/api/submissions/${submissionId}/scores`).send({
        scores: [
          { criterionId: criteria[0].id, value: 15, comment: 'Great architecture' },
          { criterionId: criteria[1].id, value: 8, comment: 'Nice UI' },
        ],
      });

      expect(res.status).toBe(200);
      expect(res.body.scores[0].value).toBe(10); // clamped to maxScore 10
      expect(res.body.scores[1].value).toBe(8);

      // Verify queue shows submission fully scored by judge1
      const queueRes = await as(judge1).get(`/api/judge/events/${hackathonId}/queue`);
      expect(queueRes.body.queue[0].isFullyScored).toBe(true);
      expect(queueRes.body.progress.scored).toBe(1);
    });

    it('locks rubric from further modifications once scores exist', async () => {
      const res = await as(org).put(`/api/events/${hackathonId}/rubric`).send({
        criteria: [{ name: 'Changed criterion', weight: 1, maxScore: 10, order: 0 }],
      });

      expect(res.status).toBe(409);
      expect(res.body.error.code).toBe('RUBRIC_LOCKED');
    });
  });

  describe('leaderboard', () => {
    it('returns calculated leaderboard for event', async () => {
      // Judge 2 also scores
      const rubricRes = await as(org).get(`/api/events/${hackathonId}/rubric`);
      const criteria = rubricRes.body.rubric.criteria;

      await as(judge2).put(`/api/submissions/${submissionId}/scores`).send({
        scores: [
          { criterionId: criteria[0].id, value: 8 },
          { criterionId: criteria[1].id, value: 9 },
        ],
      });

      const res = await as(student1).get(`/api/events/${hackathonId}/leaderboard`);
      expect(res.status).toBe(200);
      expect(res.body.leaderboard.rows).toHaveLength(1);

      const topRow = res.body.leaderboard.rows[0];
      expect(topRow.rank).toBe(1);
      expect(topRow.teamName).toBe('CodeWarriors');
      expect(topRow.judgesScored).toBe(2);
      expect(topRow.judgesAssigned).toBe(2);
      expect(topRow.score).toBeGreaterThan(0);
      expect(topRow.perCriterion).toHaveLength(2);
    });
  });
});
