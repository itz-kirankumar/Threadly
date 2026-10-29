import { errorResponse, readJsonBody } from "@/lib/api-request";
import { inWorkspace, resolveWorkspaceAccess } from "@/lib/geo/team";
import { loadLeads, saveLead, loadCrmStats, appendLeadActivity } from "@/lib/crm/store";
import { syncLeadToAccounts } from "@/lib/crm/accounts-store";
import { optionalText, parseDealValue, parseDomain, parseEmail, parseStage, parseTags, parseUserSource, requiredText } from "@/lib/crm/lead-input";
import type { CrmLead } from "@/lib/crm/types";
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
    const body = (await readJsonBody(request, 64 * 1024)) as Record<string, unknown>;

    const stage = body.stage === undefined ? "new" : parseStage(body.stage);
    const now = new Date().toISOString();
    const lead: CrmLead = {
      id: `lead-${randomUUID().slice(0, 8)}`,
      name: requiredText(body.name, "the contact name", 120),
      email: parseEmail(body.email),
      company: requiredText(body.company, "the company name", 160),
      domain: parseDomain(body.domain),
      title: optionalText(body.title, "the job title", 120),
      phone: optionalText(body.phone, "the phone number", 40),
      stage,
      source: parseUserSource(body.source),
      // Fit scoring belongs to the outbound engine; a manually added lead has
      // no score until one is computed from evidence.
      score: 0,
      dealValue: parseDealValue(body.dealValue),
      notes: optionalText(body.notes, "the notes", 5000),
      tags: parseTags(body.tags),
      sequenceStep: 0,
      maxSequenceSteps: 3,
      nextFollowUpAt: null,
      lastContactedAt: null,
      createdAt: now,
      updatedAt: now,
    };

    const actor = access.identity.email || access.identity.name || access.identity.uid;
    await inWorkspace(access, async () => {
      await saveLead(lead);
      await syncLeadToAccounts(lead, actor);
      await appendLeadActivity({
        leadId: lead.id,
        type: "stage_change",
        title: "Lead created",
        detail: `Added at stage "${stage}".`,
        actor,
      });
    });

    return Response.json({ lead });
  } catch (error) {
    return errorResponse(error, "POST /api/crm/leads");
  }
}
