/**
 * GritHunter v1: GitHub API Client
 *
 * Thin wrapper around the GitHub REST API v3 for the two calls GritHunter needs:
 *   1. GET /users/:handle         — handle validation + user metadata
 *   2. GET /users/:handle/repos   — repo list for top language computation
 *
 * Architecture constraints (design.md):
 *   - GitHub API is ONLY for structured metadata and handle validation
 *   - Perplexity Agent API handles all reasoning and evidence synthesis
 *   - Authentication: GITHUB_TOKEN from env (Bearer token). If absent,
 *     proceed unauthenticated — public rate limit applies (60 req/hr per IP).
 *   - On 403 or 429: return null (rate limited) — caller skips metadata fields
 *   - On 404: return null for validation (caller drops handle)
 *   - On any other error: return null, caller decides fallback behavior
 */

export type GitHubUser = {
  login: string;
  followers: number;
  public_repos: number;
};

export type GitHubRepo = {
  language: string | null;
  stargazers_count: number;
  pushed_at: string;
};

// ─── Helpers ──────────────────────────────────────────────────────────────────

function authHeaders(): Record<string, string> {
  const token = process.env.GITHUB_TOKEN;
  return token ? { Authorization: `Bearer ${token}` } : {};
}

async function githubGet<T>(path: string): Promise<T | null> {
  try {
    const response = await fetch(`https://api.github.com${path}`, {
      headers: {
        Accept: 'application/vnd.github+json',
        'X-GitHub-Api-Version': '2022-11-28',
        ...authHeaders(),
      },
    });

    if (response.status === 404) return null;
    if (response.status === 403 || response.status === 429) return null;
    if (!response.ok) return null;

    return (await response.json()) as T;
  } catch {
    return null;
  }
}

// ─── Public API ───────────────────────────────────────────────────────────────

/**
 * Validate a GitHub handle and fetch user metadata.
 * Returns null if the handle is a 404, or if GitHub is rate-limited.
 * Callers should drop null results from the handle list.
 */
export async function fetchGitHubUser(handle: string): Promise<GitHubUser | null> {
  return githubGet<GitHubUser>(`/users/${encodeURIComponent(handle)}`);
}

/**
 * Fetch the top 20 repos (by stargazers) for a GitHub handle.
 * Returns empty array on any failure — caller proceeds without language data.
 */
export async function fetchGitHubRepos(handle: string): Promise<GitHubRepo[]> {
  const repos = await githubGet<GitHubRepo[]>(
    `/users/${encodeURIComponent(handle)}/repos?sort=stargazers&per_page=20`,
  );
  if (!Array.isArray(repos)) return [];
  return repos;
}

