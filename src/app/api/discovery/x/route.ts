import { NextResponse } from "next/server";
import { searchX } from "@/lib/apify-x";
import { searchTopic } from "@/lib/x-discovery";
import { getState, storeXResults } from "@/lib/portal-data";
import { getFirebaseIdentity, withWorkspace } from "@/lib/portal-db";
import { checkRateLimit, rateLimitUnavailable, tooManyRequests } from "@/lib/rate-limit";
import { errorResponse, readJsonBody } from "@/lib/api-request";

export const maxDuration = 90;
export const runtime = "nodejs";

function requestKey(request: Request) {
  const forwardedFor = request.headers.get("x-forwarded-for")?.split(",")[0]?.trim();
  return forwardedFor || request.headers.get("x-real-ip") || "unknown";
}

export async function POST(request: Request) {
  if (!process.env.APIFY_TOKEN && !process.env.X_BEARER_TOKEN) {
    return NextResponse.json({ error: "Live X search is not configured yet." }, { status: 503 });
  }

  let body: unknown;
  try {
    body = await readJsonBody(request, 4 * 1024);
  } catch (error) {
    return errorResponse(error, "X discovery request", 400);
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
    const limit = await checkRateLimit(`x-search:${key}`, 5, 10 * 60, user || undefined);
    if (!limit) return rateLimitUnavailable();
    if (!limit.allowed) return tooManyRequests(limit.retryAfterSeconds);
    const topic = searchTopic((body as { topic?: unknown } | null)?.topic);
    const result = await searchX(topic);
    if (effectiveUser) {
      await withWorkspace(effectiveUser.uid, effectiveUser.idToken, async () => {
        await getState(effectiveUser.uid);
        await storeXResults(effectiveUser.uid, result.posts, result.provider);
      });
    }
    return NextResponse.json(result, { headers: { "Cache-Control": "no-store" } });
  } catch (error) {
    return errorResponse(error, "X discovery", 502);
  }
}
