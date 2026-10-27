# ADR 0002: Data regions and residency for the enterprise pivot

Status: draft for owner decision (PRD decision D06, regions half)
Date: 28 October 2026
Author: build agent, for Kiran's decision

## Context

PRD section 08 requires choosing approved regions for the database,
files, logs, backups, queue, support access, contact suppliers and
model processing, and states that a database region alone is not data
residency. It also states that no existing Firebase project, Vercel
plan, provider contract or shared-project boundary has been
independently audited for this pivot.

D02 (first customer, ICP and countries) is undecided, so no concrete
residency obligation (for example EU-only processing) is known today.
This ADR records what is true now, what is unknown, and the decision
frame; it does not pick a region, because the residency requirement
that would drive the pick does not exist yet.

## Current state (verified from this repository and its configuration)

- Firebase project id: wisentry-510811 (existing GEO product project,
  reused for the enterprise pilot data root). The project's RTDB
  location and Firestore region are NOT recorded in this repository;
  they come from deployment environment variables and the Firebase
  console. Recording them here without checking the console would be
  inventing a fact, so they are listed as unknowns below.
- Vercel hosts the app. Serverless function regions are not pinned in
  this repository; Vercel defaults apply unless the project settings
  say otherwise. Unknown, needs console verification.
- The enterprise pilot stores all outbound data under a single
  configurable RTDB root (OUTBOUND_DATA_ROOT), tenant-scoped below it.
  Tenant isolation is enforced in backend policy code only; the Admin
  SDK bypasses database rules (see ADR 0001).
- Model processing (LLM personalization) is implemented behind an
  adapter with no supplier selected (D04 undecided). No tenant content
  leaves the deployment today: the only active provider is the mock.
- No queue, no separate file storage, no contact supplier (D05
  undecided), no support-access tooling exists yet.

## Unknowns that must be resolved before a region decision is real

1. RTDB location and Firestore region of project wisentry-510811
   (Firebase console).
2. Vercel project region settings and log/drain destinations.
3. Backup story for RTDB (automated backups are a paid Firebase
   feature; whether they exist for this project is unverified).
4. Where provider OAuth tokens and the token-encryption key material
   live regionally (today: environment variables on Vercel; key in
   OUTBOUND_TOKEN_KEY, held by the owner, not in the repo).
5. The residency obligations of the first customer (D02) - this drives
   everything else.

## Options when D02 lands

### A. Keep the existing Firebase project and pin regions around it

Works if the first customer's residency needs match the project's
existing location. Cheapest path; consistent with the Firebase-first
ledger in ADR 0001. Fails immediately if the project location
contradicts the customer's requirement, because RTDB location cannot
be changed after database creation - a new project would be needed.

### B. New Firebase/GCP project in the required region

Clean residency boundary for the enterprise product; keeps one vendor.
Cost: a second project, migration of the pilot root, new secrets and
IAM review. This is also the escape hatch if option A fails on the
existing project's immovable location.

### C. Managed PostgreSQL in the required region for enterprise data

Combines with option B of ADR 0001. Strongest audit story; highest
cost and timeline. Only credible when a signed customer requires it.

## Proposal

- Do not pick a region until D02 names the first customer and
  countries. Any earlier pick is a guess that can force a rebuild.
- Before G3, verify and record unknowns 1-4 from the consoles and
  attach the screenshots/exports to this ADR.
- Keep every enterprise store behind its interface (already true:
  LedgerStore, CampaignStore, BookingStore, IngestionStore and the
  rest are interface-driven) so options B and C stay executable
  without rewriting policy code.
- Treat support access and log residency as part of the same review,
  per the PRD: a database region alone is not data residency.

This is a holding decision, deliberately. It commits to evidence
gathering and interface isolation, not to a geography.
