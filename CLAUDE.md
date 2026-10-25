# Threadly — Enterprise GEO Intelligence

Single-product app: monitor brand mentions and citation share across
ChatGPT, Claude, Gemini and Perplexity.

## Architecture

- `src/lib/geo/` — the product core:
  - `providers.ts` — one scanner per AI provider (OpenAI Responses +
    web_search, Anthropic web_search, Gemini google_search grounding,
    Perplexity Sonar). Each returns `{ answer, citations }`.
  - `extract.ts` — brand/competitor mention detection, citation-domain
    matching, first-mention position.
  - `engine.ts` — scan orchestration (bounded concurrency), metrics
    snapshots (mention rate, citation share, share of voice, position).
  - `store.ts` — per-user persistence via `src/lib/portal-db.ts`
    (Firebase RTDB REST with the caller's ID token; paths under
    `users/<uid>/geo/`).
  - `admin-store.ts` — service-account persistence for scheduled scans.
  - `demo.ts` — the seeded sample workspace behind `/demo`.
- `src/app/api/geo/` — state, brand, queries, suggest, scan (rate-limited),
  demo (public), cron (CRON_SECRET bearer, daily via vercel.json).
- `src/components/geo/` — dashboard UI (client components).
- Auth: Firebase Google sign-in client-side; API routes verify the ID token
  server-side (`getFirebaseIdentity`). `ENABLE_DEMO_MODE=true` enables the
  in-memory demo identity for local development only — keep it off in prod.

## Rules for changes

- Provider API keys are server-only. Never pass them to the client.
- All metrics shown in the UI come from real scan results; never seed the
  authed workspace with illustrative numbers (demo data lives only in /demo
  and is labelled as sample).
- Keep scans bounded: max 12 queries per scan, 45s per provider call.
- `npm run typecheck && npm run lint && npm run build` must pass.
