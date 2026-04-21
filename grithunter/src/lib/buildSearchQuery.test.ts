/**
 * Tests for buildSearchQuery (exported from perplexityClient.ts)
 * These tests verify the query construction for each SearchInput mode.
 * Network calls are not made here — this is pure unit testing of prompt logic.
 */

import { describe, it, expect } from 'vitest';
import { buildSearchQuery } from './perplexityClient';
import type { SearchInput } from './perplexityClient';

describe('buildSearchQuery', () => {
  // ── NL mode ───────────────────────────────────────────────────────────────
  it('nl mode: output contains "Limit 10"', () => {
    const input: SearchInput = { type: 'nl', value: 'React Native engineers in SF' };
    expect(buildSearchQuery(input)).toContain('Limit 10');
  });

  it('nl mode: output contains the user value verbatim', () => {
    const input: SearchInput = { type: 'nl', value: 'React Native engineers in SF' };
    expect(buildSearchQuery(input)).toContain('React Native engineers in SF');
  });

  // ── Profile mode ──────────────────────────────────────────────────────────
  it('profile mode: output contains the handle value', () => {
    const input: SearchInput = { type: 'profile', value: 'brentvatne' };
    const result = buildSearchQuery(input);
    expect(result).toContain('brentvatne');
    expect(result).toContain('github.com/brentvatne');
  });

  it('profile mode: output contains "Return only GitHub handles"', () => {
    const input: SearchInput = { type: 'profile', value: 'brentvatne' };
    expect(buildSearchQuery(input)).toContain('Return only GitHub handles');
  });

  // ── Repo mode ─────────────────────────────────────────────────────────────
  it('repo mode: output contains "not the contributor list"', () => {
    const input: SearchInput = { type: 'repo', value: 'expo/expo' };
    expect(buildSearchQuery(input)).toContain('not the contributor list');
  });

  it('repo mode: output contains "10k stars"', () => {
    const input: SearchInput = { type: 'repo', value: 'expo/expo' };
    expect(buildSearchQuery(input)).toContain('10k stars');
  });

  it('repo mode: output contains "Limit 10"', () => {
    const input: SearchInput = { type: 'repo', value: 'expo/expo' };
    expect(buildSearchQuery(input)).toContain('Limit 10');
  });
});
