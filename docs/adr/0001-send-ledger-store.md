# ADR 0001: Send ledger store - Firebase-first vs managed PostgreSQL

Status: proposed for owner decision (PRD decision D06)
Date: 27 October 2026
Author: build agent, for Kiran's decision

## Context

The enterprise outbound product needs a transactional send ledger:
unique intent keys, compare-and-set state transitions, append-only
delivery attempts, and reconciliation of unknown provider outcomes.

PRD section 08 proposes managed PostgreSQL for approvals, outbox and
ledger while keeping Firestore for existing product data, and requires
this comparison before choosing. The existing product uses Firebase
(Auth + Realtime Database) with the Admin SDK server-side. No new paid
service may be added without approval.

## Options

### A. Firebase-first (Firestore or RTDB transactions)

- Firestore supports atomic multi-document transactions and batched
  writes: intent creation + outbox record can commit or fail together.
- RTDB supports single-path transactions; multi-path atomic updates via
  update() across paths are atomic.
- No new service, no new bill, existing identity and ops knowledge.
- Server Admin SDK bypasses Security Rules: tenant isolation must be
  enforced in backend policy code and proven with adversarial tests.
  This is mandatory under either option at the application layer, but
  Firebase gives no database-level backstop.
- Query limits: ledger reconciliation scans (by status, by lease
  expiry) need careful indexing; RTDB has limited query power.
- Region and residency choices are constrained by the existing project;
  PRD requires end-to-end residency review for MNC procurement.

### B. Managed PostgreSQL (for example Cloud SQL)

- Real relational constraints: unique indexes, foreign keys, serializable
  transactions across intent + outbox + attempt tables.
- Familiar operational model for auditors; easier ad-hoc reconciliation
  queries for finance and support.
- New paid managed service, new secrets, new region decision, new backup
  and DR story, new migration path. Every one of those needs an owner
  decision and procurement record per PRD section 14.
- Does not remove the need for backend tenant policy: row-level security
  helps but the app still enforces envelope rules.

## Decision drivers

1. No unapproved spend: option B fails this today, option A passes.
2. Transactional integrity: both can meet the ledger protocol; B is
   stronger by default, A needs disciplined transaction code plus tests.
3. Tenant isolation evidence: identical burden at the app layer; A has
   no database backstop, so server tenant/IAM tests are mandatory
   (already planned as a G1 gate either way).
4. Procurement timeline: B adds weeks; A unblocks G1/G2 now.

## Proposal

Build G1/G2 on Firebase-first (option A) with these conditions:

- All ledger writes go through a single store module with explicit
  transactions; no ad-hoc writes elsewhere.
- The adversarial test suite (tenant isolation, guessed-ID, replay,
  suppression races) must pass against the real Firebase path, not only
  the in-memory store.
- The store module exposes the LedgerStore interface so a PostgreSQL
  implementation can replace it without touching policy or ledger code.
- Revisit at G3 (controlled production pilot): if residency, audit or
  reconciliation requirements outgrow Firebase, migrate the ledger
  behind the same interface with an owner-approved procurement record.

This is reversible by design. Choosing A now is not a claim that A is
the enterprise-final answer; it is the fastest path that respects the
no-unapproved-spend boundary.
