/**
 * Tests for buildSearchQuery (exported from perplexityClient.ts)
 * These tests verify the query construction for each SearchInput mode.
 * Network calls are not made here — this is pure unit testing of prompt logic.
 *
 * Updated for M5: "Limit 10" hard ceiling removed; soft target language added.
 * Stars heuristic removed; tier/notability language added.
 * NL mode gets domain expansion fallback language.
 */

import { describe, it, expect } from 'vitest';
import { buildSearchQuery } from './perplexityClient';
import type { SearchInput } from './perplexityClient';

describe('buildSearchQuery', () => {
  // ── NL mode ───────────────────────────────────────────────────────────────
  it('nl mode: output does NOT contain hard "Limit 10" ceiling', () => {
    const input: SearchInput = { type: 'nl', value: 'React Native engineers in SF' };
    expect(buildSearchQuery(input)).not.toContain('Limit 10');
  });

  it('nl mode: output contains soft target language', () => {
    const input: SearchInput = { type: 'nl', value: 'React Native engineers in SF' };
    expect(buildSearchQuery(input)).toContain('aim for 5');
  });

  it('nl mode: output contains the user value verbatim', () => {
    const input: SearchInput = { type: 'nl', value: 'React Native engineers in SF' };
    expect(buildSearchQuery(input)).toContain('React Native engineers in SF');
  });

  it('nl mode: output contains tier/notability language, not star count', () => {
    const input: SearchInput = { type: 'nl', value: 'React Native engineers in SF' };
    const result = buildSearchQuery(input);
    expect(result).toContain('well-known');
    expect(result).not.toContain('100+');
  });

  it('nl mode: output contains domain expansion fallback language', () => {
    const input: SearchInput = { type: 'nl', value: 'React Native engineers in SF' };
    const result = buildSearchQuery(input);
    expect(result).toContain('fewer than 3 strong matches');
    expect(result).toContain('expand slightly');
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

  it('profile mode: output contains impact/citation language, not star count', () => {
    const input: SearchInput = { type: 'profile', value: 'brentvatne' };
    const result = buildSearchQuery(input);
    expect(result).toContain('impact beyond their own projects');
    expect(result).not.toContain('100+');
    expect(result).not.toContain('Limit 10');
  });

  // ── Repo mode ─────────────────────────────────────────────────────────────
  it('repo mode: output contains "not the contributor list"', () => {
    const input: SearchInput = { type: 'repo', value: 'expo/expo' };
    expect(buildSearchQuery(input)).toContain('not the contributor list');
  });

  it('repo mode: output contains "10k stars" exclusion', () => {
    const input: SearchInput = { type: 'repo', value: 'expo/expo' };
    expect(buildSearchQuery(input)).toContain('10k stars');
  });

  it('repo mode: output does NOT contain hard "Limit 10" ceiling', () => {
    const input: SearchInput = { type: 'repo', value: 'expo/expo' };
    expect(buildSearchQuery(input)).not.toContain('Limit 10');
  });

  it('repo mode: output contains authority/standout language', () => {
    const input: SearchInput = { type: 'repo', value: 'expo/expo' };
    const result = buildSearchQuery(input);
    expect(result).toContain('authorities or standouts');
  });
});
