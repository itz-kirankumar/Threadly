import { errorResponse, readJsonBody, RequestError } from "@/lib/api-request";
import { inWorkspace, resolveWorkspaceAccess } from "@/lib/geo/team";
import { loadLeads, saveLead, loadCrmStats, appendLeadActivity } from "@/lib/crm/store";
import { syncLeadToAccounts } from "@/lib/crm/accounts-store";
import type { CrmLead, LeadStage, LeadSource } from "@/lib/crm/types";
import { randomUUID } from "node:crypto";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET(request: Request) {
  try {
    const access = await resolveWorkspaceAccess(request, "view");
    const [leads, stats] = await inWorkspace(access, async () => {
      return Promise.all([loadLeads(), loadCrmStats()]);
    });
    return Response.json({ leads, stats });
  } catch (error) {
    return errorResponse(error, "GET /api/crm/leads");
  }
}

export async function POST(request: Request) {
  try {
    const access = await resolveWorkspaceAccess(request, "runScans");
    const body = (await readJsonBody(request, 128 * 1024)) as Record<string, unknown>;

    const name = typeof body.name === "string" && body.name.trim() ? body.name.trim() : "Prospect Lead";
    const email = typeof body.email === "string" ? body.email.trim().toLowerCase() : "";
    const company = typeof body.company === "string" && body.company.trim() ? body.company.trim() : "Target Company";
    const domain = typeof body.domain === "string" ? body.domain.trim().toLowerCase().replace(/^https?:\/\//, "").replace(/\/.*$/, "") : "example.com";
    const stage = (typeof body.stage === "string" ? body.stage : "new") as LeadStage;
    const source = (typeof body.source === "string" ? body.source : "manual") as LeadSource;
    const dealValue = typeof body.dealValue === "number" ? body.dealValue : undefined;
    const notes = typeof body.notes === "string" ? body.notes : undefined;
    const tags = Array.isArray(body.tags) ? (body.tags as string[]) : [];

    const lead: CrmLead = {
      id: `lead-${randomUUID().slice(0, 8)}`,
      name,
      email,
      company,
      domain,
      title: typeof body.title === "string" ? body.title : undefined,
      phone: typeof body.phone === "string" ? body.phone : undefined,
      stage,
      source,
      score: typeof body.score === "number" ? body.score : 60,
      dealValue,
      notes,
      tags,
      sequenceStep: 0,
      maxSequenceSteps: 4,
      nextFollowUpAt: null,
      lastContactedAt: null,
      geoGap: typeof body.geoGap === "object" && body.geoGap ? (body.geoGap as any) : undefined,
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
    };

    await inWorkspace(access, async () => {
      await saveLead(lead);
      await syncLeadToAccounts(lead, access.identity.email || access.identity.name || "User");
      await appendLeadActivity({
        leadId: lead.id,
        type: "stage_change",
        title: "Lead Created",
        detail: `Added to CRM pipeline at stage "${stage}".`,
        actor: access.identity.name || "User",
      });
    });

    return Response.json({ lead });
  } catch (error) {
    return errorResponse(error, "POST /api/crm/leads");
  }
}
