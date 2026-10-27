import { errorResponse } from "@/lib/api-request";
import { resolveWorkspaceAccess } from "@/lib/geo/team";
import { RtdbUsageStore } from "@/lib/outbound/rtdb-usage-store";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const NO_STORE = { "Cache-Control": "no-store" } as const;

function enabled(): boolean {
  if (process.env.OUTBOUND_ENABLED !== "true") return false;
  return typeof process.env.OUTBOUND_DATA_ROOT === "string" && process.env.OUTBOUND_DATA_ROOT.length > 0;
}

// Tenant usage totals. costMinorUnits sums only events with a verified price;
// events without one contribute zero and are listed so the gap is visible.
export async function GET(request: Request) {
  try {
    if (!enabled()) {
      return Response.json({ error: "Outbound is not enabled on this deployment." }, { status: 404, headers: NO_STORE });
    }
    const access = await resolveWorkspaceAccess(request, "view");
    const store = new RtdbUsageStore();
    const events = await store.listUsage(access.workspaceUid);
    const total = await store.sumCostMinorUnits(access.workspaceUid);
    return Response.json({
      totalCostMinorUnits: total,
      unpricedEvents: events.filter((e) => e.costMinorUnits === null).length,
      events,
    }, { headers: NO_STORE });
  } catch (error) {
    return errorResponse(error, "outbound usage");
  }
}
