// Planner: turns active enrollments into drafted message intents through the
// policy gates. It never sends. Every enrollment is evaluated independently
// and fail-closed: any missing contact, rights record, approval or fresh
// verification yields a skip with machine-readable reasons, never an intent.

import type { CampaignStore } from "./campaign.ts";
import type { LedgerStore } from "./ledger.ts";
import { intentUniqueKey } from "./ledger.ts";
import {
  evaluateFirstSendEligibility,
  suppressionTokenFor,
  type Decision,
} from "./policy.ts";
import { decideAssignment, type ExperimentStore } from "./experiments.ts";
import type { Contact, MessageIntent, RightsRecord } from "./types.ts";

export interface ContactStore {
  getContact(tenantId: string, contactId: string): Promise<Contact | null>;
  getRightsForContact(tenantId: string, contactId: string): Promise<RightsRecord | null>;
  saveContact(contact: Contact): Promise<void>;
  saveRights(rights: RightsRecord): Promise<void>;
}

export class MemoryContactStore implements ContactStore {
  contacts = new Map<string, Contact>();
  rights = new Map<string, RightsRecord>();

  async getContact(tenantId: string, contactId: string): Promise<Contact | null> {
    const c = this.contacts.get(`${tenantId}:${contactId}`);
    return c && c.tenantId === tenantId ? c : null;
  }
  async getRightsForContact(tenantId: string, contactId: string): Promise<RightsRecord | null> {
    const r = this.rights.get(`${tenantId}:${contactId}`);
    return r && r.tenantId === tenantId ? r : null;
  }
  async saveContact(contact: Contact): Promise<void> {
    this.contacts.set(`${contact.tenantId}:${contact.contactId}`, contact);
  }
  async saveRights(rights: RightsRecord): Promise<void> {
    this.rights.set(`${rights.tenantId}:${rights.contactId}`, rights);
  }
}

export interface PlanResult {
  campaignId: string;
  planned: MessageIntent[];
  skipped: { enrollmentId: string; contactId: string; reasons: string[] }[];
  blocked: string[]; // campaign-level reasons; when non-empty nothing was planned
}

export async function planCampaignIntents(
  stores: { campaigns: CampaignStore; ledger: LedgerStore; contacts: ContactStore; experiments?: ExperimentStore },
  input: { tenantId: string; campaignId: string; actor: string; now: Date }
): Promise<PlanResult> {
  const { campaigns, ledger, contacts, experiments } = stores;
  const { tenantId, campaignId, actor, now } = input;
  const result: PlanResult = { campaignId, planned: [], skipped: [], blocked: [] };

  const campaign = await campaigns.latestCampaignVersion(tenantId, campaignId);
  if (!campaign) {
    result.blocked.push("campaign_version_missing");
    return result;
  }
  const approval = await campaigns.getApprovalForVersion(tenantId, campaignId, campaign.version);
  if (!approval || approval.revokedAt) {
    result.blocked.push("approval_missing_or_revoked");
    return result;
  }
  if (now.getTime() > Date.parse(campaign.expiresAt)) {
    result.blocked.push("campaign_expired");
    return result;
  }

  // F10: an active experiment assigns each contact deterministically.
  // Holdouts never get intents; variants are tagged on the intent so the
  // draft worker renders the variant's approved templates.
  const experiment = experiments ? await experiments.getActiveExperiment(tenantId, campaignId, campaign.version) : null;

  const enrollments = await campaigns.listEnrollments(tenantId, campaignId);
  for (const enrollment of enrollments) {
    if (enrollment.status !== "active") continue;
    let experimentVariant: string | undefined;
    if (experiment) {
      const assignment = decideAssignment(experiment, enrollment.contactId);
      if (assignment.kind === "holdout") {
        result.skipped.push({ enrollmentId: enrollment.enrollmentId, contactId: enrollment.contactId, reasons: ["experiment_holdout"] });
        continue;
      }
      experimentVariant = assignment.key;
    }
    const step = enrollment.currentStep + 1;
    if (step > 1 + campaign.followUpCount) continue; // sequence complete

    const contact = await contacts.getContact(tenantId, enrollment.contactId);
    const rights = contact ? await contacts.getRightsForContact(tenantId, contact.contactId) : null;
    const suppressed = contact
      ? (await campaigns.findSuppression(tenantId, suppressionTokenFor(tenantId, contact.email))) !== null
      : false;
    const decision: Decision = evaluateFirstSendEligibility({ contact, rights, suppressed, now });
    if (!decision.allow) {
      result.skipped.push({ enrollmentId: enrollment.enrollmentId, contactId: enrollment.contactId, reasons: decision.reasons });
      continue;
    }

    const nowIso = now.toISOString();
    const intent: MessageIntent = {
      tenantId,
      intentId: `mi_${crypto.randomUUID()}`,
      uniqueKey: intentUniqueKey({
        tenantId,
        enrollmentId: enrollment.enrollmentId,
        campaignVersion: campaign.version,
        step,
      }),
      enrollmentId: enrollment.enrollmentId,
      campaignId: campaign.campaignId,
      campaignVersion: campaign.version,
      contactId: enrollment.contactId,
      senderId: (Array.isArray(campaign.senderAllowlist) ? campaign.senderAllowlist : [])[0] ?? "",
      step,
      status: "drafted",
      statusUpdatedAt: nowIso,
      ...(experimentVariant ? { experimentVariant } : {}),
      cancelReason: null,
      leaseOwner: null,
      leaseExpiresAt: null,
      reconciledAt: null,
      createdAt: nowIso,
      createdBy: actor,
    };
    const created = await ledger.createIntentIfAbsent(intent);
    if (created === "created") {
      await campaigns.saveIntent(intent); // campaign index for reporting
      result.planned.push(intent);
    }
    // "duplicate" means this step was already planned: idempotent, skip quietly.
  }
  return result;
}
