// Sequence advancement: moves an active enrollment forward when the current
// step's intent reaches a provider-confirmed outcome. Advances only on
// provider_accepted or delivered_if_reported; rejected/bounced intents end
// the enrollment; anything else leaves the step untouched. Follow-up drafting
// stays with the planner on the next run, which re-checks suppression and
// rights; human replies cancel intents and mark the enrollment replied before
// any of this runs.

import type { CampaignStore } from "./campaign.ts";

export interface AdvanceResult {
  advanced: { enrollmentId: string; fromStep: number; toStep: number }[];
  ended: { enrollmentId: string; reason: string }[];
  completed: string[]; // sequence finished (all steps accepted)
}

export async function advanceEnrollments(
  stores: { campaigns: CampaignStore },
  input: { tenantId: string; campaignId: string }
): Promise<AdvanceResult> {
  const { campaigns } = stores;
  const { tenantId, campaignId } = input;
  const result: AdvanceResult = { advanced: [], ended: [], completed: [] };

  const campaign = await campaigns.latestCampaignVersion(tenantId, campaignId);
  if (!campaign) throw new Error("campaign_version_missing");
  const maxStep = 1 + campaign.followUpCount;
  const intents = await campaigns.listIntentsByCampaign(tenantId, campaignId);

  for (const enrollment of await campaigns.listEnrollments(tenantId, campaignId)) {
    if (enrollment.status !== "active") continue;
    if (enrollment.currentStep >= maxStep) continue;
    const currentIntent = intents.find(
      (i) => i.enrollmentId === enrollment.enrollmentId && i.step === enrollment.currentStep + 1
    );
    if (!currentIntent) continue; // not planned yet
    if (currentIntent.status === "provider_accepted" || currentIntent.status === "delivered_if_reported") {
      const toStep = enrollment.currentStep + 1;
      await campaigns.saveEnrollment({ ...enrollment, currentStep: toStep });
      if (toStep >= maxStep) {
        await campaigns.saveEnrollment({ ...enrollment, currentStep: toStep, status: "completed" });
        result.completed.push(enrollment.enrollmentId);
      } else {
        result.advanced.push({ enrollmentId: enrollment.enrollmentId, fromStep: enrollment.currentStep, toStep });
      }
    } else if (currentIntent.status === "provider_rejected" || currentIntent.status === "bounced") {
      await campaigns.saveEnrollment({ ...enrollment, status: "completed" });
      result.ended.push({ enrollmentId: enrollment.enrollmentId, reason: currentIntent.status });
    }
    // cancelled intents are handled by the reply/suppression paths, which own
    // enrollment status; drafted/approved/scheduled/reserved/dispatching are
    // in flight; provider_unknown is never advanced past.
  }
  return result;
}
