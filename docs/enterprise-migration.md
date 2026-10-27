# Enterprise migration evidence (branch `enterprise-outbound`)

Status: 2026-10-28. This document records what differs between live production
(`main`) and the isolated enterprise rebuild branch, so the difference can be
reviewed without trusting prose claims.

## Production (`main`)

- Serves https://www.gothreadly.live/ — the GEO platform plus landing, auth,
  billing (Razorpay live + Dodo, hardened unknown-state freeze), dashboard.
- Auto-deploys on every push to `main`.
- Contains no outbound prospecting product surface.
- Known divergence: the GEO dashboard's CRM discovery section on `main` still
  derives contact rows from keyword data (flagged as fabrication; removed on
  this branch in 9610c4a; no backport to `main` has been authorized).

## Branch `enterprise-outbound`

Contains the PRD v1.2 outbound subsystem. Nothing on this branch sends email,
touches provider accounts, or spends money:

- `src/lib/outbound/` — ledger (idempotent intents, CAS transitions, attempt
  log), campaign store (versions, approvals, enrollments, suppressions),
  planner (fail-closed eligibility), contact store (verification + rights
  records), sender store (pending_consent only; write guard refuses any other
  status), usage store (idempotent; `costMinorUnits: null` marks unknown cost
  and blocks spend decisions), conversations + classifier (assistive only,
  humanReplySeenAt written before classification), CRM mapping store,
  drafts (deterministic template rendering; every template variable must be
  allowlisted AND evidence-backed or the render fails closed), policy
  (first-send eligibility, dispatch checks incl. cost-unknown deny).
- `src/app/api/outbound/` — 12 routes (intents, campaigns, enrollments,
  suppressions, contacts, plan, replies, senders, usage, conversations,
  crm-mappings, drafts). Every route returns 404 unless BOTH
  `OUTBOUND_ENABLED=true` AND `OUTBOUND_DATA_ROOT` is explicitly set. There is
  no implicit default data root.
- `src/components/outbound/OutboundPanel.tsx` — review UI (Enterprise tab):
  senders, campaign create/approve, contact+enroll, planner run with skip
  reasons, draft generation, drafts, enrollments (mark replied), intents,
  conversations, meetings.
- `tests/outbound-*.test.mjs` — unit suites (ledger, policy, planner,
  campaign, usage, conversations, isolation, rtdb store, drafts).

## What does not exist yet (per PRD v1.2)

- Real provider adapters behind checkDispatch (OAuth account grants, real
  send). A mock adapter exists for loop validation; its attempts and usage
  events are marked `synthetic` and excluded from real delivery/cap counts.
- Sender consent activation flow (senders stay pending_consent by design;
  POST /api/outbound/senders {action:"begin-consent"} returns an explicit 501
  rather than a missing path; checkDispatch denies sender_not_active).
- LLM personalization engine (needs verified pricing before recording usage).
- Meeting booking integration (types exist; no provider writes).
- PRD D01 owner decisions (pivot vs module) — pending with the owner.

## Components added since the first validation runs

- Draft generation worker + /api/outbound/drafts (render, list, human approve).
- Dispatch runner + /api/outbound/dispatch (mock provider only; all
  checkDispatch gates apply; reserved-before-dispatch lease-expiry reclaim;
  stranded dispatching/provider_unknown reported, never retried).
- Sequence advancement (sequence.ts, run by the plan route): advance on
  provider-confirmed outcomes only; provider_unknown never advances.
- RTDB intent CAS via REST ETag compare-and-put (serverless-safe).

## Validation history

- 2026-10-27/28, two synthetic functional runs on an isolated Vercel preview
  with a branch-scoped flag and explicit test data root (`outbound-test`):
  full lifecycle (create → approve → contact → enroll → plan → idempotent
  re-plan → skip reasons → reply-cancel → suppression) plus RTDB edge cases
  found and fixed (undefined rejection, empty-array drop). All enabled
  deployments and the flag were deleted afterwards; every preview URL and
  production re-verified to return 404 for outbound routes.
- 2026-10-28, run 3 (same scoped-flag window protocol): new draft generation
  worker exercised live on preview. Verified: allowlisted evidence-backed
  variable renders a stored draft ("Quick idea for Draft"); idempotent re-run
  skips with `draft_exists` and records no duplicate usage; a template variable
  outside `allowedPersonalization` fails closed with
  `variable_not_allowed:<name>` (no draft, no usage event); unverified contacts
  and contacts without a verification timestamp fail closed in planning
  (`verification_unknown`, `verification_missing_timestamp`). One `generation`
  usage event recorded at true-zero cost. Flag and enabled deployment deleted;
  every preview URL, the branch alias, and production re-verified 404.
