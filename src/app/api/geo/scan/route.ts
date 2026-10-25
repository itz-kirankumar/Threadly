import { errorResponse, readJsonBody } from "@/lib/api-request";
import { checkRateLimit } from "@/lib/rate-limit";
import { inWorkspace, resolveWorkspaceAccess } from "@/lib/geo/team";
import { runScan } from "@/lib/geo/engine";
import { loadBrand, loadKeySettings, loadQueries, saveRun } from "@/lib/geo/store";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const maxDuration = 120;

export async function POST(request: Request) {
  try {
    const access = await resolveWorkspaceAccess(request, "runScans");
    const body = (await readJsonBody(request, 8 * 1024).catch(() => ({}))) as { queryIds?: unknown };
    const queryIds = Array.isArray(body.queryIds)
      ? (body.queryIds as unknown[]).filter((id): id is string => typeof id === "string")
      : undefined;
    if (access.identity.idToken === "demo-token") {
      return Response.json(
        { error: "The local demo identity cannot run live scans. Sign in with Google to scan." },
        { status: 403, headers: { "Cache-Control": "no-store" } },
      );
    }
    return await inWorkspace(access, async () => {
      const limit = await checkRateLimit("geo-scan", 6, 3600, { uid: access.identity.uid, idToken: access.identity.idToken });
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
