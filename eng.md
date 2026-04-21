# GritHunter v1 — Engineering Log

_Last updated: 2026-04-21_

---

## Project Status

| Phase | Status |
|-------|--------|
| Pre-condition gate | ✅ Passed (5/5 verifiable developers returned) |
| Credentials | ⚠️ All 4 env vars in `.env.local`; Redis not yet validated end-to-end |
| Scaffolding | ✅ Complete — Next.js 15+ in `grithunter/`, Vitest, Upstash, Zod installed |
| `classifyInput.ts` | ✅ 6/6 tests passing |
| `parseEnrichment.ts` | ✅ 16/16 tests passing |
| `topLanguages.ts` | ✅ 9/9 tests passing |
| `rateLimitCheck.ts` | ✅ 10/10 tests passing |
| `perplexityClient.ts` | ✅ Implemented (no network tests — covered by integration tests on routes) |
| `POST /api/search` | ⏳ Next |
| `GET /api/enrich/[handle]` | ⏳ Planned |
| Frontend | ⏳ Planned |

---

## Architecture Decisions

### AD-001: Test Runner — Vitest (deliberate choice, not from docs)
- **Date**: 2026-04-21
- **Decision**: Vitest over Jest
- **Rationale**: Native TypeScript, fast feedback, excellent MSW compatibility
- **Status**: Locked

### AD-002: No SSE — Split Routes
- **Date**: 2026-04-21 (locked in REVIEW.md A-1)
- **Decision**: `POST /api/search` returns handles only; `GET /api/enrich/[handle]` returns one EvidenceCard
- **Rationale**: Vercel Hobby 10s function timeout is incompatible with a long-lived SSE connection over full enrichment (~25-40s). Split routes are each under 10s and independently retryable/cacheable.
- **Status**: Locked

### AD-003: Perplexity Agent API as primary, multi-API architecture now permitted
- **Date**: 2026-04-21
- **Decision**: Agent API remains the primary orchestration and evidence synthesis surface. Sonar API and Search API are now explicitly permitted as supporting teammates for lower-cost or specialized substeps.
- **Delta from original docs**: Original docs said "Perplexity Agent API exclusively." This is now revised to allow a multi-surface Perplexity strategy — but Agent API must remain the highest-leverage, user-facing intelligence layer.
- **Mapping**:
  - Agent API (`POST /v1/agent`, preset `pro-search`): candidate discovery, evidence synthesis, similarity reasoning
  - Sonar API (`sonar-pro` or `sonar` via Chat Completions): cheaper, faster substeps (e.g., quick handle-to-identity lookup if needed, or reformatting enrichment output)
  - Search API: raw retrieval grounding if it improves citation quality at lower cost
  - GitHub API: handle validation, repo metadata (followers, public_repos, top languages from top 20 repos by stars), not AI
  - Local code: all deterministic transforms — fenced JSON stripping, URL validation, topLanguages computation, signal capping
  - Redis: caching enrichment (24h TTL), rate limiting (10/session/hour), daily spend cap
- **Status**: Approved pending memo review

### AD-004: GitHub API does more than minimal metadata
- **Date**: 2026-04-21
- **Decision**: GitHub API is not just metadata decoration. It is the ground-truth validation layer for handles, and can also supply structured data that would otherwise have to be inferred by Perplexity (language breakdown, star counts, repo age). This prevents hallucination of factual fields.
- **Rationale**: The docs already specify this clearly (GET /users/:handle for validation, GET /users/:handle/repos for top languages). The revision simply makes explicit that GitHub should cover deterministic factual retrieval, not be treated as optional decoration.
- **Status**: Locked

### AD-005: Retry behavior — 1 retry with 1s delay
- **Date**: 2026-04-21 (locked in REVIEW.md A-4)
- **Decision**: 1 retry with 1s delay on 5xx or timeout, per call. No circuit breaker in v1.
- **Status**: Locked

### AD-006: Prompt injection defense
- **Date**: 2026-04-21 (locked in REVIEW.md A-5)
- **Decision**: System+user envelope for ALL Perplexity calls. User input only in labeled QUERY or HANDLE field.
- **Status**: Locked

### AD-007: JSON parsing — fenced JSON first, prose fallback
- **Date**: 2026-04-21 (locked in REVIEW.md CQ-1)
- **Decision**: Strip ```json...``` fences before JSON.parse. If still invalid, use regex prose fallback to extract github_handle and summary. Invalid URLs dropped silently.
- **Implementation home**: `src/lib/parseEnrichment.ts`
- **Status**: Locked

