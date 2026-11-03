import { parseGithubUrl } from '@campusgrid/shared';

export interface ValidationSuccess {
  owner: string;
  repo: string;
  defaultBranch: string;
  lastCommitSha: string;
  lastCommitAt: Date;
  validatedAt: Date;
  commitsAfterDeadline: boolean;
}

export type GitHubErrorCode =
  | 'INVALID_URL'
  | 'REPO_NOT_FOUND'
  | 'REPO_PRIVATE'
  | 'NO_COMMITS_DURING_EVENT'
  | 'SUBMISSIONS_CLOSED'
  | 'GITHUB_UNAVAILABLE';

export class GitHubValidationError extends Error {
  constructor(
    public readonly code: GitHubErrorCode,
    message: string,
    public readonly statusCode: number = 400,
  ) {
    super(message);
    this.name = 'GitHubValidationError';
  }
}

interface CacheEntry<T> {
  data: T;
  expiresAt: number;
}

const cache = new Map<string, CacheEntry<unknown>>();
const CACHE_TTL_MS = 60 * 1000;

export function clearGithubCache(): void {
  cache.clear();
}

/**
 * Fetch wrapper with 60s cache and rate-limit handling.
 */
export async function githubApiFetch<T>(
  endpoint: string,
  options: { bypassCache?: boolean; customFetch?: typeof fetch } = {},
): Promise<T> {
  const fetchFn = options.customFetch ?? globalThis.fetch;
  const now = Date.now();
  const cacheKey = endpoint;

  if (!options.bypassCache) {
    const cached = cache.get(cacheKey);
    if (cached && cached.expiresAt > now) {
      return cached.data as T;
    }
  }

  const token = process.env.GITHUB_TOKEN?.trim();
  const headers: Record<string, string> = {
    Accept: 'application/vnd.github.v3+json',
    'User-Agent': 'CampusGrid-Hackathon-Validator',
  };
  if (token) {
    headers.Authorization = `Bearer ${token}`;
  }

  const url = endpoint.startsWith('http') ? endpoint : `https://api.github.com${endpoint}`;

  let res: Response;
  try {
    res = await fetchFn(url, { headers });
  } catch (err) {
    throw new GitHubValidationError(
      'GITHUB_UNAVAILABLE',
      `Failed to connect to GitHub API: ${err instanceof Error ? err.message : 'Network error'}`,
      503,
    );
  }

  const rateRemaining = res.headers.get('x-ratelimit-remaining');
  if (rateRemaining === '0') {
    throw new GitHubValidationError(
      'GITHUB_UNAVAILABLE',
      'GitHub API rate limit exceeded. Please configure GITHUB_TOKEN or try again later.',
      503,
    );
  }

  if (res.status === 404) {
    throw new GitHubValidationError(
      'REPO_NOT_FOUND',
      'Repository not found. Ensure the repository exists and is public.',
      400,
    );
  }

  if (res.status === 401 || res.status === 403) {
    // If rate-limited without remaining header or permission issue
    const text = await res.text().catch(() => '');
    if (text.toLowerCase().includes('rate limit')) {
      throw new GitHubValidationError('GITHUB_UNAVAILABLE', 'GitHub API rate limit exceeded.', 503);
    }
    throw new GitHubValidationError(
      'REPO_PRIVATE',
      'Cannot access repository. Repository must be public.',
      400,
    );
  }

  if (res.status >= 500) {
    throw new GitHubValidationError(
      'GITHUB_UNAVAILABLE',
      `GitHub API returned server error (${res.status}).`,
      503,
    );
  }

  if (!res.ok) {
    throw new GitHubValidationError(
      'GITHUB_UNAVAILABLE',
      `GitHub API request failed with status ${res.status}.`,
      res.status >= 400 && res.status < 500 ? 400 : 503,
    );
  }

  const data = (await res.json()) as T;
  cache.set(cacheKey, { data, expiresAt: now + CACHE_TTL_MS });
  return data;
}

interface GitHubRepoResponse {
  name: string;
  private: boolean;
  fork: boolean;
  default_branch: string;
  parent?: {
    full_name: string;
  };
}

interface GitHubCommitResponse {
  sha: string;
  commit: {
    committer?: { date: string };
    author?: { date: string };
    message: string;
  };
  parents?: Array<{ sha: string }>;
}

export async function validateGithubRepository(params: {
  repoUrl: string;
  startsAt: Date;
  endsAt: Date;
  bypassCache?: boolean;
  customFetch?: typeof fetch;
}): Promise<ValidationSuccess> {
  const { repoUrl, startsAt, endsAt, bypassCache, customFetch } = params;

  const parsed = parseGithubUrl(repoUrl);
  if (!parsed) {
    throw new GitHubValidationError('INVALID_URL', 'Invalid GitHub repository URL format.', 400);
  }

  const { owner, repo } = parsed;

  // 1. Fetch Repository Metadata
  const repoData = await githubApiFetch<GitHubRepoResponse>(`/repos/${owner}/${repo}`, {
    bypassCache,
    customFetch,
  });

  if (repoData.private) {
    throw new GitHubValidationError(
      'REPO_PRIVATE',
      'Repository must be public for hackathon submissions.',
      400,
    );
  }

  // 2. Fetch latest commits
  const commits = await githubApiFetch<GitHubCommitResponse[]>(
    `/repos/${owner}/${repo}/commits?per_page=30`,
    { bypassCache, customFetch },
  );

  if (!Array.isArray(commits) || commits.length === 0) {
    throw new GitHubValidationError(
      'NO_COMMITS_DURING_EVENT',
      'Repository has no commits.',
      400,
    );
  }

  const startsAtTime = startsAt.getTime();
  const endsAtTime = endsAt.getTime();

  // Find commits made after event startsAt
  const validCommits = commits.filter((c) => {
    const dateStr = c.commit.committer?.date || c.commit.author?.date;
    if (!dateStr) return false;
    return new Date(dateStr).getTime() >= startsAtTime;
  });

  if (validCommits.length === 0) {
    throw new GitHubValidationError(
      'NO_COMMITS_DURING_EVENT',
      `Repository has no commits made after event start (${startsAt.toISOString()}).`,
      400,
    );
  }

  // If repo is a fork, ensure there is at least one non-merge commit made during event
  if (repoData.fork) {
    const eventCommits = validCommits.filter((c) => (c.parents?.length ?? 0) <= 1);
    if (eventCommits.length === 0) {
      throw new GitHubValidationError(
        'NO_COMMITS_DURING_EVENT',
        'Repository is an unmodified fork with no original commits during the event.',
        400,
      );
    }
  }

  const latestCommit = commits[0];
  const latestDateStr = latestCommit.commit.committer?.date || latestCommit.commit.author?.date || '';
  const lastCommitAt = latestDateStr ? new Date(latestDateStr) : new Date();

  const commitsAfterDeadline = lastCommitAt.getTime() > endsAtTime;

  return {
    owner,
    repo,
    defaultBranch: repoData.default_branch || 'main',
    lastCommitSha: latestCommit.sha,
    lastCommitAt,
    validatedAt: new Date(),
    commitsAfterDeadline,
  };
}
