// Draft worker: renders drafts for intents in `drafted` status. Idempotent:
// an intent with an existing draft is skipped. Records one generation usage
// event per rendered draft. Template rendering makes no provider call, so
// its cost is a true zero; an LLM personalization engine would need verified
// pricing before it could record anything other than null.

import type { CampaignStore } from "./campaign.ts";
import type { ContactStore } from "./planner.ts";
import type { LedgerStore } from "./ledger.ts";
import { contactEvidence, renderTemplate, type Draft, type DraftStore } from "./drafts.ts";
import type { MessageIntent } from "./types.ts";
import type { UsageStore } from "./usage.ts";

export interface DraftRunResult {
  rendered: string[];
  skipped: { intentId: string; reason: string }[];
  usageRecorded: string[];
}

export async function generateDrafts(
  stores: { campaigns: CampaignStore; ledger: LedgerStore; contacts: ContactStore; drafts: DraftStore; usage: UsageStore },
  input: { tenantId: string; campaignId: string; actor: string; now: Date }
): Promise<DraftRunResult> {
  const { campaigns, ledger, contacts, drafts, usage } = stores;
  const { tenantId, campaignId, actor, now } = input;
  const campaign = await campaigns.latestCampaignVersion(tenantId, campaignId);
  if (!campaign) throw new Error("campaign_version_missing");
  const result: DraftRunResult = { rendered: [], skipped: [], usageRecorded: [] };

  for (const intent of await campaigns.listIntentsByCampaign(tenantId, campaignId)) {
    if ((intent as MessageIntent).status !== "drafted") continue;
    const existing = await drafts.getDraftForIntent(tenantId, intent.intentId);
    if (existing) {
      result.skipped.push({ intentId: intent.intentId, reason: "draft_exists" });
      continue;
    }
    const contact = await contacts.getContact(tenantId, intent.contactId);
    if (!contact) {
      result.skipped.push({ intentId: intent.intentId, reason: "contact_missing" });
      continue;
    }
    const rendered = renderTemplate(campaign, intent, contactEvidence(contact));
    if (!rendered.ok) {
      for (const reason of rendered.reasons) result.skipped.push({ intentId: intent.intentId, reason });
      continue;
    }
    const draft: Draft = {
      tenantId,
      draftId: `dr_${intent.intentId.replace(/^mi_/, "")}`,
      intentId: intent.intentId,
      step: intent.step,
      subject: rendered.subject!,
      body: rendered.body!,
      engine: "template",
      renderedAt: now.toISOString(),
      createdAt: now.toISOString(),
      createdBy: actor,
    };
    await drafts.saveDraft(draft);
    result.rendered.push(draft.draftId);
    const usageResult = await usage.recordUsage({
      tenantId,
      usageId: `ug_${draft.draftId.replace(/^dr_/, "")}`,
      kind: "generation",
      units: 1,
      idempotencyKey: `generation:${intent.intentId}:${draft.draftId}`,
      costMinorUnits: 0,
      currency: "USD",
      createdAt: now.toISOString(),
      createdBy: actor,
    });
    if (usageResult === "recorded") result.usageRecorded.push(`ug_${draft.draftId.replace(/^dr_/, "")}`);
  }
  return result;
}

// Human review step: approving a stored draft moves its intent drafted ->
// approved, making it eligible for dispatch. Nothing else does.
export async function approveDraft(
  stores: { ledger: LedgerStore; campaigns: CampaignStore; drafts: DraftStore },
  input: { tenantId: string; draftId: string; actor: string; now: Date }
): Promise<{ intentId: string }> {
  const { ledger, campaigns, drafts } = stores;
  const { tenantId, draftId, actor, now } = input;
  const all = await drafts.listDrafts(tenantId);
  const draft = all.find((d) => d.draftId === draftId);
  if (!draft) throw new Error("draft_missing");
  const intent = await ledger.getIntent(tenantId, draft.intentId);
  if (!intent) throw new Error("intent_missing");
  if (intent.status !== "drafted") throw new Error(`intent_not_drafted:${intent.status}`);
  const { transition } = await import("./ledger.ts");
  const next = transition(intent, "approved", { actor, now });
  const ok = await ledger.compareAndSetStatus(tenantId, intent.intentId, "drafted", next);
  if (!ok) throw new Error("reservation_conflict");
  await campaigns.saveIntent(next);
  return { intentId: intent.intentId };
}
