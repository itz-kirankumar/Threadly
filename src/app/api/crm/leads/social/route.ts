import { randomUUID } from "node:crypto";
import { errorResponse, readJsonBody, RequestError } from "@/lib/api-request";
import { inWorkspace, resolveWorkspaceAccess } from "@/lib/geo/team";
import { appendLeadActivity, loadLeads, saveLead } from "@/lib/crm/store";
import { optionalText, requiredText } from "@/lib/crm/lead-input";
import type { CrmLead } from "@/lib/crm/types";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const PLATFORM: Record<string, string> = { reddit: "Reddit", x: "X", linkedin: "LinkedIn", web: "Web" };

// Saves a public post from Social search as a lead: the person asking, the
// post itself as evidence, and a note to reply there. The post's site is not
// a customer, so no CRM company is created for it. Saving the same post
// twice returns the lead already saved.
export async function POST(request: Request) {
  try {
    const access = await resolveWorkspaceAccess(request, "runScans");
    const body = (await readJsonBody(request, 16 * 1024)) as Record<string, unknown>;
    const url = requiredText(body.url, "the post link", 600);
    let host: string;
    try {
      const parsed = new URL(url);
      if (!/^https?:$/.test(parsed.protocol)) throw new Error("bad");
      host = parsed.hostname.replace(/^www\./, "").toLowerCase();
    } catch {
      throw new RequestError("Enter a valid post link.", 400);
    }
    const title = requiredText(body.title, "the post title", 300);
    const snippet = optionalText(body.snippet, "the post text", 2000);
    const source = typeof body.source === "string" && PLATFORM[body.source] ? body.source : "web";
    const author = optionalText(body.author, "the author", 120);
    const actor = access.identity.email || access.identity.name || access.identity.uid;

    const result = await inWorkspace(access, async () => {
      const existing = (await loadLeads()).find((l) => l.source === "social_search" && (l.notes ?? "").includes(url));
      if (existing) return { lead: existing, created: false };
      const now = new Date().toISOString();
      const lead: CrmLead = {
        id: `lead-${randomUUID().slice(0, 8)}`,
        name: author ?? `${PLATFORM[source]} poster`,
        email: "",
        company: `${PLATFORM[source]} conversation`,
        domain: host,
        stage: "new",
        source: "social_search",
        score: 0,
        notes: [`Asked: ${title}`, snippet ? `Said: ${snippet}` : null, `Post: ${url}`, "Reply in the thread first; no email is known."].filter(Boolean).join("\n"),
        tags: ["social", source],
        sequenceStep: 0,
        maxSequenceSteps: 3,
        nextFollowUpAt: null,
        lastContactedAt: null,
        createdAt: now,
        updatedAt: now,
      };
      await saveLead(lead);
      await appendLeadActivity({ leadId: lead.id, type: "note", title: "Saved from Social search", detail: url, actor });
      return { lead, created: true };
    });
    return Response.json(result);
  } catch (error) {
    return errorResponse(error, "POST /api/crm/leads/social");
  }
}
