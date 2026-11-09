import { errorResponse } from "@/lib/api-request";
import { inWorkspace, resolveWorkspaceAccess } from "@/lib/geo/team";
import { loadLeads } from "@/lib/crm/store";
import { loadCrmAccountsState } from "@/lib/crm/accounts-store";
import { loadState } from "@/lib/prospecting/store";
import { loadQueries } from "@/lib/geo/store";
import { recordsFrom, searchRecords } from "@/lib/suite/search";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

// One search across the workspace: leads, CRM records, prospecting finds and
// buyer questions. Each source fails on its own, so one unreadable store
// never hides results from the others.
export async function GET(request: Request) {
  try {
    const q = (new URL(request.url).searchParams.get("q") ?? "").slice(0, 120);
    if (!q.trim()) return Response.json({ hits: [] });
    const access = await resolveWorkspaceAccess(request, "view");
    const hits = await inWorkspace(access, async () => {
      const safe = async <T,>(load: () => Promise<T>): Promise<T | null> => {
        try {
          return await load();
        } catch {
          return null;
        }
      };
      const [leads, accounts, prospecting, queries] = await Promise.all([
        safe(loadLeads),
        safe(loadCrmAccountsState),
        safe(loadState),
        safe(loadQueries),
      ]);
      const records = recordsFrom({
        leads: leads ?? [],
        companies: accounts?.companies ?? [],
        contacts: accounts?.contacts ?? [],
        deals: accounts?.deals ?? [],
        prospects: (prospecting?.companies?.items ?? []).map((c) => ({ domain: c.domain, name: c.name, description: c.description })),
        people: (prospecting?.contacts?.items ?? []).map((c) => ({ name: c.name, title: c.title, companyDomain: c.companyDomain })),
        questions: (queries ?? []).map((item) => ({ id: item.id, text: item.text })),
      });
      return searchRecords(q, records, 24);
    });
    return Response.json({ hits }, { headers: { "Cache-Control": "no-store" } });
  } catch (error) {
    return errorResponse(error, "GET /api/search");
  }
}
