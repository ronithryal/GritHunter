# GritHunter v1 — Product Log

_Last updated: 2026-04-21_

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
| Semantic search (natural language → developers) | ⏳ Planned |
| Similarity search, repo URL → similar devs in same domain | ⏳ Planned |
| Similarity search, profile URL → devs with similar proof-of-work | ⏳ Planned |
| Per-result evidence card: Perplexity WHY paragraph + typed signal tags | ⏳ Planned |
| "Last verified" timestamp on evidence card (from 24h enrichment cache) | ⏳ Planned |
| Location (from GitHub profile or conference inference) | ⏳ Planned |
| "5 of N found" result counter | ⏳ Planned |
| Anonymous usage; rate-limited (10 queries/session/hour) by IP | ⏳ Planned |

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
| 2026-04-21 | `classifyInput.ts` implemented and tested (6/6 tests pass). |
| 2026-04-21 | Architecture revised: multi-Perplexity-surface model adopted. Agent API remains primary. |
