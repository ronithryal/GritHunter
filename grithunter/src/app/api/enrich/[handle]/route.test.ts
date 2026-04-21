/**
 * GritHunter v1: GET /api/enrich/[handle] — Integration Tests
 *
 * Per test-plan.md:
 *   ✓ cache hit → returns cached card, no Perplexity call made
 *   ✓ cache miss, bare JSON response → EvidenceCard returned + written to cache
 *   ✓ cache miss, fenced JSON response → EvidenceCard returned
 *   ✓ cache miss, malformed JSON → fallback card returned (summary: null, signals: [])
 *   ✓ Perplexity 5xx first attempt → retries once → success
 *   ✓ Perplexity 5xx both attempts → returns degraded card (not 5xx)
 *   ✓ GitHub API success → followers/public_repos/top_languages populated
 *   ✓ GitHub API 403 → card returned without metadata fields
 *   ✓ last_verified_at set to cache write timestamp
 */

import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { NextRequest } from 'next/server';

// ─── Redis mock ───────────────────────────────────────────────────────────────

let mockRedisGet = vi.fn().mockResolvedValue(null);  // default: cache miss
let mockRedisSet = vi.fn().mockResolvedValue('OK');

vi.mock('@upstash/redis', () => {
  return {
    Redis: class MockRedis {
      get(...args: unknown[]) { return mockRedisGet(...args); }
      set(...args: unknown[]) { return mockRedisSet(...args); }
      incr() { return Promise.resolve(1); }
      expire() { return Promise.resolve(1); }
      incrbyfloat() { return Promise.resolve(0); }
    },
  };
});

// ─── Import route AFTER mock is registered ────────────────────────────────────
const { GET, _resetRedisForTest } = await import('@/app/api/enrich/[handle]/route');

// ─── Helpers ──────────────────────────────────────────────────────────────────

/**
 * Minimal Perplexity Agent API response with JSON content.
 */
function perplexityResponse(text: string) {
  return {
    ok: true,
    json: async () => ({
      output: [
        {
          type: 'message',
          content: [{ type: 'output_text', text }],
        },
      ],
      usage: { cost: { total_cost: 0.009 } },
    }),
  };
}

function perplexity5xx() {
  return { ok: false, status: 500, json: async () => ({}) };
}

function githubUserOk() {
  return {
    ok: true,
    status: 200,
    json: async () => ({ login: 'brentvatne', followers: 1234, public_repos: 42 }),
  };
}

function githubReposOk() {
  return {
    ok: true,
    status: 200,
    json: async () => [
      { language: 'TypeScript', stargazers_count: 100, pushed_at: '2024-01-01' },
      { language: 'TypeScript', stargazers_count: 80, pushed_at: '2024-01-01' },
      { language: 'JavaScript', stargazers_count: 50, pushed_at: '2024-01-01' },
      { language: null, stargazers_count: 10, pushed_at: '2024-01-01' },
    ],
  };
}

function githubUser403() {
  return { ok: false, status: 403, json: async () => ({ message: 'rate limited' }) };
}

const VALID_ENRICHMENT_JSON = JSON.stringify({
  github_handle: 'brentvatne',
  summary: 'Co-founder of Expo, long-time React Native contributor.',
  signals: [
    { type: 'repo', label: 'expo/expo', url: 'https://github.com/expo/expo' },
  ],
  location: 'San Francisco, CA',
});

const FENCED_ENRICHMENT_JSON = '```json\n' + VALID_ENRICHMENT_JSON + '\n```';

const MALFORMED_ENRICHMENT = `
  Here is information about brentvatne:
  "github_handle": "brentvatne"
  "summary": "Co-founder of Expo."
  Not valid JSON.
`;

/**
 * Create a NextRequest for GET /api/enrich/[handle].
 * The actual [handle] value is passed via the params object (Next.js route params).
 */
function makeRequest(handle: string): NextRequest {
  return new NextRequest(`http://localhost/api/enrich/${handle}`);
}

function makeParams(handle: string): { params: Promise<{ handle: string }> } {
  return { params: Promise.resolve({ handle }) };
}

// ─── Setup / teardown ─────────────────────────────────────────────────────────

