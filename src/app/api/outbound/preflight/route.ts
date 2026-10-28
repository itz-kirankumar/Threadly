import { errorResponse, readJsonBody } from "@/lib/api-request";
import { resolveWorkspaceAccess } from "@/lib/geo/team";
import { outboundAudienceDeny, outboundUidAllowed } from "@/lib/outbound/route-guard";
import { NodeDnsResolver, checkDomain, evaluatePreflight } from "@/lib/outbound/preflight";
import { RtdbPreflightStore } from "@/lib/outbound/rtdb-preflight-store";
import { auditEvent } from "@/lib/outbound/audit";
import { RtdbAuditStore } from "@/lib/outbound/rtdb-audit-store";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const NO_STORE = { "Cache-Control": "no-store" } as const;

function enabled(): boolean {
  if (process.env.OUTBOUND_ENABLED !== "true") return false;
  return typeof process.env.OUTBOUND_DATA_ROOT === "string" && process.env.OUTBOUND_DATA_ROOT.length > 0;
}

// Domain/reputation preflight (PRD F13). POST runs LIVE DNS checks (SPF,
// DMARC, common-selector DKIM) for a domain and stores the evidence with a
// timestamp; dispatch blocks senders on domains without a passing, fresh
// record. Read-only against the internet; no inbox-placement promise is made
// anywhere. DKIM "missing" means no COMMON selector resolved, not proof of
// absence.

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
    const records = await new RtdbPreflightStore().list(access.workspaceUid);
    const now = new Date();
    return Response.json(
      { domains: records.map((r) => ({ ...r, state: evaluatePreflight(r, now).state, failedChecks: evaluatePreflight(r, now).failedChecks })) },
      { headers: NO_STORE },
    );
  } catch (error) {
    return errorResponse(error, "outbound preflight");
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
      return Response.json({ error: "Only workspace admins can run preflight checks." }, { status: 403, headers: NO_STORE });
    }
    const body = (await readJsonBody(request, 4 * 1024)) as Record<string, unknown>;
    const domain = typeof body.domain === "string" ? body.domain.trim().toLowerCase() : "";
    if (!/^[a-z0-9][a-z0-9.-]*\.[a-z]{2,}$/.test(domain)) {
      return Response.json({ error: "A valid domain is required." }, { status: 400, headers: NO_STORE });
    }
    const record = await checkDomain(access.workspaceUid, domain, new NodeDnsResolver(), { now: new Date(), actor: access.identity.uid });
    await new RtdbPreflightStore().save(record);
    const state = evaluatePreflight(record, new Date());
    await audit(access.workspaceUid, access.identity.uid, "domain.preflight_checked", `domain:${domain}`, "success", `state=${state.state} spf=${record.spf} dkim=${record.dkim} dmarc=${record.dmarc}`);
    return Response.json({ ...record, state: state.state, failedChecks: state.failedChecks }, { headers: NO_STORE });
  } catch (error) {
    return errorResponse(error, "outbound preflight");
  }
}
