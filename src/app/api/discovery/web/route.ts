import { NextResponse } from "next/server";
import { isTavilyConfigured, searchCommunityDiscussions } from "@/lib/tavily";
import { searchTopic } from "@/lib/x-discovery";
import { getState, storeDiscoveredOpportunities } from "@/lib/portal-data";
import { getFirebaseIdentity, withWorkspace } from "@/lib/portal-db";
import { checkRateLimit, rateLimitUnavailable, tooManyRequests } from "@/lib/rate-limit";
import { errorResponse, readJsonBody } from "@/lib/api-request";

export const maxDuration = 45;
export const runtime = "nodejs";

function requestKey(request: Request) {
  const forwardedFor = request.headers.get("x-forwarded-for")?.split(",")[0]?.trim();
  return forwardedFor || request.headers.get("x-real-ip") || "unknown";
}

export async function POST(request: Request) {
  if (!isTavilyConfigured()) {
    return NextResponse.json({ error: "Tavily search is not configured. Add TAVILY_API_KEY to the environment." }, { status: 503 });
  }

  let body: unknown;
  try {
    body = await readJsonBody(request, 4 * 1024);
  } catch (error) {
    return errorResponse(error, "Web discovery request", 400);
  }

  try {
    const user = await getFirebaseIdentity(request, true);
    const key = user?.uid || requestKey(request);
    const limit = await checkRateLimit(`web-discovery:${key}`, 10, 10 * 60);
    if (!limit) return rateLimitUnavailable();
    if (!limit.allowed) return tooManyRequests(limit.retryAfterSeconds);

    const payload = body as { topic?: unknown; domains?: unknown } | null;
    const topic = searchTopic(payload?.topic);
    const customDomains = Array.isArray(payload?.domains)
      ? (payload?.domains as unknown[]).filter((d): d is string => typeof d === "string" && d.length > 0)
      : undefined;

    const discussions = await searchCommunityDiscussions(topic, { targetDomains: customDomains });

    if (user) {
      await withWorkspace(user.uid, user.idToken, async () => {
        await getState(user.uid);
        await storeDiscoveredOpportunities(user.uid, discussions, "Tavily");
      });
    }

    return NextResponse.json({
      query: topic,
      discussions,
      retrievedAt: new Date().toISOString(),
      provider: "Tavily",
    }, { headers: { "Cache-Control": "no-store" } });
  } catch (error) {
    return errorResponse(error, "Web community discovery", 502);
  }
}
