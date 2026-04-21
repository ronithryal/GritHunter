import { describe, it, expect } from 'vitest';
import { parseEnrichment } from './parseEnrichment';
import type { ParsedEnrichment } from './parseEnrichment';

// ─── Fixtures ─────────────────────────────────────────────────────────────────

const VALID_JSON_OBJ = {
  github_handle: 'brentvatne',
  summary: 'Co-founder of Expo, long-time React Native contributor.',
  signals: [
    { type: 'repo', label: 'expo/expo', url: 'https://github.com/expo/expo' },
    { type: 'blog', label: 'brentvatne.ca', url: 'https://brentvatne.ca' },
  ],
  location: 'San Francisco, CA',
};

const VALID_JSON = JSON.stringify(VALID_JSON_OBJ);

const FENCED_JSON = '```json\n' + VALID_JSON + '\n```';
const FENCED_JSON_WHITESPACE = '   ```json  \n  ' + VALID_JSON + '\n```   ';
const FENCED_JSON_NO_LANG = '```\n' + VALID_JSON + '\n```';

const MALFORMED = `
  Here is information about brentvatne:
  "github_handle": "brentvatne"
  "summary": "Co-founder of Expo with many contributions."
  They have shipped multiple React Native apps and maintain core packages.
`;

// ─── Tests ────────────────────────────────────────────────────────────────────

