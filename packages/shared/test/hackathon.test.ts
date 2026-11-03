import { describe, expect, it } from 'vitest';
import {
  calculateLeaderboard,
  parseGithubUrl,
  type ScoringCriterion,
  type ScoringSubmission,
} from '../src/hackathon';

describe('GitHub URL Parser', () => {
  it('parses valid GitHub repository URLs', () => {
    expect(parseGithubUrl('https://github.com/facebook/react')).toEqual({
      owner: 'facebook',
      repo: 'react',
    });
    expect(parseGithubUrl('https://github.com/owner/repo.git')).toEqual({
      owner: 'owner',
      repo: 'repo',
    });
    expect(parseGithubUrl('https://www.github.com/my-org/my_repo/')).toEqual({
      owner: 'my-org',
      repo: 'my_repo',
    });
  });

  it('rejects invalid or non-GitHub URLs', () => {
    expect(parseGithubUrl('https://gitlab.com/owner/repo')).toBeNull();
    expect(parseGithubUrl('https://github.com/only-owner')).toBeNull();
    expect(parseGithubUrl('not-a-url')).toBeNull();
    expect(parseGithubUrl('https://github.com/owner/repo/pull/1')).toBeNull();
  });
});

describe('calculateLeaderboard', () => {
  const criteria: ScoringCriterion[] = [
    { id: 'c1', name: 'Originality', weight: 1, maxScore: 10 },
    { id: 'c2', name: 'Technical Depth', weight: 2, maxScore: 20 },
  ];

  it('calculates weighted score correctly for a fully scored submission', () => {
    // Total weight = 1 + 2 = 3
    // Judge 1:
    // c1: 10/10 * 1 = 1.0
    // c2: 20/20 * 2 = 2.0
    // sum = 3.0 / 3 * 100 = 100
    const submissions: ScoringSubmission[] = [
      {
        id: 's1',
        teamId: 't1',
        teamName: 'Team Alpha',
        submittedAt: '2026-11-01T10:00:00.000Z',
        scores: [
          { judgeId: 'j1', criterionId: 'c1', value: 10 },
          { judgeId: 'j1', criterionId: 'c2', value: 20 },
        ],
      },
    ];

    const result = calculateLeaderboard({
      eventId: 'e1',
      criteria,
      submissions,
      judgesAssignedCount: 2,
    });

    expect(result.rows).toHaveLength(1);
    expect(result.rows[0].score).toBe(100);
    expect(result.rows[0].judgesScored).toBe(1);
    expect(result.rows[0].judgesAssigned).toBe(2);
    expect(result.rows[0].rank).toBe(1);
  });

  it('averages multiple judges and excludes partially scored judges from submission score', () => {
    // Judge 1: c1: 8/10 (0.8), c2: 10/20 (1.0) -> (1.8 / 3) * 100 = 60
    // Judge 2: c1: 10/10 (1.0), c2: 20/20 (2.0) -> (3.0 / 3) * 100 = 100
    // Mean of Judge 1 & Judge 2 = (60 + 100) / 2 = 80
    // Judge 3 only scored c1: partially scored, so excluded from submission score
    const submissions: ScoringSubmission[] = [
      {
        id: 's1',
        teamId: 't1',
        teamName: 'Team Alpha',
        submittedAt: '2026-11-01T10:00:00.000Z',
        scores: [
          { judgeId: 'j1', criterionId: 'c1', value: 8 },
          { judgeId: 'j1', criterionId: 'c2', value: 10 },
          { judgeId: 'j2', criterionId: 'c1', value: 10 },
          { judgeId: 'j2', criterionId: 'c2', value: 20 },
          { judgeId: 'j3', criterionId: 'c1', value: 5 },
        ],
      },
    ];

    const result = calculateLeaderboard({
      eventId: 'e1',
      criteria,
      submissions,
      judgesAssignedCount: 3,
    });

    expect(result.rows[0].score).toBe(80);
    expect(result.rows[0].judgesScored).toBe(2);
  });

  it('breaks ties using earliest submittedAt', () => {
    const submissions: ScoringSubmission[] = [
      {
        id: 's-late',
        teamId: 't-late',
        teamName: 'Late Team',
        submittedAt: '2026-11-01T12:00:00.000Z',
        scores: [
          { judgeId: 'j1', criterionId: 'c1', value: 10 },
          { judgeId: 'j1', criterionId: 'c2', value: 20 },
        ],
      },
      {
        id: 's-early',
        teamId: 't-early',
        teamName: 'Early Team',
        submittedAt: '2026-11-01T09:00:00.000Z',
        scores: [
          { judgeId: 'j1', criterionId: 'c1', value: 10 },
          { judgeId: 'j1', criterionId: 'c2', value: 20 },
        ],
      },
    ];

    const result = calculateLeaderboard({
      eventId: 'e1',
      criteria,
      submissions,
      judgesAssignedCount: 1,
    });

    expect(result.rows[0].teamName).toBe('Early Team');
    expect(result.rows[0].rank).toBe(1);
    expect(result.rows[1].teamName).toBe('Late Team');
    expect(result.rows[1].rank).toBe(2);
  });

  it('handles empty scores and zero judges', () => {
    const submissions: ScoringSubmission[] = [
      {
        id: 's1',
        teamId: 't1',
        teamName: 'Team No Scores',
        submittedAt: '2026-11-01T10:00:00.000Z',
        scores: [],
      },
    ];

    const result = calculateLeaderboard({
      eventId: 'e1',
      criteria,
      submissions,
      judgesAssignedCount: 2,
    });

    expect(result.rows[0].score).toBe(0);
    expect(result.rows[0].judgesScored).toBe(0);
  });
});
