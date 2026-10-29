import { errorResponse, readJsonBody, RequestError } from "@/lib/api-request";
import { inWorkspace, resolveWorkspaceAccess } from "@/lib/geo/team";
import { loadLead, saveLead, deleteLead, loadLeadActivities, appendLeadActivity } from "@/lib/crm/store";
import { optionalText, parseDealValue, parseEmail, parseLeadId, parseStage, requiredText } from "@/lib/crm/lead-input";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET(request: Request, context: { params: Promise<{ id: string }> }) {
  try {
    const id = parseLeadId((await context.params).id);
    const access = await resolveWorkspaceAccess(request, "view");
    const data = await inWorkspace(access, async () => {
      const lead = await loadLead(id);
      if (!lead) throw new RequestError("Lead not found.", 404);
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
    const id = parseLeadId((await context.params).id);
    const access = await resolveWorkspaceAccess(request, "runScans");
    const body = (await readJsonBody(request, 64 * 1024)) as Record<string, unknown>;
    const actor = access.identity.email || access.identity.name || access.identity.uid;

    // Validate everything before the first write.
    const stage = body.stage === undefined ? undefined : parseStage(body.stage);
    const name = body.name === undefined ? undefined : requiredText(body.name, "the contact name", 120);
    const email = body.email === undefined ? undefined : parseEmail(body.email);
    const company = body.company === undefined ? undefined : requiredText(body.company, "the company name", 160);
    const title = body.title === undefined ? undefined : optionalText(body.title, "the job title", 120) ?? "";
    const notes = body.notes === undefined ? undefined : optionalText(body.notes, "the notes", 5000) ?? "";
    const dealValue = body.dealValue === undefined ? undefined : parseDealValue(body.dealValue);
    let nextFollowUpAt: string | null | undefined;
    if (body.nextFollowUpAt === null) nextFollowUpAt = null;
    else if (body.nextFollowUpAt !== undefined) {
      const at = typeof body.nextFollowUpAt === "string" ? new Date(body.nextFollowUpAt) : null;
      if (!at || Number.isNaN(at.getTime())) throw new RequestError("Enter a valid follow-up date.", 400);
      nextFollowUpAt = at.toISOString();
    }

    const updated = await inWorkspace(access, async () => {
      const lead = await loadLead(id);
      if (!lead) throw new RequestError("Lead not found.", 404);

      if (stage && stage !== lead.stage) {
        await appendLeadActivity({
          leadId: lead.id,
          type: "stage_change",
          title: `Stage changed: ${lead.stage} to ${stage}`,
          detail: "Stage updated by a workspace member.",
          actor,
        });
        lead.stage = stage;
      }
      if (name !== undefined) lead.name = name;
      if (email !== undefined) lead.email = email;
      if (company !== undefined) lead.company = company;
      if (title !== undefined) lead.title = title;
      if (notes !== undefined) {
        lead.notes = notes;
        if (body.addNoteActivity === true && notes) {
          await appendLeadActivity({ leadId: lead.id, type: "note", title: "Note added", detail: notes.slice(0, 200), actor });
        }
      }
      if (dealValue !== undefined) lead.dealValue = dealValue;
      if (nextFollowUpAt !== undefined) lead.nextFollowUpAt = nextFollowUpAt;

      lead.updatedAt = new Date().toISOString();
      await saveLead(lead);
      return lead;
    });

    return Response.json({ lead: updated });
  } catch (error) {
    return errorResponse(error, "PATCH /api/crm/leads/[id]");
  }
}

export async function DELETE(request: Request, context: { params: Promise<{ id: string }> }) {
  try {
    const id = parseLeadId((await context.params).id);
    const access = await resolveWorkspaceAccess(request, "runScans");
    await inWorkspace(access, async () => {
      const lead = await loadLead(id);
      if (!lead) throw new RequestError("Lead not found.", 404);
      await deleteLead(id);
    });
    return Response.json({ success: true });
  } catch (error) {
    return errorResponse(error, "DELETE /api/crm/leads/[id]");
  }
}
