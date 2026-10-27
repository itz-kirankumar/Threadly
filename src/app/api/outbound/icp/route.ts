import { errorResponse, readJsonBody } from "@/lib/api-request";
import { resolveWorkspaceAccess } from "@/lib/geo/team";
import { confirmIcp, createIcpDraft, currentIcp, nextVersionNumber } from "@/lib/outbound/icp";
import { RtdbIcpStore } from "@/lib/outbound/rtdb-icp-store";
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

// Versioned ICP (PRD F01). POST action=create stores a DRAFT version -
// manual or url_derived, never active. POST action=confirm is the explicit
// human approval that activates a draft and supersedes the prior confirmed
// version. URL-derived text is never approved automatically.

export async function GET(request: Request) {
  try {
    if (!enabled()) {
      return Response.json({ error: "Outbound is not enabled on this deployment." }, { status: 404, headers: NO_STORE });
    }
    const access = await resolveWorkspaceAccess(request, "view");
    const icpStore = new RtdbIcpStore();
    const versions = await icpStore.list(access.workspaceUid);
    // Pointer is authoritative for "current"; currentIcp is the read
    // fallback only when no pointer exists yet.
    const pointerId = await icpStore.getCurrentId(access.workspaceUid);
    const pointed = pointerId ? versions.find((v) => v.icpVersionId === pointerId && v.status === "confirmed") ?? null : null;
    return Response.json({ current: pointed ?? currentIcp(versions), versions: versions.slice(0, 100) }, { headers: NO_STORE });
  } catch (error) {
    return errorResponse(error, "outbound icp");
  }
}

export async function POST(request: Request) {
  try {
    if (!enabled()) {
      return Response.json({ error: "Outbound is not enabled on this deployment." }, { status: 404, headers: NO_STORE });
    }
    const access = await resolveWorkspaceAccess(request, "manageTeam");
    if (access.role !== "owner" && access.role !== "admin") {
      return Response.json({ error: "Only workspace admins can manage the ICP." }, { status: 403, headers: NO_STORE });
    }
    const body = (await readJsonBody(request, 16 * 1024)) as Record<string, unknown>;
    const store = new RtdbIcpStore();

    if (body.action === "create") {
      const src = (body.source ?? {}) as Record<string, unknown>;
      const source = src.kind === "url_derived" && typeof src.url === "string" && src.url.trim().length > 0
        ? { kind: "url_derived" as const, url: src.url.trim().slice(0, 500) }
        : { kind: "manual" as const };
      const versions = await store.list(access.workspaceUid);
      const draft = createIcpDraft(
        {
          tenantId: access.workspaceUid,
          actor: access.identity.uid,
          now: new Date(),
          sectors: body.sectors,
          roles: body.roles,
          employeeBands: body.employeeBands,
          regions: body.regions,
          exclusions: body.exclusions,
          approvedClaims: body.approvedClaims,
          source,
        },
        nextVersionNumber(versions),
      );
      await store.save(draft);
      await audit(access.workspaceUid, access.identity.uid, "icp.draft_created", `icp:${draft.icpVersionId}`, "success", `version=${draft.version} source=${draft.source.kind}`);
      return Response.json(draft, { headers: NO_STORE });
    }

    if (body.action === "confirm") {
      const icpVersionId = typeof body.icpVersionId === "string" ? body.icpVersionId.trim() : "";
      if (!icpVersionId) {
        return Response.json({ error: "icpVersionId is required." }, { status: 400, headers: NO_STORE });
      }
      const outcome = await confirmIcp(store, access.workspaceUid, icpVersionId, access.identity.uid, new Date());
      if (!outcome.ok) {
        const messages = {
          not_found: "ICP version not found.",
          not_draft: "Only a draft ICP version can be confirmed.",
          record_race: "ICP version changed concurrently; reload and retry.",
          pointer_race: "Another ICP version was confirmed concurrently; reload and retry.",
        } as const;
        if (outcome.reason === "pointer_race") {
          await audit(access.workspaceUid, access.identity.uid, "icp.confirm_conflict", `icp:${icpVersionId}`, "denied", "lost tenant current-pointer race; record superseded");
        }
        return Response.json({ error: messages[outcome.reason] }, { status: outcome.reason === "not_found" ? 404 : 409, headers: NO_STORE });
      }
      await audit(access.workspaceUid, access.identity.uid, "icp.confirmed", `icp:${icpVersionId}`, "success", `version=${outcome.confirmed.version} superseded=${outcome.superseded.length} source=${outcome.confirmed.source.kind}`);
      return Response.json(outcome.confirmed, { headers: NO_STORE });
    }

    return Response.json({ error: "action must be create or confirm." }, { status: 400, headers: NO_STORE });
  } catch (error) {
    return errorResponse(error, "outbound icp");
  }
}
