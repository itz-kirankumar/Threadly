import { errorResponse, readJsonBody } from "@/lib/api-request";
import { resolveWorkspaceAccess } from "@/lib/geo/team";
import { outboundAudienceDeny, outboundUidAllowed } from "@/lib/outbound/route-guard";
import { addSuppression } from "@/lib/outbound/campaign";
import { RtdbCampaignStore } from "@/lib/outbound/rtdb-campaign-store";
import type { SuppressionReason } from "@/lib/outbound/types";
import { auditEvent } from "@/lib/outbound/audit";
import { RtdbAuditStore } from "@/lib/outbound/rtdb-audit-store";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const NO_STORE = { "Cache-Control": "no-store" } as const;
const REASONS: SuppressionReason[] = ["opt_out", "hard_bounce", "complaint", "manual", "legal"];

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
    if (!outboundUidAllowed(access.identity.uid)) return outboundAudienceDeny();
    if (access.role !== "owner" && access.role !== "admin") {
      return Response.json({ error: "Only workspace admins can manage suppressions." }, { status: 403, headers: NO_STORE });
    }
    const body = (await readJsonBody(request, 4 * 1024)) as Record<string, unknown>;
    const email = typeof body.email === "string" ? body.email : "";
    const reason = REASONS.find((r) => r === body.reason);
    if (!email.includes("@") || !reason) {
      return Response.json({ error: "A valid email and reason are required." }, { status: 400 });
    }
    const store = new RtdbCampaignStore();
    const result = await addSuppression(store, {
      tenantId: access.workspaceUid,
      email,
      reason,
      source: "api",
      actor: access.identity.uid,
      now: new Date(),
    });
    await audit(access.workspaceUid, access.identity.uid, "suppression.added", `suppression:${result.suppression.suppressionId}`, "success", `reason=${result.suppression.reason} created=${result.created}`);
    return Response.json(result, { status: result.created ? 201 : 200, headers: NO_STORE });
  } catch (error) {
    return errorResponse(error, "outbound suppressions");
  }
}

export async function GET(request: Request) {
  try {
    if (!enabled()) {
      return Response.json({ error: "Outbound is not enabled on this deployment." }, { status: 404, headers: NO_STORE });
    }
    const access = await resolveWorkspaceAccess(request, "view");
    if (!outboundUidAllowed(access.identity.uid)) return outboundAudienceDeny();
    const store = new RtdbCampaignStore();
    const suppressions = await store.listSuppressions(access.workspaceUid);
    // Never return raw emails; suppressions store tokens only.
    return Response.json({ suppressions }, { headers: NO_STORE });
  } catch (error) {
    return errorResponse(error, "outbound suppressions");
  }
}
