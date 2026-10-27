import { errorResponse, readJsonBody } from "@/lib/api-request";
import { resolveWorkspaceAccess } from "@/lib/geo/team";
import { computeFitScore, DEFAULT_FIT_SCORE_CONFIG } from "@/lib/outbound/scoring";
import type { FitScoreConfig, TargetProfile } from "@/lib/outbound/scoring";
import { RtdbFitScoreStore } from "@/lib/outbound/rtdb-scoring-store";
import { RtdbContactStore } from "@/lib/outbound/rtdb-contact-store";
import { RtdbAccountStore, RtdbEvidenceStore } from "@/lib/outbound/rtdb-import-store";
import { auditEvent } from "@/lib/outbound/audit";
import { RtdbAuditStore } from "@/lib/outbound/rtdb-audit-store";
import { icpUsableAsTarget, resolveCurrentIcp, targetFromIcp } from "@/lib/outbound/icp";
import { RtdbIcpStore } from "@/lib/outbound/rtdb-icp-store";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const NO_STORE = { "Cache-Control": "no-store" } as const;

function enabled(): boolean {
  if (process.env.OUTBOUND_ENABLED !== "true") return false;
  return typeof process.env.OUTBOUND_DATA_ROOT === "string" && process.env.OUTBOUND_DATA_ROOT.length > 0;
}

// Evidence-based fit scores (PRD F04). POST recomputes a contact's score
// from its dated SourceEvidence under a caller-supplied target profile and
// score config version; every reason links evidence and missing evidence is
// reported as unknown, never zero. Scores inform review; nothing here gates
// planning or dispatch.

function cleanList(v: unknown): string[] | undefined {
  if (!Array.isArray(v)) return undefined;
  const out = v.filter((x): x is string => typeof x === "string").map((x) => x.trim()).filter((x) => x.length > 0);
  return out.length > 0 ? out.slice(0, 50) : undefined;
}

function parseConfig(body: Record<string, unknown>): FitScoreConfig {
  const c = (body.config ?? {}) as Record<string, unknown>;
  const version = typeof c.version === "string" && c.version.trim().length > 0 ? c.version.trim().slice(0, 64) : DEFAULT_FIT_SCORE_CONFIG.version;
  const half = typeof c.freshnessHalfLifeDays === "number" && c.freshnessHalfLifeDays > 0 && c.freshnessHalfLifeDays <= 3650 ? c.freshnessHalfLifeDays : DEFAULT_FIT_SCORE_CONFIG.freshnessHalfLifeDays;
  const w = (c.weights ?? {}) as Record<string, unknown>;
  const weight = (k: "role" | "region" | "size" | "sector", d: number) =>
    typeof w[k] === "number" && (w[k] as number) >= 0 && (w[k] as number) <= 100 ? (w[k] as number) : d;
  return {
    version,
    freshnessHalfLifeDays: half,
    weights: {
      role: weight("role", DEFAULT_FIT_SCORE_CONFIG.weights.role),
      region: weight("region", DEFAULT_FIT_SCORE_CONFIG.weights.region),
      size: weight("size", DEFAULT_FIT_SCORE_CONFIG.weights.size),
      sector: weight("sector", DEFAULT_FIT_SCORE_CONFIG.weights.sector),
    },
  };
}

export async function GET(request: Request) {
  try {
    if (!enabled()) {
      return Response.json({ error: "Outbound is not enabled on this deployment." }, { status: 404, headers: NO_STORE });
    }
    const access = await resolveWorkspaceAccess(request, "view");
    const contactId = new URL(request.url).searchParams.get("contactId");
    const store = new RtdbFitScoreStore();
    const scores = contactId ? await store.listForContact(access.workspaceUid, contactId) : await store.list(access.workspaceUid);
    return Response.json({ scores: scores.slice(0, 200) }, { headers: NO_STORE });
  } catch (error) {
    return errorResponse(error, "outbound fit-scores");
  }
}

export async function POST(request: Request) {
  try {
    if (!enabled()) {
      return Response.json({ error: "Outbound is not enabled on this deployment." }, { status: 404, headers: NO_STORE });
    }
    const access = await resolveWorkspaceAccess(request, "manageTeam");
    if (access.role !== "owner" && access.role !== "admin") {
      return Response.json({ error: "Only workspace admins can compute fit scores." }, { status: 403, headers: NO_STORE });
    }
    const body = (await readJsonBody(request, 16 * 1024)) as Record<string, unknown>;
    const contactId = typeof body.contactId === "string" ? body.contactId.trim() : "";
    if (!contactId) {
      return Response.json({ error: "contactId is required." }, { status: 400, headers: NO_STORE });
    }
    let target: TargetProfile;
    let targetSource: { kind: "request" | "icp"; icpVersionId?: string; icpVersion?: number } = { kind: "request" };
    const icpRef = typeof body.icpVersionId === "string" ? body.icpVersionId.trim() : "";
    if (icpRef) {
      // Target from an F01 ICP version: "current" resolves via the pointer
      // only (fail closed); an explicit id must have been successfully
      // ACTIVATED (activatedAt set) - confirmed-but-never-activated is not
      // usable, superseded history is.
      const icpStore = new RtdbIcpStore();
      const icp = icpRef === "current"
        ? await resolveCurrentIcp(icpStore, access.workspaceUid)
        : await icpStore.get(access.workspaceUid, icpRef);
      if (!icp || !icpUsableAsTarget(icp)) {
        return Response.json({ error: "No activated ICP version found for the given reference." }, { status: 404, headers: NO_STORE });
      }
      target = targetFromIcp(icp);
      targetSource = { kind: "icp", icpVersionId: icp.icpVersionId, icpVersion: icp.version };
    } else {
      const t = (body.target ?? {}) as Record<string, unknown>;
      target = {
        roles: cleanList(t.roles),
        regions: cleanList(t.regions),
        employeeBands: cleanList(t.employeeBands),
        sectors: cleanList(t.sectors),
      };
    }
    if (!target.roles && !target.regions && !target.employeeBands && !target.sectors) {
      return Response.json({ error: "target (or a confirmed ICP) must define at least one criterion." }, { status: 400, headers: NO_STORE });
    }
    const contact = await new RtdbContactStore().getContact(access.workspaceUid, contactId);
    if (!contact) {
      return Response.json({ error: "Contact not found." }, { status: 404, headers: NO_STORE });
    }
    const account = await new RtdbAccountStore().getAccount(access.workspaceUid, contact.accountId);
    const evidence = (await new RtdbEvidenceStore().listEvidence(access.workspaceUid)).filter(
      (e) => e.contactId === contactId || e.accountId === contact.accountId,
    );
    const config = parseConfig(body);
    const result = computeFitScore({ contact, account, evidence, target, config, now: new Date(), actor: access.identity.uid });
    result.targetSource = targetSource;
    await new RtdbFitScoreStore().save(result);
    await new RtdbAuditStore().append(
      auditEvent({
        tenantId: access.workspaceUid,
        actor: access.identity.uid,
        action: "fitscore.computed",
        target: `contact:${contactId}`,
        outcome: "success",
        detail: `score=${result.score === null ? "unknown" : result.score} version=${result.scoreVersion} known=${result.coverage.known}/${result.coverage.total}`,
      }),
    );
    return Response.json(result, { headers: NO_STORE });
  } catch (error) {
    return errorResponse(error, "outbound fit-scores");
  }
}
