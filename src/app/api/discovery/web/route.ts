import { NextResponse } from "next/server";
import { isTavilyConfigured, searchCommunityDiscussions } from "@/lib/tavily";
import { searchTopic } from "@/lib/x-discovery";
import { getState, storeDiscoveredOpportunities, type AutoOutreachResult } from "@/lib/portal-data";
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
  let body: unknown;
  try {
    body = await readJsonBody(request, 4 * 1024);
  } catch (error) {
    return errorResponse(error, "Web discovery request", 400);
  }

  try {
    const user = await getFirebaseIdentity(request, true);
    const effectiveUser = user || (process.env.NODE_ENV !== "production" ? {
      uid: "demo-founder-uid",
      email: "founder@demo.threadly.io",
      name: "Demo Founder",
      idToken: "demo-token",
    } : null);

    const key = effectiveUser?.uid || requestKey(request);
    const limit = await checkRateLimit(`web-discovery:${key}`, 30, 10 * 60, user || undefined);
    if (!limit) return rateLimitUnavailable();
    if (!limit.allowed) return tooManyRequests(limit.retryAfterSeconds);

    const payload = body as { topic?: unknown; domains?: unknown; threshold?: unknown; autoOutreach?: unknown } | null;
    const topic = searchTopic(payload?.topic);
    const threshold = typeof payload?.threshold === "number" ? payload.threshold : 60;
    const autoOutreach = payload?.autoOutreach !== false;
    const customDomains = Array.isArray(payload?.domains)
      ? (payload?.domains as unknown[]).filter((d): d is string => typeof d === "string" && d.length > 0)
      : undefined;

    const providerName = isTavilyConfigured() ? "Tavily" : "Community Radar";
    const discussions = await searchCommunityDiscussions(topic, { targetDomains: customDomains });

    let autoSummary: AutoOutreachResult = {
      savedCount: discussions.length,
      qualifiedCount: 0,
      draftsCount: 0,
      qualifiedLeads: [],
    };

    if (effectiveUser) {
      await withWorkspace(effectiveUser.uid, effectiveUser.idToken, async () => {
        await getState(effectiveUser.uid);
        autoSummary = await storeDiscoveredOpportunities(effectiveUser.uid, discussions, providerName, {
          autoOutreachThreshold: threshold,
          autoOutreach,
        });
      });
    }

    return NextResponse.json({
      query: topic,
      discussions,
      autoSummary,
      threshold,
      retrievedAt: new Date().toISOString(),
      provider: providerName,
    }, { headers: { "Cache-Control": "no-store" } });
  } catch (error) {
    return errorResponse(error, "Web community discovery", 502);
  }
}
