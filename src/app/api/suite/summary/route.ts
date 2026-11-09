import { errorResponse } from "@/lib/api-request";
import { inWorkspace, resolveWorkspaceAccess } from "@/lib/geo/team";
import { loadLeads } from "@/lib/crm/store";
import { loadDeals } from "@/lib/crm/accounts-store";
import { loadState } from "@/lib/prospecting/store";
import { buildSummary } from "@/lib/suite/summary";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

// What is waiting in each sales app, for the badges in the side rail. Each
// store is read on its own; one that fails just shows no badge.
export async function GET(request: Request) {
  try {
    const access = await resolveWorkspaceAccess(request, "view");
    const summary = await inWorkspace(access, async () => {
      const safe = async <T,>(load: () => Promise<T>): Promise<T | null> => {
        try {
          return await load();
        } catch {
          return null;
        }
      };
      const [leads, deals, prospecting] = await Promise.all([safe(loadLeads), safe(loadDeals), safe(loadState)]);
      return buildSummary({
        leads,
        deals,
        prospecting: prospecting ? { selected: (prospecting.companies?.items ?? []).filter((c) => c.selected).map((c) => c.domain) } : null,
        questions: null,
        runs: null,
      });
    });
    return Response.json(summary, { headers: { "Cache-Control": "no-store" } });
  } catch (error) {
    return errorResponse(error, "GET /api/suite/summary");
  }
}
