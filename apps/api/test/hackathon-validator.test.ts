import { describe, expect, it } from 'vitest';
import {
  clearGithubCache,
  GitHubValidationError,
  validateGithubRepository,
} from '../src/modules/submissions/githubValidator';

describe('GitHub Repository Validator', () => {
  const startsAt = new Date('2026-11-01T00:00:00Z');
  const endsAt = new Date('2026-11-03T00:00:00Z');

  it('validates a valid public repo with commits during event', async () => {
    clearGithubCache();
    const mockFetch: typeof fetch = async (input) => {
      const url = String(input);
      if (url.includes('/commits')) {
        return new Response(
          JSON.stringify([
            {
              sha: 'abc12345',
              commit: {
                committer: { date: '2026-11-01T12:00:00Z' },
                author: { date: '2026-11-01T12:00:00Z' },
                message: 'feat: hackathon MVP',
              },
            },
          ]),
          { status: 200, headers: { 'content-type': 'application/json' } },
        );
      }
      return new Response(
        JSON.stringify({
          name: 'hackathon-project',
          private: false,
          fork: false,
          default_branch: 'main',
        }),
        { status: 200, headers: { 'content-type': 'application/json' } },
      );
    };

    const res = await validateGithubRepository({
      repoUrl: 'https://github.com/my-team/hackathon-project',
      startsAt,
      endsAt,
      bypassCache: true,
      customFetch: mockFetch,
    });

    expect(res.owner).toBe('my-team');
    expect(res.repo).toBe('hackathon-project');
    expect(res.defaultBranch).toBe('main');
    expect(res.lastCommitSha).toBe('abc12345');
    expect(res.commitsAfterDeadline).toBe(false);
  });

  it('returns REPO_NOT_FOUND when repo does not exist', async () => {
    clearGithubCache();
    const mockFetch: typeof fetch = async () => new Response('Not Found', { status: 404 });

    await expect(
      validateGithubRepository({
        repoUrl: 'https://github.com/missing/nonexistent',
        startsAt,
        endsAt,
        bypassCache: true,
        customFetch: mockFetch,
      }),
    ).rejects.toMatchObject({
      code: 'REPO_NOT_FOUND',
    });
  });

  it('returns REPO_PRIVATE when repo is marked private', async () => {
    clearGithubCache();
    const mockFetch: typeof fetch = async () =>
      new Response(
        JSON.stringify({
          name: 'secret-repo',
          private: true,
          fork: false,
        }),
        { status: 200, headers: { 'content-type': 'application/json' } },
      );

    await expect(
      validateGithubRepository({
        repoUrl: 'https://github.com/my-team/secret-repo',
        startsAt,
        endsAt,
        bypassCache: true,
        customFetch: mockFetch,
      }),
    ).rejects.toMatchObject({
      code: 'REPO_PRIVATE',
    });
  });

  it('returns NO_COMMITS_DURING_EVENT if all commits are older than startsAt', async () => {
    clearGithubCache();
    const mockFetch: typeof fetch = async (input) => {
      const url = String(input);
      if (url.includes('/commits')) {
        return new Response(
          JSON.stringify([
            {
              sha: 'old111',
              commit: {
                committer: { date: '2026-10-15T12:00:00Z' },
                author: { date: '2026-10-15T12:00:00Z' },
                message: 'old commit before event started',
              },
            },
          ]),
          { status: 200, headers: { 'content-type': 'application/json' } },
        );
      }
      return new Response(
        JSON.stringify({
          name: 'old-repo',
          private: false,
          fork: false,
          default_branch: 'main',
        }),
        { status: 200, headers: { 'content-type': 'application/json' } },
      );
    };

    await expect(
      validateGithubRepository({
        repoUrl: 'https://github.com/my-team/old-repo',
        startsAt,
        endsAt,
        bypassCache: true,
        customFetch: mockFetch,
      }),
    ).rejects.toMatchObject({
      code: 'NO_COMMITS_DURING_EVENT',
    });
  });

  it('flags commits made after deadline', async () => {
    clearGithubCache();
    const mockFetch: typeof fetch = async (input) => {
      const url = String(input);
      if (url.includes('/commits')) {
        return new Response(
          JSON.stringify([
            {
              sha: 'late222',
              commit: {
                committer: { date: '2026-11-04T12:00:00Z' }, // after endsAt
                author: { date: '2026-11-04T12:00:00Z' },
                message: 'late commit',
              },
            },
          ]),
          { status: 200, headers: { 'content-type': 'application/json' } },
        );
      }
      return new Response(
        JSON.stringify({
          name: 'late-repo',
          private: false,
          fork: false,
          default_branch: 'main',
        }),
        { status: 200, headers: { 'content-type': 'application/json' } },
      );
    };

    const res = await validateGithubRepository({
      repoUrl: 'https://github.com/my-team/late-repo',
      startsAt,
      endsAt,
      bypassCache: true,
      customFetch: mockFetch,
    });

    expect(res.commitsAfterDeadline).toBe(true);
  });

  it('handles rate limit with GITHUB_UNAVAILABLE error', async () => {
    clearGithubCache();
    const mockFetch: typeof fetch = async () =>
      new Response('API rate limit exceeded', {
        status: 403,
        headers: { 'x-ratelimit-remaining': '0' },
      });

    await expect(
      validateGithubRepository({
        repoUrl: 'https://github.com/my-team/rate-limited',
        startsAt,
        endsAt,
        bypassCache: true,
        customFetch: mockFetch,
      }),
    ).rejects.toThrowError(GitHubValidationError);
  });
});
