import { describe, it, expect } from 'vitest';
import { detectGeoHint } from '@/lib/detectGeoHint';

describe('detectGeoHint', () => {
  // ── Returns hint when scarcity + geo term ──────────────────────────────────

  it('returns hint for SF abbreviation with low count', () => {
    expect(detectGeoHint('React Native engineers in SF', 1)).toBeDefined();
  });

  it('returns hint for NYC abbreviation with low count', () => {
    expect(detectGeoHint('Go engineers in NYC', 0)).toBeDefined();
  });

  it('returns hint for full city name with low count', () => {
    expect(detectGeoHint('React Native engineers in San Francisco', 2)).toBeDefined();
  });

  it('returns hint for "Bay Area" with low count', () => {
    expect(detectGeoHint('Senior engineers in the Bay Area', 1)).toBeDefined();
  });

  it('returns hint for zero results with geo term', () => {
    expect(detectGeoHint('Rust engineers in Vancouver', 0)).toBeDefined();
  });

  it('returns hint at the boundary count of 2', () => {
    expect(detectGeoHint('ML engineers in Seattle', 2)).toBeDefined();
  });

  // ── Does NOT return hint when count is above threshold ────────────────────

  it('returns undefined when handle count is 3', () => {
    expect(detectGeoHint('React Native engineers in SF', 3)).toBeUndefined();
  });

  it('returns undefined when handle count is 10', () => {
    expect(detectGeoHint('React Native engineers in SF', 10)).toBeUndefined();
  });

  // ── Does NOT return hint when no geo term ─────────────────────────────────

  it('returns undefined for query with no location term', () => {
    expect(detectGeoHint('Go engineers who built Prometheus exporters', 1)).toBeUndefined();
  });

  it('returns undefined when "in" appears but is not followed by a city', () => {
    expect(detectGeoHint('engineers who specialize in production Rust', 0)).toBeUndefined();
  });

  it('returns undefined for domain-only query with low count', () => {
    expect(detectGeoHint('React Native engineers who shipped App Store apps', 1)).toBeUndefined();
  });

  // ── Case insensitivity ────────────────────────────────────────────────────

  it('matches city names case-insensitively', () => {
    expect(detectGeoHint('engineers in san francisco', 1)).toBeDefined();
  });

  // ── Hint content ─────────────────────────────────────────────────────────

  it('hint mentions removing location filter', () => {
    const hint = detectGeoHint('React Native engineers in SF', 1);
    expect(hint).toContain('location filter');
  });
});
