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

- Provider adapters behind checkDispatch (OAuth account grants, real send).
- Sender consent activation flow (senders stay pending_consent by design).
- LLM personalization engine (needs verified pricing before recording usage).
- Meeting booking integration (types exist; no provider writes).
- PRD D01 owner decisions (pivot vs module) — pending with the owner.

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
  event.

## Deployment model

- `main` pushes auto-deploy to production. Enterprise work is never pushed to
  `main`.
- Branch pushes create preview deployments that are dark for outbound routes
  by default (no flag set). The flag is created only for a scoped validation
  window and removed with the enabled deployments afterwards.
