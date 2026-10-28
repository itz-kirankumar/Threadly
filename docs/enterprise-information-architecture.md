# Threadly enterprise information architecture

This is the canonical product structure for the enterprise prospecting and outreach
workflow described in the PRD and PR-FAQ. The current product remains the live
foundation; existing functionality is grouped under one capability instead of
appearing as multiple competing products.

## Canonical navigation

| Canonical area | Existing surfaces consolidated | System of record |
| --- | --- | --- |
| Overview | Dashboard | Workspace health and queue summary |
| Revenue | Leads, CRM, Outreach, Content Studio, Campaigns, Sequences, Calendar, Scheduler, Workflows | Prospects, campaigns, conversations, meetings, companies, contacts, deals and activities |
| Workspace | Workspace, Team, Settings | Members, roles, invitations, tenant policy, integrations, credentials and security |
| Intelligence (conditional) | Discover, Radar, Maps Scraper, Analytics, GEO, AI Insights, Segments | Questions, scans, citations, optimization, social evidence and operational insights |

The old names remain valid internal page targets so existing deep links and
workflow actions do not break. They are compatibility aliases, not separate
top-level products. GEO remains a distinct legacy capability and is not
silently merged with prospecting.

The portal sidebar exposes the same model as a compact workstream tree:

- **Revenue**: CRM, Leads, Workflows, Calendar and Content Studio.
- **Workspace**: Company profile, Team and Settings.
- **Intelligence**: Discover, Radar, Maps Scraper, Analytics and GEO.

Campaigns, Sequences, Segments, Scheduler and the legacy Revenue page remain
addressable compatibility targets, but are not rendered as competing primary
navigation products. The Overview dashboard prioritizes pipeline, high-intent
signals, review queue and team readiness over secondary channel metrics.

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
- One action endpoint for authenticated workspace mutations.
- One policy gate before any external send or booking action.
- One audit trail for actor, tenant, policy version, outcome and provider
  correlation data.
- GEO remains available as an insight capability; it is not silently repurposed
  as the outreach engine.

## Deferred production gates

The PRD marks these as release gates rather than UI features: tenant isolation
negative tests, enterprise SSO/SCIM, managed secrets, append-only audit export,
licensed source rights, OAuth verification, suppression races, durable send
idempotency, reply reconciliation, recovery drills, payment reconciliation and
independent security testing. The current Firebase-backed portal should not be
represented as having passed those gates until evidence exists.
