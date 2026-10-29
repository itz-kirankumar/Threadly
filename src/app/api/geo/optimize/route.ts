import { errorResponse, readJsonBody, RequestError } from "@/lib/api-request";
import { inWorkspace, resolveWorkspaceAccess } from "@/lib/geo/team";
import { loadBrand, loadWorkspace } from "@/lib/geo/store";
import { checkRateLimit } from "@/lib/rate-limit";
import { diagnosePrompt, generateBrandKnowledgeFacts, summarizeCitationSources } from "@/lib/geo/geoflow-engine";
import { parseAuditDomain, runOpenSeoAudit } from "@/lib/geo/openseo-engine";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function POST(request: Request) {
  try {
    const access = await resolveWorkspaceAccess(request, "view");
    const body = (await readJsonBody(request, 16 * 1024)) as Record<string, unknown>;
    const action = typeof body.action === "string" ? body.action : "";

    if (action === "facts") {
      const brand = await inWorkspace(access, () => loadBrand());
      if (!brand) throw new RequestError("Set up your brand profile first.", 400);
      return Response.json({ facts: generateBrandKnowledgeFacts(brand) });
    }

    if (action === "diagnose") {
      const prompt = typeof body.prompt === "string" ? body.prompt.trim() : "";
      if (!prompt) throw new RequestError("Enter a buyer question to check.", 400);
      if (prompt.length > 500) throw new RequestError("Keep the question to 500 characters or fewer.", 400);
      const workspace = await inWorkspace(access, () => loadWorkspace());
      return Response.json({ diagnostic: diagnosePrompt(prompt, workspace.brand, workspace.queries, workspace.results) });
    }

    if (action === "sources") {
      const workspace = await inWorkspace(access, () => loadWorkspace());
      return Response.json({
        ...summarizeCitationSources(workspace.brand, workspace.results),
        scanFinishedAt: workspace.latestRun?.finishedAt ?? null,
      });
    }

    if (action === "audit") {
      const brand = await inWorkspace(access, () => loadBrand());
      const requested = typeof body.domain === "string" && body.domain.trim() ? body.domain : brand?.domain ?? "";
      const domain = parseAuditDomain(requested);
      if (!domain) throw new RequestError("Enter a public website domain, like example.com.", 400);
      const user = access.identity;
      if (user.idToken !== "demo-token") {
        const limit = await checkRateLimit(`geo-audit:${user.uid}`, 10, 3600, user);
        if (limit && !limit.allowed) {
          return Response.json(
            { error: "Too many audits. Try again shortly." },
            { status: 429, headers: { "Retry-After": String(limit.retryAfterSeconds) } }
          );
        }
      }
      return Response.json({ audit: await runOpenSeoAudit(domain) });
    }

    throw new RequestError("Unknown action.", 400);
  } catch (error) {
    return errorResponse(error, "POST /api/geo/optimize");
  }
}
