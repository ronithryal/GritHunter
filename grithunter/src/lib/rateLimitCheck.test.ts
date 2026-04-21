import { describe, it, expect, vi, beforeEach } from 'vitest';
import { checkRateLimit } from './rateLimitCheck';
import type { RedisClient, RateLimitResult } from './rateLimitCheck';

// ─── Mock Redis ───────────────────────────────────────────────────────────────

function makeMockRedis(overrides: Partial<RedisClient> = {}): RedisClient {
  const store = new Map<string, string>();
  let incrCalls: Record<string, number> = {};

  return {
    async incr(key: string) {
      const current = parseInt(store.get(key) ?? '0', 10);
      const next = current + 1;
      store.set(key, String(next));
      incrCalls[key] = (incrCalls[key] ?? 0) + 1;
      return next;
    },
    async expire(_key: string, _seconds: number) {
      return 1;
    },
    async get(key: string) {
      return store.get(key) ?? null;
    },
    async set(key: string, value: string, opts?: { ex?: number }) {
      store.set(key, value);
      return 'OK';
    },
    async incrbyfloat(key: string, increment: number) {
      const current = parseFloat(store.get(key) ?? '0');
      const next = current + increment;
      store.set(key, String(next));
      return next;
    },
    ...overrides,
  };
}

const BASE_OPTIONS = {
  identifier: '192.168.1.1',
  estimatedCostUsd: 0.12,
  maxQueries: 10,
  windowSeconds: 3600,
  dailyCapUsd: 10.0,
};

// ─── Tests ────────────────────────────────────────────────────────────────────

describe('checkRateLimit', () => {
  // ── From test-plan.md ──────────────────────────────────────────────────────

  // ✓ first query from IP → allowed, remaining=9
  it('allows the first query and reports remaining=9', async () => {
    const redis = makeMockRedis();
    const result = await checkRateLimit(redis, BASE_OPTIONS);
    expect(result.allowed).toBe(true);
    if (result.allowed) expect(result.remaining).toBe(9);
  });

  // ✓ 10th query from IP → allowed, remaining=0
  it('allows the 10th query and reports remaining=0', async () => {
    const redis = makeMockRedis();
    // Burn 9 queries first
    for (let i = 0; i < 9; i++) {
      await checkRateLimit(redis, BASE_OPTIONS);
    }
    const result = await checkRateLimit(redis, BASE_OPTIONS);
    expect(result.allowed).toBe(true);
    if (result.allowed) expect(result.remaining).toBe(0);
  });

  // ✓ 11th query from IP → blocked (429)
  it('blocks the 11th query with reason=rate_limit', async () => {
    const redis = makeMockRedis();
    // Burn 10 queries
    for (let i = 0; i < 10; i++) {
      await checkRateLimit(redis, BASE_OPTIONS);
    }
    const result = await checkRateLimit(redis, BASE_OPTIONS);
    expect(result.allowed).toBe(false);
    if (!result.allowed) {
      expect(result.reason).toBe('rate_limit');
      expect(result.retryAfterSeconds).toBe(3600);
    }
  });

  // ✓ query when daily spend cap exceeded → blocked (503)
  it('blocks when daily spend cap is exceeded', async () => {
    // Pre-seed daily spend above cap
    const store = new Map<string, string>();
    const today = new Date().toISOString().slice(0, 10);
    store.set(`dailyspend:v1:${today}`, '10.50'); // above $10 cap

    const redis = makeMockRedis({
      async get(key: string) {
        return store.get(key) ?? null;
      },
    });

    const result = await checkRateLimit(redis, BASE_OPTIONS);
    expect(result.allowed).toBe(false);
    if (!result.allowed) expect(result.reason).toBe('spend_cap');
  });

  // ── Edge cases ─────────────────────────────────────────────────────────────

  it('spend_cap check runs before rate_limit check (503 takes priority)', async () => {
    // Both at limit: spend cap should be the reason returned
    const today = new Date().toISOString().slice(0, 10);
    const internalStore = new Map<string, string>([
      [`dailyspend:v1:${today}`, '99.00'], // cap exceeded
      [`ratelimit:v1:${BASE_OPTIONS.identifier}`, '11'], // also rate-limited
    ]);

    const redis = makeMockRedis({
      async get(key: string) {
        return internalStore.get(key) ?? null;
      },
    });

    const result = await checkRateLimit(redis, BASE_OPTIONS);
    expect(result.allowed).toBe(false);
    if (!result.allowed) expect(result.reason).toBe('spend_cap');
  });

  it('increments spend counter on allowed request', async () => {
    const spendValues: number[] = [];
    const redis = makeMockRedis({
      async incrbyfloat(key: string, increment: number) {
        spendValues.push(increment);
        return increment;
      },
    });

    await checkRateLimit(redis, { ...BASE_OPTIONS, estimatedCostUsd: 0.15 });
    expect(spendValues).toContain(0.15);
  });

  it('respects custom maxQueries parameter', async () => {
    const redis = makeMockRedis();
    const opts = { ...BASE_OPTIONS, maxQueries: 3 };

    await checkRateLimit(redis, opts); // 1
    await checkRateLimit(redis, opts); // 2
    await checkRateLimit(redis, opts); // 3 — last allowed

    const result = await checkRateLimit(redis, opts); // 4 — should be blocked
    expect(result.allowed).toBe(false);
    if (!result.allowed) expect(result.reason).toBe('rate_limit');
  });

  it('respects custom dailyCapUsd parameter', async () => {
    const today = new Date().toISOString().slice(0, 10);
    const store = new Map([
      [`dailyspend:v1:${today}`, '1.50'], // above custom cap of $1
    ]);

    const redis = makeMockRedis({ async get(k) { return store.get(k) ?? null; } });
    const result = await checkRateLimit(redis, { ...BASE_OPTIONS, dailyCapUsd: 1.0 });
    expect(result.allowed).toBe(false);
    if (!result.allowed) expect(result.reason).toBe('spend_cap');
  });

  it('sets TTL on the rate limit key when the first request arrives', async () => {
    const expireCalls: Array<{ key: string; seconds: number }> = [];
    const redis = makeMockRedis({
      async expire(key, seconds) {
        expireCalls.push({ key, seconds });
        return 1;
      },
    });

    await checkRateLimit(redis, BASE_OPTIONS);
    const rlCall = expireCalls.find((c) => c.key.startsWith('ratelimit:'));
    expect(rlCall).toBeDefined();
    expect(rlCall?.seconds).toBe(3600);
  });

  it('does not set TTL on rate limit key on subsequent requests', async () => {
    const expireCalls: string[] = [];
    const redis = makeMockRedis({
      async expire(key) {
        expireCalls.push(key);
        return 1;
      },
    });

    await checkRateLimit(redis, BASE_OPTIONS); // first — sets TTL
    const firstCallCount = expireCalls.filter((k) => k.startsWith('ratelimit:')).length;
    await checkRateLimit(redis, BASE_OPTIONS); // second — should NOT set TTL again
    const secondCallCount = expireCalls.filter((k) => k.startsWith('ratelimit:')).length;

    expect(firstCallCount).toBe(1);
    expect(secondCallCount).toBe(1); // unchanged
  });
});
