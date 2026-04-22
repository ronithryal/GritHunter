# GritHunter v1 — Engineering Log

_Last updated: 2026-04-22_

---

## Project Status

| Phase | Status |
|-------|--------|
| Pre-condition gate | ✅ Passed (5/5 verifiable developers returned) |
| Credentials | ⚠️ All 4 env vars in `.env.local`; Redis not yet validated end-to-end |
| Scaffolding | ✅ Complete — Next.js 15+ in `grithunter/`, Vitest, Upstash, Zod installed |
| `classifyInput.ts` | ✅ 6/6 tests passing |
| `parseEnrichment.ts` | ✅ 18/18 tests passing |
| `topLanguages.ts` | ✅ 9/9 tests passing |
| `rateLimitCheck.ts` | ✅ 10/10 tests passing |
| `perplexityClient.ts` | ✅ 7/7 tests passing |
| `extractHandles.ts` | ✅ 13/13 tests passing |
| `buildSearchQuery` | ✅ 7/7 tests passing |
| `githubClient.ts` | ✅ Implemented (no unit tests — covered by route integration tests) |
| `POST /api/search` | ✅ **M3 COMPLETE** — 13/13 integration tests passing |
| `GET /api/enrich/[handle]` | ✅ **M3 COMPLETE** — 11/11 integration tests passing |
| **Total (all suites)** | **✅ 110/110 passing** |
| Frontend | ✅ **M4 COMPLETE** — search flow, evidence cards, states |
| Search quality | ✅ **M5 COMPLETE** — prompt tuning, enrichment rubric, eval fixture |

---

## gstack Review Fixes (2026-04-21)

Applied before M3. All 4 issues resolved.

### Fix 1: Dead `redis.incr(rlKey)` in `rateLimitCheck.ts` [RESOLVED]
- **Bug**: Inside the `count > maxQueries` branch, an `await redis.incr(rlKey)` call was incrementing the counter *further* on every over-limit request. The comment said "no-op" but it was actively worsening the cap count.
- **Fix**: Removed the call entirely. The TTL expires the key naturally; no counter manipulation is needed after rejection.
- **Test impact**: Existing tests still pass. The mock Redis in tests was absorbing the extra incr silently, masking the bug.

### Fix 2: URL not trimmed before validation in `parseEnrichment.ts` [RESOLVED]
- **Bug**: `isValidUrl(item.url)` ran the regex against the raw (possibly whitespace-padded) string. A URL like `" https://github.com/..."` would fail the `^https?://` check and be silently dropped.
- **Fix**: `const rawUrl = typeof item.url === 'string' ? item.url.trim() : item.url;` — trimmed before both validation and storage.
- **Regression tests added**: 2 new tests covering whitespace-padded URL (kept) and whitespace-only URL (dropped).

### Fix 3: `usage.cost.total_cost` — CONFIRMED EXISTS [RESOLVED]
- **Method**: Made a live Perplexity Agent API call via `probe_response.py` and logged the full response shape.
- **Result**:
  ```json
  "usage": {
    "cost": {
      "currency": "USD",
      "input_cost": 0.0026,
      "output_cost": 0.00098,
      "tool_calls_cost": 0.005,
      "total_cost": 0.00858
    },
    "input_tokens": 2082,
    "output_tokens": 98,
    "total_tokens": 2180
  }
  ```
- **`usage.cost.total_cost`**: ✅ Confirmed present and is a `number`.
- **Bonus finding**: Top-level `output_text` is ABSENT. Real content path:
  `output[n].type === 'message'` → `content[m].type === 'output_text'` → `content[m].text`.
  `extractContent()` already handled this correctly. Updated comments to reflect confirmed shape.
- **Cost per probe call**: $0.00858 (1 web search + small output). At ~6 calls/query: ~$0.05/query. $10/day cap → ~200 queries/day. Generous for v1.

