import { errorResponse, readJsonBody } from "@/lib/api-request";
import { resolveWorkspaceAccess } from "@/lib/geo/team";
import { RtdbContactStore } from "@/lib/outbound/rtdb-contact-store";
import { RtdbAccountStore } from "@/lib/outbound/rtdb-import-store";
import type { Account, Contact, ContactVerificationState, RightsRecord } from "@/lib/outbound/types";
import { auditEvent } from "@/lib/outbound/audit";
import { RtdbAuditStore } from "@/lib/outbound/rtdb-audit-store";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const NO_STORE = { "Cache-Control": "no-store" } as const;
const VSTATES: ContactVerificationState[] = ["valid", "invalid", "unknown", "stale", "catch_all"];

function enabled(): boolean {
  if (process.env.OUTBOUND_ENABLED !== "true") return false;
  // Refuse to enable against the implicit default root: enabling requires an
  // explicit data-root decision so a stray flag can never silently target
  // production tenant data.
  return typeof process.env.OUTBOUND_DATA_ROOT === "string" && process.env.OUTBOUND_DATA_ROOT.length > 0;
}

// Creates a contact and (optionally) its rights record. The planner still
// evaluates eligibility fresh on every run; writing a record here grants
// nothing by itself.

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
      return Response.json({ error: "Only workspace admins can manage contacts." }, { status: 403, headers: NO_STORE });
    }
    const body = (await readJsonBody(request, 8 * 1024)) as Record<string, unknown>;
    const email = typeof body.email === "string" ? body.email.trim().toLowerCase() : "";
    const fullName = typeof body.fullName === "string" ? body.fullName.trim() : "";
    if (!email.includes("@") || !fullName) {
      return Response.json({ error: "email and fullName are required." }, { status: 400 });
    }
    const tenantId = access.workspaceUid;
    const now = new Date().toISOString();
    const contact: Contact = {
      tenantId,
      contactId: `ct_${crypto.randomUUID()}`,
      accountId: typeof body.accountId === "string" ? body.accountId : "",
      email,
      fullName,
      // RTDB rejects undefined values; only set title when provided.
      ...(typeof body.title === "string" && body.title ? { title: body.title } : {}),
      verification: {
        state: VSTATES.find((v) => v === (body.verificationState as string)) ?? "unknown",
        verifiedAt: typeof body.verifiedAt === "string" ? body.verifiedAt : null,
        verifier: typeof body.verifier === "string" ? body.verifier : null,
      },
      employerChangedAt: null,
      createdAt: now,
      createdBy: access.identity.uid,
    };
    // Link the account like csv-import does: explicit correction assignment
    // wins, then domain match, else create the account record.
    const accountDomain = typeof body.accountDomain === "string" ? body.accountDomain.trim().toLowerCase() : "";
    if (accountDomain) {
      const accounts = new RtdbAccountStore();
      let account: Account | null = null;
      const assignedId = await accounts.getAssignment(tenantId, accountDomain);
      if (assignedId) account = await accounts.getAccount(tenantId, assignedId);
      if (!account) account = await accounts.findByDomain(tenantId, accountDomain);
      if (!account) {
        account = {
          tenantId,
          accountId: `acc_${crypto.randomUUID()}`,
          name: typeof body.accountName === "string" && body.accountName.trim() ? body.accountName.trim() : accountDomain,
          domain: accountDomain,
          createdAt: now,
          createdBy: access.identity.uid,
        };
        await accounts.saveAccount(account);
      }
      contact.accountId = account.accountId;
    }
    const store = new RtdbContactStore();
    await store.saveContact(contact);

    let rights: RightsRecord | null = null;
    if (body.rights && typeof body.rights === "object") {
      const r = body.rights as Record<string, unknown>;
      rights = {
        tenantId,
        rightsId: `rr_${crypto.randomUUID()}`,
        contactId: contact.contactId,
        sourceEvidenceId: typeof r.sourceEvidenceId === "string" ? r.sourceEvidenceId : "",
        intendedUse: "b2b_marketing",
        licensePermitsUse: r.licensePermitsUse === true,
        subscriberClass: r.subscriberClass === "corporate" ? "corporate" : r.subscriberClass === "individual" ? "individual" : "unknown",
        lawfulBasis: typeof r.lawfulBasis === "string" ? r.lawfulBasis : null,
        country: typeof r.country === "string" ? r.country : null,
        createdAt: now,
        createdBy: access.identity.uid,
      };
      await store.saveRights(rights);
    }
    await audit(access.workspaceUid, access.identity.uid, "contact.created", `contact:${contact.contactId}`, "success", rights ? "with_rights_record" : null);
    return Response.json({ contact, rights }, { status: 201, headers: NO_STORE });
  } catch (error) {
    return errorResponse(error, "outbound contacts");
  }
}

export async function GET(request: Request) {
  try {
    if (!enabled()) {
      return Response.json({ error: "Outbound is not enabled on this deployment." }, { status: 404, headers: NO_STORE });
    }
    const access = await resolveWorkspaceAccess(request, "view");
    const contactId = new URL(request.url).searchParams.get("id") ?? "";
    if (!contactId) return Response.json({ error: "id is required." }, { status: 400 });
    const store = new RtdbContactStore();
    const contact = await store.getContact(access.workspaceUid, contactId);
    if (!contact) return Response.json({ error: "Not found." }, { status: 404 });
    const rights = await store.getRightsForContact(access.workspaceUid, contactId);
    return Response.json({ contact, rights }, { headers: NO_STORE });
  } catch (error) {
    return errorResponse(error, "outbound contacts");
  }
}