describe('parseEnrichment', () => {
  // ── From test-plan.md: bare JSON response → EvidenceCard ──────────────────
  it('parses bare JSON response into ParsedEnrichment', () => {
    const result = parseEnrichment(VALID_JSON, 'brentvatne');

    expect(result.github_handle).toBe('brentvatne');
    expect(result.summary).toBe('Co-founder of Expo, long-time React Native contributor.');
    expect(result.signals).toHaveLength(2);
    expect(result.location).toBe('San Francisco, CA');
    expect(result.parsed_cleanly).toBe(true);
  });

  // ── From test-plan.md: fenced ```json...``` response → strip → EvidenceCard
  it('strips ```json fences and parses the inner JSON', () => {
    const result = parseEnrichment(FENCED_JSON, 'brentvatne');

    expect(result.parsed_cleanly).toBe(true);
    expect(result.github_handle).toBe('brentvatne');
    expect(result.summary).toContain('Expo');
  });

  // ── From test-plan.md: fenced with leading whitespace → EvidenceCard ──────
  it('handles fenced JSON with surrounding whitespace', () => {
    const result = parseEnrichment(FENCED_JSON_WHITESPACE, 'brentvatne');

    expect(result.parsed_cleanly).toBe(true);
    expect(result.github_handle).toBe('brentvatne');
  });

  it('strips plain ``` fences (no language tag)', () => {
    const result = parseEnrichment(FENCED_JSON_NO_LANG, 'brentvatne');

    expect(result.parsed_cleanly).toBe(true);
    expect(result.github_handle).toBe('brentvatne');
  });

  // ── From test-plan.md: malformed JSON → prose fallback ────────────────────
  it('falls back to prose extraction when JSON is malformed', () => {
    const result = parseEnrichment(MALFORMED, 'brentvatne');

    expect(result.parsed_cleanly).toBe(false);
    expect(result.github_handle).toBe('brentvatne'); // extracted from prose
    expect(result.summary).toBe('Co-founder of Expo with many contributions.');
    expect(result.signals).toEqual([]);
  });

  it('uses the provided githubHandle as fallback when handle missing from prose', () => {
    const result = parseEnrichment('totally unparseable text', 'fallback-user');

    expect(result.parsed_cleanly).toBe(false);
    expect(result.github_handle).toBe('fallback-user');
    expect(result.summary).toBeNull();
  });

  // ── From test-plan.md: url field = "https://..." → kept ───────────────────
  it('keeps valid https:// urls in signals', () => {
    const json = JSON.stringify({
      github_handle: 'dev1',
      summary: 'Test',
      signals: [{ type: 'repo', label: 'my-repo', url: 'https://github.com/dev1/repo' }],
    });

    const result = parseEnrichment(json, 'dev1');
    expect(result.signals[0].url).toBe('https://github.com/dev1/repo');
  });

  it('keeps valid http:// urls in signals', () => {
    const json = JSON.stringify({
      github_handle: 'dev1',
      summary: 'Test',
      signals: [{ type: 'blog', label: 'old blog', url: 'http://dev1.com/blog' }],
    });

    const result = parseEnrichment(json, 'dev1');
    expect(result.signals[0].url).toBe('http://dev1.com/blog');
  });

  // ── From test-plan.md: url field = "not-a-url" → dropped silently ─────────
  it('silently drops signals with invalid (non-http) urls', () => {
    const json = JSON.stringify({
      github_handle: 'dev1',
      summary: 'Test',
      signals: [{ type: 'repo', label: 'broken', url: 'not-a-url' }],
    });

    const result = parseEnrichment(json, 'dev1');
    expect(result.signals[0]).not.toHaveProperty('url');
    expect(result.signals[0].label).toBe('broken'); // signal kept, just url dropped
  });

  // ── From test-plan.md: url field = "" → dropped silently ──────────────────
  it('silently drops signals with empty url strings', () => {
    const json = JSON.stringify({
      github_handle: 'dev1',
      summary: 'Test',
      signals: [{ type: 'npm', label: 'some-pkg', url: '' }],
    });

    const result = parseEnrichment(json, 'dev1');
    expect(result.signals[0]).not.toHaveProperty('url');
  });

  // ── Regression: URL trim fix (Bug #2 from gstack review) ──────────────────
  it('trims whitespace from url before validation and stores the trimmed value', () => {
    const json = JSON.stringify({
      github_handle: 'dev1',
      summary: 'Test',
      signals: [{ type: 'repo', label: 'my-repo', url: '  https://github.com/dev1/repo  ' }],
    });

    const result = parseEnrichment(json, 'dev1');
    // URL should be kept (https:// after trim) and stored without leading/trailing spaces
    expect(result.signals[0].url).toBe('https://github.com/dev1/repo');
  });

  it('drops a url that is only whitespace', () => {
    const json = JSON.stringify({
      github_handle: 'dev1',
      summary: 'Test',
      signals: [{ type: 'repo', label: 'my-repo', url: '   ' }],
    });

    const result = parseEnrichment(json, 'dev1');
    expect(result.signals[0]).not.toHaveProperty('url');
  });

  // ── From test-plan.md: signals array > 6 → truncated to 6 ─────────────────
  it('truncates signals array to a maximum of 6', () => {
    const signals = Array.from({ length: 10 }, (_, i) => ({
      type: 'repo',
      label: `signal-${i}`,
      url: `https://github.com/dev/repo-${i}`,
    }));
    const json = JSON.stringify({
      github_handle: 'dev1',
      summary: 'Test',
      signals,
    });

    const result = parseEnrichment(json, 'dev1');
    expect(result.signals).toHaveLength(6);
    expect(result.signals[5].label).toBe('signal-5'); // last allowed
  });

  // ── Edge cases ─────────────────────────────────────────────────────────────
  it('uses githubHandle parameter when JSON omits github_handle field', () => {
    const json = JSON.stringify({ summary: 'A dev', signals: [] });
    const result = parseEnrichment(json, 'injected-handle');
    expect(result.github_handle).toBe('injected-handle');
  });

  it('omits location when absent from JSON', () => {
    const json = JSON.stringify({ github_handle: 'dev1', summary: 'Test', signals: [] });
    const result = parseEnrichment(json, 'dev1');
    expect(result.location).toBeUndefined();
  });

  it('drops signals with unknown type but still includes them (defaults to repo)', () => {
    const json = JSON.stringify({
      github_handle: 'dev1',
      summary: 'Test',
      signals: [{ type: 'youtube', label: 'a video', url: 'https://youtube.com/watch?v=abc' }],
    });
    const result = parseEnrichment(json, 'dev1');
    expect(result.signals[0].type).toBe('repo'); // normalized to repo
    expect(result.signals[0].label).toBe('a video');
  });

  it('drops signals with no label', () => {
    const json = JSON.stringify({
      github_handle: 'dev1',
      summary: 'Test',
      signals: [{ type: 'repo', label: '', url: 'https://github.com/dev1/repo' }],
    });
    const result = parseEnrichment(json, 'dev1');
    expect(result.signals).toHaveLength(0);
  });

  it('sets summary to null when JSON summary is missing', () => {
    const json = JSON.stringify({ github_handle: 'dev1', signals: [] });
    const result = parseEnrichment(json, 'dev1');
    expect(result.summary).toBeNull();
  });
});
