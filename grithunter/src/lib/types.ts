/**
 * GritHunter v1: Shared Types
 *
 * Central type definitions shared between routes and lib modules.
 * Imported by route handlers and test files.
 */

import type { SignalTag } from '@/lib/parseEnrichment';

export type { SignalTag };

/**
 * The full assembled evidence card for one developer.
 * Perplexity-sourced fields (summary, signals, location) are assembled by
 * parseEnrichment(); GitHub-sourced fields are fetched separately by the
 * enrich route.
 *
 * Per design.md evidence card schema.
 */
export type EvidenceCard = {
  github_handle: string;
  summary: string | null;      // null when enrichment failed or is unavailable
  signals: SignalTag[];
  location?: string;
  followers?: number;          // from GitHub API — absent if rate-limited
  public_repos?: number;       // from GitHub API — absent if rate-limited
  top_languages?: string[];    // top 3, from top 20 repos by stars
  last_verified_at: string;    // ISO 8601 — timestamp of cache write
  error?: 'unavailable';       // present when Perplexity enrichment failed
};

/**
 * POST /api/search response shape.
 */
export type SearchResponse = {
  handles: string[];
  total: number;
  detectedMode?: 'nl' | 'profile' | 'repo';
  geoHint?: string;
};
