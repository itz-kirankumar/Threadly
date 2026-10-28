import { errorResponse, readJsonBody } from "@/lib/api-request";
import { resolveWorkspaceAccess } from "@/lib/geo/team";
import { outboundAudienceDeny, outboundUidAllowed } from "@/lib/outbound/route-guard";
import { validateActivation, validateExperiment } from "@/lib/outbound/experiments";
import { RtdbExperimentStore } from "@/lib/outbound/rtdb-experiment-store";
import type { Experiment, ExperimentVariant } from "@/lib/outbound/types";
import { auditEvent } from "@/lib/outbound/audit";
import { RtdbAuditStore } from "@/lib/outbound/rtdb-audit-store";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const NO_STORE = { "Cache-Control": "no-store" } as const;

function enabled(): boolean {
  if (process.env.OUTBOUND_ENABLED !== "true") return false;
  return typeof process.env.OUTBOUND_DATA_ROOT === "string" && process.env.OUTBOUND_DATA_ROOT.length > 0;
}

// Experiments (PRD F10). Creating an ACTIVE experiment requires
// variantsApproved: true, which records the caller as the approver of every
// variant's templates. Assignment is deterministic per contact; holdouts
// are never planned.

async function audit(tenantId: string, actor: string, action: string, target: string, outcome: "success" | "denied" | "error", detail: string | null = null): Promise<void> {
  await new RtdbAuditStore().append(auditEvent({ tenantId, actor, action, target, outcome, detail }));
}

