import { readData, writeData } from "@/lib/portal-db";
import type { ScanRun } from "./types";

export type PlanId = "trial" | "pro" | "growth" | "enterprise";

export interface PlanLimits {
  /** Total full scans allowed, ever. null = unlimited. */
  scans: number | null;
  /** Tracked questions cap. null = unlimited. */
  queries: number | null;
  /** Days of scan history retained. null = unlimited. */
  historyDays: number | null;
  /** Workspace seats. null = unlimited. */
  seats: number | null;
}

export const PLAN_LIMITS: Record<PlanId, PlanLimits> = {
  trial: { scans: 1, queries: 10, historyDays: 7, seats: 1 },
  pro: { scans: null, queries: 50, historyDays: null, seats: 5 },
  growth: { scans: null, queries: 150, historyDays: null, seats: 25 },
  enterprise: { scans: null, queries: null, historyDays: null, seats: null },
};

export const PLAN_LABELS: Record<PlanId, string> = {
  trial: "Free trial",
  pro: "Pro",
  growth: "Growth",
  enterprise: "Enterprise",
};

const PLAN_ROOT = "geo/plan";

export async function loadPlan(email?: string): Promise<PlanId> {
  const stored = await readData<PlanId>(PLAN_ROOT);
  if (stored && stored in PLAN_LIMITS) {
    // One-time Razorpay purchases grant a fixed term; lapse it when the term
    // ends. Dodo subscriptions renew via webhook and carry no periodEnd.
    try {
      const billing = await readData<{ provider?: string; status?: string; periodEnd?: string | null }>("geo/billing");
      if (
        stored !== "trial" &&
        billing?.provider === "razorpay" &&
        billing.status === "active" &&
        billing.periodEnd &&
        Date.parse(billing.periodEnd) < Date.now()
      ) {
        await savePlan("trial");
        const { writeData: write } = await import("@/lib/portal-db");
        await write("geo/billing", { ...billing, status: "ended", updatedAt: new Date().toISOString() });
        return "trial";
      }
    } catch {
      // billing record unreadable - keep the stored plan
    }
    return stored;
  }
  const exempt = (process.env.TRIAL_EXEMPT_EMAILS ?? "")
    .split(",")
    .map((entry) => entry.trim().toLowerCase())
    .filter(Boolean);
  if (email && exempt.includes(email.toLowerCase())) return "growth";
  return "trial";
}

export async function savePlan(plan: PlanId): Promise<void> {
  await writeData(PLAN_ROOT, plan);
}

export async function loadRunCount(): Promise<number> {
  const raw = await readData("geo/runs");
  if (!raw) return 0;
  if (Array.isArray(raw)) return raw.filter(Boolean).length;
  if (typeof raw === "object") return Object.values(raw as Record<string, ScanRun>).filter(Boolean).length;
  return 0;
}

/** 403 payload when a trial cap blocks an action. */
export function planBlockResponse(message: string, plan: PlanId): Response {
  return Response.json({ error: message, code: "PLAN_LIMIT", plan }, { status: 403, headers: { "Cache-Control": "no-store" } });
}
