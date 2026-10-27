// Retention sweep (PRD retention proposal, F-sec data rights). Defaults are
// the PRD PROPOSAL values, not negotiated contract terms: prospect/raw
// content 90 days, audit metadata 365 days. Overrides and limits, stated
// honestly:
// - Legal hold is modeled as a rights record with lawfulBasis "legal_hold";
//   those contacts and their evidence are never deleted.
// - Contract-level retention overrides are NOT yet modeled; a tenant with a
//   contractual retention requirement must not be swept until they are.
// - Suppressions are NEVER deleted: the suppression token is the protected
//   record that prevents recontact (PRD: keep a minimal protected token).
// - Contacts with an active/paused enrollment or any conversation record are
//   skipped, not deleted mid-dialog.
// The sweep is dry-run by default; execution requires an explicit flag and
// is audited either way. Audit purge appends a new audit event for itself.

import type { AuditStore } from "./audit.ts";
import type { CampaignStore } from "./campaign.ts";
import type { ConversationStore } from "./conversations.ts";
import type { ContactStore } from "./planner.ts";
import type { ISODate, SourceEvidence } from "./types.ts";

export const PROSPECT_CONTENT_RETENTION_DAYS = 90;
export const AUDIT_METADATA_RETENTION_DAYS = 365;
export const LEGAL_HOLD_BASIS = "legal_hold";

// Contract-level retention overrides. The MECHANISM is built; the TERMS are
// an owner decision (no route creates these records today - activation of
// specific terms requires owner input). Evaluation is fail-closed: an active
// legal hold or any override record we cannot fully parse blocks the entire
// sweep, because deleting under unknown contract terms is worse than
// keeping data longer. Multiple active overrides combine by taking the
// LONGEST window (most conservative). Expired overrides are ignored.
export interface RetentionOverride {
  tenantId: string;
  overrideId: string;
  kind: "contract";
  prospectDays: number | null; // null = keep the proposal default
  auditDays: number | null;
  legalHoldUntil: ISODate | null; // future = full hold, sweep refuses
  note: string;
  expiresAt: ISODate | null; // past = ignored
  createdAt: ISODate;
  createdBy: string;
}

export type OverrideEvaluation =
  | { state: "none" }
  | { state: "active"; prospectDays: number | null; auditDays: number | null }
  | { state: "blocked"; reason: string };

export function evaluateOverrides(overrides: RetentionOverride[], now: Date): OverrideEvaluation {
  let active: { prospectDays: number | null; auditDays: number | null } | null = null;
  for (const o of overrides) {
    if (o.expiresAt && Date.parse(o.expiresAt) <= now.getTime()) continue; // expired: ignored
    if (o.legalHoldUntil && Date.parse(o.legalHoldUntil) > now.getTime()) {
      return { state: "blocked", reason: `legal hold active until ${o.legalHoldUntil} (override ${o.overrideId})` };
    }
    const daysOk = (d: number | null) => d === null || (Number.isInteger(d) && d > 0);
    if (o.kind !== "contract" || !daysOk(o.prospectDays) || !daysOk(o.auditDays)) {
      // Fail closed: the tenant's contract terms cannot be determined, so
      // no deletion is safe.
      return { state: "blocked", reason: `override ${o.overrideId} cannot be evaluated; refusing to sweep under unknown terms` };
    }
    active = {
      prospectDays: active === null ? o.prospectDays : Math.max(active.prospectDays ?? 0, o.prospectDays ?? 0) || null,
      auditDays: active === null ? o.auditDays : Math.max(active.auditDays ?? 0, o.auditDays ?? 0) || null,
    };
  }
  return active ? { state: "active", ...active } : { state: "none" };
}

export interface RetentionOverrideStore {
  listOverrides(tenantId: string): Promise<RetentionOverride[]>;
}

export class MemoryRetentionOverrideStore implements RetentionOverrideStore {
  items = new Map<string, RetentionOverride>();
  async save(o: RetentionOverride): Promise<void> {
    this.items.set(`${o.tenantId}:${o.overrideId}`, o);
  }
  async listOverrides(tenantId: string): Promise<RetentionOverride[]> {
    return [...this.items.values()].filter((o) => o.tenantId === tenantId);
  }
}

export interface EvidenceStore {
  listEvidence(tenantId: string): Promise<SourceEvidence[]>;
  deleteEvidence(tenantId: string, evidenceId: string): Promise<void>;
}

export interface RetentionStores {
  contacts: ContactStore;
  campaigns: CampaignStore;
  conversations: ConversationStore;
  evidence: EvidenceStore;
  audit: AuditStore;
}

export interface RetentionPlan {
  tenantId: string;
  blocked: string | null; // non-null: nothing in this plan may execute
  prospectCutoff: ISODate;
  auditCutoff: ISODate;
  deleteContacts: { contactId: string; createdAt: ISODate }[];
  skipContacts: { contactId: string; reason: "recent" | "legal_hold" | "active_enrollment" | "conversation_exists" }[];
  deleteEvidence: { evidenceId: string; createdAt: ISODate }[];
  purgeAuditEvents: number; // count only; event content not echoed into the plan
  suppressionsUntouched: number;
}