export async function POST(request: Request) {
  try {
    if (!enabled()) {
      return Response.json({ error: "Outbound is not enabled on this deployment." }, { status: 404, headers: NO_STORE });
    }
    const access = await resolveWorkspaceAccess(request, "manageTeam");
    if (!outboundUidAllowed(access.identity.uid)) return outboundAudienceDeny();
    if (access.role !== "owner" && access.role !== "admin") {
      return Response.json({ error: "Only workspace admins can manage experiments." }, { status: 403, headers: NO_STORE });
    }
    const body = (await readJsonBody(request, 64 * 1024)) as Record<string, unknown>;

    if (body.action === "activate") {
      // Deliberate two-step activation: the activating admin's identity is
      // recorded as the variant approver. Atomic draft -> active via CAS.
      const experimentId = typeof body.experimentId === "string" ? body.experimentId : "";
      if (!experimentId) return Response.json({ error: "experimentId is required." }, { status: 400, headers: NO_STORE });
      const store = new RtdbExperimentStore();
      const experiment = await store.getExperiment(access.workspaceUid, experimentId);
      if (!experiment) return Response.json({ error: "Experiment not found." }, { status: 404, headers: NO_STORE });
      const existingActive = await store.getActiveExperiment(access.workspaceUid, experiment.campaignId, experiment.campaignVersion);
      const errors = validateActivation(experiment, existingActive);
      if (errors.length) {
        return Response.json({ error: `Cannot activate: ${errors.join(", ")}` }, { status: 400, headers: NO_STORE });
      }
      // Atomic guard at campaign+version scope: a pointer record is claimed
      // before the status transition, so racing activations of two DIFFERENT
      // drafts (separate requests or tabs) cannot both pass.
      const result = await store.activateExperiment(experiment, access.identity.uid);
      if (result === "another_active") {
        return Response.json({ error: "Cannot activate: another_active_experiment" }, { status: 400, headers: NO_STORE });
      }
      if (result !== "activated") {
        return Response.json({ error: "Activation conflict: the experiment changed concurrently; reload and retry." }, { status: 409, headers: NO_STORE });
      }
      await audit(access.workspaceUid, access.identity.uid, "experiment.activated", `experiment:${experimentId}`, "success", `campaign=${experiment.campaignId} v${experiment.campaignVersion}`);
      const fresh = await store.getExperiment(access.workspaceUid, experimentId);
      return Response.json({ experiment: fresh }, { status: 200, headers: NO_STORE });
    }

    if (body.action === "end") {
      // active -> ended: future planning stops assigning it; contacts already
      // assigned keep their stable bucket. Releases the activation pointer.
      const experimentId = typeof body.experimentId === "string" ? body.experimentId : "";
      if (!experimentId) return Response.json({ error: "experimentId is required." }, { status: 400, headers: NO_STORE });
      const store = new RtdbExperimentStore();
      const experiment = await store.getExperiment(access.workspaceUid, experimentId);
      if (!experiment) return Response.json({ error: "Experiment not found." }, { status: 404, headers: NO_STORE });
      const ended = await store.endExperiment(experiment);
      if (!ended) {
        return Response.json({ error: "Only an active experiment can be ended." }, { status: 400, headers: NO_STORE });
      }
      await audit(access.workspaceUid, access.identity.uid, "experiment.ended", `experiment:${experimentId}`, "success", `campaign=${experiment.campaignId} v${experiment.campaignVersion}`);
      const fresh = await store.getExperiment(access.workspaceUid, experimentId);
      return Response.json({ experiment: fresh }, { status: 200, headers: NO_STORE });
    }

    const campaignId = typeof body.campaignId === "string" ? body.campaignId : "";
    const campaignVersion = typeof body.campaignVersion === "number" ? body.campaignVersion : 0;
    if (!campaignId || !campaignVersion) return Response.json({ error: "campaignId and campaignVersion are required." }, { status: 400 });
    const variants: ExperimentVariant[] = Array.isArray(body.variants)
      ? (body.variants as Record<string, unknown>[])
          .filter((v) => typeof v.key === "string" && Array.isArray(v.templates))
          .map((v) => ({
            key: v.key as string,
            templates: (v.templates as Record<string, unknown>[]).map((t) => ({
              step: typeof t.step === "number" ? t.step : 1,
              subject: typeof t.subject === "string" ? t.subject : "",
              body: typeof t.body === "string" ? t.body : "",
            })),
          }))
      : [];
    const now = new Date().toISOString();
    const experiment: Experiment = {
      tenantId: access.workspaceUid,
      experimentId: `exp_${crypto.randomUUID()}`,
      campaignId,
      campaignVersion,
      variants,
      holdoutPercent: typeof body.holdoutPercent === "number" ? body.holdoutPercent : 0,
      status: body.status === "active" ? "active" : "draft",
      variantsApprovedBy: body.variantsApproved === true ? access.identity.uid : null,
      createdAt: now,
      createdBy: access.identity.uid,
    };
    const errors = validateExperiment(experiment);
    if (errors.length) {
      return Response.json({ error: `Invalid experiment: ${errors.join(", ")}` }, { status: 400, headers: NO_STORE });
    }
    await new RtdbExperimentStore().saveExperiment(experiment);
    await audit(access.workspaceUid, access.identity.uid, "experiment.created", `experiment:${experiment.experimentId}`, "success", `campaign=${campaignId} holdout=${experiment.holdoutPercent ?? "n/a"}`);
    return Response.json({ experiment }, { status: 201, headers: NO_STORE });
  } catch (error) {
    return errorResponse(error, "outbound experiments");
  }
}

export async function GET(request: Request) {
  try {
    if (!enabled()) {
      return Response.json({ error: "Outbound is not enabled on this deployment." }, { status: 404, headers: NO_STORE });
    }
    const access = await resolveWorkspaceAccess(request, "view");
    if (!outboundUidAllowed(access.identity.uid)) return outboundAudienceDeny();
    const campaignId = new URL(request.url).searchParams.get("campaignId") ?? "";
    const experiments = await new RtdbExperimentStore().listExperiments(access.workspaceUid, campaignId);
    return Response.json({ experiments }, { headers: NO_STORE });
  } catch (error) {
    return errorResponse(error, "outbound experiments");
  }
}
