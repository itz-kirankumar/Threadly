import { errorResponse, readJsonBody } from "@/lib/api-request";
import { resolveWorkspaceAccess } from "@/lib/geo/team";
import { outboundAudienceDeny, outboundUidAllowed } from "@/lib/outbound/route-guard";
import { approveCampaign } from "@/lib/outbound/campaign";
import { RtdbCampaignStore } from "@/lib/outbound/rtdb-campaign-store";
import type { CampaignVersion, RoleId } from "@/lib/outbound/types";
import { auditEvent } from "@/lib/outbound/audit";
import { RtdbAuditStore } from "@/lib/outbound/rtdb-audit-store";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

function outboundEnabled(): boolean {
  if (process.env.OUTBOUND_ENABLED !== "true") return false;
  // Refuse to enable against the implicit default root: enabling requires an
  // explicit data-root decision so a stray flag can never silently target
  // production tenant data.
  return typeof process.env.OUTBOUND_DATA_ROOT === "string" && process.env.OUTBOUND_DATA_ROOT.length > 0;
}

const NO_STORE = { "Cache-Control": "no-store" } as const;

// Maps workspace roles onto outbound RoleIds for the gated preview. Only
// owner/admin may approve; the CampaignStore functions re-verify anyway.
function outboundRole(role: string): RoleId {
  return role === "owner" || role === "admin" ? "campaign_approver" : "rep";
}


async function audit(tenantId: string, actor: string, action: string, target: string, outcome: "success" | "denied" | "error", detail: string | null = null): Promise<void> {
  await new RtdbAuditStore().append(auditEvent({ tenantId, actor, action, target, outcome, detail }));
}

export async function POST(request: Request) {
  try {
    if (!outboundEnabled()) {
      return Response.json({ error: "Outbound is not enabled on this deployment." }, { status: 404, headers: NO_STORE });
    }
    const access = await resolveWorkspaceAccess(request, "manageTeam");
    if (!outboundUidAllowed(access.identity.uid)) return outboundAudienceDeny();
    if (access.role !== "owner" && access.role !== "admin") {
      return Response.json({ error: "Only workspace admins can manage campaigns." }, { status: 403, headers: NO_STORE });
    }
    const body = (await readJsonBody(request, 32 * 1024)) as Record<string, unknown>;
    const action = typeof body.action === "string" ? body.action : "";
    const tenantId = access.workspaceUid;
    const store = new RtdbCampaignStore();

    if (action === "create") {
      const campaignId = typeof body.campaignId === "string" ? body.campaignId : "";
      if (!campaignId || !/^[A-Za-z0-9_-]{1,64}$/.test(campaignId)) {
        return Response.json({ error: "campaignId is required (letters, digits, -, _)." }, { status: 400 });
      }
      const latest = await store.latestCampaignVersion(tenantId, campaignId);
      const version = (latest?.version ?? 0) + 1;
      const spec = (body.spec ?? {}) as Partial<CampaignVersion>;
      if (!Array.isArray(spec.templates) || spec.templates.length === 0) {
        return Response.json({ error: "spec.templates (non-empty) is required." }, { status: 400 });
      }
      if (typeof spec.followUpCount === "number" && spec.followUpCount > 2) {
        return Response.json({ error: "followUpCount above the pilot maximum of 2 is not allowed." }, { status: 400 });
      }
      const now = new Date().toISOString();
      const campaign: CampaignVersion = {
        tenantId,
        campaignId,
        version,
        senderAllowlist: Array.isArray(spec.senderAllowlist) ? spec.senderAllowlist : [],
        audienceQueryVersion: typeof spec.audienceQueryVersion === "string" ? spec.audienceQueryVersion : "",
        exclusions: Array.isArray(spec.exclusions) ? spec.exclusions : [],
        templates: spec.templates,
        allowedPersonalization: Array.isArray(spec.allowedPersonalization) ? spec.allowedPersonalization : [],
        followUpCount: typeof spec.followUpCount === "number" ? spec.followUpCount : 2,
        countries: Array.isArray(spec.countries) ? spec.countries : [],
        sendWindows: Array.isArray(spec.sendWindows) ? spec.sendWindows : [],
        dailyCapPerSender: typeof spec.dailyCapPerSender === "number" ? spec.dailyCapPerSender : 25,
        costCeiling:
          spec.costCeiling && typeof spec.costCeiling === "object"
            ? spec.costCeiling
            : { currency: "USD", amount: 0 },
        bookingPolicy:
          spec.bookingPolicy && typeof spec.bookingPolicy === "object"
            ? spec.bookingPolicy
            : { directBooking: false, hostPool: [] },
        expiresAt: typeof spec.expiresAt === "string" ? spec.expiresAt : now,
        createdAt: now,
        createdBy: access.identity.uid,
      };
      await store.saveCampaignVersion(campaign);
      await audit(tenantId, access.identity.uid, "campaign.created", `campaign:${campaignId}:v${campaign.version}`, "success");
      return Response.json({ campaign }, { status: 201, headers: NO_STORE });
    }

    if (action === "approve") {
      const campaignId = typeof body.campaignId === "string" ? body.campaignId : "";
      const version = typeof body.version === "number" ? body.version : NaN;
      const campaign = await store.getCampaignVersion(tenantId, campaignId, version);
      if (!campaign) return Response.json({ error: "Campaign version not found." }, { status: 404 });
      const approval = await approveCampaign(store, {
        tenantId,
        campaign,
        approverUserId: access.identity.uid,
        approverRole: outboundRole(access.role),
        now: new Date(),
      });
      await audit(tenantId, access.identity.uid, "campaign.approved", `campaign:${campaignId}:v${version}`, "success", `approvalId=${approval.approvalId}`);
      return Response.json({ approval }, { status: 201, headers: NO_STORE });
    }

    return Response.json({ error: 'action must be "create" or "approve".' }, { status: 400 });
  } catch (error) {
    return errorResponse(error, "outbound campaigns");
  }
}

export async function GET(request: Request) {
  try {
    if (!outboundEnabled()) {
      return Response.json({ error: "Outbound is not enabled on this deployment." }, { status: 404, headers: NO_STORE });
    }
    const access = await resolveWorkspaceAccess(request, "view");
    if (!outboundUidAllowed(access.identity.uid)) return outboundAudienceDeny();
    const campaignId = new URL(request.url).searchParams.get("campaignId") ?? "";
    const store = new RtdbCampaignStore();
    if (!campaignId) {
      const campaigns = await store.listCampaigns(access.workspaceUid);
      return Response.json({ campaigns }, { headers: NO_STORE });
    }
    const campaign = await store.latestCampaignVersion(access.workspaceUid, campaignId);
    if (!campaign) return Response.json({ error: "Not found." }, { status: 404 });
    const approval = await store.getApprovalForVersion(access.workspaceUid, campaignId, campaign.version);
    return Response.json({ campaign, approval: approval && !approval.revokedAt ? approval : null }, { headers: NO_STORE });
  } catch (error) {
    return errorResponse(error, "outbound campaigns");
  }
}
