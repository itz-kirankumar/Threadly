import { errorResponse, readJsonBody } from "@/lib/api-request";
import { resolveWorkspaceAccess } from "@/lib/geo/team";
import { outboundAudienceDeny, outboundUidAllowed } from "@/lib/outbound/route-guard";
import { commitImport, mapRows, parseCsv, type CsvMapping } from "@/lib/outbound/csv-import";
import { requireLicensedSource } from "@/lib/outbound/discovery";
import { RtdbLicensedSourceStore } from "@/lib/outbound/rtdb-source-store";
import { RtdbContactStore } from "@/lib/outbound/rtdb-contact-store";
import { RtdbAccountStore, RtdbEvidenceStore } from "@/lib/outbound/rtdb-import-store";
import { NO_STORE, outboundEnabled, recordAudit } from "@/lib/outbound/route-support";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const MAX_CSV_BYTES = 512 * 1024;

// CSV import (PRD F02): action "preview" parses + validates without writing;
// action "commit" writes contacts with source evidence and rights records.
// Commit without rightsConfirmed=true is blocked as an unlicensed source.

export async function POST(request: Request) {
  try {
    if (!outboundEnabled()) {
      return Response.json({ error: "Outbound is not enabled on this deployment." }, { status: 404, headers: NO_STORE });
    }
    const access = await resolveWorkspaceAccess(request, "manageTeam");
    if (!outboundUidAllowed(access.identity.uid)) return outboundAudienceDeny();
    if (access.role !== "owner" && access.role !== "admin") {
      return Response.json({ error: "Only workspace admins can import." }, { status: 403, headers: NO_STORE });
    }
    const body = (await readJsonBody(request, MAX_CSV_BYTES + 16 * 1024)) as Record<string, unknown>;
    const action = typeof body.action === "string" ? body.action : "preview";
    const csv = typeof body.csv === "string" ? body.csv : "";
    if (!csv) return Response.json({ error: "csv is required." }, { status: 400 });
    if (Buffer.byteLength(csv, "utf8") > MAX_CSV_BYTES) {
      return Response.json({ error: "csv exceeds the 512KB limit." }, { status: 413 });
    }
    const mapping = body.mapping as CsvMapping | undefined;
    if (!mapping || typeof mapping.email !== "string" || typeof mapping.fullName !== "string" || typeof mapping.accountName !== "string" || typeof mapping.accountDomain !== "string") {
      return Response.json({ error: "mapping with email, fullName, accountName and accountDomain column names is required." }, { status: 400 });
    }
    const { valid, invalid } = mapRows(parseCsv(csv), mapping);
    if (action === "preview") {
      return Response.json({ validCount: valid.length, invalidCount: invalid.length, invalid: invalid.slice(0, 50), sample: valid.slice(0, 10) }, { headers: NO_STORE });
    }
    if (action === "commit") {
      const sourceName = typeof body.sourceName === "string" && body.sourceName.trim() ? body.sourceName.trim() : "";
      if (!sourceName) return Response.json({ error: "sourceName is required for commit." }, { status: 400 });
      const acquiredAt = typeof body.acquiredAt === "string" && !Number.isNaN(Date.parse(body.acquiredAt)) ? new Date(body.acquiredAt).toISOString() : "";
      if (!acquiredAt) return Response.json({ error: "acquiredAt (ISO date) is required for commit." }, { status: 400 });
      if (body.rightsConfirmed !== true) {
        return Response.json(
          { error: "Unlicensed source blocked: confirm rightsConfirmed=true only if this source permits B2B marketing use of these contacts." },
          { status: 400, headers: NO_STORE }
        );
      }
      const subscriberClass = body.subscriberClass === "corporate" || body.subscriberClass === "individual" ? body.subscriberClass : "unknown";
      // Rows sourced from a licensed discovery API must name a registered,
      // permitting, unrevoked source; anything else is blocked (PRD F02).
      let licensedSource: { sourceName: string; sourceId: string } | undefined;
      if (body.sourceKind === "licensed_api") {
        const sources = await new RtdbLicensedSourceStore().list(access.workspaceUid);
        licensedSource = requireLicensedSource(sources, access.workspaceUid, sourceName);
      }
      const result = await commitImport(
        {
          accounts: new RtdbAccountStore(),
          contacts: new RtdbContactStore(),
          evidence: new RtdbEvidenceStore(),
          rights: new RtdbContactStore(),
          domainAssignments: new RtdbAccountStore(),
        },
        {
          tenantId: access.workspaceUid,
          rows: valid,
          invalid,
          sourceName,
          acquiredAt,
          rightsConfirmed: true,
          subscriberClass,
          country: typeof body.country === "string" ? body.country : null,
          actor: access.identity.uid,
          now: new Date(),
          ...(licensedSource ? { licensedSource: { sourceName: licensedSource.sourceName, sourceId: licensedSource.sourceId } } : {}),
        }
      );
      await recordAudit(access.workspaceUid, access.identity.uid, "import.committed", `import:${result.importId ?? sourceName}`, "success", `created=${result.created} reconciled=${result.reconciled} invalid=${result.invalid.length}`);
      return Response.json(result, { status: 201, headers: NO_STORE });
    }
    return Response.json({ error: "Unknown action." }, { status: 400 });
  } catch (error) {
    return errorResponse(error, "outbound import");
  }
}
