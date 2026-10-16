import { analyzeOutreachWebsite } from "@/lib/outreach-website";
import { getState, updateContext } from "@/lib/portal-data";
import { getFirebaseIdentity, withWorkspace } from "@/lib/portal-db";
import { checkRateLimit, rateLimitUnavailable, tooManyRequests } from "@/lib/rate-limit";
import { errorResponse, readJsonBody } from "@/lib/api-request";

export const runtime = "nodejs";
export const maxDuration = 45;

export async function POST(request: Request) {
  try {
    const user = await getFirebaseIdentity(request);
    if (!user) return Response.json({ error: "Sign in required" }, { status: 401 });
    const limit = await checkRateLimit(`website-analysis:${user.uid}`, 10, 60 * 60);
    if (!limit) return rateLimitUnavailable();
    if (!limit.allowed) return tooManyRequests(limit.retryAfterSeconds);
    const parsedBody = await readJsonBody(request, 8 * 1024);
    if (!parsedBody || typeof parsedBody !== "object" || Array.isArray(parsedBody)) {
      return Response.json({ error: "Enter a company website URL." }, { status: 400 });
    }
    const body = parsedBody as Record<string, unknown>;
    return await withWorkspace(user.uid, user.idToken, async () => {
      const current = await getState(user.uid);
      const analysis = await analyzeOutreachWebsite(body?.website);
      const context = {
        ...current.workspace.context,
        website: analysis.website,
        description: analysis.description || current.workspace.context.description || "",
        customer: analysis.customer || current.workspace.context.customer || "",
        icp: analysis.icp || current.workspace.context.icp || "",
        painPoints: analysis.painPoints || current.workspace.context.painPoints || "",
        industry: analysis.industry || current.workspace.context.industry || "",
        titles: analysis.titles || current.workspace.context.titles || "",
        outreachSearchPhrases: analysis.searchPhrases || current.workspace.context.outreachSearchPhrases || "",
      };
      await updateContext(user.uid, context, analysis.companyName || current.workspace.name);
      return Response.json({ analysis, context, companyName: analysis.companyName || current.workspace.name });
    });
  } catch (error) {
    return errorResponse(error, "Website analysis", 400);
  }
}