### AD-008: topLanguages derivation
- **Date**: 2026-04-21 (locked in REVIEW.md CQ-2)
- **Decision**: Fetch `per_page=20` repos sorted by `stargazers`. Compute top 3 languages by repo count across those 20.
- **Implementation home**: `src/lib/topLanguages.ts`
- **Status**: Locked

### AD-009: No re-ranking beyond Perplexity's returned order
- **Date**: 2026-04-21 (from design.md)
- **Decision**: Perplexity's returned handle order is the display order. GitHub metadata does not modify rank. Thin-signal cards stay at their rank, labeled "Limited signal."
- **Status**: Locked

### AD-010: Daily spend cap strategy
- **Date**: 2026-04-21
- **Decision**: Redis key `dailyspend:v1:<YYYY-MM-DD>` with TTL 86400s. Track $ cost per query. Cap set at $10/day (~80 queries). Return 503 on breach.
- **Status**: Proposed — set after real cost data from pre-condition gate is confirmed. Actual gate cost was $0.022/call for 1 call. At ~6 calls/query, estimated $0.12-0.15/query.

---

## Codebase Status (as of 2026-04-21)

### `grithunter/src/lib/`
```
classifyInput.ts        ✅  6 tests
classifyInput.test.ts   ✅
parseEnrichment.ts      ✅ 16 tests — pure content parser, API-surface-agnostic
parseEnrichment.test.ts ✅
topLanguages.ts         ✅  9 tests — pure deterministic transform
topLanguages.test.ts    ✅
rateLimitCheck.ts       ✅ 10 tests — injectable Redis client for testability
rateLimitCheck.test.ts  ✅
perplexityClient.ts     ✅ agentSearch() + agentEnrich() — single HTTP integration point
                           No direct tests: covered by route integration tests
```
Total: 41/41 unit tests passing.

### `grithunter/src/app/api/`
```
search/route.ts         ⏳ Not created
enrich/[handle]/route.ts ⏳ Not created
```

### `grithunter/src/app/` (frontend)
```
page.tsx                ✅ Default Next.js placeholder (not GritHunter UI)
layout.tsx              ✅ Default Next.js placeholder
```

---

## Open Engineering Questions

1. **Agent API model selection**: The Agent API now supports many third-party models (openai/gpt-5.4, anthropic/claude-sonnet-4-6, perplexity/sonar). The `pro-search` preset auto-selects. Need to verify what model the preset uses and pin it explicitly for cost predictability.
2. **Sonar API integration boundary**: No concrete need yet identified for a Sonar API call. Defer until route implementation reveals a specific sub-task where Sonar outperforms Agent on cost/latency.
3. **Redis connection**: UPSTASH_REDIS_REST_URL and UPSTASH_REDIS_REST_TOKEN are in `.env.local` but not yet validated. Test connection before implementing `rateLimitCheck.ts`.

---

## Milestone-Based Commit / Push Cadence

This project uses **milestone commits** — not a commit per change. Only push when a meaningful unit of work is complete and tests pass.

| # | Milestone | What It Includes | Status |
|---|-----------|-----------------|--------|
| M1 | **Initial public scaffold + docs** | README, eng.md, product.md, design.md, REVIEW.md, TODOS.md, test-plan.md, Next.js scaffold, Vitest config, precondition.py | ✅ Ready to push |
| M2 | **Core library complete** | classifyInput, parseEnrichment, topLanguages, rateLimitCheck, perplexityClient — 41/41 tests | ✅ Ready to push (combine with M1 or push separately) |
| M3 | **API routes complete** | POST /api/search + GET /api/enrich/[handle] + integration tests | ⏳ |
| M4 | **First working search flow** | Frontend connected to routes; real query returns real cards end-to-end | ⏳ |
| M5 | **First deployed demo** | Vercel deployment live; demo URL in README | ⏳ |
| M6 | **Architecture revision (if any)** | If Sonar/Search API are introduced, or major refactor | ⏳ |

### Push Rules
- Never push a red test suite
- Never push uncommitted `.env.local` (it is gitignored)
- Never force-push `main`
- Commit message format: `[M<N>] <milestone name>: <one-line summary>`
- Example: `[M1] Scaffold + docs: initial public scaffold, README, architecture docs`

### What NOT to Commit
- `grithunter/.env.local` (contains real secrets — already in `.gitignore`)
- `grithunter/.next/` (build artifacts — already in `.gitignore`)
- `grithunter/node_modules/` (already in `.gitignore`)
- `.DS_Store` (add to root `.gitignore`)
- `.claude/`, `.gstack/` (internal tooling state — add to `.gitignore`)

