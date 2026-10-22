import { NextResponse } from "next/server";
import { isTavilyConfigured, searchCommunityDiscussions, type DiscoveredDiscussion } from "@/lib/tavily";
import { searchWithAgentReach } from "@/lib/agent-reach";
import { searchTopic } from "@/lib/x-discovery";
import { getState, storeDiscoveredOpportunities, type AutoOutreachResult } from "@/lib/portal-data";
import { withWorkspace } from "@/lib/portal-db";
import { requireApprovedIdentity } from "@/lib/admin-auth";
import { checkRateLimit, rateLimitUnavailable, tooManyRequests } from "@/lib/rate-limit";
import { errorResponse, readJsonBody } from "@/lib/api-request";

export const maxDuration = 45;
export const runtime = "nodejs";

export async function POST(request: Request) {
  let body: unknown;
  try {
    body = await readJsonBody(request, 4 * 1024);
  } catch (error) {
    return errorResponse(error, "Web discovery request", 400);
  }

  try {
    const user = await requireApprovedIdentity(request);
    const limit = await checkRateLimit(`web-discovery:${user.uid}`, 30, 10 * 60, user);
    if (!limit) return rateLimitUnavailable();
    if (!limit.allowed) return tooManyRequests(limit.retryAfterSeconds);

    const payload = body as { topic?: unknown; domains?: unknown; threshold?: unknown; autoOutreach?: unknown } | null;
    const topic = searchTopic(payload?.topic);
    const threshold = typeof payload?.threshold === "number" ? payload.threshold : 60;
    const autoOutreach = payload?.autoOutreach !== false;
    const customDomains = Array.isArray(payload?.domains)
      ? (payload?.domains as unknown[]).filter((d): d is string => typeof d === "string" && d.length > 0)
      : undefined;

    let providerName = isTavilyConfigured() ? "Tavily" : "Agent-Reach Real-Time Crawler";
    let discussions: DiscoveredDiscussion[] = [];

    if (isTavilyConfigured()) {
      try {
        discussions = await searchCommunityDiscussions(topic, { targetDomains: customDomains });
      } catch {
        // Fallback to Agent-Reach
      }
    }

    if (!discussions.length) {
      providerName = "Agent-Reach Real-Time Crawler";
      discussions = await searchWithAgentReach(topic, { targetDomains: customDomains });
    }

    let autoSummary: AutoOutreachResult = {
      savedCount: discussions.length,
      qualifiedCount: 0,
      draftsCount: 0,
      qualifiedLeads: [],
    };

    await withWorkspace(user.uid, user.idToken, async () => {
      await getState(user.uid);
      autoSummary = await storeDiscoveredOpportunities(user.uid, discussions, providerName, {
        autoOutreachThreshold: threshold,
        autoOutreach,
      });
    });

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
