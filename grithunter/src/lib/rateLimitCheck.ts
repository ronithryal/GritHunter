/**
 * GritHunter v1: Rate Limiting and Daily Spend Cap
 *
 * All Redis-backed enforcement for request gating. Two independent controls:
 *
 * 1. Per-IP session rate limit (design.md):
 *    - Key: ratelimit:v1:<ip>  — TTL: 3600s (1 hour rolling window)
 *    - Limit: 10 queries per session
 *    - Returns 429 on breach. No Perplexity call is made.
 *    - Fallback identifier: cookie session ID (if IP is shared, e.g. NAT)
 *
 * 2. Daily spend cap (REVIEW.md A-7):
 *    - Key: dailyspend:v1:<YYYY-MM-DD>  — TTL: 86400s
 *    - Tracks estimated $ cost per query added at call time
 *    - Returns 503 on cap breach. No Perplexity call is made.
 *    - Cap: $10.00/day (approximately 80 queries at ~$0.12/query)
 *
 * This module only performs the check and increment. It does not make any
 * Perplexity or GitHub API calls.
 *
 * For testability: the Redis client is injected rather than imported directly.
 * This keeps unit tests free of real network calls (mock via MSW or vi.fn()).
 */

// ─── Types ────────────────────────────────────────────────────────────────────

/** Minimal Redis interface needed by rateLimitCheck — injectable for testing. */
export interface RedisClient {
  incr(key: string): Promise<number>;
  expire(key: string, seconds: number): Promise<number>;
  get(key: string): Promise<string | null>;
  set(key: string, value: string, opts?: { ex?: number }): Promise<unknown>;
  incrbyfloat(key: string, increment: number): Promise<number>;
}

export type RateLimitResult =
  | { allowed: true; remaining: number }
  | { allowed: false; reason: 'rate_limit'; retryAfterSeconds: number }
  | { allowed: false; reason: 'spend_cap' };

export type RateLimitOptions = {
  /** Client IP address or session cookie fallback identifier. */
  identifier: string;
  /** Estimated $ cost for this query (search + enrichment). Used for spend cap. */
  estimatedCostUsd: number;
  /** Max queries per session window. Default: 10. */
  maxQueries?: number;
  /** Session window in seconds. Default: 3600. */
  windowSeconds?: number;
  /** Daily spend cap in USD. Default: 10.0. */
  dailyCapUsd?: number;
};

// ─── Constants ────────────────────────────────────────────────────────────────

const DEFAULT_MAX_QUERIES = 10;
const DEFAULT_WINDOW_SECONDS = 3600;
const DEFAULT_DAILY_CAP_USD = 10.0;

// ─── Helpers ──────────────────────────────────────────────────────────────────

function todayKey(): string {
  return new Date().toISOString().slice(0, 10); // YYYY-MM-DD, UTC
}

function rateLimitKey(identifier: string): string {
  return `ratelimit:v1:${identifier}`;
}

function spendCapKey(): string {
  return `dailyspend:v1:${todayKey()}`;
}

// ─── Main Check ───────────────────────────────────────────────────────────────

/**
 * Check whether the current request is allowed under the rate limit and
 * daily spend cap. If allowed, atomically increments both counters.
 *
 * @param redis   Injectable Redis client (Upstash or mock)
 * @param options Request metadata for gating decisions
 */
export async function checkRateLimit(
  redis: RedisClient,
  options: RateLimitOptions,
): Promise<RateLimitResult> {
  const {
    identifier,
    estimatedCostUsd,
    maxQueries = DEFAULT_MAX_QUERIES,
    windowSeconds = DEFAULT_WINDOW_SECONDS,
    dailyCapUsd = DEFAULT_DAILY_CAP_USD,
  } = options;

  // ── 1. Check daily spend cap FIRST (503 if exceeded) ─────────────────────
  const spendKey = spendCapKey();
  const currentSpendStr = await redis.get(spendKey);
  const currentSpend = currentSpendStr ? parseFloat(currentSpendStr) : 0;

  if (currentSpend >= dailyCapUsd) {
    return { allowed: false, reason: 'spend_cap' };
  }

  // ── 2. Check per-IP rate limit (429 if exceeded) ──────────────────────────
  const rlKey = rateLimitKey(identifier);
  const count = await redis.incr(rlKey);

  if (count === 1) {
    // First request in this window — set TTL
    await redis.expire(rlKey, windowSeconds);
  }

  if (count > maxQueries) {
    // Counter is already over limit — just reject. The TTL will expire the key naturally.
    // (The previous incr already consumed a slot; no further writes needed here.)
    return {
      allowed: false,
      reason: 'rate_limit',
      retryAfterSeconds: windowSeconds,
    };
  }

  // ── 3. Allowed — record spend ─────────────────────────────────────────────
  const spendExists = currentSpend > 0;
  await redis.incrbyfloat(spendKey, estimatedCostUsd);
  if (!spendExists) {
    // Set TTL on first write of the day
    await redis.expire(spendKey, 86400);
  }

  return { allowed: true, remaining: maxQueries - count };
}
