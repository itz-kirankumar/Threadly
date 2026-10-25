import { errorResponse, readJsonBody } from "@/lib/api-request";
import { checkRateLimit } from "@/lib/rate-limit";
import { inWorkspace, resolveWorkspaceAccess } from "@/lib/geo/team";
import { runScan } from "@/lib/geo/engine";
import { loadBrand, loadKeySettings, loadQueries, saveRun } from "@/lib/geo/store";
import { loadPlan, loadRunCount, PLAN_LIMITS, planBlockResponse } from "@/lib/geo/plan";
import { readData, writeData } from "@/lib/portal-db";
import { sendLifecycleEmail } from "@/lib/email";
import { appendAudit } from "@/lib/geo/store";

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
      const [brand, queries, keySettings, plan] = await Promise.all([loadBrand(), loadQueries(), loadKeySettings(), loadPlan(access.identity.email)]);
      if (!brand) throw new Error("Set up your brand profile first.");
      const scanCap = PLAN_LIMITS[plan].scans;
      if (scanCap !== null && (await loadRunCount()) >= scanCap) {
        return planBlockResponse(
          `Your free trial includes ${scanCap} full scan - and it is used. Upgrade to Pro or Growth for unlimited scans (paid plans are free during early access).`,
          plan,
        );
      }
      const { run, results, snapshot, queries: scannedQueries } = await runScan(brand, queries, keySettings, queryIds);
      await saveRun(run, results, snapshot, scannedQueries);
      // Trial accounts get one scan - when it lands, email the results pointer
      // plus the upgrade nudge. Flagged so it sends once per workspace.
      if (plan === "trial" && access.identity.email) {
        try {
          const flagPath = "lifecycle/trial-scan-complete";
          const already = await readData<{ sentAt: string }>(flagPath);
          if (!already?.sentAt) {
            const sent = await sendLifecycleEmail("trial-scan-complete", access.identity.email, { name: access.identity.name });
            if (sent.sent) await writeData(flagPath, { sentAt: new Date().toISOString() });
          }
        } catch {
          // email must never fail a scan
        }
      }
      await appendAudit({
        actor: access.identity.email,
        action: "scan.completed",
        detail: `${scannedQueries.length} questions, mention rate ${snapshot.mentionRate}%`,
      });
      return Response.json({ run, results, snapshot });
    });
  } catch (error) {
    return errorResponse(error, "GEO scan");
  }
}
