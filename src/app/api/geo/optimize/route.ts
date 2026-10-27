import { errorResponse, readJsonBody, RequestError } from "@/lib/api-request";
import { inWorkspace, resolveWorkspaceAccess } from "@/lib/geo/team";
import { loadBrand } from "@/lib/geo/store";
import {
  generateBrandKnowledgeFacts,
  diagnosePrompt,
  getRecommendedLinkPool,
} from "@/lib/geo/geoflow-engine";
import { runOpenSeoAudit } from "@/lib/geo/openseo-engine";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function POST(request: Request) {
  try {
    const access = await resolveWorkspaceAccess(request, "view");
    const body = (await readJsonBody(request, 64 * 1024)) as Record<string, unknown>;
    const action = String(body.action || "facts");

    const brand = await inWorkspace(access, async () => loadBrand());

    if (action === "facts") {
      if (!brand) throw new RequestError("Set up your brand profile first.", 400);
      const facts = generateBrandKnowledgeFacts(brand);
      return Response.json({ facts });
    }

    if (action === "diagnose") {
      const prompt = String(body.prompt || "");
      if (!prompt.trim()) throw new RequestError("Enter a query prompt to diagnose.", 400);
      const diagnostic = diagnosePrompt(prompt, brand);
      return Response.json({ diagnostic });
    }

    if (action === "anchors") {
      const category = brand?.category || "software";
      const anchors = getRecommendedLinkPool(category);
      return Response.json({ anchors });
    }

    if (action === "audit") {
      const targetDomain = typeof body.domain === "string" && body.domain.trim()
        ? body.domain.trim()
        : brand?.domain || "example.com";
      const audit = await runOpenSeoAudit(targetDomain);
      return Response.json({ audit });
    }

    throw new RequestError(`Unknown action "${action}"`, 400);
  } catch (error) {
    return errorResponse(error, "POST /api/geo/optimize");
  }
}
