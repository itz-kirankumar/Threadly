// Optional site-wide daily budget for the public landing-page demo, which
// runs real web searches. There is no per-visitor or per-address limit:
// every visitor can run the demo as often as they like. The owner can set
// PUBLIC_DEMO_DAILY_RUNS to bound search spend for the whole site; unset or
// 0 means no cap. The counter lives in the Realtime Database, and when it
// cannot be reached the run is allowed rather than refused.

export const DEMO_RUNS_PER_DAY = Number(process.env.PUBLIC_DEMO_DAILY_RUNS ?? "0");

export type QuotaResult = { allowed: true } | { allowed: false; reason: "site" };

function day(): string {
  return new Date().toISOString().slice(0, 10);
}

async function increment(path: string, cap: number): Promise<boolean | null> {
  try {
    const { getAdminDatabase } = await import("../geo/admin-store.ts");
    const db = await getAdminDatabase();
    if (!db) return null;
    const result = await db.ref(path).transaction((current: number | null) => {
      const used = typeof current === "number" ? current : 0;
      if (used >= cap) return;
      return used + 1;
    });
    return result.committed;
  } catch {
    return null;
  }
}

export async function reserveDemoRun(cap = DEMO_RUNS_PER_DAY): Promise<QuotaResult> {
  if (!(cap > 0)) return { allowed: true };
  const site = await increment(`publicDemoQuota/${day()}/total`, cap);
  return site === false ? { allowed: false, reason: "site" } : { allowed: true };
}
