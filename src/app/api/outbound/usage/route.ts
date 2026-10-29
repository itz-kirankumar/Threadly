import { errorResponse } from "@/lib/api-request";
import { resolveWorkspaceAccess } from "@/lib/geo/team";
import { outboundAudienceDeny, outboundUidAllowed } from "@/lib/outbound/route-guard";
import { RtdbUsageStore } from "@/lib/outbound/rtdb-usage-store";
import { NO_STORE, outboundEnabled } from "@/lib/outbound/route-support";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

// Tenant usage totals. costMinorUnits sums only events with a verified price;
// events without one contribute zero and are listed so the gap is visible.
export async function GET(request: Request) {
  try {
    if (!outboundEnabled()) {
      return Response.json({ error: "Outbound is not enabled on this deployment." }, { status: 404, headers: NO_STORE });
    }
    const access = await resolveWorkspaceAccess(request, "view");
    if (!outboundUidAllowed(access.identity.uid)) return outboundAudienceDeny();
    const store = new RtdbUsageStore();
    const events = await store.listUsage(access.workspaceUid);
    const total = await store.sumCostMinorUnits(access.workspaceUid);
    const unpriced = events.filter((e) => e.costMinorUnits === null).length;
    return Response.json({
      totalCostMinorUnits: total,
      // true 0 vs unknown: when unpriced events exist the total is a lower
      // bound, not a total. Spend decisions must not key off an incomplete
      // total; dispatch denies when costComplete is false.
      costComplete: unpriced === 0,
      unpricedEvents: unpriced,
      events,
    }, { headers: NO_STORE });
  } catch (error) {
    return errorResponse(error, "outbound usage");
  }
}
