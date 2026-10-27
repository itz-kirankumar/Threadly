import { errorResponse, readJsonBody } from "@/lib/api-request";
import { resolveWorkspaceAccess } from "@/lib/geo/team";
import { validateExperiment } from "@/lib/outbound/experiments";
import { RtdbExperimentStore } from "@/lib/outbound/rtdb-experiment-store";
import type { Experiment, ExperimentVariant } from "@/lib/outbound/types";

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
export async function POST(request: Request) {
  try {
    if (!enabled()) {
      return Response.json({ error: "Outbound is not enabled on this deployment." }, { status: 404, headers: NO_STORE });
    }
    const access = await resolveWorkspaceAccess(request, "manageTeam");
    if (access.role !== "owner" && access.role !== "admin") {
      return Response.json({ error: "Only workspace admins can manage experiments." }, { status: 403, headers: NO_STORE });
    }
    const body = (await readJsonBody(request, 64 * 1024)) as Record<string, unknown>;
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
    const campaignId = new URL(request.url).searchParams.get("campaignId") ?? "";
    const experiments = await new RtdbExperimentStore().listExperiments(access.workspaceUid, campaignId);
    return Response.json({ experiments }, { headers: NO_STORE });
  } catch (error) {
    return errorResponse(error, "outbound experiments");
  }
}
