import { errorResponse, readJsonBody, RequestError } from "@/lib/api-request";
import { inWorkspace, resolveWorkspaceAccess } from "@/lib/geo/team";
import {
  prepareOutreachEmail,
  dispatchOutreachStep,
  recordLeadReply,
} from "@/lib/crm/outreach";
import { loadLead, loadOutreachTemplates, saveOutreachTemplates } from "@/lib/crm/store";
import type { OutreachTemplate } from "@/lib/crm/types";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET(request: Request) {
  try {
    const access = await resolveWorkspaceAccess(request, "view");
    const templates = await inWorkspace(access, async () => {
      return loadOutreachTemplates();
    });
    return Response.json({ templates });
  } catch (error) {
    return errorResponse(error, "GET /api/crm/outreach");
  }
}

export async function PUT(request: Request) {
  try {
    const access = await resolveWorkspaceAccess(request, "runScans");
    const body = (await readJsonBody(request, 64 * 1024)) as { templates: OutreachTemplate[] };
    if (!Array.isArray(body.templates)) throw new RequestError("Templates must be an array.", 400);

    await inWorkspace(access, async () => {
      await saveOutreachTemplates(body.templates);
    });

    return Response.json({ success: true, templates: body.templates });
  } catch (error) {
    return errorResponse(error, "GET /api/crm/outreach");
  }
}

export async function POST(request: Request) {
  try {
    const access = await resolveWorkspaceAccess(request, "runScans");
    const body = (await readJsonBody(request, 64 * 1024)) as Record<string, unknown>;
    const action = String(body.action || "dispatch");

    if (action === "preview") {
      const leadId = String(body.leadId || "");
      const stepNumber = Number(body.step || 1);
      const customSubject = typeof body.subject === "string" ? body.subject : undefined;
      const customBody = typeof body.body === "string" ? body.body : undefined;

      const preview = await inWorkspace(access, async () => {
        const lead = await loadLead(leadId);
        if (!lead) throw new RequestError("Lead not found", 404);
        return prepareOutreachEmail(lead, stepNumber, {
          subject: customSubject,
          body: customBody,
        });
      });

      return Response.json(preview);
    }

    if (action === "dispatch") {
      const leadId = String(body.leadId || "");
      const stepNumber = body.step ? Number(body.step) : undefined;
      const customEmail =
        typeof body.subject === "string" || typeof body.body === "string"
          ? {
              subject: typeof body.subject === "string" ? body.subject : undefined,
              body: typeof body.body === "string" ? body.body : undefined,
            }
          : undefined;

      const result = await inWorkspace(access, async () => {
        return dispatchOutreachStep(leadId, stepNumber, customEmail);
      });

      return Response.json(result);
    }

    if (action === "reply") {
      const leadId = String(body.leadId || "");
      const replyText = String(body.replyText || "Thanks, interested in learning more.");
      const sentiment = (
        ["interested", "question", "not_interested", "booked"].includes(String(body.sentiment))
          ? String(body.sentiment)
          : "interested"
      ) as "interested" | "question" | "not_interested" | "booked";

      const result = await inWorkspace(access, async () => {
        return recordLeadReply(leadId, replyText, sentiment);
      });

      return Response.json(result);
    }

    throw new RequestError(`Unknown action "${action}"`, 400);
  } catch (error) {
    return errorResponse(error, "GET /api/crm/outreach");
  }
}
