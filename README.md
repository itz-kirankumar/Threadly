# Threadly

Threadly helps business teams find the companies worth contacting, reach the
right people with relevant and truthful email, and measure how AI assistants
describe their brand. The product has two capability areas on one workspace:

- **Intelligence (GEO)**, live: asks ChatGPT, Claude and Gemini the questions
  a brand's buyers ask, then tracks mentions, citations and share of voice
  against competitors.
- **Revenue**: leads, a relationship CRM and an approval-gated outbound
  engine. The outbound engine is built and tested but switched off and
  owner-only until the release gates in the PRD are closed.

The canonical navigation and workflow are documented in
[the enterprise information architecture](docs/enterprise-information-architecture.md).

## What it does

**Intelligence**

- **Brand setup**: name, domain, aliases and competitors.
- **Question tracking**: the buyer questions to win, with suggestions.
- **Scans**: each question is asked to ChatGPT (OpenAI Responses API with web
  search), Claude (Anthropic with web search) and Gemini (Google Search
  grounding). Results list only providers that returned results, and a run
  summary states how many did; a failed or partial run is never reported as
  complete.
- **Metrics**: mention rate, citation share, share of voice and first-mention
  position per provider and question, with trends across runs.
- **Optimization**: brand facts from the profile, a question check against
  stored scans, the sources AI answers actually cite, and a robots.txt and
  llms.txt crawler audit reported as pass/fail checks.
- **Social search** of public Reddit, X, LinkedIn and web pages indexed by
  search (not complete or real-time platform data).

**Revenue**

- **Leads**: candidate accounts from manual entry or observed scan results.
  Leads never send email; drafts are for review and copying.
- **CRM**: companies, contacts, deals and activities; saving a lead creates
  or updates the matching account and contact without duplicates.
- **Outbound** (gated): versioned targeting profiles, licensed sources and
  CSV import with rights records, fit scoring, campaign approval, a durable
  send ledger, suppression and one-click unsubscribe, sender OAuth consent,
  reply handling, meeting booking, kill switches and an append-only audit log
  with export. This is the single policy gate for every send.

**Workspace**: team roles and invites, bring-your-own provider keys, API
access keys, billing, light and dark dashboard themes, and a help assistant.

## Stack

Next.js 15 (App Router), React 19, Firebase Authentication and Realtime
Database, Tailwind CSS 4, Vercel with cron, Resend, Razorpay and Dodo
Payments, PostHog (consent-gated).

## Run locally

```bash
npm ci
cp .env.example .env.local   # fill in Firebase and at least one provider key
npm run dev
```

Open http://localhost:3000. `/demo` renders a read-only workspace with
labelled sample data for a fictional brand; `/portal` is the signed-in
workspace.

## Checks

```bash
npm run verify          # lint, type check, unit tests and production build
npm test                # unit suites (no external services)
npm run test:emulator   # Realtime Database suites; needs Java 11+
```

`test:emulator` starts the Firebase Realtime Database emulator for project
`demo-threadly` (offline, no credentials) with the test-only open rules in
`tests/emulator/`, then runs the `*.emulator.test.mjs` suites. CI runs both.

## Environment

Every variable the code reads is listed and explained in `.env.example`.
Never set `ENABLE_DEMO_MODE` in production: it exists only for local
development with an in-memory store that never calls paid APIs. Outbound
stays dark unless `OUTBOUND_ENABLED=true` and an explicit
`OUTBOUND_DATA_ROOT` are both set.

## Deployment (Vercel)

1. Import the repository and set the variables from `.env.example` that you use.
2. Pushes to `main` deploy to production automatically. Batch changes: the
   project has hit the daily deployment limit before.
3. Scheduled scans need the `FIREBASE_ADMIN_*` service account and a random
   `CRON_SECRET`. `vercel.json` registers a daily 03:00 UTC call to
   `/api/geo/cron`.
4. The scan route allows 120 seconds and the cron route 300. On a plan with a
   60 second limit, keep the number of tracked questions small.

## Security model

- Provider keys are server-only and never sent to the client. Workspace keys
  are encrypted at rest with `KEY_ENCRYPTION_SECRET`.
- Every API route verifies the Firebase ID token (or a webhook signature,
  signed link or provider token for public endpoints) and scopes data to the
  workspace.
- Prospect pages, imported data and inbound email are untrusted input. CSV
  exports neutralise spreadsheet formulas.
- Outbound actions are recorded in an append-only audit log that owners and
  admins can export from the Outbound tab or `GET /api/outbound/audit`.
- Server-side fetches of user-supplied domains accept public hostnames only
  and are rate-limited.

## Documents

- [Enterprise information architecture](docs/enterprise-information-architecture.md)
- [Enterprise migration evidence](docs/enterprise-migration.md)
- [ADR 0001: send ledger store](docs/adr/0001-send-ledger-store.md)
- [ADR 0002: data regions](docs/adr/0002-data-regions.md)