### Fix 4: `agentSearch` accepts `SearchInput` instead of raw string [RESOLVED]
- **Bug**: `agentSearch(sanitizedQuery: string)` let any caller pass raw user input with no type structure. The "sanitization" was a naming convention, not enforced.
- **Fix**: Changed signature to `agentSearch(input: SearchInput)` where `SearchInput` is a discriminated union: `{ type: 'nl' | 'profile' | 'repo'; value: string }`.
- **New behavior**: `buildSearchQuery(input)` constructs mode-specific search phrases internally:
  - `'nl'`: passes value verbatim (it is the user's intent)
  - `'profile'`: constructs similarity query mentioning `github.com/<handle>`
  - `'repo'`: constructs repo domain query mentioning `github.com/<org/repo>`
- **Tests added**: 7 new tests in `perplexityClient.test.ts` covering NL, profile, repo modes, injection defense, and response extraction.



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
| M1 | **Initial public scaffold + docs** | README, eng.md, product.md, design.md, REVIEW.md, TODOS.md, test-plan.md, Next.js scaffold, Vitest config, precondition.py | ✅ Done |
| M2 | **Core library complete** | classifyInput, parseEnrichment, topLanguages, rateLimitCheck, perplexityClient — 41/41 tests | ✅ Done |
| M3 | **API routes complete** | POST /api/search + GET /api/enrich/[handle] + integration tests | ✅ Done |
| M4 | **First working search flow** | Frontend connected to routes; real query returns real cards end-to-end | ✅ Done |
| M5 | **Search quality** | Tier/notability language, domain expansion fallback, code quality enrichment rubric, eval fixture | ✅ Done |
| M6 | **Search intelligence** | Geo-constraint scarcity surfacing, prompt tuning, product feedback loop — ongoing | ⏳ In progress |
| M7 | **Vercel deployment** | Production env, maxDuration validation, Redis under real IPs, live URL in README | ✅ Done |
| M8 | **Design and screens** | Evidence card visual hierarchy, typography, responsive layout, loading skeletons | ⏳ Planned |

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

---

## M3: API Routes Layer (2026-04-21)

### Status: ✅ COMPLETE

Both M3 routes are implemented, tested, and all 94 tests pass (library + route integration).

### Files Created

#### New lib files
- `src/lib/githubClient.ts` — Thin GitHub REST API v3 wrapper. Two functions: `fetchGitHubUser` (handle validation + user metadata) and `fetchGitHubRepos` (top 20 repos by stars for language computation). Returns `null` on 404/403/429; callers apply graceful fallback.
- `src/lib/types.ts` — Shared types: `EvidenceCard` and `SearchResponse`. Matches design.md schema exactly.

#### New route files
- `src/app/api/search/route.ts` — `POST /api/search`
- `src/app/api/enrich/[handle]/route.ts` — `GET /api/enrich/[handle]`

#### New test files
- `src/app/api/search/route.test.ts` — 13 integration tests
- `src/app/api/enrich/[handle]/route.test.ts` — 11 integration tests

### Route Summaries

**POST /api/search**
- Parses `{ query: string }` body
- Classifies input server-side via `classifyInput()`
- Checks rate limit via `checkRateLimit()` — fails open if Redis throws (logged)
- Calls `agentSearch({ type, value })` with mode-specific query via `buildSearchQuery()`
- Extracts handles via `extractHandles()`
- Validates all handles via GitHub API in parallel (`Promise.allSettled`)
- Drops 404s and 403s silently; surviving handles returned
- Returns `{ handles: string[], total: number }`

**GET /api/enrich/[handle]**
- Validates handle format (basic regex)
- Checks Redis cache (`enrich:v1:<handle>`, 24h TTL) — cache read error treated as miss
- On cache miss: calls `agentEnrich(handle)`; on Perplexity failure → degraded card (see AD-011)
- Parses enrichment via `parseEnrichment()` (JSON/prose/fenced)
- Fetches GitHub user + repos in parallel
- Assembles `EvidenceCard` with Perplexity + GitHub fields
- Writes assembled card to Redis cache (24h TTL, best-effort — failure is non-fatal)
- Returns full `EvidenceCard`

### Architecture Decision: AD-011 — Degraded Card Shape

When Perplexity enrichment fails after 1 retry, the route returns a 200 (not 5xx) with a degraded card:
```typescript
{
  github_handle: string,
  summary: null,
  signals: [],
  last_verified_at: ISO8601,
  error: 'unavailable'
}
```
Rationale: the frontend must handle partial failure gracefully. A 5xx response per-handle would mean the client can't distinguish "handle enrichment temporarily failed" from "server is broken". The degraded 200 lets the frontend show "Evidence unavailable — try refreshing" inline on the card, consistent with design.md error states table.

The degraded card IS written to cache (24h TTL). This prevents cascading Perplexity calls on a handle that is temporarily failing. If this is too aggressive for cold-start failures, revisit in M4 debrief.

### Deviations from Original Design Docs

1. **`_resetRedisForTest()` export**: Routes export this test-only helper to allow resetting the Redis singleton between tests. Not mentioned in design docs — a testability tradeoff for the singleton pattern. The singleton avoids re-constructing the Redis client on every request (important for serverless cold-start cost).

2. **`githubClient.ts` Array.isArray guard**: Added `Array.isArray(repos)` check in `fetchGitHubRepos` to handle non-array responses gracefully. Design docs don't call this out, but it prevents `computeTopLanguages` from crashing if GitHub returns an unexpected shape.

3. **Cache write for degraded cards**: Design docs say "skip" enrichment on failure, but don't specify whether to cache the degraded result. Chose to cache it (24h) to prevent hammering Perplexity on a temporarily bad handle. Documented above as AD-011.

4. **`satisfies SearchResponse`** type annotation in search route: confirms the return shape at compile-time without widening the type. Zero runtime cost.

### Test Approach

Both route test files use:
- `vi.mock('@upstash/redis')` with a class-based mock (not factory function) to correctly intercept `new Redis(...)` calls
- Module-level mutable variables (`mockRedisGet`, `mockRedisIncr`, etc.) captured by mock class closure — allows per-test override without re-importing
- `top-level await import(...)` after mock registration to ensure routes get the mocked Redis constructor
- `vi.stubGlobal('fetch', ...)` for Perplexity and GitHub API HTTP mocking
- `_resetRedisForTest()` called in `beforeEach`/`afterEach` to clear cached Redis singletons

### What Remains Before M4

1. ~~Redis end-to-end validation~~ ✅ **Done** — validated live (see checkpoint below)
2. ~~TypeScript build~~ ✅ **Done** — `npm run build` ran clean before M4 gstack clearance
3. **Vercel deployment sanity check** — `maxDuration = 60` set; needs verification under Vercel Hobby plan at deploy time
4. **M4 scope**: Frontend — search input, results list, evidence card component, progressive loading

---

## M3 Checkpoint: Live Validation & Commit (2026-04-21)

### Live validation result: ✅ PASS

**What was tested:**
- Started `npm run dev` against real `.env.local` (live Perplexity, GitHub, Upstash Redis credentials)
- Fired `POST /api/search` with `{"query": "React Native engineers in San Francisco who shipped App Store apps"}`

**First attempt result:** `{ handles: [], total: 0 }` — route returned 200 but empty

**Diagnosis:** Perplexity returned bare-line handles (`jessjchang\nj-tomasik`) with no `@` prefix, URL, or numbered list format. `extractHandles` had no pass for this format.

**Fix applied:** Added extraction pass #4 to `extractHandles.ts` — collects lines whose entire trimmed content is a valid GitHub handle (single token, no spaces). Added 2 regression tests. This is a real API response shape discovery; the format is now documented in the module docstring.

**Second attempt result:** `{ handles: ['lee-cjanet'], total: 1 }` — 200 OK, 2.9s

**What was validated:**
- Route boots cleanly in Next.js dev runtime ✅
- `.env.local` env vars are wired and consumed correctly ✅
- Redis rate-limit path executes without error (Upstash connectivity confirmed) ✅
- Perplexity Agent API call completes and content is extracted ✅
- extractHandles parses bare-line format returned by live API ✅
- GitHub validation runs in parallel, 404s dropped silently ✅
- Response shape matches `{ handles: string[], total: number }` contract ✅

**Note on result quality:** Only 1 of 2 returned handles survived GitHub 404 validation. This is expected — Perplexity occasionally returns handles that don't correspond to real GitHub profiles. The system correctly drops them silently per design.md. Real query quality will improve with better prompt tuning (a v1.1 concern).

### Commit
```
[M3] API routes: search + enrich, 96/96 tests passing
sha: f776af1
```

16 files changed, 1704 insertions. Single commit. History is clean.

### Git status after commit
```
On branch main
Your branch is ahead of 'origin/main' by 1 commit.
  (use "git push" to publish your local commits)

Untracked files: m2review.md, probe_response.py, probe_search.py
  (scratch/review artifacts — not committed)
```

### M4 handoff checklist

- [x] 96/96 tests passing
- [x] `npm run build` clean
- [x] Live Redis-backed search validated end-to-end
- [x] M3 committed as single clean commit
- [x] eng.md current
- [x] Push to origin (do before M4 begins)
- [ ] Vercel deploy (do before M4 UI integration)

---

## M4: Frontend Search Experience (2026-04-21)

### Status: ✅ COMPLETE

The M4 frontend iteration is fully implemented. The application architecture orchestrates parallel enrichment while bypassing Vercel Hobby serverless limits.

### Components Added
- `src/components/ModeToggle.tsx` (Search / Similar to...)
- `src/components/SearchForm.tsx` (Handles inputs and mode hints)
- `src/components/ResultsSummary.tsx` (Shows progressive loading state)
- `src/components/DeveloperCard.tsx` (Renders Perplexity tags + GitHub data)
- `src/components/SignalTags.tsx` (Color-coded evidence types)
- `src/components/EmptyState.tsx` (No results)
- `src/components/ErrorState.tsx` (503, 429, Search Failed, Invalid URL)

### Orchestration
- Modified `src/app/page.tsx` to handle frontend requests.
- Makes 1 request to `POST /api/search`
- Iterates over top 5 handles via `Promise.allSettled`, calling `GET /api/enrich/[handle]` concurrently.
- Renders results as they return, regardless of which finishes first, while preserving the array rank order defined by Perplexity.

### Tests
- Added `test/frontend.test.tsx` using `vitest` + `@testing-library/react`.
- Mocked `fetch` API.
- Implemented tests for empty state, invalid URL, mode toggling, progressive enrichment rendering, degraded card state, and standard card state.

### Caveats & Engineering Decisions
- **Server-Driven Mode Hints**: The backend `POST /api/search` explicitly returns a `detectedMode` parameter. If a user tries to pass a repo URL while still technically in "Search" mode, the mode will gracefully switch to similarity behavior backed by a UI toast message, preserving API calls and optimizing user experience.
- **`AbortController` on Re-Submits**: If a user fires a secondary search while the previous set of cards are still enriching via `/api/enrich/:handle`, the stale parallel fetch requests map to a `ref` via `AbortController` and are killed gracefully, preventing dirty state leaks in rank ordering.
- **Null Summaries**: Rather than returning an empty `<p>`, developers surfaced by GitHub API validation that lack sufficient web signal return `summary === null`, and the UI gracefully renders an italicized "Limited public signal — fewer sources available" explainer.

---

## Post-M4 Hotfixes & Search Quality (2026-04-21)

### Status: ✅ APPLIED

Four issues discovered during first live session against real APIs. All fixed before M5.

### Fix 1: Perplexity enrichment timeout too short [RESOLVED]
- **Bug**: `DEFAULT_TIMEOUT_MS = 15_000` caused AbortError on ~31s enrichment calls (15s + 1s delay + 15s retry). Affected 2/5 cards consistently.
- **Fix**: Raised to `28_000ms`. Worst case: 28s + 1s + 28s = 57s, within `maxDuration = 60`.
- **File**: `src/lib/perplexityClient.ts`

### Fix 2: Degraded card cached for 24h [RESOLVED]
- **Bug**: AD-011 noted this risk. A transient timeout locked a handle out of enrichment for 24h.
- **Fix**: Degraded cards now use a 5-minute TTL (`ex: 300`). Full cards keep 24h TTL unchanged.
- **File**: `src/app/api/enrich/[handle]/route.ts`

### Fix 3: Redis cache double-parse bug [RESOLVED]
- **Bug**: `readCache` used `redis.get<string>()` then `JSON.parse(raw)`. Upstash auto-deserializes valid JSON on read, so `raw` was already an object. `JSON.parse(object)` coerced to `"[object Object]"` → SyntaxError.
- **Fix**: Changed to `redis.get<EvidenceCard>()` — Upstash handles deserialization, no manual parse.
- **File**: `src/app/api/enrich/[handle]/route.ts`

### Fix 4: Organizations appearing in results [RESOLVED]
- **Bug**: GitHub validation only checked for 404. Organization accounts (e.g. `cloudposse`, `terraform-aws-modules`) passed validation and appeared as developer results.
- **Fix**: Added `GitHubUser.type` field. Validation now drops any handle where `user.type !== 'User'`.
- **Files**: `src/lib/githubClient.ts`, `src/app/api/search/route.ts`

### Fix 5: Search prompts not guiding for result quality [RESOLVED]
- **Bug**: All three `buildSearchQuery` prompts returned only "Return only GitHub handles. Limit 10." with no signal-quality guidance. Perplexity had no incentive to prefer high-signal developers over any account that matches the domain.
- **Fix**: All three prompts now:
  - Explicitly request individual developers only (not organizations — belt-and-suspenders alongside Fix 4)
  - Instruct Perplexity to prioritize developers whose repos have earned significant stars (100+)
  - Repo-mode prompt retains its existing "exclude maintainers of 10k+ star repos" clause
- **File**: `src/lib/perplexityClient.ts`

### Architecture Decision: AD-012 — Star weighting lives in the prompt, not in re-ranking

- **Date**: 2026-04-21
- **Decision**: Star count preference is expressed in the Perplexity search prompt, not as post-hoc re-ranking of GitHub metadata.
- **Rationale**: AD-009 locks "no re-ranking beyond Perplexity's returned order." The correct lever for result quality is prompt engineering. The GitHub API's `stargazers_count` data (fetched in the enrich route) decorates cards for the user to see but does not change display rank.
- **Status**: Locked

---

## M5: Search Quality (2026-04-22)

### Status: ✅ COMPLETE — merged to main 2026-04-22

M5 addressed two failure modes diagnosed during first live usage: tier mismatch (correct domain, wrong tier within domain) and niche query suppression (hardcoded "Limit 10" ceiling hiding valid results). All changes are in `perplexityClient.ts` and `ResultsSummary.tsx`. No route or architecture changes.

### Changes Made

**Change 1 — Remove hard result ceiling (`perplexityClient.ts`)**
- Replaced `"Limit 10."` with `"Return as many strong matches as you can find (aim for 5–10; more is fine if strong candidates exist)."` in all three modes (nl, profile, repo).
- Updated `ResultsSummary.tsx`: enrichment cap `Math.min(totalFound, 5)` → `Math.min(totalFound, 10)`.

**Change 2 — Tier and notability bias (`perplexityClient.ts`)**
- NL mode: added language targeting well-known, highly cited, referenced-by-others developers. Removed "100+ stars" heuristic.
- Profile mode: added impact-beyond-own-projects language.
- Repo mode: added authority/standout language (widely-used library maintainers, conference speakers).

**Change 3 — Code quality assessment in enrichment (`perplexityClient.ts`)**
- Updated `agentEnrich()` prompt with three explicit rubric dimensions:
  1. What they built (specific repos/packages cited, not single commits)
  2. Code quality signal (error handling, test coverage, project structure, active maintenance — one repo URL cited as evidence)
  3. Domain depth (specialist vs. generalist with evidence)
- Pre-ship pilot passed 3/3: brentvatne, kmagiera, mmazzarolo all returned summaries citing specific repos and covering code quality dimensions.

**Change 4 — Domain expansion fallback for niche NL queries (`perplexityClient.ts`)**
- Added: if fewer than 3 strong exact matches exist, Perplexity expands to near-matches and notes partial coverage in parentheses.

**Change 5 — Eval fixture (`test/eval/search-quality.eval.ts`)**
- Manual eval script with 5 representative queries and recorded baseline.
- `EVAL_PILOT=1` flag runs the enrichment pilot (3 handles) separately.
- `AbortSignal.timeout(90_000)` on all fetch calls — prevents undici 30s default from cutting off long Perplexity responses.

### Validation Results (2026-04-22)

| Query | Baseline | M5 | Notes |
|---|---|---|---|
| React Native SF | 1 result | 9 results (one run) | Includes brentvatne ✓. Non-deterministic — one run returned 0 (server instability during testing). |
| Go + Prometheus | 10 results | 9 results | Major quality improvement: beorn7, brian-brazil, richih (Prometheus core team) replaced 10 weaker results. |
| DevOps + Terraform | 4 results | 3 results | Stable, passing. |
| Repo similarity | 0 results | Not tested (rate limited) | Mode untested this session — rate limit exhausted by repeated eval restarts. |
| Profile similarity | 6 results | Not tested (rate limited) | Same. |

**Change 3 pilot:** 3/3 pass. brentvatne and kmagiera returned rich code quality summaries with specific repo citations. mmazzarolo returned a degraded card initially (Perplexity timeout on less-known dev during server instability), then returned a full quality summary on clean retry.

**Test suite:** 110/110 passing (up from 96/96 at M4).

### Known Issues / Watch Items

- **React Native SF non-determinism**: one run returned 9 results including brentvatne; a second run returned 0. Perplexity Agent API results are not deterministic. Needs one more clean run to confirm the improvement holds consistently.
- **Repo/profile similarity modes not re-tested**: the eval's last two queries were rate-limited before results could be compared. Re-run eval when rate limit resets.
- **mmazzarolo degraded card on concurrent load**: enrichment timeouts increase under concurrent Perplexity load. The degraded card TTL (5min) handles recovery, but concurrent eval + pilot runs should not be attempted.

### Architecture Decision: AD-013 — Prompt-based tier signaling is allowed; post-hoc re-ranking is not

- **Date**: 2026-04-22
- **Decision**: Expressing tier preference in the Perplexity search prompt ("well-known, highly cited, referenced by others") is explicitly permitted and does not conflict with AD-009 (no post-hoc re-ranking) or AD-012 (no star/follower weighting post-search). The prompt changes what Perplexity looks for, not how we order its output.
- **Status**: Locked

---

## M6: Search Intelligence (IN PROGRESS)

### Status: ⏳ IN PROGRESS — branch `m6`

Ongoing search quality and product intelligence layer. Absorbs feedback-driven prompt changes, new hint types, and user-facing signals. This milestone stays open — it is the living edge of the product.

**Shipped (2026-04-22):**
- Geo-constraint scarcity surfacing: when a query contains a city/region name and returns ≤2 results, the API returns a `geoHint` field. Surfaces in `EmptyState` (zero results) and `ResultsSummary` (1–2 results). Does not silently change search intent.
- `detectGeoHint.ts` — 13 unit tests. 126/126 total.

**Anticipated future scope:**
- Additional hint types as user feedback identifies patterns
- Prompt tuning iterations informed by eval results
- Query suggestions or follow-up actions (e.g. "try without location")

---

## M7: Vercel Deployment (DONE)

### Status: ✅ DONE

**Live at https://grithunter.vercel.app**

**Shipped:**
- All 4 production env vars configured on Vercel (PERPLEXITY_API_KEY, GITHUB_TOKEN, UPSTASH_REDIS_REST_URL, UPSTASH_REDIS_REST_TOKEN)
- `maxDuration = 60` set on both API routes — validated under Vercel Hobby plan
- Push-to-deploy wired: merges to `main` auto-deploy via Vercel git integration
- Upstash Redis working under real production IPs (rate limiting and enrichment cache active)
- E2E validated: 9 handles returned in 7.3s for "React Native engineers who shipped App Store apps"; brentvatne card loads from cache in 165ms

**Deployment note:** `.env.local` stores values with surrounding double quotes. When pushing env vars to Vercel, use `source .env.local && printf '%s' "$VAR" > /tmp/f.txt && vercel env add VAR production < /tmp/f.txt` — not the Python file reader, which preserves the literal quote characters.

---

## M8: Design and Screens (PLANNED)

### Status: ⏳ PLANNED

Scope to be defined. The evidence card is the product — M8 makes it feel like one.
- Prompt injection safety test
