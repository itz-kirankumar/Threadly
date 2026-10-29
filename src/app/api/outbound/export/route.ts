import { errorResponse } from "@/lib/api-request";
import { resolveWorkspaceAccess } from "@/lib/geo/team";
import { outboundAudienceDeny, outboundUidAllowed } from "@/lib/outbound/route-guard";
import { RtdbContactStore } from "@/lib/outbound/rtdb-contact-store";
import { csvCell, NO_STORE, outboundEnabled, recordAudit } from "@/lib/outbound/route-support";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

// CSV export (PRD F19): tenant contacts with verification state and rights
// provenance, for CRM handoff without a live CRM connection.

export async function GET(request: Request) {
  try {
    if (!outboundEnabled()) {
      return Response.json({ error: "Outbound is not enabled on this deployment." }, { status: 404, headers: NO_STORE });
    }
    const access = await resolveWorkspaceAccess(request, "view");
    if (!outboundUidAllowed(access.identity.uid)) return outboundAudienceDeny();
    const store = new RtdbContactStore();
    const contacts = await store.listContacts(access.workspaceUid);
    const lines = ["email,full_name,title,verification_state,verified_at,subscriber_class,lawful_basis,country,created_at"];
    for (const c of contacts) {
      const rights = await store.getRightsForContact(access.workspaceUid, c.contactId);
      lines.push(
        [
          csvCell(c.email),
          csvCell(c.fullName),
          csvCell(c.title),
          c.verification.state,
          c.verification.verifiedAt ?? "",
          rights?.subscriberClass ?? "",
          rights?.lawfulBasis ?? "",
          rights?.country ?? "",
          c.createdAt,
        ].join(",")
      );
    }
    await recordAudit(access.workspaceUid, access.identity.uid, "contacts.exported", `tenant:${access.workspaceUid}`, "success", `count=${contacts.length}`);
    return new Response(lines.join("\n") + "\n", {
      headers: { ...NO_STORE, "Content-Type": "text/csv; charset=utf-8", "Content-Disposition": 'attachment; filename="threadly-contacts.csv"' },
    });
  } catch (error) {
    return errorResponse(error, "outbound export");
  }
}
