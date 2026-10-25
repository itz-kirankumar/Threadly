import { createHash } from "node:crypto";
import { adminLoadLatestSummary, adminResolveApiKey } from "@/lib/geo/admin-store";
import { checkRateLimit } from "@/lib/rate-limit";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

// Public v1 API: latest visibility summary for the workspace behind the key.
// Auth: Authorization: Bearer thly_...
export async function GET(request: Request) {
  const auth = request.headers.get("authorization") ?? "";
  const secret = auth.startsWith("Bearer ") ? auth.slice(7).trim() : "";
  if (!secret.startsWith("thly_")) {
    return Response.json({ error: "Pass Authorization: Bearer thly_..." }, { status: 401 });
  }
  const hash = createHash("sha256").update(secret).digest("hex");
  const resolved = await adminResolveApiKey(hash).catch(() => null);
  if (!resolved) return Response.json({ error: "Invalid API key." }, { status: 401 });
  const limit = await checkRateLimit(`v1:${resolved.uid}`, 120, 3600);
  if (limit && !limit.allowed) {
    return Response.json({ error: "Rate limit exceeded." }, { status: 429, headers: { "Retry-After": String(limit.retryAfterSeconds) } });
  }
  const { brand, latestRun, snapshot } = await adminLoadLatestSummary(resolved.uid);
  if (!brand) return Response.json({ error: "Workspace has no brand profile yet." }, { status: 409 });
  return Response.json({
    brand: { name: brand.name, domain: brand.domain, competitors: brand.competitors.map((c) => ({ name: c.name, domain: c.domain })) },
    latestRun: latestRun
      ? { id: latestRun.id, startedAt: latestRun.startedAt, finishedAt: latestRun.finishedAt, queryCount: latestRun.queryCount, providerStatus: latestRun.providerStatus }
      : null,
    metrics: snapshot
      ? {
          mentionRate: snapshot.mentionRate,
          citationShare: snapshot.citationShare,
          shareOfVoice: snapshot.shareOfVoice,
          avgPosition: snapshot.avgPosition,
          perProvider: snapshot.perProvider,
        }
      : null,
  });
}
