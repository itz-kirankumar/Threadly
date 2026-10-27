import { errorResponse, readJsonBody, RequestError } from "@/lib/api-request";
import { inWorkspace, resolveWorkspaceAccess } from "@/lib/geo/team";
import { loadLead, saveLead, deleteLead, loadLeadActivities, appendLeadActivity } from "@/lib/crm/store";
import type { LeadStage } from "@/lib/crm/types";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET(request: Request, context: { params: Promise<{ id: string }> }) {
  try {
    const { id } = await context.params;
    const access = await resolveWorkspaceAccess(request, "view");
    const data = await inWorkspace(access, async () => {
      const lead = await loadLead(id);
      if (!lead) throw new RequestError("Lead not found", 404);
      const activities = await loadLeadActivities(id);
      return { lead, activities };
    });
    return Response.json(data);
  } catch (error) {
    return errorResponse(error, "GET /api/crm/leads/[id]");
  }
}

export async function PATCH(request: Request, context: { params: Promise<{ id: string }> }) {
  try {
    const { id } = await context.params;
    const access = await resolveWorkspaceAccess(request, "runScans");
    const body = (await readJsonBody(request, 64 * 1024)) as Record<string, unknown>;

    const updated = await inWorkspace(access, async () => {
      const lead = await loadLead(id);
      if (!lead) throw new RequestError("Lead not found", 404);

      const oldStage = lead.stage;
      if (typeof body.stage === "string" && body.stage !== oldStage) {
        lead.stage = body.stage as LeadStage;
        await appendLeadActivity({
          leadId: lead.id,
          type: "stage_change",
          title: `Stage Changed: ${oldStage} -> ${lead.stage}`,
          detail: `Pipeline status updated.`,
          actor: access.identity.name || "User",
        });
      }

      if (typeof body.name === "string") lead.name = body.name.trim();
      if (typeof body.email === "string") lead.email = body.email.trim();
      if (typeof body.company === "string") lead.company = body.company.trim();
      if (typeof body.title === "string") lead.title = body.title.trim();
      if (typeof body.notes === "string") {
        lead.notes = body.notes;
        if (body.addNoteActivity) {
          await appendLeadActivity({
            leadId: lead.id,
            type: "note",
            title: "Note Added",
            detail: body.notes.slice(0, 200),
            actor: access.identity.name || "User",
          });
        }
      }
      if (typeof body.dealValue === "number") lead.dealValue = body.dealValue;
      if (typeof body.nextFollowUpAt === "string" || body.nextFollowUpAt === null) {
        lead.nextFollowUpAt = body.nextFollowUpAt;
      }

      lead.updatedAt = new Date().toISOString();
      await saveLead(lead);
      return lead;
    });

    return Response.json({ lead: updated });
  } catch (error) {
    return errorResponse(error, "GET /api/crm/leads/[id]");
  }
}

export async function DELETE(request: Request, context: { params: Promise<{ id: string }> }) {
  try {
    const { id } = await context.params;
    const access = await resolveWorkspaceAccess(request, "runScans");
    await inWorkspace(access, async () => {
      await deleteLead(id);
    });
    return Response.json({ success: true });
  } catch (error) {
    return errorResponse(error, "GET /api/crm/leads/[id]");
  }
}
