import { errorResponse, readJsonBody } from "@/lib/api-request";
import { resolveWorkspaceAccess } from "@/lib/geo/team";
import { outboundAudienceDeny, outboundUidAllowed } from "@/lib/outbound/route-guard";
import { MxVerifier, NodeMxResolver, applyVerificationOutcome } from "@/lib/outbound/verification";
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

// Contact verification (PRD F05). Runs the FREE domain-level MX check only:
// it can downgrade to "invalid" (domain cannot receive mail) or record an
// inconclusive check; it can never mark a mailbox "valid" or "catch_all" -
// those need a real mailbox-verification provider (paid, owner decision).
// Read-only against the internet.

export async function POST(request: Request) {
  try {
    if (!enabled()) {
      return Response.json({ error: "Outbound is not enabled on this deployment." }, { status: 404, headers: NO_STORE });
    }
    const access = await resolveWorkspaceAccess(request, "manageTeam");
    if (!outboundUidAllowed(access.identity.uid)) return outboundAudienceDeny();
    if (access.role !== "owner" && access.role !== "admin") {
      return Response.json({ error: "Only workspace admins can run verification." }, { status: 403, headers: NO_STORE });
    }
    const body = (await readJsonBody(request, 4 * 1024)) as Record<string, unknown>;
    const contactId = typeof body.contactId === "string" ? body.contactId.trim() : "";
    if (!contactId) return Response.json({ error: "contactId is required." }, { status: 400, headers: NO_STORE });
    const store = new RtdbContactStore();
    const contact = await store.getContact(access.workspaceUid, contactId);
    if (!contact) return Response.json({ error: "Contact not found." }, { status: 404, headers: NO_STORE });
    const verifier = new MxVerifier(new NodeMxResolver());
    const outcome = await verifier.verify(contact.email);
    const updated = applyVerificationOutcome(contact, outcome, verifier.verifier, new Date());
    await store.saveContact(updated);
    await new RtdbAuditStore().append(
      auditEvent({
        tenantId: access.workspaceUid,
        actor: access.identity.uid,
        action: "contact.verified",
        target: `contact:${contactId}`,
        outcome: "success",
        detail: `verifier=mx-check state=${updated.verification.state} detail=${outcome.detail.slice(0, 200)}`,
      }),
    );
    return Response.json({ contactId, verification: updated.verification, detail: outcome.detail }, { headers: NO_STORE });
  } catch (error) {
    return errorResponse(error, "outbound verification");
  }
}
