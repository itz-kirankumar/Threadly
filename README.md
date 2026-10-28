# Threadly — Enterprise GEO Intelligence

Threadly measures how AI assistants talk about your brand. It asks ChatGPT,
Claude, Gemini and Perplexity the questions your buyers ask, then tracks
whether the answers mention you, cite your website, and how you rank against
your competitors — scan after scan.

## What it does

- **Brand setup** — name, domain, aliases and up to 8 competitors.
- **Question tracking** — the buyer questions you want to win ("best async
  video tools", "Loom vs Vidyard"), with AI-generated suggestions.
- **Four-provider scans** — every question is asked to ChatGPT (OpenAI
  Responses API + web search), Claude (Anthropic + web search), Gemini
  (Google Search grounding) and Perplexity (Sonar, native citations).
- **GEO metrics** — mention rate, citation share, share of voice and average
  first-mention position, per provider and per question, with trend
  snapshots across runs.
- **Citation leaderboard** — which domains the assistants cite in your
  category, labelled yours / competitor / source.
- **Relationship CRM** — the portal's CRM workspace keeps companies,
  contacts, deals and next-step activities; saving a lead creates or updates
  the matching account and contact without duplicates. The consolidated
  navigation model is documented in [the enterprise information
  architecture](docs/enterprise-information-architecture.md).
- **Public demo** — `/demo` renders a read-only workspace with clearly
  labelled sample data (fictional brand "Loomify"), no sign-in required.
- **Scheduled scans** — daily Vercel cron scans every workspace when the
  Firebase service-account variables are set.

## Stack

Next.js 15 (App Router) · React 19 · Firebase Auth (Google sign-in) ·
Firebase Realtime Database · Tailwind CSS 4 · Vercel cron.

## Run locally

```bash
npm ci
cp .env.example .env.local   # fill in Firebase + at least one provider key
npm run dev
```

Open http://localhost:3000 — the landing page links to the demo and the
workspace (`/portal`, Google sign-in).

## Environment

See `.env.example`. The app works with any subset of the four provider keys
— providers without a key show as "not configured". All four are needed for
full coverage. Never enable `ENABLE_DEMO_MODE` in production: it exists only
for local development with an in-memory store that never calls paid APIs.

## Deployment (Vercel)

1. Import the repo, set every variable from `.env.example` that you use.
2. Push to `main` — Vercel deploys automatically.
3. Scheduled scans: create a service account in the Firebase project
   (Project settings → Service accounts), add `FIREBASE_ADMIN_*` and a random
   `CRON_SECRET`. `vercel.json` registers a daily 03:00 UTC cron that calls
   `/api/geo/cron`, which scans every workspace with a brand profile.
4. Long scans: the scan route sets `maxDuration = 120` and the cron route
   300. On the Hobby plan (60s cap), keep tracked questions to ~6 or upgrade.

## Security model

- All AI provider keys are server-only; the client never sees them.
- API routes verify the Firebase ID token on every request and scope all
  data to `users/<uid>` via `database.rules.json`.
- Scan runs are rate-limited per user (6/hour) with an atomic counter.
- The legacy `demo-token` bypass is gated behind `ENABLE_DEMO_MODE=false`
  and never reaches paid providers.
