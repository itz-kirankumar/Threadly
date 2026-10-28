import { errorResponse, readJsonBody } from "@/lib/api-request";
import { resolveWorkspaceAccess } from "@/lib/geo/team";
import { outboundAudienceDeny, outboundUidAllowed } from "@/lib/outbound/route-guard";
import { reassignContactToAccount } from "@/lib/outbound/corrections";
import { RtdbAccountStore, RtdbEvidenceStore } from "@/lib/outbound/rtdb-import-store";
import { RtdbContactStore } from "@/lib/outbound/rtdb-contact-store";
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

// F03 corrections. assign-domain: explicit domain -> account mapping that
// import consults before the domain index or auto-create (subsidiary and
// shared-domain fixes). reassign-contact: move a misassigned contact to an
// existing account; a correction never sets employerChangedAt (that flag
// keeps its single meaning: the person's employer actually changed).

export async function POST(request: Request) {
  try {
    if (!enabled()) {
      return Response.json({ error: "Outbound is not enabled on this deployment." }, { status: 404, headers: NO_STORE });
    }
    const access = await resolveWorkspaceAccess(request, "manageTeam");
    if (!outboundUidAllowed(access.identity.uid)) return outboundAudienceDeny();
    if (access.role !== "owner" && access.role !== "admin") {
      return Response.json({ error: "Only workspace admins can correct account assignments." }, { status: 403, headers: NO_STORE });
    }
    const body = (await readJsonBody(request, 8 * 1024)) as Record<string, unknown>;
    const accounts = new RtdbAccountStore();

    if (body.action === "assign-domain") {
      const domain = typeof body.domain === "string" ? body.domain.trim().toLowerCase() : "";
      const accountId = typeof body.accountId === "string" ? body.accountId.trim() : "";
      if (!domain || !accountId) return Response.json({ error: "domain and accountId are required." }, { status: 400, headers: NO_STORE });
      const account = await accounts.getAccount(access.workspaceUid, accountId);
      if (!account) return Response.json({ error: "Target account not found." }, { status: 404, headers: NO_STORE });
      await accounts.saveAssignment(access.workspaceUid, domain, accountId);
      await audit(access.workspaceUid, access.identity.uid, "account.domain_assigned", `account:${accountId}`, "success", `domain=${domain}`);
      return Response.json({ domain, accountId }, { headers: NO_STORE });
    }

    if (body.action === "reassign-contact") {
      const contactId = typeof body.contactId === "string" ? body.contactId.trim() : "";
      const targetAccountId = typeof body.targetAccountId === "string" ? body.targetAccountId.trim() : "";
      const reason = typeof body.reason === "string" ? body.reason.trim() : "";
      if (!contactId || !targetAccountId || !reason) return Response.json({ error: "contactId, targetAccountId and reason are required." }, { status: 400, headers: NO_STORE });
      const result = await reassignContactToAccount(
        { contacts: new RtdbContactStore(), accounts, evidence: new RtdbEvidenceStore() },
        { tenantId: access.workspaceUid, contactId, targetAccountId, reason, actor: access.identity.uid, now: new Date() },
      );
      await audit(access.workspaceUid, access.identity.uid, "account.contact_reassigned", `contact:${contactId}`, "success", `to=${targetAccountId} evidence=${result.evidenceId}`);
      return Response.json({ contact: result.contact, evidenceId: result.evidenceId }, { headers: NO_STORE });
    }

    return Response.json({ error: "action must be assign-domain or reassign-contact." }, { status: 400, headers: NO_STORE });
  } catch (error) {
    return errorResponse(error, "outbound accounts");
  }
}