export interface RetentionResult {
  plan: RetentionPlan;
  executed: boolean;
  deletedContacts: number;
  deletedEvidence: number;
  purgedAuditEvents: number;
}

export async function planRetentionSweep(
  stores: RetentionStores & { overrides?: RetentionOverrideStore },
  input: { tenantId: string; now: Date; prospectDays?: number; auditDays?: number }
): Promise<RetentionPlan> {
  const evaluation = evaluateOverrides(stores.overrides ? await stores.overrides.listOverrides(input.tenantId) : [], input.now);
  const prospectDays = input.prospectDays ?? (evaluation.state === "active" ? evaluation.prospectDays : null) ?? PROSPECT_CONTENT_RETENTION_DAYS;
  const auditDays = input.auditDays ?? (evaluation.state === "active" ? evaluation.auditDays : null) ?? AUDIT_METADATA_RETENTION_DAYS;
  const prospectCutoff = new Date(input.now.getTime() - prospectDays * 24 * 60 * 60 * 1000).toISOString();
  const auditCutoff = new Date(input.now.getTime() - auditDays * 24 * 60 * 60 * 1000).toISOString();
  if (evaluation.state === "blocked") {
    return {
      tenantId: input.tenantId,
      blocked: evaluation.reason,
      prospectCutoff,
      auditCutoff,
      deleteContacts: [],
      skipContacts: [],
      deleteEvidence: [],
      purgeAuditEvents: 0,
      suppressionsUntouched: 0,
    };
  }

  // Contacts protected by an active or paused enrollment in any campaign.
  const protectedByEnrollment = new Set<string>();
  const campaignIds = [...new Set((await stores.campaigns.listCampaigns(input.tenantId)).map((c) => c.campaignId))];
  for (const campaignId of campaignIds) {
    for (const e of await stores.campaigns.listEnrollments(input.tenantId, campaignId)) {
      if (e.status === "active" || e.status === "paused") protectedByEnrollment.add(e.contactId);
    }
  }
  // Contacts with any conversation record: human dialog history is kept.
  const withConversation = new Set((await stores.conversations.listConversations(input.tenantId)).map((c) => c.contactId));

  const plan: RetentionPlan = {
    tenantId: input.tenantId,
    blocked: null,
    prospectCutoff,
    auditCutoff,
    deleteContacts: [],
    skipContacts: [],
    deleteEvidence: [],
    purgeAuditEvents: 0,
    suppressionsUntouched: (await stores.campaigns.listSuppressions(input.tenantId)).length,
  };

  const contacts = await stores.contacts.listContacts(input.tenantId);
  const deletable = new Set<string>();
  for (const c of contacts) {
    if (c.createdAt >= prospectCutoff) {
      plan.skipContacts.push({ contactId: c.contactId, reason: "recent" });
      continue;
    }
    const rights = await stores.contacts.getRightsForContact(input.tenantId, c.contactId);
    if (rights?.lawfulBasis === LEGAL_HOLD_BASIS) {
      plan.skipContacts.push({ contactId: c.contactId, reason: "legal_hold" });
      continue;
    }
    if (protectedByEnrollment.has(c.contactId)) {
      plan.skipContacts.push({ contactId: c.contactId, reason: "active_enrollment" });
      continue;
    }
    if (withConversation.has(c.contactId)) {
      plan.skipContacts.push({ contactId: c.contactId, reason: "conversation_exists" });
      continue;
    }
    plan.deleteContacts.push({ contactId: c.contactId, createdAt: c.createdAt });
    deletable.add(c.contactId);
  }

  // Evidence is provenance for a rights record: it is deleted only with its
  // contact (or when account-level and past cutoff), never under a kept contact.
  for (const ev of await stores.evidence.listEvidence(input.tenantId)) {
    if (ev.createdAt >= prospectCutoff) continue;
    if (ev.contactId && !deletable.has(ev.contactId)) continue;
    plan.deleteEvidence.push({ evidenceId: ev.evidenceId, createdAt: ev.createdAt });
  }

  const auditEvents = await stores.audit.list(input.tenantId, 10000);
  plan.purgeAuditEvents = auditEvents.filter((e) => e.at < auditCutoff).length;
  return plan;
}

export async function executeRetentionSweep(
  stores: RetentionStores,
  plan: RetentionPlan,
  auditCutoff: ISODate
): Promise<RetentionResult> {
  if (plan.blocked) throw new Error(`retention sweep blocked: ${plan.blocked}`);
  let deletedContacts = 0;
  for (const c of plan.deleteContacts) {
    await stores.contacts.deleteRights(plan.tenantId, c.contactId);
    await stores.contacts.deleteContact(plan.tenantId, c.contactId);
    deletedContacts++;
  }
  let deletedEvidence = 0;
  for (const ev of plan.deleteEvidence) {
    await stores.evidence.deleteEvidence(plan.tenantId, ev.evidenceId);
    deletedEvidence++;
  }
  const purgedAuditEvents = await stores.audit.purgeOlderThan(plan.tenantId, auditCutoff);
  return { plan, executed: true, deletedContacts, deletedEvidence, purgedAuditEvents };
}
