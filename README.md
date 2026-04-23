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

### More results

v1 returns up to 10 results per query. Returning more — pagination, "load more," or a
higher ceiling — is a deliberate future upgrade. Perplexity's Agent API can surface more
candidates; the bottleneck is GitHub validation latency (parallel, but each is a network
round-trip) and enrichment cost per card. The right model for "more results" is probably
lazy loading: return 10 immediately, let the user request the next page on demand, and
only enrich cards that are actually viewed.

### If this were a paid product

The v1 free tier is intentionally minimal — one input, one output, no account. A
commercial version would layer on top of the same core evidence engine:

**Search depth**
- Result counts of 25–50, with lazy enrichment as cards scroll into view
- Filters applied post-search (language, location, follower count) without re-querying Perplexity
- Re-run with different prompt strategies and merge/deduplicate across runs for higher recall

**Workflow**
- Saved searches with email or Slack alerts when new matches appear
- Candidate pipeline: move developers from search results into lists (Screening, Outreach, Passed)
- Side-by-side developer comparison
- Bulk CSV / Notion / Google Sheets export
- ATS integration: push a card directly to Greenhouse, Lever, or Ashby

**Team features**
- Shared workspaces: the CTO and recruiter see the same pipeline
- Comments and notes attached to developer cards
- Activity log: who searched what, who moved whom through the pipeline

**Developer-facing**
- Profile claiming: a developer can add context, correct the AI-generated summary, or opt out
- "Open to work" signal: developers can flag availability; surfaced as a badge on the card

**Intelligence**
- Feedback loop: the user marks a card as "good match" or "not a fit"; those signals tune
  future query weights without retraining (prompt-level personalization)
- Historical search index: re-run the same query weekly and diff the results to surface
  rising engineers before they're well-known
- Private signal integration: if the user connects GitHub stars, follows, or a private
  CRM, blend those signals into the ranking

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

**Status: Live at https://grithunter.vercel.app**

Search uses the Perplexity Agent API + GitHub API + Upstash Redis. Rate limiting and daily cost cap enforced. All 4 production env vars configured and validated end-to-end.

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

**126 / 126 tests passing.** Routes, core library, and frontend complete. Verified against live APIs.

---

## Writing Good Queries

GritHunter uses Perplexity to reason over public evidence — GitHub repos, npm packages, conference talks, blog posts, open-source contributions. The richer the public signal for a skill or domain, the better the results.

**The rule:** describe what they built, not what they've experienced.

"What would this person's GitHub profile actually show?" If the answer is a repo, a library, or a contribution history — that's a good query. If the answer is a performance review or a war story — rephrase it.

---

### What works well

| Query | Why it works |
|-------|-------------|
| `React Native engineers who shipped App Store apps` | App Store presence and RN repos are publicly verifiable |
| `contributors to the TypeScript compiler or language tooling` | Contribution history is public on GitHub |
| `engineers who built open-source developer tools in Go` | Repos, stars, and usage are all observable |
| `Python ML engineers who publish research code on GitHub` | Research repos, notebooks, and citations are findable |
| `authors of widely-used Rust async or systems libraries` | crates.io downloads + GitHub activity = strong signal |
| `engineers who maintain Kubernetes operators or Helm charts` | Public repos + contributor history = findable |

---

### Rephrasing guide

**Experience descriptors → technology artifacts**

| Instead of | Try |
|------------|-----|
| "devs who can scale apps to millions of users" | "engineers who maintain Kubernetes schedulers, wrote cloud-native infra tooling, or contributed to distributed systems projects" |
| "engineers who've led large systems redesigns" | "engineers who authored technical deep-dives on system architecture or maintain widely-used infrastructure libraries" |
| "senior engineers who are good at architecture" | "engineers who author design docs, technical blog posts, or libraries others build on top of" |

**Role titles → domain artifacts**

| Instead of | Try |
|------------|-----|
| "DevOps engineers with infra experience" | "contributors to Terraform providers, Helm charts, or cloud-native CNCF projects" |
| "ML engineers who understand production" | "engineers who authored ML serving frameworks, inference tooling, or wrote about ML systems at scale" |
| "full-stack engineers who ship fast" | "engineers who built and open-sourced products with real community adoption" |

**Soft skills have no public proxy** — "good communicators," "team players," "fast learners" — rephrase into observable artifacts (blog posts, talks, community engagement) or skip the filter.

---

### Location constraints

GritHunter searches globally. Top engineers in most domains are spread across Vancouver, London, Berlin, São Paulo, and Kraków as much as San Francisco. If you add a city to your query you may get few results — not because good engineers don't exist there, but because the strongest public signal is globally distributed. GritHunter will tell you when this is happening. Search without location first, then filter manually.

---

### Similarity mode

Paste a GitHub profile or repo URL to find developers with similar proof-of-work.

- **Profile URL** (`github.com/brentvatne`): finds engineers with a similar contribution history and domain footprint
- **Repo URL** (`github.com/facebook/react-native`): finds engineers active in the same technical domain — not just contributors, but domain authorities

---

## Roadmap

| # | Milestone | Status |
|---|-----------|--------|
| M1–M2 | Scaffold + core library (41 tests) | ✅ Done |
| M3 | API routes — search + enrich (24 tests) | ✅ Done |
| M4 | Frontend — search UI, progressive loading, evidence cards (40 tests) | ✅ Done |
| M5 | **Search quality** — tier language, enrichment rubric, eval fixture | ✅ Done |
| M6 | **Search intelligence** — geo scarcity hints, prompt tuning, feedback loop | ⏳ In progress |
| M7 | **Vercel deployment** — production env, rate limiting, E2E validation | ✅ Done |
| M8 | **Design and screens** — evidence card visual hierarchy, responsive layout | ⏳ Planned |

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
