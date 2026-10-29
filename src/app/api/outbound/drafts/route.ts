import { errorResponse, readJsonBody } from "@/lib/api-request";
import { resolveWorkspaceAccess } from "@/lib/geo/team";
import { outboundAudienceDeny, outboundUidAllowed } from "@/lib/outbound/route-guard";
import { approveDraft, generateDrafts } from "@/lib/outbound/draft-run";
import { RtdbDraftStore } from "@/lib/outbound/drafts-rtdb";
import { RtdbExperimentStore } from "@/lib/outbound/rtdb-experiment-store";
import { unsubscribeConfigFromEnv } from "@/lib/outbound/unsubscribe";
import { HttpLLMProvider } from "@/lib/outbound/llm/http";
import { MockLLMProvider } from "@/lib/outbound/llm/mock";
import { RtdbCampaignStore } from "@/lib/outbound/rtdb-campaign-store";
import { RtdbContactStore } from "@/lib/outbound/rtdb-contact-store";
import { RtdbLedgerStore } from "@/lib/outbound/rtdb-store";
import { RtdbUsageStore } from "@/lib/outbound/rtdb-usage-store";
import { NO_STORE, outboundEnabled, recordAudit } from "@/lib/outbound/route-support";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

// Runs the template draft worker for one campaign. Renders stored drafts for
// drafted intents; nothing is sent by this or any other route.

export async function POST(request: Request) {
  try {
    if (!outboundEnabled()) {
      return Response.json({ error: "Outbound is not enabled on this deployment." }, { status: 404, headers: NO_STORE });
    }
    const access = await resolveWorkspaceAccess(request, "manageTeam");
    if (!outboundUidAllowed(access.identity.uid)) return outboundAudienceDeny();
    if (access.role !== "owner" && access.role !== "admin") {
      return Response.json({ error: "Only workspace admins can run draft generation." }, { status: 403, headers: NO_STORE });
    }
    const body = (await readJsonBody(request, 4 * 1024)) as Record<string, unknown>;
    const action = typeof body.action === "string" ? body.action : "run";
    if (action === "approve") {
      // Human review: approving a stored draft moves its intent to approved.
      const draftId = typeof body.draftId === "string" ? body.draftId : "";
      if (!draftId) return Response.json({ error: "draftId is required." }, { status: 400 });
      try {
        const result = await approveDraft(
          { ledger: new RtdbLedgerStore(), campaigns: new RtdbCampaignStore(), drafts: new RtdbDraftStore() },
          { tenantId: access.workspaceUid, draftId, actor: access.identity.uid, now: new Date() }
        );
        await recordAudit(access.workspaceUid, access.identity.uid, "draft.approved", `draft:${draftId}`, "success", `intentId=${result.intentId}`);
        return Response.json({ approved: true, intentId: result.intentId }, { status: 200, headers: NO_STORE });
      } catch (e) {
        const msg = e instanceof Error ? e.message : "approve failed";
        const status = msg === "draft_missing" || msg === "intent_missing" ? 404 : 409;
        return Response.json({ error: msg }, { status, headers: NO_STORE });
      }
    }
    const campaignId = typeof body.campaignId === "string" ? body.campaignId : "";
    if (!campaignId) return Response.json({ error: "campaignId is required." }, { status: 400 });
    const unsubscribe = unsubscribeConfigFromEnv();
    if (!unsubscribe) {
      return Response.json({ error: "Unsubscribe is not configured on this deployment (OUTBOUND_PUBLIC_BASE_URL / OUTBOUND_UNSUBSCRIBE_SECRET)." }, { status: 400, headers: NO_STORE });
    }
    const result = await generateDrafts(
      {
        campaigns: new RtdbCampaignStore(),
        ledger: new RtdbLedgerStore(),
        contacts: new RtdbContactStore(),
        drafts: new RtdbDraftStore(),
        usage: new RtdbUsageStore(),
        experiments: new RtdbExperimentStore(),
        unsubscribe,
        // llm-assisted engine: use the real endpoint when configured,
        // otherwise the mock (synthetic, clearly marked) so the path is
        // exercisable without supplier selection or spend.
        llm: (() => {
          try {
            return new HttpLLMProvider();
          } catch {
            return new MockLLMProvider();
          }
        })(),
      },
      { tenantId: access.workspaceUid, campaignId, actor: access.identity.uid, now: new Date() }
    );
    await recordAudit(access.workspaceUid, access.identity.uid, "drafts.generated", `campaign:${campaignId}`, "success", `rendered=${result.rendered.length} skipped=${result.skipped.length}`);
    return Response.json(
      { campaignId, renderedCount: result.rendered.length, rendered: result.rendered, skipped: result.skipped, usageRecorded: result.usageRecorded },
      { status: 200, headers: NO_STORE }
    );
  } catch (error) {
    return errorResponse(error, "outbound drafts run");
  }
}

// Lists stored drafts, optionally filtered by campaign.
export async function GET(request: Request) {
  try {
    if (!outboundEnabled()) {
      return Response.json({ error: "Outbound is not enabled on this deployment." }, { status: 404, headers: NO_STORE });
    }
    const access = await resolveWorkspaceAccess(request, "manageTeam");
    if (!outboundUidAllowed(access.identity.uid)) return outboundAudienceDeny();
    const url = new URL(request.url);
    const campaignId = url.searchParams.get("campaignId");
    const store = new RtdbDraftStore();
    let drafts = await store.listDrafts(access.workspaceUid);
    if (campaignId) {
      const campaigns = new RtdbCampaignStore();
      const intents = await campaigns.listIntentsByCampaign(access.workspaceUid, campaignId);
      const ids = new Set(intents.map((i) => i.intentId));
      drafts = drafts.filter((d) => ids.has(d.intentId));
    }
    return Response.json(
      { drafts: drafts.map((d) => ({ draftId: d.draftId, intentId: d.intentId, step: d.step, subject: d.subject, body: d.body, engine: d.engine, renderedAt: d.renderedAt })) },
      { status: 200, headers: NO_STORE }
    );
  } catch (error) {
    return errorResponse(error, "outbound drafts list");
  }
}
