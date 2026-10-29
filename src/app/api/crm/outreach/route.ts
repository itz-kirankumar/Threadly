import { errorResponse, readJsonBody, RequestError } from "@/lib/api-request";
import { inWorkspace, resolveWorkspaceAccess } from "@/lib/geo/team";
import {
  isReplySentiment,
  LEAD_SENDING_DISABLED_MESSAGE,
  prepareOutreachEmail,
  recordLeadReply,
} from "@/lib/crm/outreach";
import { parseLeadId } from "@/lib/crm/lead-input";
import { loadLead, loadOutreachTemplates, saveOutreachTemplates } from "@/lib/crm/store";
import type { OutreachTemplate } from "@/lib/crm/types";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const MAX_TEMPLATES = 6;

function cleanText(value: unknown, label: string, max: number): string {
  if (typeof value !== "string" || !value.trim()) throw new RequestError(`Enter ${label}.`, 400);
  if (value.length > max) throw new RequestError(`${label[0].toUpperCase()}${label.slice(1)} must be ${max} characters or fewer.`, 400);
  return value;
}

function cleanTemplates(value: unknown): OutreachTemplate[] {
  if (!Array.isArray(value) || value.length === 0) throw new RequestError("Templates must be a non-empty list.", 400);
  if (value.length > MAX_TEMPLATES) throw new RequestError(`A sequence has at most ${MAX_TEMPLATES} steps.`, 400);
  return value.map((raw, index) => {
    const t = (raw ?? {}) as Record<string, unknown>;
    const delayDays = Number(t.delayDays);
    if (!Number.isInteger(delayDays) || delayDays < 0 || delayDays > 60) {
      throw new RequestError(`Step ${index + 1}: delay must be a whole number of days from 0 to 60.`, 400);
    }
    return {
      step: index + 1,
      name: cleanText(t.name, "a step name", 120).trim(),
      subject: cleanText(t.subject, "a subject", 200).trim(),
      body: cleanText(t.body, "a message body", 5000),
      delayDays,
    };
  });
}

function leadIdFrom(body: Record<string, unknown>): string {
  return parseLeadId(body.leadId);
}

export async function GET(request: Request) {
  try {
    const access = await resolveWorkspaceAccess(request, "view");
    const templates = await inWorkspace(access, () => loadOutreachTemplates());
    return Response.json({ templates, sendingEnabled: false });
  } catch (error) {
    return errorResponse(error, "GET /api/crm/outreach");
  }
}

export async function PUT(request: Request) {
  try {
    const access = await resolveWorkspaceAccess(request, "runScans");
    const body = (await readJsonBody(request, 64 * 1024)) as { templates?: unknown };
    const templates = cleanTemplates(body.templates);
    await inWorkspace(access, () => saveOutreachTemplates(templates));
    return Response.json({ success: true, templates });
  } catch (error) {
    return errorResponse(error, "PUT /api/crm/outreach");
  }
}

export async function POST(request: Request) {
  try {
    const access = await resolveWorkspaceAccess(request, "runScans");
    const body = (await readJsonBody(request, 64 * 1024)) as Record<string, unknown>;
    const action = typeof body.action === "string" ? body.action : "";

    if (action === "preview") {
      const leadId = leadIdFrom(body);
      const stepNumber = Number(body.step ?? 1);
      if (!Number.isInteger(stepNumber) || stepNumber < 1 || stepNumber > MAX_TEMPLATES) {
        throw new RequestError("Choose a sequence step.", 400);
      }
      const preview = await inWorkspace(access, async () => {
        const lead = await loadLead(leadId);
        if (!lead) throw new RequestError("Lead not found.", 404);
        return prepareOutreachEmail(lead, stepNumber);
      });
      return Response.json(preview);
    }

    if (action === "dispatch") {
      // Kept as an explicit refusal so older clients get a clear answer
      // instead of an unknown-action error.
      return Response.json({ error: LEAD_SENDING_DISABLED_MESSAGE, code: "use_outbound" }, { status: 409 });
    }

    if (action === "reply") {
      const leadId = leadIdFrom(body);
      const replyText = cleanText(body.replyText, "the reply you received", 5000);
      if (!isReplySentiment(body.sentiment)) throw new RequestError("Choose how the lead replied.", 400);
      const sentiment = body.sentiment;
      const actor = access.identity.email || access.identity.uid;
      const result = await inWorkspace(access, async () => {
        const lead = await loadLead(leadId);
        if (!lead) throw new RequestError("Lead not found.", 404);
        return recordLeadReply(leadId, replyText, sentiment, actor);
      });
      return Response.json(result);
    }

    throw new RequestError("Unknown action.", 400);
  } catch (error) {
    return errorResponse(error, "POST /api/crm/outreach");
  }
}
