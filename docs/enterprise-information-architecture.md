# Threadly enterprise information architecture

This is the canonical product structure for the enterprise prospecting and outreach
workflow described in the PRD and PR-FAQ. The current product remains the live
foundation; existing functionality is grouped under one capability instead of
appearing as multiple competing products.

## Canonical navigation

| Canonical area | Existing surfaces consolidated | System of record |
| --- | --- | --- |
| Overview | Overview dashboard | Workspace health and queue summary |
| Revenue | Leads, CRM, Outbound | Leads, companies, contacts, deals, activities, prospects, campaigns, conversations, meetings |
| Intelligence | Questions, Citations, Scans, Optimization, Social search | Questions, scans, citations, optimization and social evidence |
| Workspace | Settings (profile, brand, keys, team) | Members, roles, integrations, credentials and security |

The portal sidebar groups its tabs under the same areas: Overview; Revenue
(Leads, CRM, Outbound); Intelligence (Questions, Citations, Optimization,
Scans, Social search); Workspace (Settings). Leads are the discovery entry
point, while companies, contacts, deals and activities are the CRM system of
record. Leads never send email: every send runs through Outbound, the single
policy gate.

## Enterprise source of truth

The enterprise workflow is one chain:

1. **Targeting** — approved ICP, exclusions, markets and source policy.
2. **Discovery** — eligible sources produce dated evidence and candidate accounts.
3. **Qualification** — evidence-backed fit and contact verification determine eligibility.
4. **Authorization** — an immutable campaign version defines sender, audience, content, caps, timing and booking policy.
5. **Execution** — durable work checks suppression, sender health, budget and revocation before dispatch.
6. **Conversation** — replies, bounces and opt-outs update the record and stop unauthorized follow-ups.
7. **Meeting** — booking is a distinct state from created, accepted and held.
8. **Handoff** — one CRM mapping creates or updates the account, contact, opportunity and activity without duplicates.
9. **Insights** — every operational metric retains its denominator, time window and source.

## Consolidation rules

- One canonical navigation label per user outcome.
- One record model per business object; leads are the discovery entry point,
  while companies, contacts, deals and activities are the CRM system of record.
- One policy gate before any external send or booking action.
- One audit trail for actor, tenant, policy version, outcome and provider
  correlation data.
- GEO remains available as an insight capability; it is not repurposed as the
  outreach engine.

## Deferred production gates

The PRD marks these as release gates rather than UI features: tenant isolation
negative tests, enterprise SSO/SCIM, managed secrets, append-only audit export,
licensed source rights, OAuth verification, suppression races, durable send
idempotency, reply reconciliation, recovery drills, payment reconciliation and
independent security testing. The current Firebase-backed portal should not be
represented as having passed those gates until evidence exists.
