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
  stores: { campaigns: CampaignStore; ledger: LedgerStore; contacts: ContactStore; drafts: DraftStore; usage: UsageStore; experiments?: import("./experiments.ts").ExperimentStore; llm?: import("./llm/types.ts").PersonalizationProvider },
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
    // F10: intents tagged with an experiment variant render that variant's
    // approved templates instead of the base campaign templates.
    let templateSource = campaign;
    if (intent.experimentVariant) {
      if (!stores.experiments) {
        result.skipped.push({ intentId: intent.intentId, reason: "experiment_store_missing" });
        continue;
      }
      const experiment = await stores.experiments.getActiveExperiment(tenantId, campaignId, campaign.version);
      const variant = experiment?.variants.find((v) => v.key === intent.experimentVariant);
      if (!variant) {
        result.skipped.push({ intentId: intent.intentId, reason: `experiment_variant_missing:${intent.experimentVariant}` });
        continue;
      }
      templateSource = { ...campaign, templates: variant.templates };
    }
    const evidence = contactEvidence(contact);
    let engine: Draft["engine"] = "template";
    let fallbackReason: string | undefined;
    let rendered = renderTemplate(templateSource, intent, evidence);
    if ((campaign.personalizationEngine ?? "template") === "llm-assisted" && rendered.ok) {
      const stepTemplate = templateSource.templates.find((t) => t.step === intent.step);
      if (!stores.llm) {
        engine = "template-fallback";
        fallbackReason = "llm_not_configured";
      } else if (stepTemplate) {
        const llmResult = await stores.llm.personalize({
          intentId: intent.intentId,
          step: intent.step,
          template: stepTemplate,
          evidence,
          allowedVariables: campaign.allowedPersonalization,
        });
        if (llmResult.ok) {
          // Provider output keeps {{variable}} placeholders; fill them from
          // evidence here so validation governs exactly what was used.
          const fill = (text: string) => text.replace(/\{\{([a-z0-9_]+)\}\}/gi, (m, v) => (v in evidence ? evidence[v] : m));
          rendered = { ok: true, subject: fill(llmResult.subject), body: fill(llmResult.body), reasons: [] };
          engine = stores.llm.name as Draft["engine"];
        } else {
          engine = "template-fallback";
          fallbackReason = llmResult.reasons.join(";").slice(0, 300);
        }
      }
    }
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
      engine,
      ...(fallbackReason ? { fallbackReason } : {}),
      renderedAt: now.toISOString(),
      createdAt: now.toISOString(),
      createdBy: actor,
    };
    await drafts.saveDraft(draft);
    result.rendered.push(draft.draftId);
    // Cost honesty: template rendering is a true zero. A real model call has
    // no verified price here, so cost is recorded as UNKNOWN (null), which
    // fails tenantCostComplete and blocks dispatch until priced. Mock LLM is
    // explicitly synthetic and excluded from real spend accounting.
    const isMockLlm = engine === "mock-llm";
    const isRealLlm = engine === "http-llm";
    const usageResult = await usage.recordUsage({
      tenantId,
      usageId: `ug_${draft.draftId.replace(/^dr_/, "")}`,
      kind: "generation",
      units: 1,
      idempotencyKey: `generation:${intent.intentId}:${draft.draftId}`,
      costMinorUnits: isRealLlm ? null : 0,
      currency: isRealLlm ? null : "USD",
      ...(isMockLlm ? { synthetic: true } : {}),
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
