# GritHunter — Next.js App

This is the Next.js 15 application for GritHunter. For full project context — architecture, design decisions, roadmap — see the [root README](../README.md).

## Local Development

```bash
npm install
npm run dev     # http://localhost:3000
npm test        # runs Vitest (105 tests)
npm run build   # production build check
```

## Environment Variables

Create `grithunter/.env.local` with:

```
PERPLEXITY_API_KEY=...
GITHUB_TOKEN=...
UPSTASH_REDIS_REST_URL=...
UPSTASH_REDIS_REST_TOKEN=...
```

## Project Structure

```
src/
├── app/
│   ├── page.tsx                    # Main search UI
│   └── api/
│       ├── search/route.ts         # POST /api/search
│       └── enrich/[handle]/route.ts # GET /api/enrich/:handle
├── components/
│   ├── DeveloperCard.tsx
│   ├── SearchForm.tsx
│   ├── ModeToggle.tsx
│   ├── ResultsSummary.tsx
│   ├── SignalTags.tsx
│   ├── EmptyState.tsx
│   └── ErrorState.tsx
└── lib/
    ├── classifyInput.ts
    ├── extractHandles.ts
    ├── githubClient.ts
    ├── parseEnrichment.ts
    ├── perplexityClient.ts
    ├── rateLimitCheck.ts
    ├── topLanguages.ts
    └── types.ts
```