beforeEach(() => {
  process.env.PERPLEXITY_API_KEY = 'test-key';
  process.env.UPSTASH_REDIS_REST_URL = 'https://fake-redis.upstash.io';
  process.env.UPSTASH_REDIS_REST_TOKEN = 'fake-token';
  mockRedisGet = vi.fn().mockResolvedValue(null);
  mockRedisSet = vi.fn().mockResolvedValue('OK');
  _resetRedisForTest();
});

afterEach(() => {
  vi.restoreAllMocks();
  delete process.env.PERPLEXITY_API_KEY;
  _resetRedisForTest();
});

// ─── Tests ────────────────────────────────────────────────────────────────────

describe('GET /api/enrich/[handle]', () => {
  // ── Cache hit ──────────────────────────────────────────────────────────────
  it('cache hit: returns cached card, no Perplexity call made', async () => {
    const cachedCard = {
      github_handle: 'brentvatne',
      summary: 'Cached summary.',
      signals: [],
      last_verified_at: '2024-01-01T00:00:00.000Z',
    };
    mockRedisGet = vi.fn().mockResolvedValue(JSON.stringify(cachedCard));
    _resetRedisForTest();

    const fetchMock = vi.fn();
    vi.stubGlobal('fetch', fetchMock);

    const res = await GET(makeRequest('brentvatne'), makeParams('brentvatne'));
    const body = await res.json();

    expect(res.status).toBe(200);
    expect(body.summary).toBe('Cached summary.');
    // Perplexity and GitHub fetch should NOT have been called
    expect(fetchMock).not.toHaveBeenCalled();
  });

  // ── Cache miss, valid JSON → EvidenceCard ─────────────────────────────────
  it('cache miss, bare JSON: returns assembled EvidenceCard and writes to cache', async () => {
    vi.stubGlobal('fetch', vi.fn()
      .mockResolvedValueOnce(perplexityResponse(VALID_ENRICHMENT_JSON))
      .mockResolvedValueOnce(githubUserOk())
      .mockResolvedValueOnce(githubReposOk()),
    );

    const res = await GET(makeRequest('brentvatne'), makeParams('brentvatne'));
    const body = await res.json();

    expect(res.status).toBe(200);
    expect(body.github_handle).toBe('brentvatne');
    expect(body.summary).toContain('Expo');
    expect(body.signals).toHaveLength(1);
    expect(body.followers).toBe(1234);
    expect(body.public_repos).toBe(42);
    expect(body.top_languages).toContain('TypeScript');
    expect(body.last_verified_at).toBeDefined();

    // Cache should have been written
    expect(mockRedisSet).toHaveBeenCalledOnce();
  });

  // ── Cache miss, fenced JSON → EvidenceCard ────────────────────────────────
  it('cache miss, fenced JSON: strips fences and returns EvidenceCard', async () => {
    vi.stubGlobal('fetch', vi.fn()
      .mockResolvedValueOnce(perplexityResponse(FENCED_ENRICHMENT_JSON))
      .mockResolvedValue(githubUserOk()),
    );

    const res = await GET(makeRequest('brentvatne'), makeParams('brentvatne'));
    const body = await res.json();

    expect(res.status).toBe(200);
    expect(body.summary).toContain('Expo');
  });

  // ── Cache miss, malformed JSON → prose fallback card ─────────────────────
  it('cache miss, malformed JSON: returns fallback card (prose extraction)', async () => {
    vi.stubGlobal('fetch', vi.fn()
      .mockResolvedValueOnce(perplexityResponse(MALFORMED_ENRICHMENT))
      .mockResolvedValue(githubUserOk()),
    );

    const res = await GET(makeRequest('brentvatne'), makeParams('brentvatne'));
    const body = await res.json();

    expect(res.status).toBe(200);
    expect(body.github_handle).toBe('brentvatne');
    // Prose fallback: summary extracted, signals empty
    expect(body.signals).toEqual([]);
  });

  // ── Perplexity 5xx → retry → success ──────────────────────────────────────
  it('Perplexity 5xx first attempt: retries once and returns card from second attempt', async () => {
    vi.stubGlobal('fetch', vi.fn()
      .mockResolvedValueOnce(perplexity5xx())
      .mockResolvedValueOnce(perplexityResponse(VALID_ENRICHMENT_JSON))
      .mockResolvedValue(githubUserOk()),
    );

    const res = await GET(makeRequest('brentvatne'), makeParams('brentvatne'));
    const body = await res.json();

    expect(res.status).toBe(200);
    expect(body.summary).toContain('Expo');
  });

  // ── Perplexity 5xx both → degraded card (not 5xx to client) ──────────────
  it('Perplexity 5xx both attempts: returns degraded card, not a server error', async () => {
    vi.stubGlobal('fetch', vi.fn()
      .mockResolvedValue(perplexity5xx()),
    );

    const res = await GET(makeRequest('brentvatne'), makeParams('brentvatne'));
    const body = await res.json();

    // Route returns 200 with degraded card — not a 5xx
    expect(res.status).toBe(200);
    expect(body.github_handle).toBe('brentvatne');
    expect(body.summary).toBeNull();
    expect(body.signals).toEqual([]);
    expect(body.error).toBe('unavailable');
    expect(body.last_verified_at).toBeDefined();
  });

  // ── GitHub success → metadata populated ───────────────────────────────────
  it('GitHub API success: followers, public_repos, top_languages populated', async () => {
    vi.stubGlobal('fetch', vi.fn()
      .mockResolvedValueOnce(perplexityResponse(VALID_ENRICHMENT_JSON))
      .mockResolvedValueOnce(githubUserOk())
      .mockResolvedValueOnce(githubReposOk()),
    );

    const res = await GET(makeRequest('brentvatne'), makeParams('brentvatne'));
    const body = await res.json();

    expect(body.followers).toBe(1234);
    expect(body.public_repos).toBe(42);
    expect(Array.isArray(body.top_languages)).toBe(true);
    expect(body.top_languages[0]).toBe('TypeScript');
  });

  // ── GitHub 403 → card without metadata ───────────────────────────────────
  it('GitHub API 403: returns card without GitHub metadata fields', async () => {
    vi.stubGlobal('fetch', vi.fn()
      .mockResolvedValueOnce(perplexityResponse(VALID_ENRICHMENT_JSON))
      .mockResolvedValue(githubUser403()),
    );

    const res = await GET(makeRequest('brentvatne'), makeParams('brentvatne'));
    const body = await res.json();

    expect(res.status).toBe(200);
    expect(body.github_handle).toBe('brentvatne');
    // Metadata fields should be absent, not null
    expect(body.followers).toBeUndefined();
    expect(body.public_repos).toBeUndefined();
  });

  // ── last_verified_at populated ────────────────────────────────────────────
  it('last_verified_at is set to a valid ISO 8601 timestamp', async () => {
    vi.stubGlobal('fetch', vi.fn()
      .mockResolvedValueOnce(perplexityResponse(VALID_ENRICHMENT_JSON))
      .mockResolvedValue(githubUserOk()),
    );

    const before = new Date().toISOString();
    const res = await GET(makeRequest('brentvatne'), makeParams('brentvatne'));
    const body = await res.json();
    const after = new Date().toISOString();

    expect(body.last_verified_at).toBeDefined();
    expect(body.last_verified_at >= before).toBe(true);
    expect(body.last_verified_at <= after).toBe(true);
  });

  // ── Cache read error → treated as miss ────────────────────────────────────
  it('cache read error: treated as miss, request proceeds normally', async () => {
    mockRedisGet = vi.fn().mockRejectedValue(new Error('Redis read error'));
    _resetRedisForTest();

    vi.stubGlobal('fetch', vi.fn()
      .mockResolvedValueOnce(perplexityResponse(VALID_ENRICHMENT_JSON))
      .mockResolvedValue(githubUserOk()),
    );

    const res = await GET(makeRequest('brentvatne'), makeParams('brentvatne'));
    expect(res.status).toBe(200);
  });

  // ── Invalid handle format → 400 ───────────────────────────────────────────
  it('returns 400 for invalid handle format', async () => {
    const fetchMock = vi.fn();
    vi.stubGlobal('fetch', fetchMock);

    const res = await GET(makeRequest('-invalid'), makeParams('-invalid'));
    expect(res.status).toBe(400);
    expect(fetchMock).not.toHaveBeenCalled();
  });
});
