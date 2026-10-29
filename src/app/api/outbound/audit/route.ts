import { errorResponse, RequestError } from "@/lib/api-request";
import { resolveWorkspaceAccess } from "@/lib/geo/team";
import { outboundAudienceDeny, outboundUidAllowed } from "@/lib/outbound/route-guard";
import { RtdbAuditStore } from "@/lib/outbound/rtdb-audit-store";
import { csvCell, NO_STORE, outboundEnabled, recordAudit } from "@/lib/outbound/route-support";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const MAX_EVENTS = 5000;

function parseDate(value: string | null, label: string): string | null {
  if (!value) return null;
  const d = new Date(value);
  if (Number.isNaN(d.getTime())) throw new RequestError(`Enter a valid ${label} date.`, 400);
  return d.toISOString();
}

// Append-only audit export (PRD R28). Owner and admin only. Returns the
// tenant's events newest first, optionally within [from, to). The export
// itself is recorded as a new audit event after the read.
export async function GET(request: Request) {
  try {
    if (!outboundEnabled()) {
      return Response.json({ error: "Outbound is not enabled on this deployment." }, { status: 404, headers: NO_STORE });
    }
    const access = await resolveWorkspaceAccess(request, "manageTeam");
    if (!outboundUidAllowed(access.identity.uid)) return outboundAudienceDeny();

    const url = new URL(request.url);
    const format = url.searchParams.get("format") ?? "json";
    if (format !== "json" && format !== "csv") throw new RequestError("Format must be json or csv.", 400);
    const from = parseDate(url.searchParams.get("from"), "start");
    const to = parseDate(url.searchParams.get("to"), "end");
    if (from && to && from >= to) throw new RequestError("The start date must be before the end date.", 400);
    const limitParam = url.searchParams.get("limit");
    const limit = limitParam === null ? MAX_EVENTS : Number(limitParam);
    if (!Number.isInteger(limit) || limit < 1 || limit > MAX_EVENTS) {
      throw new RequestError(`Limit must be a whole number from 1 to ${MAX_EVENTS}.`, 400);
    }

    const tenantId = access.workspaceUid;
    const all = await new RtdbAuditStore().list(tenantId, Number.MAX_SAFE_INTEGER);
    const inWindow = all.filter((e) => (!from || e.at >= from) && (!to || e.at < to));
    const events = inWindow.slice(0, limit);
    const truncated = inWindow.length > events.length;
    const generatedAt = new Date().toISOString();

    await recordAudit(
      tenantId,
      access.identity.uid,
      "audit.exported",
      `tenant:${tenantId}`,
      "success",
      `format=${format} count=${events.length} truncated=${truncated}${from ? ` from=${from}` : ""}${to ? ` to=${to}` : ""}`
    );

    if (format === "csv") {
      const lines = ["event_id,at,actor,action,target,outcome,detail"];
      for (const e of events) {
        lines.push([e.eventId, e.at, e.actor, e.action, e.target, e.outcome, e.detail].map(csvCell).join(","));
      }
      return new Response(lines.join("\n") + "\n", {
        headers: {
          ...NO_STORE,
          "Content-Type": "text/csv; charset=utf-8",
          "Content-Disposition": `attachment; filename="threadly-audit-${generatedAt.slice(0, 10)}.csv"`,
          "X-Audit-Event-Count": String(events.length),
          "X-Audit-Truncated": String(truncated),
        },
      });
    }

    return Response.json(
      { tenantId, generatedAt, window: { from, to }, count: events.length, truncated, events },
      { headers: NO_STORE }
    );
  } catch (error) {
    return errorResponse(error, "outbound audit export");
  }
}
