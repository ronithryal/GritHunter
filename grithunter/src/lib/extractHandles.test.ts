import { describe, it, expect } from 'vitest';
import { extractHandles } from './extractHandles';

describe('extractHandles', () => {
  // ── @handle format ────────────────────────────────────────────────────────
  it('extracts @handle format', () => {
    const result = extractHandles('Check out @brentvatne for React Native work.');
    expect(result).toContain('brentvatne');
  });

  // ── github.com/handle URL ─────────────────────────────────────────────────
  it('extracts github.com/handle URL', () => {
    const result = extractHandles('Profile at github.com/kmagiera is impressive.');
    expect(result).toContain('kmagiera');
  });

  // ── https://github.com/handle ─────────────────────────────────────────────
  it('extracts https://github.com/handle', () => {
    const result = extractHandles('See https://github.com/tido64 for more details.');
    expect(result).toContain('tido64');
  });

  // ── Plain handle in a numbered prose list ─────────────────────────────────
  it('extracts plain handle in a numbered list', () => {
    const content = `
1. kmagiera — co-founder of Software Mansion
2. brentvatne — co-founder of Expo
3. tido64 — React Native at Microsoft
    `;
    const result = extractHandles(content);
    expect(result).toContain('kmagiera');
    expect(result).toContain('brentvatne');
    expect(result).toContain('tido64');
  });

  // ── Deduplication (case-insensitive) ──────────────────────────────────────
  it('deduplicates handles case-insensitively', () => {
    const content = '@BrentVatne is great. See also github.com/brentvatne and @brentvatne again.';
    const result = extractHandles(content);
    expect(result.filter(h => h === 'brentvatne')).toHaveLength(1);
  });

  // ── Invalid handle dropped (contains special chars) ───────────────────────
  it('drops handles with invalid characters', () => {
    // @-invalid starts with a hyphen — @handle regex requires [a-z0-9] first char
    // __underscore__ contains underscores which are not permitted
    const result = extractHandles('@-invalid and __underscore__ are not valid GitHub handles.');
    expect(result).toEqual([]);
  });

  // ── Empty string returns [] ───────────────────────────────────────────────
  it('returns empty array for empty string', () => {
    expect(extractHandles('')).toEqual([]);
  });

  it('returns empty array for whitespace-only string', () => {
    expect(extractHandles('   \n\t  ')).toEqual([]);
  });

  // ── Mixed formats — all extracted and deduplicated ────────────────────────
  it('extracts and deduplicates handles from mixed formats in one string', () => {
    const content = `
Top React Native engineers:
1. brentvatne — Expo
@kmagiera contributed to reanimated. See https://github.com/tido64 as well.
Also check github.com/brentvatne for more.
    `;
    const result = extractHandles(content);
    expect(result).toContain('brentvatne');
    expect(result).toContain('kmagiera');
    expect(result).toContain('tido64');
    // brentvatne appears in three formats — must appear exactly once
    expect(result.filter(h => h === 'brentvatne')).toHaveLength(1);
  });

  // ── More than 10 handles — returns first 10 only ─────────────────────────
  it('returns at most 10 handles when input contains more', () => {
    const handles = Array.from({ length: 15 }, (_, i) => `@user${String(i).padStart(2, '0')}`);
    const content = handles.join(' ');
    const result = extractHandles(content);
    expect(result).toHaveLength(10);
  });

  // ── Order of first appearance preserved ───────────────────────────────────
  it('returns handles in order of first appearance', () => {
    const content = '@alpha @beta @gamma';
    const result = extractHandles(content);
    expect(result[0]).toBe('alpha');
    expect(result[1]).toBe('beta');
    expect(result[2]).toBe('gamma');
  });

  // ── Normalizes to lowercase ────────────────────────────────────────────────
  it('normalizes handles to lowercase', () => {
    const result = extractHandles('@BrentVatne');
    expect(result[0]).toBe('brentvatne');
  });

  // ── Does NOT extract org/repo paths as handles ─────────────────────────────
  it('does not extract github.com/org/repo as a handle', () => {
    const result = extractHandles('See github.com/expo/expo for the framework.');
    expect(result).not.toContain('expo/expo');
  });

  // ── Plain bare handles on their own line (live Perplexity format 2026-04-21) ─
  it('extracts plain bare handles appearing on their own lines', () => {
    // Exact format observed from the Perplexity Agent API in live validation:
    // the response contained just "jessjchang\nj-tomasik" with no @, URL, or number prefix.
    const result = extractHandles('jessjchang\nj-tomasik');
    expect(result).toContain('jessjchang');
    expect(result).toContain('j-tomasik');
  });

  it('does not extract words from prose as bare handles', () => {
    // Lines with spaces are skipped — only single-token lines fire the bare-line pass
    const result = extractHandles('React Native engineers in San Francisco.');
    expect(result).toEqual([]);
  });
});
