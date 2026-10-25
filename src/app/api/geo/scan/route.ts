import { errorResponse, readJsonBody } from "@/lib/api-request";
import { checkRateLimit } from "@/lib/rate-limit";
import { getFirebaseIdentity, withWorkspace } from "@/lib/portal-db";
import { runScan } from "@/lib/geo/engine";
import { loadBrand, loadKeySettings, loadQueries, saveRun } from "@/lib/geo/store";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const maxDuration = 120;

export async function POST(request: Request) {
  try {
    const user = await getFirebaseIdentity(request);
    const body = (await readJsonBody(request, 8 * 1024).catch(() => ({}))) as { queryIds?: unknown };
    const queryIds = Array.isArray(body.queryIds)
      ? (body.queryIds as unknown[]).filter((id): id is string => typeof id === "string")
      : undefined;
    if (user!.idToken === "demo-token") {
      return Response.json(
        { error: "The local demo identity cannot run live scans. Sign in with Google to scan." },
        { status: 403, headers: { "Cache-Control": "no-store" } },
      );
    }
    return await withWorkspace(user!.uid, user!.idToken, async () => {
      const limit = await checkRateLimit("geo-scan", 6, 3600, { uid: user!.uid, idToken: user!.idToken });
      if (limit && !limit.allowed) {
        return Response.json(
          { error: `Scan limit reached. Try again in ${Math.ceil(limit.retryAfterSeconds / 60)} minutes.` },
          { status: 429, headers: { "Cache-Control": "no-store" } },
        );
      }
      const [brand, queries, keySettings] = await Promise.all([loadBrand(), loadQueries(), loadKeySettings()]);
      if (!brand) throw new Error("Set up your brand profile first.");
      const { run, results, snapshot } = await runScan(brand, queries, keySettings, queryIds);
      await saveRun(run, results, snapshot);
      return Response.json({ run, results, snapshot });
    });
  } catch (error) {
    return errorResponse(error, "GEO scan");
  }
}
