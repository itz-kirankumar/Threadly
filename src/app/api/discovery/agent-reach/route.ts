import { NextResponse } from "next/server";
import {
  crawlUrlWithAgentReach,
  searchWithAgentReach,
  getAgentReachDoctorReport,
} from "@/lib/agent-reach";
import { getState, storeDiscoveredOpportunities, type AutoOutreachResult } from "@/lib/portal-data";
import { withWorkspace } from "@/lib/portal-db";
import { requireApprovedIdentity } from "@/lib/admin-auth";
import { checkRateLimit, rateLimitUnavailable, tooManyRequests } from "@/lib/rate-limit";
import { errorResponse, readJsonBody } from "@/lib/api-request";

export const maxDuration = 60;
export const runtime = "nodejs";

export async function GET() {
  try {
    const report = await getAgentReachDoctorReport();
    return NextResponse.json(report, {
      headers: { "Cache-Control": "no-store, max-age=0" },
    });
  } catch (error) {
    return errorResponse(error, "Agent-Reach doctor check", 500);
  }
}

export async function POST(request: Request) {
  let body: unknown;
  try {
    body = await readJsonBody(request, 8 * 1024);
  } catch (error) {
    return errorResponse(error, "Agent-Reach crawl request", 400);
  }

  try {
    const user = await requireApprovedIdentity(request);
    const limit = await checkRateLimit(`agent-reach:${user.uid}`, 40, 10 * 60, user);
    if (!limit) return rateLimitUnavailable();
    if (!limit.allowed) return tooManyRequests(limit.retryAfterSeconds);

    const payload = body as {
      action?: "crawl_url" | "search" | "doctor";
      url?: string;
      topic?: string;
      threshold?: number;
      autoOutreach?: boolean;
      saveToRadar?: boolean;
    } | null;

    const action = payload?.action || (payload?.url ? "crawl_url" : "search");

    // 1. CRAWL SPECIFIC URL
    if (action === "crawl_url") {
      const targetUrl = payload?.url?.trim();
      if (!targetUrl) {
        return NextResponse.json({ error: "Missing required 'url' parameter" }, { status: 400 });
      }

      const crawlResult = await crawlUrlWithAgentReach(targetUrl);
      let autoSummary: AutoOutreachResult | null = null;

      if (payload?.saveToRadar) {
        const discussion = {
          id: `reach-url-${Buffer.from(crawlResult.url).toString("base64").slice(0, 16)}`,
          platform: crawlResult.socialLinks[0]?.platform || "Web Crawl",
          community: new URL(crawlResult.url).hostname,
          author: crawlResult.author || new URL(crawlResult.url).hostname,
          title: crawlResult.title,
          body: crawlResult.description || crawlResult.markdown.slice(0, 600),
          url: crawlResult.url,
          publishedAt: crawlResult.publishedAt || crawlResult.crawledAt,
          relevanceScore: 92,
        };

        await withWorkspace(user.uid, user.idToken, async () => {
          await getState(user.uid);
          autoSummary = await storeDiscoveredOpportunities(
            user.uid,
            [discussion],
            crawlResult.provider,
            { autoOutreachThreshold: payload?.threshold || 60, autoOutreach: payload?.autoOutreach !== false }
          );
        });
      }

      return NextResponse.json({
        action: "crawl_url",
        result: crawlResult,
        autoSummary,
        crawledAt: crawlResult.crawledAt,
        provider: crawlResult.provider,
      }, { headers: { "Cache-Control": "no-store" } });
    }

    // 2. MULTI-PLATFORM LIVE SEARCH CRAWL
    if (action === "search") {
      const topic = payload?.topic?.trim() || "high-intent business leads";
      const threshold = typeof payload?.threshold === "number" ? payload.threshold : 60;
      const autoOutreach = payload?.autoOutreach !== false;

      const discussions = await searchWithAgentReach(topic, { maxResults: 15 });

      let autoSummary: AutoOutreachResult = {
        savedCount: discussions.length,
        qualifiedCount: 0,
        draftsCount: 0,
        qualifiedLeads: [],
      };

      await withWorkspace(user.uid, user.idToken, async () => {
        await getState(user.uid);
        autoSummary = await storeDiscoveredOpportunities(
          user.uid,
          discussions,
          "Agent-Reach Real-Time Crawler",
          { autoOutreachThreshold: threshold, autoOutreach }
        );
      });

      return NextResponse.json({
        action: "search",
        query: topic,
        discussions,
        autoSummary,
        threshold,
        retrievedAt: new Date().toISOString(),
        provider: "Agent-Reach Real-Time Crawler",
      }, { headers: { "Cache-Control": "no-store" } });
    }

    // 3. DOCTOR DIAGNOSTIC
    if (action === "doctor") {
      const report = await getAgentReachDoctorReport();
      return NextResponse.json(report, { headers: { "Cache-Control": "no-store" } });
    }

    return NextResponse.json({ error: `Unknown action: ${action}` }, { status: 400 });
  } catch (error) {
    return errorResponse(error, "Agent-Reach Crawler Engine", 502);
  }
}