- Synthetic fixtures remain under the RTDB `outbound-test` root, documented
  for the D01 cleanup point. They contain no real contacts or tokens. Run 3
  added: campaigns draftcamp1 v1 and failcamp1 v1 with approvals, contacts
  ct_b35e0a87 (unverified), ct_f9eb1f7d (valid, no timestamp), ct_1166c6c9
  (verified), three enrollments, two intents, one draft, one generation usage
  event. Run 5 added: campaign consentcamp1 v1 + approval, one intent
  (scheduled, consent-gated), one draft. Run 6 added no fixtures.

## Deployment model

- `main` pushes auto-deploy to production. Enterprise work is never pushed to
  `main`.
- Branch pushes create preview deployments that are dark for outbound routes
  by default (no flag set). The flag is created only for a scoped validation
  window and removed with the enabled deployments afterwards.

## Continuation, 28 October 2026 (second overnight session)

Built on enterprise-outbound after main's correction that activation gates are not implementation gates:

- Provider adapters (Gmail + Microsoft): real consent URL/token/send implementations with accepted/rejected/unknown outcome mapping (Graph 202 = accepted, not delivered; timeout/5xx = unknown, never blind-retried). OAuth consent flow is the ONLY sender-activation path: HMAC-signed state, provider-verified mailbox identity must match the registered sender, AES-256-GCM token storage, disconnect deletes tokens + revokes trace. Inactive everywhere: needs provider client envs (OUTBOUND_GMAIL_*/OUTBOUND_MS_*, absent), real consent execution, and OUTBOUND_PROVIDERS_LIVE for live sends (never set). Dispatch routes through RoutingDispatchProvider; synthetic marking is now per-outcome.
- Meetings (F18): BookingPolicy (host pool, IANA-timezone working hours, buffers), recipient booking links (sha256-hashed tokens, expiry, single-use), slot commit with free/busy recheck immediately before provider event creation. Calendar adapters: mock (synthetic) + real Google/Microsoft, live-gated; live flag without calendar-scope consent refuses. booked vs attendeeAccepted vs held stay separate outcomes; cancel updates the same record.
- CSV import (F02/F03): preview/commit, rightsConfirmed required (unlicensed source blocked), SourceEvidence + RightsRecord per contact, re-import reconciles by normalized email, accounts deduped by domain, emails indexed by sha256.
- CRM (F19): HubSpot adapter (search-before-create upsert, note logging; refuses without OUTBOUND_HUBSPOT_TOKEN) + contacts CSV export with rights provenance.
- Experiments (F10): deterministic sha256 bucket assignment (no cross-variant recipients), holdouts never planned, active experiments require variantsApprovedBy, small samples labeled.
- LLM personalization: scoped adapter enforcing allowlisted+evidenced variables only, explicit template fallback with recorded reason, prompt rules against invented familiarity/testimonials. Mock provider = zero-spend synthetic; HttpLLMProvider configured by env (absent). Real-LLM generation records cost UNKNOWN, which blocks dispatch until priced. Decoupled from the Gemini prepay decision.
- Audit trail: append-only events (push-only store) for sender.consent_completed, sender.consent_revoked, booking.committed.

### Verified model pricing (28 Oct 2026, sources below; re-verify at selection)
- Gemini API: free tier uses content to improve products - disqualified for tenant content; usable only for synthetic fixtures. Paid: gemini-3.8-flash $0.75 in / $3.75 out per 1M tokens through 2026-12-31, $1.50/$7.50 from 2027-01-01; other listed models $1/$5 and up. Prepaid and pay-as-you-go both exist. Source: https://ai.google.dev/gemini-api/docs/pricing
- Anthropic: Sonnet 5 $2 in / $10 out per MTok; Opus 5 $5/$25; Fable 5.1 $10/$50. Source: https://docs.anthropic.com/en/docs/about-claude/pricing

### Still open
- Reply-ingestion webhook scaffolding (F15 restricted scopes = separate consent decision).
- Audit wiring for the remaining routes (import, experiments, dispatch, plan).
- UI surfaces for senders-consent, booking, import, experiments + a validation run with pixel passes.
- D06 architecture decision record (Firebase-first vs managed PostgreSQL) - writable without the owner; the choice itself is D06.
- Owner decisions: D01-D10 as reported to main; sender OAuth consent on real accounts; any spend; G3/G4 release.
