/**
 * GritHunter v1: Top Languages Computation
 *
 * Computes the top 3 programming languages from a developer's GitHub repos.
 *
 * Per design.md and REVIEW.md CQ-2:
 *   - Input: up to 20 GitHub repos, pre-sorted by stargazers (highest first)
 *   - Method: count repo occurrences per language across those 20 repos
 *   - Output: top 3 languages by count, descending
 *   - Repos with null language are excluded from the count
 *   - If fewer than 3 distinct languages exist, return only what exists
 *
 * This is a pure deterministic transform. No API calls, no side effects.
 */

export type GitHubRepo = {
  language: string | null;
  [key: string]: unknown; // allow other GitHub API fields we don't need here
};

/**
 * Compute the top 3 languages from a list of GitHub repos.
 *
 * @param repos - Array of repo objects from GitHub API
 *                (GET /users/:username/repos?sort=stargazers&per_page=20)
 * @returns Ordered array of up to 3 language strings, most common first.
 */
export function computeTopLanguages(repos: GitHubRepo[]): string[] {
  const counts = new Map<string, number>();

  for (const repo of repos) {
    if (repo.language === null || repo.language === undefined) continue;
    if (typeof repo.language !== 'string') continue;
    if (!repo.language.trim()) continue;

    const lang = repo.language.trim();
    counts.set(lang, (counts.get(lang) ?? 0) + 1);
  }

  return [...counts.entries()]
    .sort((a, b) => b[1] - a[1]) // descending by count
    .slice(0, 3)
    .map(([lang]) => lang);
}
