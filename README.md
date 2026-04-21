# GritHunter

**Technical talent intelligence for startup CTOs — proof of work, not keyword matches.**

---

## The Problem

Every tool that exists for finding developers — LinkedIn Recruiter, GitHub search, traditional ATS platforms — returns keyword matches. A developer who lists "React Native" on LinkedIn is indistinguishable from one who shipped three apps to the App Store and contributes to `react-navigation`. The signal is absent.

For a startup CTO hiring their 3rd–10th engineer, this is a real problem. A bad hire at that stage is expensive. Manual vetting takes hours. And the people doing the hiring are engineers themselves — they know what a good GitHub history looks like, but they don't have time to look at 50 of them.

---

## The Core Insight

**Public proof of work already exists.** GitHub repos, npm packages, blog posts, conference talks, Hacker News threads, Stack Overflow answers, open-source contributions — the evidence is out there. No one has wired it together into a fast, reasoned answer to the question: *"Who are the five best React Native engineers in San Francisco who have actually shipped something?"*

GritHunter does that. At query time. In under 30 seconds.

Instead of maintaining a static index, GritHunter makes a live Perplexity Agent API call that reasons over the full public web surface — then returns a synthesized evidence card per developer explaining *why* they match, backed by specific public signals.

**The evidence card is the product.** Not a list. Not a score. A reasoned explanation with linked sources.

---

## Who It's For

**Engineering hiring managers and tech leads at startups.** Specifically: startup CTOs and founding engineers who are personally doing the hiring, evaluate proof of work directly, and feel the acute pain of wading through LinkedIn noise.

NOT the initial user: traditional technical recruiters optimizing for volume.

---

## What GritHunter Does (v1)

Three entry points. One output format.

| Mode | Input | What Perplexity Does |
|------|-------|---------------------|
| **Search** | `"React Native engineers in SF who shipped App Store apps"` | Discovers matching developers via live web reasoning |
| **Repo Similarity** | `github.com/facebook/react-native` | Finds engineers working in the same technical domain (not just contributors) |
| **Profile Similarity** | `github.com/brentvatne` | Finds developers with comparable proof-of-work |

Each result surfaces an **Evidence Card**:
- Perplexity-synthesized explanation of *why* this developer matches
- Typed signal tags: `repo` · `blog` · `npm` · `talk` · `so` · `hn` · `x`
- GitHub metadata: followers, public repos, top languages
- "Last verified" timestamp (enrichment is cached 24h, search is always live)

---

## What Is NOT in v1

- Any numeric match score (the evidence card is the signal)
- ATS integration or pipeline management
- Outreach or messaging features
- Bulk export / CSV download
- Developer-facing features (claiming profiles, opting out)
- Saved searches or alert subscriptions
- Resume parsing or LinkedIn scraping
- Availability inference

---

## Architecture

```
User query (text or GitHub URL)
        │
        ▼
[Input Classification — server-side]
  regex: profile URL → 'profile'
         repo URL   → 'repo'
         otherwise  → 'nl'
        │
        ▼
[Rate Limit Check — Redis]
  ratelimit:v1:<ip>    10 req/session/hour → 429
  dailyspend:v1:<date> $10/day cap        → 503
        │
        ▼
POST /api/search
  → Perplexity Agent API (pro-search preset)
  → Returns up to 10 GitHub handles
  → Parallel GitHub handle validation (drop 404s)
  → Returns: { handles: string[], total: number }
        │
        ▼
GET /api/enrich/:handle  (×5, parallel)
  ├── Redis MGET cache check (TTL 24h)
  ├── Cache hit  → return stored EvidenceCard immediately
  └── Cache miss → Perplexity Agent API enrichment call
                 → parseEnrichment() (JSON strip, validate URLs, cap signals)
                 → GitHub API: followers + top 20 repos by stars → top languages
                 → Assemble EvidenceCard → write to cache
        │
        ▼
Client renders cards as each /enrich call resolves
```

### Why Split Routes (Not SSE)

Vercel Hobby functions have a 10-second timeout. A single long-lived SSE connection delivering all 5 enrichments (~25–40s total) would exceed that. Split routes solve this cleanly:
- `POST /api/search` completes in under 5s
- Each `GET /api/enrich/:handle` completes in under 10s
- Client fires 5 in parallel, renders cards as they resolve

Same progressive-loading UX. No SSE. Works on the free tier.

### Perplexity Agent API — Why It's Central

The Agent API is not a chatbot endpoint. It is a multi-step agentic research system that:
- Runs `web_search` tool calls autonomously to gather evidence
- Reasons over results before synthesizing an answer
- Returns grounded, citation-backed output from the full public web

This is what enables GritHunter to return real developers with real evidence rather than plausible-sounding hallucinations. The pre-condition gate (run before any product code was written) validated this: the API returned 5 React Native engineers in SF, all with independently verifiable GitHub profiles and supporting evidence.

### GitHub API — Deterministic Facts Only

GitHub API is used for two things and only two things:
1. **Handle validation**: `GET /users/:handle` — drop 404s silently
2. **Structured metadata**: followers, public_repos, top 3 languages (computed from top 20 repos sorted by stargazers)

Perplexity handles interpretation. GitHub handles facts.

---

## Tech Stack

