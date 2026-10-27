import { errorResponse, readJsonBody } from "@/lib/api-request";
import { resolveWorkspaceAccess } from "@/lib/geo/team";
import { enrollContact } from "@/lib/outbound/campaign";
import { isExcludedByIcp, resolveCurrentIcp } from "@/lib/outbound/icp";
import { RtdbIcpStore } from "@/lib/outbound/rtdb-icp-store";
import { RtdbContactStore } from "@/lib/outbound/rtdb-contact-store";
import { RtdbAccountStore } from "@/lib/outbound/rtdb-import-store";
import { RtdbCampaignStore } from "@/lib/outbound/rtdb-campaign-store";
import { auditEvent } from "@/lib/outbound/audit";
import { RtdbAuditStore } from "@/lib/outbound/rtdb-audit-store";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const NO_STORE = { "Cache-Control": "no-store" } as const;

function enabled(): boolean {
  if (process.env.OUTBOUND_ENABLED !== "true") return false;
  // Refuse to enable against the implicit default root: enabling requires an
  // explicit data-root decision so a stray flag can never silently target
  // production tenant data.
  return typeof process.env.OUTBOUND_DATA_ROOT === "string" && process.env.OUTBOUND_DATA_ROOT.length > 0;
}


async function audit(tenantId: string, actor: string, action: string, target: string, outcome: "success" | "denied" | "error", detail: string | null = null): Promise<void> {
  await new RtdbAuditStore().append(auditEvent({ tenantId, actor, action, target, outcome, detail }));
}

export async function POST(request: Request) {
  try {
    if (!enabled()) {
      return Response.json({ error: "Outbound is not enabled on this deployment." }, { status: 404, headers: NO_STORE });
    }
    const access = await resolveWorkspaceAccess(request, "manageTeam");
    if (access.role !== "owner" && access.role !== "admin") {
      return Response.json({ error: "Only workspace admins can enroll contacts." }, { status: 403, headers: NO_STORE });
    }
    const body = (await readJsonBody(request, 8 * 1024)) as Record<string, unknown>;
    const campaignId = typeof body.campaignId === "string" ? body.campaignId : "";
    const version = typeof body.version === "number" ? body.version : NaN;
    const approvalId = typeof body.approvalId === "string" ? body.approvalId : "";
    const contactId = typeof body.contactId === "string" ? body.contactId : "";
    const exclusionGroup = typeof body.exclusionGroup === "string" ? body.exclusionGroup : contactId;
    if (!campaignId || !approvalId || !contactId || !Number.isFinite(version)) {
      return Response.json({ error: "campaignId, version, approvalId and contactId are required." }, { status: 400 });
    }
    const store = new RtdbCampaignStore();
    const campaign = await store.getCampaignVersion(access.workspaceUid, campaignId, version);
    if (!campaign) return Response.json({ error: "Campaign version not found." }, { status: 404 });
    // F05 exclusion policy: when an activated ICP exists, its exclusions
    // block enrollment. Fail-open by design ONLY when no ICP is activated
    // (nothing to enforce); the first-send/dispatch eligibility gates stay
    // fail-closed independently.
    const contact = await new RtdbContactStore().getContact(access.workspaceUid, contactId);
    if (!contact) return Response.json({ error: "Contact not found." }, { status: 404 });
    const icp = await resolveCurrentIcp(new RtdbIcpStore(), access.workspaceUid);
    if (icp) {
      const account = await new RtdbAccountStore().getAccount(access.workspaceUid, contact.accountId);
      const check = isExcludedByIcp(icp.exclusions, { email: contact.email, accountDomain: account?.domain ?? null });
      if (check.excluded) {
        await audit(access.workspaceUid, access.identity.uid, "enrollment.excluded", `contact:${contactId}`, "denied", `matched ICP exclusion "${check.matched}" (icp ${icp.icpVersionId} v${icp.version})`);
        return Response.json({ error: `Contact is excluded by the active ICP (matched "${check.matched}").` }, { status: 409, headers: NO_STORE });
      }
    }
    // enrollContact re-reads the approval fresh, checks campaign binding,
    // expiry and exclusion-group clash before writing.
    const enrollment = await enrollContact(store, {
      tenantId: access.workspaceUid,
      campaign,
      approvalId,
      contactId,
      exclusionGroup,
      actor: access.identity.uid,
      now: new Date(),
    });
    await audit(access.workspaceUid, access.identity.uid, "enrollment.created", `enrollment:${enrollment.enrollmentId}`, "success", `campaign=${campaignId} contact=${body.contactId}`);
    return Response.json({ enrollment }, { status: 201, headers: NO_STORE });
  } catch (error) {
    return errorResponse(error, "outbound enrollments");
  }
}

export async function GET(request: Request) {
  try {
    if (!enabled()) {
      return Response.json({ error: "Outbound is not enabled on this deployment." }, { status: 404, headers: NO_STORE });
    }
    const access = await resolveWorkspaceAccess(request, "view");
    const campaignId = new URL(request.url).searchParams.get("campaignId") ?? "";
    if (!campaignId) return Response.json({ error: "campaignId is required." }, { status: 400 });
    const store = new RtdbCampaignStore();
    const enrollments = await store.listEnrollments(access.workspaceUid, campaignId);
    return Response.json({ enrollments }, { headers: NO_STORE });
  } catch (error) {
    return errorResponse(error, "outbound enrollments");
  }
}
