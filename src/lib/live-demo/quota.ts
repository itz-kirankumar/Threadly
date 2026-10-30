// Quota for the public landing-page demo, which runs real web searches for
// anonymous visitors. Counted atomically in the Realtime Database: a fixed
// number of free runs per visitor overall (hashed address, never reset), and
// a daily cap for the whole site that bounds search spend. In production the
// demo fails closed when the counter cannot be reached; local development
// without a database uses an in-process counter.

import { createHash } from "node:crypto";

export const DEMO_RUNS_PER_VISITOR = Number(process.env.PUBLIC_DEMO_RUNS_PER_VISITOR ?? "3");
export const DEMO_RUNS_PER_DAY = Number(process.env.PUBLIC_DEMO_DAILY_RUNS ?? "300");

export type QuotaResult = { allowed: true } | { allowed: false; reason: "visitor" | "site" | "unavailable" };

// Development fallback, kept on globalThis so it survives route recompiles.
const local = ((globalThis as { __threadlyDemoQuota?: Map<string, number> }).__threadlyDemoQuota ??= new Map<string, number>());

function day(): string {
  return new Date().toISOString().slice(0, 10);
}

export function visitorKey(request: Request): string {
  const forwarded = request.headers.get("x-forwarded-for")?.split(",")[0]?.trim();
  const address = request.headers.get("x-real-ip")?.trim() || forwarded || "unknown";
  // Salted so the stored key is not the address; stable so the free-run
  // allowance is overall rather than daily.
  const salt = process.env.DEMO_VISITOR_SALT || "threadly-demo";
  return createHash("sha256").update(`${salt}:${address}`).digest("hex").slice(0, 32);
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

export async function reserveDemoRun(visitor: string): Promise<QuotaResult> {
  if (DEMO_RUNS_PER_DAY <= 0 || DEMO_RUNS_PER_VISITOR <= 0) return { allowed: false, reason: "site" };
  const base = `publicDemoQuota/${day()}`;
  const perVisitor = await increment(`publicDemoQuota/visitors/${visitor}`, DEMO_RUNS_PER_VISITOR);
  if (perVisitor === null) {
    if (process.env.NODE_ENV === "production") return { allowed: false, reason: "unavailable" };
    const key = `visitor:${visitor}`;
    const n = (local.get(key) ?? 0) + 1;
    local.set(key, n);
    return n <= DEMO_RUNS_PER_VISITOR ? { allowed: true } : { allowed: false, reason: "visitor" };
  }
  if (!perVisitor) return { allowed: false, reason: "visitor" };
  const site = await increment(`${base}/total`, DEMO_RUNS_PER_DAY);
  if (site === false) return { allowed: false, reason: "site" };
  if (site === null && process.env.NODE_ENV === "production") return { allowed: false, reason: "unavailable" };
  return { allowed: true };
}
