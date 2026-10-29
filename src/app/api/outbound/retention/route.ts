import { errorResponse, readJsonBody } from "@/lib/api-request";
import { resolveWorkspaceAccess } from "@/lib/geo/team";
import { outboundAudienceDeny, outboundUidAllowed } from "@/lib/outbound/route-guard";
import { RtdbContactStore } from "@/lib/outbound/rtdb-contact-store";
import { RtdbCampaignStore } from "@/lib/outbound/rtdb-campaign-store";
import { RtdbConversationStore } from "@/lib/outbound/rtdb-conversation-store";
import { RtdbEvidenceStore } from "@/lib/outbound/rtdb-import-store";
import { RtdbAuditStore } from "@/lib/outbound/rtdb-audit-store";
import { RtdbRetentionOverrideStore } from "@/lib/outbound/rtdb-retention-override-store";
import { planRetentionSweep, executeRetentionSweep } from "@/lib/outbound/retention";
import { NO_STORE, outboundEnabled, recordAudit } from "@/lib/outbound/route-support";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

// Retention sweep (PRD retention proposal). DRY-RUN BY DEFAULT: the plan is
// returned without any mutation unless the body explicitly sets
// execute: true. Both modes are audited. Retention values are the PRD
// proposal defaults (90d prospect content, 365d audit metadata); contract
// overrides are not yet modeled - do not sweep a tenant under a contractual
// retention requirement. Suppressions are never deleted.

export async function POST(request: Request) {
  try {
    if (!outboundEnabled()) {
      return Response.json({ error: "Outbound is not enabled on this deployment." }, { status: 404, headers: NO_STORE });
    }
    const access = await resolveWorkspaceAccess(request, "manageTeam");
    if (!outboundUidAllowed(access.identity.uid)) return outboundAudienceDeny();
    if (access.role !== "owner" && access.role !== "admin") {
      return Response.json({ error: "Only workspace admins can run the retention sweep." }, { status: 403, headers: NO_STORE });
    }
    const body = (await readJsonBody(request, 4 * 1024).catch(() => ({}))) as Record<string, unknown>;
    const execute = body.execute === true;
    const stores = {
      contacts: new RtdbContactStore(),
      campaigns: new RtdbCampaignStore(),
      conversations: new RtdbConversationStore(),
      evidence: new RtdbEvidenceStore(),
      audit: new RtdbAuditStore(),
      overrides: new RtdbRetentionOverrideStore(),
    };
    const plan = await planRetentionSweep(stores, { tenantId: access.workspaceUid, now: new Date() });
    if (plan.blocked) {
      await recordAudit(access.workspaceUid, access.identity.uid, "retention.sweep_blocked", `tenant:${access.workspaceUid}`, "denied", plan.blocked);
      return Response.json({ mode: "blocked", blocked: plan.blocked, plan }, { status: execute ? 409 : 200, headers: NO_STORE });
    }
    if (!execute) {
      await recordAudit(access.workspaceUid, access.identity.uid, "retention.sweep_planned", `tenant:${access.workspaceUid}`, "success", `deleteContacts=${plan.deleteContacts.length} deleteEvidence=${plan.deleteEvidence.length} purgeAudit=${plan.purgeAuditEvents}`);
      return Response.json({ mode: "dry_run", plan }, { headers: NO_STORE });
    }
    const result = await executeRetentionSweep(stores, plan, plan.auditCutoff);
    await recordAudit(access.workspaceUid, access.identity.uid, "retention.swept", `tenant:${access.workspaceUid}`, "success", `deletedContacts=${result.deletedContacts} deletedEvidence=${result.deletedEvidence} purgedAudit=${result.purgedAuditEvents}`);
    return Response.json({ mode: "executed", plan, deletedContacts: result.deletedContacts, deletedEvidence: result.deletedEvidence, purgedAuditEvents: result.purgedAuditEvents }, { headers: NO_STORE });
  } catch (error) {
    return errorResponse(error, "outbound retention");
  }
}
