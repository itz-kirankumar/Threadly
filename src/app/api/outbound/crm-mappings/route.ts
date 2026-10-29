import { errorResponse, readJsonBody } from "@/lib/api-request";
import { resolveWorkspaceAccess } from "@/lib/geo/team";
import { outboundAudienceDeny, outboundUidAllowed } from "@/lib/outbound/route-guard";
import { RtdbCRMMappingStore } from "@/lib/outbound/crm-mapping";
import type { CRMMapping } from "@/lib/outbound/types";
import { NO_STORE, outboundEnabled, recordAudit } from "@/lib/outbound/route-support";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";


export async function POST(request: Request) {
  try {
    if (!outboundEnabled()) {
      return Response.json({ error: "Outbound is not enabled on this deployment." }, { status: 404, headers: NO_STORE });
    }
    const access = await resolveWorkspaceAccess(request, "manageTeam");
    if (!outboundUidAllowed(access.identity.uid)) return outboundAudienceDeny();
    if (access.role !== "owner" && access.role !== "admin") {
      return Response.json({ error: "Only workspace admins can manage CRM mappings." }, { status: 403, headers: NO_STORE });
    }
    const body = (await readJsonBody(request, 4 * 1024)) as Record<string, unknown>;
    const externalObjectType = typeof body.externalObjectType === "string" ? body.externalObjectType : "";
    const externalId = typeof body.externalId === "string" ? body.externalId : "";
    const internalKind = body.internalKind === "contact" || body.internalKind === "activity" ? body.internalKind : null;
    const internalId = typeof body.internalId === "string" ? body.internalId : "";
    if (!externalObjectType || !externalId || !internalKind || !internalId) {
      return Response.json({ error: "externalObjectType, externalId, internalKind (contact|activity) and internalId are required." }, { status: 400 });
    }
    const now = new Date().toISOString();
    const mapping: CRMMapping = {
      tenantId: access.workspaceUid,
      mappingId: `cm_${crypto.randomUUID()}`,
      provider: "hubspot",
      externalObjectType,
      externalId,
      internalRef: { kind: internalKind, id: internalId },
      lastSyncAt: null,
      createdAt: now,
      createdBy: access.identity.uid,
    };
    const store = new RtdbCRMMappingStore();
    await store.saveMapping(mapping);
    await recordAudit(access.workspaceUid, access.identity.uid, "crm_mapping.created", `crm:${mapping.externalObjectType}:${mapping.externalId}`, "success", `${mapping.internalRef.kind}:${mapping.internalRef.id}`);
    return Response.json({ mapping }, { status: 201, headers: NO_STORE });
  } catch (error) {
    return errorResponse(error, "outbound crm-mappings");
  }
}

export async function GET(request: Request) {
  try {
    if (!outboundEnabled()) {
      return Response.json({ error: "Outbound is not enabled on this deployment." }, { status: 404, headers: NO_STORE });
    }
    const access = await resolveWorkspaceAccess(request, "view");
    if (!outboundUidAllowed(access.identity.uid)) return outboundAudienceDeny();
    const store = new RtdbCRMMappingStore();
    const mappings = await store.listMappings(access.workspaceUid);
    return Response.json({ mappings }, { headers: NO_STORE });
  } catch (error) {
    return errorResponse(error, "outbound crm-mappings");
  }
}