| Layer | Choice | Why |
|-------|--------|-----|
| Framework | Next.js 15+ (App Router) | Clean API route separation; Vercel-native |
| Language | TypeScript | Type-safe EvidenceCard schema throughout |
| Styling | Tailwind CSS | Fast, consistent utility styling |
| Cache / Rate Limit | Upstash Redis | Serverless Redis; Vercel-compatible REST API |
| Schema Validation | Zod | Runtime validation of EvidenceCard and env vars |
| Test Runner | Vitest | Fast, native TS, excellent MSW compatibility |
| Mock Layer | MSW | Network-level mocking for route integration tests |
| AI | Perplexity Agent API | Live multi-step web reasoning at query time |
| Deployment | Vercel (Hobby tier) | Split routes fit within 10s function timeout |

---

## Pre-Condition Gate (Validated Before Any Product Code)

Before writing a line of application code, the architecture was validated with a real Perplexity Agent API call:

> **Query**: "Find React Native engineers in San Francisco who have shipped apps to the App Store. For each one, explain specifically why they match based on public evidence."

**Result**: 5/5 developers returned. All had independently verifiable GitHub profiles and supporting public evidence.

| Developer | Role / Evidence |
|-----------|----------------|
| brentvatne | Co-founder of Expo |
| kmagiera | Co-founder of Software Mansion, author of `react-native-reanimated` |
| tido64 | React Native core at Meta / Microsoft Office RN |
| Pizzaboi87 | iOS-focused RN apps with public repos |
| jacobp100 | iOS RN tooling author |

**Pass criteria (per spec):** ≥3 of 5 must have at least one independently verifiable public source URL. Result: 5/5. Gate passed.

---

## Current Implementation Status

**Status: Live**
- The v1 web app is fully implemented without authentication.
- M4 frontend search and enrichment experience is live with progressive loading.
- Search uses the Perplexity Agent API + GitHub API + Upstash Redis as defined in the design spec.
- Rate limiting and daily cost cap enforced in the backend.

### What's Implemented Now
- **Dual-mode search**: Natural language queries and similarity-by-GitHub URL.
- **Progressive evidence cards**: Real-time rendering of GitHub profiles with Perplexity-backed evidence signals as fetches resolve.
- **Backend caps**: Redis handles strict IP-based rate limiting and daily API cost envelopes.
- **Production-grade edge cases**: Handles Perplexity outages gracefully via degraded caching modes without blocking parallel fetch pipelines.


```
grithunter/
├── src/
│   ├── lib/
│   │   ├── classifyInput.ts        ✅  6 tests — input mode classifier
│   │   ├── parseEnrichment.ts      ✅ 18 tests — fenced JSON parser + fallback
│   │   ├── topLanguages.ts         ✅  9 tests — GitHub repo language aggregation
│   │   ├── rateLimitCheck.ts       ✅ 10 tests — Redis rate limit + spend cap
│   │   ├── perplexityClient.ts     ✅  7 tests — agentSearch() + agentEnrich()
│   │   ├── extractHandles.ts       ✅ 15 tests — robust handle extractor (4 formats)
│   │   ├── githubClient.ts         ✅ Thin wrapper for GitHub REST API v3
│   │   └── types.ts                ✅ Shared EvidenceCard + SearchResponse types
│   └── app/api/
│       ├── search/                 ✅ POST /api/search — 13 integration tests
│       └── enrich/[handle]/        ✅ GET /api/enrich/[handle] — 11 integration tests
└── ...
```

**96 / 96 tests passing.** Routes and core library are complete. Verified against live API.

---

## Near-Term Roadmap

| Milestone | Status |
|-----------|--------|
| Pre-condition gate | ✅ Passed |
| Project scaffold | ✅ Next.js + Vitest + Upstash + Zod |
| Core library layer | ✅ 72/72 unit/lib tests passing |
| `POST /api/search` route | ✅ Complete (M3) — 13 tests passing |
| `GET /api/enrich/[handle]` route | ✅ Complete (M3) — 11 tests passing |
| **Total Test Suite** | **✅ 96/96 tests passing** |
| Frontend (search + results) | ✅ Complete (M4) — 8 tests passing |
| Vercel deployment | ⏳ M5 — Planned (Next) |

---

## Build-in-Public

This repository is being built openly as a proof-of-work artifact. Architecture decisions, engineering tradeoffs, and implementation rationale are documented in:

- [`eng.md`](./eng.md) — Engineering log and architecture decision records
- [`product.md`](./product.md) — Product vision, scope, and feature log
- [`design.md`](./design.md) — Original product design spec
- [`REVIEW.md`](./REVIEW.md) — Engineering review: resolved spec gaps before implementation
- [`TODOS.md`](./TODOS.md) — Implementation task list in dependency order
- [`test-plan.md`](./test-plan.md) — Full unit + integration test spec

Every major architectural decision is documented before it is coded. Every implementation slice has a passing test suite before the next slice begins.

---

## Local Development

```bash
# Install dependencies
cd grithunter && npm install

# Set up environment
# Copy .env.local and fill in:
#   PERPLEXITY_API_KEY
#   GITHUB_TOKEN
#   UPSTASH_REDIS_REST_URL
#   UPSTASH_REDIS_REST_TOKEN

# Run tests
npm test

# Start dev server
npm run dev
```

---

_GritHunter v1 — signal over noise._
