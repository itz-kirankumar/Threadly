import { errorResponse, readJsonBody } from "@/lib/api-request";
import { resolveWorkspaceAccess } from "@/lib/geo/team";
import { outboundAudienceDeny, outboundUidAllowed } from "@/lib/outbound/route-guard";
import { RtdbKillSwitchStore } from "@/lib/outbound/rtdb-kill-switch-store";
import { RtdbCampaignStore } from "@/lib/outbound/rtdb-campaign-store";
import { RtdbSenderStore } from "@/lib/outbound/rtdb-sender-store";
import { engageKillSwitch } from "@/lib/outbound/kill-switches";
import type { KillSwitchScope } from "@/lib/outbound/kill-switches";
import { auditEvent } from "@/lib/outbound/audit";
import { RtdbAuditStore } from "@/lib/outbound/rtdb-audit-store";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const NO_STORE = { "Cache-Control": "no-store" } as const;
const SCOPES: KillSwitchScope[] = ["tenant", "campaign", "domain", "sender"];

function enabled(): boolean {
  if (process.env.OUTBOUND_ENABLED !== "true") return false;
  return typeof process.env.OUTBOUND_DATA_ROOT === "string" && process.env.OUTBOUND_DATA_ROOT.length > 0;
}

// Control-center kill switches (PRD F09): pause tenant/campaign/domain/
// sender without a redeploy, with visible reasons. Engage is idempotent per
// scope+target (one active switch each); lifting keeps the record as audit
// trail. Enforcement lives in the planner and dispatch gates.

async function audit(tenantId: string, actor: string, action: string, target: string, outcome: "success" | "denied" | "error", detail: string | null = null): Promise<void> {
  await new RtdbAuditStore().append(auditEvent({ tenantId, actor, action, target, outcome, detail }));
}

export async function GET(request: Request) {
  try {
    if (!enabled()) {
      return Response.json({ error: "Outbound is not enabled on this deployment." }, { status: 404, headers: NO_STORE });
    }
    const access = await resolveWorkspaceAccess(request, "view");
    if (!outboundUidAllowed(access.identity.uid)) return outboundAudienceDeny();
    const switches = await new RtdbKillSwitchStore().list(access.workspaceUid);
    return Response.json({ switches: switches.map((s) => ({ ...s, active: s.liftedAt === null })) }, { headers: NO_STORE });
  } catch (error) {
    return errorResponse(error, "outbound killswitches");
  }
}

export async function POST(request: Request) {
  try {
    if (!enabled()) {
      return Response.json({ error: "Outbound is not enabled on this deployment." }, { status: 404, headers: NO_STORE });
    }
    const access = await resolveWorkspaceAccess(request, "manageTeam");
    if (!outboundUidAllowed(access.identity.uid)) return outboundAudienceDeny();
    if (access.role !== "owner" && access.role !== "admin") {
      return Response.json({ error: "Only workspace admins can manage kill switches." }, { status: 403, headers: NO_STORE });
    }
    const body = (await readJsonBody(request, 4 * 1024)) as Record<string, unknown>;
    const store = new RtdbKillSwitchStore();

    if (body.action === "lift") {
      const switchId = typeof body.switchId === "string" ? body.switchId : "";
      const existing = switchId ? await store.get(access.workspaceUid, switchId) : null;
      if (!existing) return Response.json({ error: "Kill switch not found." }, { status: 404, headers: NO_STORE });
      if (existing.liftedAt !== null) {
        return Response.json({ switchId, active: false, already: true }, { headers: NO_STORE });
      }
      const liftedAt = new Date().toISOString();
      await store.lift(access.workspaceUid, switchId, liftedAt);
      await audit(access.workspaceUid, access.identity.uid, "killswitch.lifted", `killswitch:${switchId}`, "success", `scope=${existing.scope} target=${existing.target}`);
      return Response.json({ switchId, active: false, liftedAt }, { headers: NO_STORE });
    }

    const scope = SCOPES.find((s) => s === body.scope);
    const reason = typeof body.reason === "string" ? body.reason.trim() : "";
    if (!scope || !reason) {
      return Response.json({ error: "scope (tenant|campaign|domain|sender) and a visible reason are required." }, { status: 400, headers: NO_STORE });
    }
    let target: string;
    if (scope === "tenant") {
      target = "*";
    } else if (scope === "campaign") {
      target = typeof body.target === "string" ? body.target : "";
      const found = (await new RtdbCampaignStore().listCampaigns(access.workspaceUid)).some((c) => c.campaignId === target);
      if (!found) return Response.json({ error: "Campaign not found in this workspace." }, { status: 404, headers: NO_STORE });
    } else if (scope === "sender") {
      target = typeof body.target === "string" ? body.target : "";
      const sender = await new RtdbSenderStore().getSender(access.workspaceUid, target);
      if (!sender) return Response.json({ error: "Sender not found in this workspace." }, { status: 404, headers: NO_STORE });
    } else {
      target = typeof body.target === "string" ? body.target.trim().toLowerCase() : "";
      if (!/^[a-z0-9][a-z0-9.-]*\.[a-z]{2,}$/.test(target)) {
        return Response.json({ error: "A valid domain is required for a domain kill switch." }, { status: 400, headers: NO_STORE });
      }
    }

    const result = await engageKillSwitch(store, {
      tenantId: access.workspaceUid,
      scope,
      target,
      reason,
      createdAt: new Date().toISOString(),
      createdBy: access.identity.uid,
    });
    await audit(access.workspaceUid, access.identity.uid, "killswitch.engaged", `killswitch:${result.switch.switchId}`, "success", `scope=${scope} target=${target} created=${result.created} reason=${reason}`);
    return Response.json({ switchId: result.switch.switchId, scope, target, active: true, created: result.created }, { status: result.created ? 201 : 200, headers: NO_STORE });
  } catch (error) {
    return errorResponse(error, "outbound killswitches");
  }
}
