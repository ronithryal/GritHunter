# GritHunter v1 — Product Log

_Last updated: 2026-04-22_

---

## Product Vision

GritHunter is a **technical talent intelligence** tool. It allows startup CTOs and founding engineers to describe what they're looking for in a developer and get back verified, evidence-based profiles — not keyword matches.

The core user experience: paste a description, get 5 developers back in under 30 seconds, each with a Perplexity-synthesized explanation of *why they match*, backed by real public sources.

**The evidence card is the product.** This is the moat: live reasoning over the full public web signal surface (repos, blogs, npm, conferences, HN, Stack Overflow), not a static index.

---

## Real Initial User

**Engineering hiring manager or tech lead at a startup.** Specifically: a startup CTO or founding engineer who is personally doing the hiring, evaluates proof-of-work directly, and feels the acute pain of wading through LinkedIn noise.

NOT the initial user: technical recruiters (optimize for volume/velocity, don't evaluate proof-of-work).

---

## v1 Scope — What's In

| Feature | Status |
|---------|--------|
| Semantic search (natural language → developers) | ✅ Live |
| Similarity search, repo URL → similar devs in same domain | ✅ Live |
| Similarity search, profile URL → devs with similar proof-of-work | ✅ Live |
| Per-result evidence card: Perplexity WHY paragraph + typed signal tags | ✅ Live |
| "Last verified" timestamp on evidence card (from 24h enrichment cache) | ✅ Live |
| Location (from GitHub profile or Perplexity inference) | ✅ Live |
| "N of M found" result counter (up to 10 results) | ✅ Live |
| Anonymous usage; rate-limited (10 queries/session/hour) by IP | ✅ Live |
| Geo-constraint scarcity hint ("engineers in SF" → explains global distribution) | ✅ Live |
| Mode mismatch hint (URL typed in wrong mode) | ✅ Live |

## v1 Scope — What's NOT In

- Any numeric match score
- ATS integration or pipeline management
- Outreach, messaging, email
- Bulk export / CSV
- Side-by-side developer comparison
- Developer-facing features (claiming profiles, opting out)
- Saved searches or alerts
- Team collaboration
- Resume parsing or LinkedIn scraping
- Availability inference

### More results

v1 returns up to 10 results per search. The ceiling isn't a technical hard limit — it's a deliberate v1 constraint. Perplexity can return more candidates; the cost is GitHub validation latency and enrichment spend per card. The right model for "more results" is lazy: return 10 immediately, let the user request more on demand, only enrich cards that are actually viewed. Pagination or a "load 10 more" button is the natural next step.

---

## Success Criteria

- A startup CTO pastes "React Native engineers in SF who shipped App Store apps" and gets back 5 developers where at least 3 have genuine, verifiable proof-of-work in the evidence card.
- A hiring manager pastes a GitHub repo URL and gets back 5 similar developers, first result appearing within 10 seconds, all 5 within 30 seconds.
- No result looks like it was generated from keyword matching alone.
- All evidence cited in a card is linkable to a real, verifiable public source.

---

## Pre-Condition Gate Results (2026-04-21)

**Status: PASSED**
- Query: "Find React Native engineers in San Francisco who have shipped apps to the App Store."
- API: Perplexity Agent API (`/v1/agent`, `pro-search` preset)
- Results: 5/5 developers returned with independently verifiable GitHub URLs + supporting sources
- Notable result: brentvatne (Expo co-founder), kmagiera (Software Mansion), tido64 (Meta/Microsoft), Pizzaboi87, jacobp100
- Signal quality: High confidence. Agent API returns real developers with real proof-of-work, not hallucinations.
- Cost per call: ~$0.022 (observed from usage data)
- Estimated cost per user query (~6 calls): $0.12–0.15

---

## Entry Modes

| Mode | Input | Perplexity approach |
|------|-------|---------------------|
| Natural language | "React Native engineers in SF" | Agent API: find developers matching domain |
| Repo URL | `github.com/facebook/react-native` | Agent API: find domain engineers, not just contributors |
| Profile URL | `github.com/brentvatne` | Agent API: find devs with similar proof-of-work |

Server-side classification wins over UI toggle. If mismatch, UI shows hint: "That looks like a search query — switching to Search mode."

---

## Distribution Plan

v1: web app, no mobile.
- Personal network / word of mouth
- HN Show HN post with a live demo
- Twitter/X post: "I described what I want and got this back"

CI/CD: Vercel push-to-deploy on merge to main.

---

## Feature Log

| Date | What |
|------|------|
| 2026-04-21 | Pre-condition gate passed. Perplexity Agent API confirmed viable for talent discovery. |
| 2026-04-21 | Scaffolding complete: Next.js in `grithunter/`, Vitest, Upstash, Zod. |
| 2026-04-21 | Core library complete: input classification, enrichment parsing, rate limiting, Perplexity client. 41/41 tests. |
| 2026-04-21 | API routes shipped: `POST /api/search` and `GET /api/enrich/[handle]`. 96/96 tests. |
| 2026-04-21 | Frontend shipped: search flow, progressive card loading, degraded states, mode hints. 104/104 tests. |
| 2026-04-21 | **Search quality pass:** Organizations filtered at GitHub validation. Prompts updated to bias toward high-signal individual developers. |
| 2026-04-21 | **Reliability fixes:** Enrichment timeout raised to 28s (was 15s). Degraded card cache TTL cut to 5min. Redis cache deserialization bug fixed. |
| 2026-04-22 | **M5 — Search quality:** Tier/notability language replaces star-count heuristic. Hard "Limit 10" ceiling removed (soft target). Domain expansion fallback for niche intersection queries. Code quality enrichment rubric (error handling, tests, project structure, maintenance). Eval fixture added. Result cap raised to 10. 110/110 tests. |
| 2026-04-22 | **M6 — Search intelligence (initial):** Geo-constraint scarcity surfacing. When a city/region name appears in the query and ≤2 results are returned, the API surfaces an honest hint ("top engineers in this space are globally distributed") rather than silently widening the search. Appears in EmptyState (zero results) and ResultsSummary (1–2 results). 126/126 tests. |

---

## What's Working Today (as of 2026-04-22)

A user can visit the app, type a description like "React Native engineers in San Francisco who shipped App Store apps," and within 30 seconds see up to 10 evidence cards — each with a Perplexity-synthesized paragraph explaining *why* that developer matches, backed by cited public sources. Cards load progressively as they resolve; the first typically appears within 10 seconds.

The system is fully live against real APIs (Perplexity, GitHub, Upstash Redis). Rate limiting and spend caps are active. The app handles degraded states gracefully: if enrichment fails for a developer, that card shows a recoverable error without blocking the others.

When geo-constrained queries return few results (e.g. "React Native engineers in SF"), the app now surfaces an honest explanation — top engineers in most domains are globally distributed — rather than returning a confusing empty state or silently widening the search.

---

## Milestone Roadmap

| # | Milestone | Goal | Status |
|---|-----------|------|--------|
| M1–M2 | Scaffold + core library | Foundation, 41 unit tests | ✅ Done |
| M3 | API routes | Search + enrich pipelines live | ✅ Done |
| M4 | Frontend | Search UI, progressive loading, evidence cards | ✅ Done |
| M5 | Search quality | Tier language, enrichment rubric, eval fixture | ✅ Done |
| M6 | Search intelligence | Scarcity hints, prompt tuning, feedback-driven improvements | ⏳ In progress |
| M7 | Vercel deployment | Live URL, production env, rate limiting validated | ✅ Done |
| M8 | Design and screens | Evidence card visual hierarchy, typography, responsive layout | ⏳ Planned |

M6 stays open — it absorbs feedback. M7 ships when the product is worth sharing publicly.


---

## Next Upgrade: Search Planning Layer

After v1, the next major improvement to GritHunter’s search intelligence should be a **search planning layer** that sits between raw user input and the main Perplexity search step.

### Why this matters

Today, GritHunter mostly does:

1. classify the input,
2. send one broad search request,
3. extract handles,
4. enrich the top results.

That works for v1, but it still asks the model to do too much in a single step: infer the relevant technical domains, decide which projects or ecosystems matter, find developers, and rank them.

The next upgrade is to break that into two phases:

1. **plan the search surface**, then
2. **search for people inside that surface**.

### What this would do

Given a user query, GritHunter would first generate a structured search plan such as:

- technical themes / subdomains,
- relevant GitHub project categories,
- likely repo or ecosystem “seed areas” to inspect first,
- must-have public signals,
- optional geo / seniority constraints.

For example, a query like **“infra engineers who’ve built observability and self-healing systems on AWS”** might first be decomposed into:

- Observability / Metrics Exporters
- Cloud Remediation / Self-Healing Automation
- AWS Infrastructure Automation

Then the system would decide that relevant repo surfaces include things like:

- Prometheus exporters
- OpenTelemetry collectors
- Terraform AWS modules
- CloudWatch tooling
- incident automation / remediation projects

Only after that planning step would GritHunter search for developers.

### Recommended pipeline changes

| Stage | Keep / Change | Why |
|---|---|---|
| 1. Input classification | Keep | Fast, deterministic, good first branch. |
| 2. Intent decomposition | Add | Extract technical themes before searching people. |
| 3. Repo/project seed selection | Add | Grounds search in actual ecosystems, like the Vamo screenshot. |
| 4. Main Perplexity search | Keep, but narrow | Search for developers *within chosen surfaces*, not from raw query alone. |
| 5. Handle extraction | Keep | Still useful since Perplexity may return mixed text. |
| 6. GitHub validation | Keep | Critical to remove hallucinated or org accounts. |
| 7. Geo hint | Keep, but expand | Could become broader “constraint hints,” not only geo. |
| 8. Enrichment | Keep | Correct separation; caching still makes sense. |

### Product benefit

This would improve the product in three ways:

- **Better precision:** results would be grounded in actual technical ecosystems, not just a broad prompt.
- **Better explainability:** users could see what project surfaces the system decided to search first.
- **Better trust:** the product would feel more deliberate and less like a black-box keyword search.

### UI direction

A future version of the product should expose this planning layer visually as a lightweight **“Relevant GitHub Projects”** or **“Technical surfaces searched”** panel.

This would not need to be editable in the first version. Even a read-only explanation would be valuable because it shows the user how GritHunter interpreted the search before returning people.

Example presentation:

- **Observability / Metrics Exporters**
  - prometheus exporter
  - custom metrics
  - health signals
  - scrape endpoint
  - metrics collection

- **Cloud Remediation / Self-Healing Automation**
  - remediation scripts
  - self-healing
  - auto restart
  - incident automation
  - health checks
  - failure recovery

- **AWS Infrastructure Automation**
  - aws lambda
  - terraform
  - cloudwatch
  - sns
  - sqs
  - iam
  - event-driven

### Scope

This is **not part of the current v1 build**.

For now, v1 keeps the simpler architecture:

- classify input,
- run Perplexity-powered search,
- validate GitHub handles,
- progressively enrich top results.

The planning layer is the next major search-quality upgrade after v1 is stable.

---

### If this were a paid product

The core evidence engine — live Perplexity reasoning over the public web, per-developer cards, GitHub metadata — is the defensible layer. Everything below is workflow and distribution built on top of it.

**Search depth**
- 25–50 results with lazy enrichment as cards scroll into view
- Post-search filters (language, location, follower count) without re-querying Perplexity
- Multi-run merge: query with different phrasings, deduplicate by handle, surface the union — higher recall for niche domains

**Workflow**
- Saved searches with weekly email or Slack diffs ("3 new matches since last week")
- Candidate pipeline: drag developers from search into Screening / Outreach / Passed lists
- Side-by-side developer comparison
- Bulk export to CSV, Notion, or Google Sheets
- ATS push: send a card directly to Greenhouse, Lever, or Ashby with one click

**Team features**
- Shared workspaces: CTO and recruiter see the same pipeline and cards
- Comments and notes on developer cards
- Activity log: who searched what, who moved whom

**Developer-facing**
- Profile claiming: a developer can correct the AI-generated summary or opt out entirely
- "Open to work" badge: developer-controlled, surfaced as a signal on the card

**Intelligence upgrades**
- Feedback loop: mark a card as "good match" or "not a fit"; use those signals to tune prompt framing for future queries on the same account — no retraining, just prompt-level personalization
- Rising engineers: re-run the same query weekly and diff results to surface people before they're well-known
- Private signal blending: connect GitHub stars, a personal CRM, or previous hires to influence ranking
- Deep search mode: Perplexity's Agent API supports a `deep-research` preset alongside `pro-search`. v1 uses `pro-search` (fast, ~$0.02/call). `deep-research` runs longer multi-hop reasoning and would meaningfully improve results for hard queries — niche domain intersections, experience-based queries like "engineers who've scaled systems from thousands to millions of users." The tradeoff is cost and latency. The right product move is a paid "Deep Search" tier where the user explicitly opts in and the higher spend per query is justified by the result quality.
