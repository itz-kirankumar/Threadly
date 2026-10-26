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

  // Reconcile account-deletion tombstones first (see pending-deletions.ts).
  const { getAdminDatabase } = await import("@/lib/geo/admin-store");
  const { reconcilePendingDeletions } = await import("@/lib/geo/pending-deletions");
  const db = await getAdminDatabase();
  let sweep = { swept: [] as string[], clearedStale: [] as string[], skipped: [] as string[] };
  try {
    sweep = await reconcilePendingDeletions(db);
  } catch (error) {
    console.error("Cron: pending-deletion sweep failed", error);
  }

  // Guest-checkout claims reconciliation: a buyer whose browser never
  // confirmed after paying gets the claim advanced from provider evidence
  // (order paid + captured payment), never from assumption. Unpaid orders
  // keep their claims pending until the provider shows a terminal state.
  const claimsSweep = { checked: 0, advanced: 0, paused: 0, errors: 0 };
  try {
    const { listOpenClaims, reconcileClaimWithProvider } = await import("@/lib/billing/claims");
    const open = await listOpenClaims(25);
    for (const claim of open) {
      claimsSweep.checked++;
      try {
        const status = await reconcileClaimWithProvider(claim);
        if (status === "paid_unclaimed") claimsSweep.advanced++;
        else if (status === "uncertain") claimsSweep.paused++;
      } catch {
        claimsSweep.errors++;
      }
    }
  } catch (error) {
    console.error("Cron: claims sweep failed", error);
  }

  // Ops affordance: ?sweepOnly=1 (same CRON_SECRET auth) runs only the
  // tombstone reconciliation - used to verify recovery without burning AI
  // scan credits.
  if (new URL(request.url).searchParams.get("sweepOnly") === "1") {
    return Response.json({ ok: true, sweep, claimsSweep });
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
  return Response.json({ ok: true, workspaces: scanned.length, scanned, pendingDeletionsSwept: sweep.swept.length, claimsSweep });
}
