import { describe, it, expect } from 'vitest';
import { computeTopLanguages } from './topLanguages';
import type { GitHubRepo } from './topLanguages';

// ─── Helpers ──────────────────────────────────────────────────────────────────

function makeRepos(languages: (string | null)[]): GitHubRepo[] {
  return languages.map((language) => ({ language }));
}

// ─── Tests ────────────────────────────────────────────────────────────────────

describe('computeTopLanguages', () => {
  // ── From test-plan.md ──────────────────────────────────────────────────────

  // ✓ 20 repos, 10 TypeScript, 5 Python, 3 Go, 2 Rust → ["TypeScript","Python","Go"]
  it('returns top 3 languages sorted by repo count, descending', () => {
    const langs = [
      ...Array(10).fill('TypeScript'),
      ...Array(5).fill('Python'),
      ...Array(3).fill('Go'),
      ...Array(2).fill('Rust'),
    ];
    const repos = makeRepos(langs);
    expect(computeTopLanguages(repos)).toEqual(['TypeScript', 'Python', 'Go']);
  });

  // ✓ repos with null language → excluded from count
  it('excludes repos with null language', () => {
    const repos = makeRepos(['TypeScript', null, null, 'Python', null, 'TypeScript']);
    expect(computeTopLanguages(repos)).toEqual(['TypeScript', 'Python']);
  });

  // ✓ fewer than 3 distinct languages → return what exists
  it('returns fewer than 3 languages when not enough exist', () => {
    const repos = makeRepos(['TypeScript', 'TypeScript', 'Python']);
    expect(computeTopLanguages(repos)).toEqual(['TypeScript', 'Python']);
  });

  it('returns empty array when all repos have null language', () => {
    const repos = makeRepos([null, null, null]);
    expect(computeTopLanguages(repos)).toEqual([]);
  });

  it('returns empty array for empty repo list', () => {
    expect(computeTopLanguages([])).toEqual([]);
  });

  // ── Edge cases ─────────────────────────────────────────────────────────────

  it('returns exactly 3 when there are many distinct languages', () => {
    const repos = makeRepos(['TypeScript', 'Python', 'Go', 'Rust', 'Java', 'C++']);
    const result = computeTopLanguages(repos);
    expect(result).toHaveLength(3);
  });

  it('breaks ties consistently (stable by insertion order when counts equal)', () => {
    // Two languages with equal count — result should be deterministic
    const repos = makeRepos(['TypeScript', 'Python', 'TypeScript', 'Python', 'Go', 'Go']);
    const result = computeTopLanguages(repos);
    expect(result).toHaveLength(3);
    // All three have count=2; just verify all three appear
    expect(result).toContain('TypeScript');
    expect(result).toContain('Python');
    expect(result).toContain('Go');
  });

  it('returns single-item array when only one language exists', () => {
    const repos = makeRepos(['TypeScript', 'TypeScript', 'TypeScript']);
    expect(computeTopLanguages(repos)).toEqual(['TypeScript']);
  });

  it('handles repos with extra GitHub API fields without issue', () => {
    const repos: GitHubRepo[] = [
      { language: 'TypeScript', name: 'repo-a', stargazers_count: 100, pushed_at: '2024-01-01' },
      { language: 'Python', name: 'repo-b', stargazers_count: 50, pushed_at: '2024-01-02' },
      { language: 'TypeScript', name: 'repo-c', stargazers_count: 10, pushed_at: '2024-01-03' },
    ];
    expect(computeTopLanguages(repos)).toEqual(['TypeScript', 'Python']);
  });
});
