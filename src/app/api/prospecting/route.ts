import { errorResponse, readJsonBody, RequestError } from "@/lib/api-request";
import { inWorkspace, resolveWorkspaceAccess } from "@/lib/geo/team";
import { contactProvider } from "@/lib/prospecting/contacts";
import { modelEnabled } from "@/lib/prospecting/model";
import { loadState, resetState, saveState } from "@/lib/prospecting/store";
import { searchAvailable } from "@/lib/prospecting/web";
import type { Campaign, ProspectingState } from "@/lib/prospecting/types";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const NO_STORE = { "Cache-Control": "no-store" } as const;

function capabilities() {
  const provider = contactProvider();
  return { search: searchAvailable(), model: modelEnabled(), contactProvider: provider ? provider.label : null };
}

function text(value: unknown, label: string, max: number, required = true): string {
  if (typeof value !== "string" || (required && !value.trim())) throw new RequestError(`Enter ${label}.`, 400);
  const t = value.trim();
  if (t.length > max) throw new RequestError(`Keep ${label} to ${max} characters or fewer.`, 400);
  return t;
}

export async function GET(request: Request) {
  try {
    const access = await resolveWorkspaceAccess(request, "view");
    const state = await inWorkspace(access, () => loadState());
    return Response.json({ state, capabilities: capabilities() }, { headers: NO_STORE });
  } catch (error) {
    return errorResponse(error, "GET /api/prospecting");
  }
}

// Edits made between steps: selections, campaigns, the research summary and
// email drafts. Each op validates its input before the state is written.
export async function PATCH(request: Request) {
  try {
    const access = await resolveWorkspaceAccess(request, "runScans");
    const body = (await readJsonBody(request, 64 * 1024)) as Record<string, unknown>;
    const op = typeof body.op === "string" ? body.op : "";
    const state = await inWorkspace(access, async () => {
      const s: ProspectingState = await loadState();
      switch (op) {
        case "select": {
          const step = body.step;
          const key = text(body.key, "an item", 300);
          const selected = body.selected === true;
          if (step === "competitors" && s.competitors) s.competitors.items = s.competitors.items.map((c) => (c.domain === key ? { ...c, selected } : c));
          else if (step === "campaigns" && s.campaigns) s.campaigns.items = s.campaigns.items.map((c) => (c.id === key ? { ...c, selected } : c));
          else if (step === "companies" && s.companies) s.companies.items = s.companies.items.map((c) => (c.domain === key ? { ...c, selected } : c));
          else throw new RequestError("Nothing to select in that step.", 400);
          break;
        }
        case "research.summary": {
          if (!s.research) throw new RequestError("Research your company first.", 400);
          s.research = { ...s.research, summary: text(body.summary, "a description", 1000), summarySource: "profile" };
          break;
        }
        case "campaign.save": {
          if (!s.campaigns) throw new RequestError("Define campaigns first.", 400);
          const roles = Array.isArray(body.roles) ? body.roles.filter((r): r is string => typeof r === "string").map((r) => r.trim().slice(0, 60)).filter(Boolean).slice(0, 8) : [];
          const id = typeof body.id === "string" && /^cmp_[a-z0-9]{1,20}$/.test(body.id) ? body.id : null;
          const fields = {
            name: text(body.name, "a campaign name", 80),
            description: text(body.description ?? "", "a description", 400, false),
            searchQuery: text(body.searchQuery, "a search query that finds these companies", 160),
            roles: roles.length ? roles : ["Founder", "CEO"],
          };
          if (id && s.campaigns.items.some((c) => c.id === id)) {
            s.campaigns.items = s.campaigns.items.map((c) => (c.id === id ? { ...c, ...fields } : c));
          } else {
            if (s.campaigns.items.length >= 8) throw new RequestError("A run has at most 8 campaigns.", 400);
            const campaign: Campaign = { id: `cmp_${crypto.randomUUID().slice(0, 8)}`, ...fields, source: "user", evidence: [{ kind: "user", quote: `Added by ${access.identity.email || "a workspace member"}`, at: new Date().toISOString() }], selected: true };
            s.campaigns.items = [...s.campaigns.items, campaign];
          }
          break;
        }
        case "campaign.remove": {
          if (!s.campaigns) throw new RequestError("Define campaigns first.", 400);
          s.campaigns.items = s.campaigns.items.filter((c) => c.id !== body.id);
          break;
        }
        case "draft.save": {
          if (!s.emails) throw new RequestError("Write emails first.", 400);
          const id = text(body.id, "a draft", 40);
          const draft = s.emails.items.find((d) => d.id === id);
          if (!draft) throw new RequestError("Draft not found.", 404);
          const to = typeof body.to === "string" && body.to.trim() ? body.to.trim().toLowerCase() : null;
          if (to && !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(to)) throw new RequestError("Enter a valid recipient address.", 400);
          s.emails.items = s.emails.items.map((d) => (d.id === id ? { ...d, to, subject: text(body.subject, "a subject", 200), body: text(body.body, "a message", 5000), updatedAt: new Date().toISOString() } : d));
          break;
        }
        default:
          throw new RequestError("Unknown edit.", 400);
      }
      await saveState(s);
      return s;
    });
    return Response.json({ state, capabilities: capabilities() }, { headers: NO_STORE });
  } catch (error) {
    return errorResponse(error, "PATCH /api/prospecting");
  }
}

export async function DELETE(request: Request) {
  try {
    const access = await resolveWorkspaceAccess(request, "runScans");
    await inWorkspace(access, () => resetState());
    return Response.json({ ok: true }, { headers: NO_STORE });
  } catch (error) {
    return errorResponse(error, "DELETE /api/prospecting");
  }
}
