/**
 * GritHunter v1: GET /api/enrich/[handle]
 *
 * Orchestrates per-developer evidence card assembly:
 *   1. Validate handle format (basic check)
 *   2. Check Redis enrichment cache (key: enrich:v1:<handle>, TTL: 86400s)
 *      - Cache hit → return stored card immediately
 *      - Cache read error → treat as miss, log and continue
 *   3. Call Perplexity Agent API via agentEnrich()
 *      - On failure after retry → return degraded card { github_handle, summary: null,
 *        signals: [], error: 'unavailable', last_verified_at }
 *   4. Parse enrichment output via parseEnrichment()
 *   5. Fetch GitHub metadata in parallel (user + repos)
 *      - fetchGitHubUser() → followers, public_repos
 *      - fetchGitHubRepos() → top_languages via computeTopLanguages()
 *      - On 403/rate-limit → skip metadata fields, return card without them
 *   6. Assemble full EvidenceCard
 *   7. Write assembled card to Redis cache (24h TTL)
 *   8. Return card
 *
 * Architecture constraints (design.md):
 *   - Enrichment may be cached for 24h (enrich:v1:<handle>)
 *   - Perplexity Agent API for reasoning, GitHub API for structured metadata only
 *   - Degraded response on Perplexity failure (not a 5xx to the client)
 *   - GitHub metadata failure → card without those fields (no user error)
 *   - maxDuration = 60 (15s Perplexity timeout + 1 retry guarantee)
 *
 * Degraded card shape (eng.md AD-011):
 *   {
 *     github_handle: string,
 *     summary: null,
 *     signals: [],
 *     last_verified_at: ISO8601,
 *     error: 'unavailable'
 *   }
 */

import { NextRequest, NextResponse } from 'next/server';
import { Redis } from '@upstash/redis';
import { agentEnrich } from '@/lib/perplexityClient';
import { parseEnrichment } from '@/lib/parseEnrichment';
import { fetchGitHubUser, fetchGitHubRepos } from '@/lib/githubClient';
import { computeTopLanguages } from '@/lib/topLanguages';
import type { EvidenceCard } from '@/lib/types';

// Required for Perplexity Agent API timeout (15s) + 1 retry
export const maxDuration = 60;

// ─── Redis Client ─────────────────────────────────────────────────────────────

let _redis: Redis | null = null;

function getRedis(): Redis | null {
  if (_redis) return _redis;
  const url = process.env.UPSTASH_REDIS_REST_URL;
  const token = process.env.UPSTASH_REDIS_REST_TOKEN;
  if (!url || !token) return null;
  try {
    _redis = new Redis({ url, token });
  } catch {
    return null;
  }
  return _redis;
}

/** Exported for testing only — resets the cached instance. */
export function _resetRedisForTest() {
  _redis = null;
}

// ─── Cache Helpers ────────────────────────────────────────────────────────────

function cacheKey(handle: string): string {
  return `enrich:v1:${handle.toLowerCase()}`;
}

async function readCache(redis: Redis, handle: string): Promise<EvidenceCard | null> {
  try {
    const card = await redis.get<EvidenceCard>(cacheKey(handle));
    return card ?? null;
  } catch (err) {
    console.error('[enrich] Cache read failed, treating as miss:', err);
    return null;
  }
}

async function writeCache(redis: Redis, handle: string, card: EvidenceCard): Promise<void> {
  try {
    await redis.set(cacheKey(handle), JSON.stringify(card), { ex: 86400 });
  } catch (err) {
    console.error('[enrich] Cache write failed:', err);
    // Non-fatal — card is returned to client even if cache write fails
  }
}

// ─── Handler ──────────────────────────────────────────────────────────────────

export async function GET(
  _request: NextRequest,
  { params }: { params: Promise<{ handle: string }> },
): Promise<NextResponse> {
  const { handle: rawHandle } = await params;
  const handle = rawHandle?.toLowerCase().trim();

  // Basic handle format guard
  if (!handle || !/^[a-z0-9][a-z0-9-]{0,38}$/i.test(handle)) {
    return NextResponse.json({ error: 'Invalid GitHub handle' }, { status: 400 });
  }

  // ── 1. Check cache ────────────────────────────────────────────────────────
  const redis = getRedis();
  if (redis) {
    const cached = await readCache(redis, handle);
    if (cached) {
      console.log(`[enrich] cache hit: ${handle}`);
      return NextResponse.json(cached);
    }
  }

  // ── 2. Call Perplexity enrichment ─────────────────────────────────────────
  console.log(`[enrich] cache miss — calling Perplexity for: ${handle}`);
  let perplexityContent: string;
  let enrichFailed = false;

  try {
    const result = await agentEnrich(handle);
    perplexityContent = result.content;
    console.log(`[enrich] Perplexity ok for ${handle} (${result.content.length} chars)`);
  } catch (err) {
    console.error(`[enrich] Perplexity agentEnrich failed for ${handle}:`, err);
    enrichFailed = true;
    perplexityContent = '';
  }

  // ── 3. Parse enrichment output ────────────────────────────────────────────
  const now = new Date().toISOString();

  if (enrichFailed) {
    console.warn(`[enrich] returning degraded card for ${handle}`);
    const degraded: EvidenceCard = {
      github_handle: handle,
      summary: null,
      signals: [],
      last_verified_at: now,
      error: 'unavailable',
    };
    // Cache degraded cards for only 5 min — short enough to retry after a transient timeout
    if (redis) await redis.set(cacheKey(handle), JSON.stringify(degraded), { ex: 300 });
    return NextResponse.json(degraded);
  }

  const parsed = parseEnrichment(perplexityContent, handle);

  // ── 4. Fetch GitHub metadata in parallel ──────────────────────────────────
  const [user, repos] = await Promise.all([
    fetchGitHubUser(handle),
    fetchGitHubRepos(handle),
  ]);

  const topLanguages = computeTopLanguages(repos);

  // ── 5. Assemble full EvidenceCard ─────────────────────────────────────────
  const card: EvidenceCard = {
    github_handle: parsed.github_handle,
    summary: parsed.summary,
    signals: parsed.signals,
    ...(parsed.location && { location: parsed.location }),
    ...(user && {
      followers: user.followers,
      public_repos: user.public_repos,
    }),
    ...(topLanguages.length > 0 && { top_languages: topLanguages }),
    last_verified_at: now,
  };

  // ── 6. Write to cache ─────────────────────────────────────────────────────
  if (redis) await writeCache(redis, handle, card);

  console.log(`[enrich] assembled card for ${handle}: signals=${card.signals.length} followers=${card.followers ?? 'n/a'} location=${card.location ?? 'n/a'}`);

  // ── 7. Return ─────────────────────────────────────────────────────────────
  return NextResponse.json(card);
}
