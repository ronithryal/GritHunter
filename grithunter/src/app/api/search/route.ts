/**
 * GritHunter v1: POST /api/search
 *
 * Orchestrates the search pipeline:
 *   1. Parse and validate request body
 *   2. Classify input (NL / profile / repo)
 *   3. Rate limit check (Redis) — fail open if Redis throws
 *   4. Call Perplexity Agent API via agentSearch()
 *   5. Extract GitHub handles from Perplexity response
 *   6. Validate handles via GitHub API in parallel (drop 404s)
 *   7. Return { handles, total }
 *
 * Architecture constraints (design.md):
 *   - Search is always live, never cached
 *   - Returns handles only — enrichment is done by GET /api/enrich/[handle]
 *   - Rate limit checked before any Perplexity call
 *   - GitHub validation runs in parallel
 *   - maxDuration = 60 required: Perplexity path may be 15s + retry
 */

import { NextRequest, NextResponse } from 'next/server';
import { Redis } from '@upstash/redis';
import { classifyInput } from '@/lib/classifyInput';
import { checkRateLimit } from '@/lib/rateLimitCheck';
import { agentSearch } from '@/lib/perplexityClient';
import { extractHandles } from '@/lib/extractHandles';
import { fetchGitHubUser } from '@/lib/githubClient';
import { detectGeoHint } from '@/lib/detectGeoHint';
import type { SearchResponse } from '@/lib/types';

// Required for Perplexity Agent API timeout (15s) + 1 retry
export const maxDuration = 60;

// ─── Redis Client ────────────────────────────────────────────────────────────
// Initialized once per module load. In tests, @upstash/redis is mocked before
// this module is imported, so the mock class is used here automatically.
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

/** Exported for testing only — allows resetting the cached instance. */
export function _resetRedisForTest() {
  _redis = null;
}

// ─── Handler ──────────────────────────────────────────────────────────────────

export async function POST(request: NextRequest): Promise<NextResponse> {
  // ── 1. Parse request body ─────────────────────────────────────────────────
  let body: unknown;
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: 'Invalid JSON body' }, { status: 400 });
  }

  if (typeof body !== 'object' || body === null || typeof (body as Record<string, unknown>).query !== 'string') {
    return NextResponse.json({ error: 'Missing or invalid query field' }, { status: 400 });
  }

  const query = ((body as Record<string, unknown>).query as string).trim();
  if (!query) {
    return NextResponse.json({ error: 'query must be a non-empty string' }, { status: 400 });
  }

  // ── 2. Classify input ─────────────────────────────────────────────────────
  const inputType = classifyInput(query);

  // Extract the value component for profile/repo modes
  // For profile: github.com/handle → handle
  // For repo: github.com/org/repo → org/repo
  function extractValue(raw: string, type: typeof inputType): string {
    if (type === 'nl') return raw;
    const normalized = raw.replace(/^https?:\/\//, '').replace(/\/$/, '');
    const parts = normalized.split('/').filter(Boolean);
    // parts[0] = 'github.com', parts[1+] = path segments
    if (type === 'profile') return parts[1] ?? raw;
    if (type === 'repo') return parts[1] && parts[2] ? `${parts[1]}/${parts[2]}` : raw;
    return raw;
  }

  const value = extractValue(query, inputType);

  // ── 3. Rate limit check ───────────────────────────────────────────────────
  const ip =
    request.headers.get('x-forwarded-for')?.split(',')[0]?.trim() ??
    request.headers.get('x-real-ip') ??
    'unknown';

  const redis = getRedis();
  if (redis) {
    try {
      const rateLimitResult = await checkRateLimit(redis, {
        identifier: ip,
        estimatedCostUsd: 0.12, // ~6 Perplexity calls × $0.02/call
      });

      if (!rateLimitResult.allowed) {
        if (rateLimitResult.reason === 'rate_limit') {
          return NextResponse.json(
            { error: "You've hit the search limit for this hour. Come back soon." },
            { status: 429 },
          );
        }
        if (rateLimitResult.reason === 'spend_cap') {
          return NextResponse.json(
            { error: 'Daily capacity reached. Try again tomorrow.' },
            { status: 503 },
          );
        }
      }
    } catch (redisErr) {
      // Fail open: log and continue — never block a request due to Redis failure
      console.error('[search] Redis checkRateLimit threw, failing open:', redisErr);
    }
  }

  // ── 4. Call Perplexity Agent API ──────────────────────────────────────────
  console.log(`[search] query="${query}" mode=${inputType} ip=${ip}`);

  let perplexityContent: string;
  try {
    const result = await agentSearch({ type: inputType, value });
    perplexityContent = result.content;
  } catch (err) {
    console.error('[search] Perplexity agentSearch failed:', err);
    return NextResponse.json(
      { error: 'Search is temporarily unavailable. Try again in a moment.' },
      { status: 503 },
    );
  }

  // ── 5. Extract GitHub handles ─────────────────────────────────────────────
  const rawHandles = extractHandles(perplexityContent);
  console.log(`[search] perplexity returned ${rawHandles.length} raw handles: [${rawHandles.join(', ')}]`);

  if (rawHandles.length === 0) {
    console.log('[search] no handles extracted — returning empty');
    return NextResponse.json({ handles: [], total: 0 } satisfies SearchResponse);
  }

  // ── 6. Validate handles via GitHub API in parallel ────────────────────────
  // Drop 404s and organization accounts — results must be individual developers.
  const validationResults = await Promise.allSettled(
    rawHandles.map(async (handle) => {
      const user = await fetchGitHubUser(handle);
      if (user === null) return null;
      if (user.type !== 'User') return null;
      return handle;
    }),
  );

  const validHandles = validationResults
    .map((r) => (r.status === 'fulfilled' ? r.value : null))
    .filter((h): h is string => h !== null);

  console.log(`[search] github validation: ${validHandles.length}/${rawHandles.length} passed — [${validHandles.join(', ')}]`);

  // ── 7. Return result ──────────────────────────────────────────────────────
  const geoHint =
    inputType === 'nl' ? detectGeoHint(query, validHandles.length) : undefined;

  const response: SearchResponse = {
    handles: validHandles,
    total: validHandles.length,
    detectedMode: inputType,
    ...(geoHint !== undefined && { geoHint }),
  };

  return NextResponse.json(response);
}
