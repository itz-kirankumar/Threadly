import { runScan } from "@/lib/geo/engine";
import { adminConfigured, adminLoadKeySettings, adminLoadWorkspace, adminSaveRun, listWorkspaceIds } from "@/lib/geo/admin-store";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const maxDuration = 300;

// Vercel cron entry point. Runs one scan for every workspace with a brand
// profile, using the Firebase service account (FIREBASE_ADMIN_*). Authorized
// with the CRON_SECRET bearer token Vercel sends automatically.
export async function GET(request: Request) {
  const secret = process.env.CRON_SECRET;
  if (!secret) {
    return Response.json({ error: "Cron is not configured. Set CRON_SECRET." }, { status: 503 });
  }
  const authorization = request.headers.get("authorization") || "";
  if (authorization !== `Bearer ${secret}`) {
    return Response.json({ error: "Unauthorized." }, { status: 401 });
  }
  if (!adminConfigured()) {
    return Response.json(
      { error: "Scheduled scans need the FIREBASE_ADMIN_* service-account variables." },
      { status: 503 },
    );
  }

  const scanned: Array<{ uid: string; runId?: string; error?: string }> = [];
  const uids = await listWorkspaceIds(50);
  for (const uid of uids) {
    try {
      const { brand, queries } = await adminLoadWorkspace(uid);
      if (!brand || !queries.length) {
        scanned.push({ uid, error: "no brand or queries" });
        continue;
      }
      const keySettings = await adminLoadKeySettings(uid);
      const { run, results, snapshot, queries: scannedQueries } = await runScan(brand, queries, keySettings);
      await adminSaveRun(uid, run, results, snapshot, scannedQueries);
      scanned.push({ uid, runId: run.id });
    } catch (error) {
      scanned.push({ uid, error: error instanceof Error ? error.message : "scan failed" });
    }
  }
  return Response.json({ ok: true, workspaces: scanned.length, scanned });
}
