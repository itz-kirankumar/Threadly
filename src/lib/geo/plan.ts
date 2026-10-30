import type { ScanRun } from "./types";

// Dynamic portal-db access: keeps the pure lapse decision below loadable in
// standalone unit tests (node strip-types cannot resolve the "@/" alias).
async function readData<T>(path: string): Promise<T | null> {
  const { readData: read } = await import("@/lib/portal-db");
  return read<T>(path);
}
async function writeData(path: string, value: unknown): Promise<void> {
  const { writeData: write } = await import("@/lib/portal-db");
  return write(path, value);
}

export type PlanId = "none" | "trial" | "pro" | "growth" | "enterprise";

export interface PlanLimits {
  /** Total full scans allowed, ever. null = unlimited. */
  scans: number | null;
  /** Tracked questions cap. null = unlimited. */
  queries: number | null;
  /** Days of scan history retained. null = unlimited. */
  historyDays: number | null;
  /** Workspace seats. null = unlimited. */
  seats: number | null;
  /** Beta social features (Reddit intel + social search): max searches per hour. null = full access. */
  socialHourly: number | null;
}

export const PLAN_LIMITS: Record<PlanId, PlanLimits> = {
  // No plan: pay per use with credits (scans and social are charged per use).
  none: { scans: 0, queries: 25, historyDays: 30, seats: null, socialHourly: 0 },
  trial: { scans: 1, queries: 10, historyDays: 7, seats: 1, socialHourly: null },
  pro: { scans: null, queries: 50, historyDays: null, seats: 5, socialHourly: null },
  growth: { scans: null, queries: 150, historyDays: null, seats: 25, socialHourly: null },
  enterprise: { scans: null, queries: null, historyDays: null, seats: null, socialHourly: null },
};

// Social-feature gate, exactly as PLAN_LIMITS documents: 0 = plan-blocked,
// null = unlimited (no rate check at all), a finite number = per-hour cap.
export type SocialGate = { kind: "blocked" } | { kind: "unlimited" } | { kind: "capped"; hourly: number };
export function socialGate(plan: PlanId): SocialGate {
  const cap = PLAN_LIMITS[plan].socialHourly;
  if (cap === 0) return { kind: "blocked" };
  if (cap === null) return { kind: "unlimited" };
  return { kind: "capped", hourly: cap };
}

export const PLAN_RANK: Record<PlanId, number> = { none: 0, trial: 1, pro: 2, growth: 3, enterprise: 4 };

/** Tier ordering for feature gates ("Pro and above", "Growth and above"). */
export function planAtLeast(plan: PlanId, min: PlanId): boolean {
  return PLAN_RANK[plan] >= PLAN_RANK[min];
}

export const PLAN_LABELS: Record<PlanId, string> = {
  none: "No plan",
  trial: "7-day trial",
  pro: "Pro",
  growth: "Growth",
  enterprise: "Enterprise",
};

const PLAN_ROOT = "geo/plan";

/** Pure lapse decision: an expired one-time Razorpay or promo term (trial
 * included) drops to no-plan - a paid term never falls back to free access.
 * Dodo subscriptions renew via webhook and carry no periodEnd. */
export function lapsedPlan(
  stored: PlanId,
  billing: { provider?: string; status?: string; periodEnd?: string | null } | null,
  now: Date = new Date(),
): { plan: PlanId; lapsed: boolean } {
  if (
    (billing?.provider === "razorpay" || billing?.provider === "promo") &&
    billing.status === "active" &&
    billing.periodEnd &&
    Date.parse(billing.periodEnd) < now.getTime()
  ) {
    return { plan: "none", lapsed: true };
  }
  return { plan: stored, lapsed: false };
}

// Exempt accounts (the product owner) are floored at Growth: the exemption
// must hold even when a stored plan record exists (e.g. a test purchase), or
// Growth-gated surfaces break for exactly the person running the product.
// The stored record itself is never rewritten here.
export function applyExemption(plan: PlanId, email: string | undefined, exemptEmails: string): PlanId {
  if (!email) return plan;
  const exempt = exemptEmails
    .split(",")
    .map((entry) => entry.trim().toLowerCase())
    .filter(Boolean);
  if (!exempt.includes(email.trim().toLowerCase())) return plan;
  return PLAN_RANK[plan] >= PLAN_RANK.growth ? plan : "growth";
}

export async function loadPlan(email?: string): Promise<PlanId> {
  const stored = await readData<PlanId>(PLAN_ROOT);
  let resolved: PlanId = "none";
  if (stored && stored in PLAN_LIMITS) {
    resolved = stored;
    try {
      const billing = await readData<{ provider?: string; status?: string; periodEnd?: string | null }>("geo/billing");
      const { plan, lapsed } = lapsedPlan(stored, billing);
      if (lapsed) {
        await savePlan("none");
        await writeData("geo/billing", { ...billing, status: "ended", updatedAt: new Date().toISOString() });
        resolved = "none";
      }
    } catch {
      // billing record unreadable - keep the stored plan
    }
  }
  // New workspaces start with no plan: the 7-day trial is a paid product.
  return applyExemption(resolved, email, process.env.TRIAL_EXEMPT_EMAILS ?? "");
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
