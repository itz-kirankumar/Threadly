import { errorResponse, readJsonBody } from "@/lib/api-request";
import { resolveWorkspaceAccess } from "@/lib/geo/team";
import { outboundAudienceDeny, outboundUidAllowed } from "@/lib/outbound/route-guard";
import { registerLicensedSource } from "@/lib/outbound/discovery";
import { RtdbLicensedSourceStore } from "@/lib/outbound/rtdb-source-store";
import { auditEvent } from "@/lib/outbound/audit";
import { RtdbAuditStore } from "@/lib/outbound/rtdb-audit-store";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const NO_STORE = { "Cache-Control": "no-store" } as const;

function enabled(): boolean {
  if (process.env.OUTBOUND_ENABLED !== "true") return false;
  return typeof process.env.OUTBOUND_DATA_ROOT === "string" && process.env.OUTBOUND_DATA_ROOT.length > 0;
}

async function audit(tenantId: string, actor: string, action: string, target: string, outcome: "success" | "denied" | "error", detail: string | null = null): Promise<void> {
  await new RtdbAuditStore().append(auditEvent({ tenantId, actor, action, target, outcome, detail }));
}

// Licensed discovery source registry (PRD F02). Registering a source here
// records that its license permits (or does not permit) the intended B2B
// marketing use; imports naming a licensed_api source are blocked unless
// the source is registered, permitting and unrevoked. Registration is a
// record-keeping act only: it activates NO provider and spends nothing.

export async function GET(request: Request) {
  try {
    if (!enabled()) {
      return Response.json({ error: "Outbound is not enabled on this deployment." }, { status: 404, headers: NO_STORE });
    }
    const access = await resolveWorkspaceAccess(request, "view");
    if (!outboundUidAllowed(access.identity.uid)) return outboundAudienceDeny();
    const sources = await new RtdbLicensedSourceStore().list(access.workspaceUid);
    return Response.json({ sources }, { headers: NO_STORE });
  } catch (error) {
    return errorResponse(error, "outbound sources");
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
      return Response.json({ error: "Only workspace admins can manage licensed sources." }, { status: 403, headers: NO_STORE });
    }
    const body = (await readJsonBody(request, 8 * 1024)) as Record<string, unknown>;
    const store = new RtdbLicensedSourceStore();

    if (body.action === "revoke") {
      const sourceName = typeof body.sourceName === "string" ? body.sourceName.trim().toLowerCase() : "";
      const found = (await store.list(access.workspaceUid)).find((s) => s.sourceName === sourceName);
      if (!found) return Response.json({ error: "Source not found." }, { status: 404, headers: NO_STORE });
      const revoked = { ...found, revokedAt: new Date().toISOString() };
      await store.save(revoked);
      await audit(access.workspaceUid, access.identity.uid, "source.revoked", `source:${found.sourceId}`, "success", `name=${found.sourceName}`);
      return Response.json(revoked, { headers: NO_STORE });
    }

    const sourceName = typeof body.sourceName === "string" ? body.sourceName : "";
    if (typeof body.licensePermitsUse !== "boolean") {
      return Response.json({ error: "licensePermitsUse (boolean) is required - an explicit declaration, never a default." }, { status: 400, headers: NO_STORE });
    }
    const record = registerLicensedSource({
      tenantId: access.workspaceUid,
      sourceName,
      licensePermitsUse: body.licensePermitsUse,
      termsUrl: typeof body.termsUrl === "string" ? body.termsUrl.slice(0, 500) : null,
      actor: access.identity.uid,
      now: new Date(),
    });
    await store.save(record);
    await audit(access.workspaceUid, access.identity.uid, "source.registered", `source:${record.sourceId}`, "success", `name=${record.sourceName} permits=${record.licensePermitsUse}`);
    return Response.json(record, { headers: NO_STORE });
  } catch (error) {
    return errorResponse(error, "outbound sources");
  }
}
