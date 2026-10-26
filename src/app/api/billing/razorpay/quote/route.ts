import { errorResponse, readJsonBody } from "@/lib/api-request";
import { inWorkspace, resolveWorkspaceAccess } from "@/lib/geo/team";
import { isInterval, isPaidPlan } from "@/lib/billing/dodo";
import { razorpayConfigured, resolvePaidThisTerm, upgradeQuote } from "@/lib/billing/razorpay";
import { loadBilling } from "@/lib/billing/store";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

// POST /api/billing/razorpay/quote - server-priced upgrade quote: credits the
// unused paid time on the current one-time purchase against the same
// remaining term on the higher plan. No order is created here.
export async function POST(request: Request) {
  try {
    if (!razorpayConfigured()) {
      return Response.json({ error: "Razorpay is not available yet." }, { status: 503, headers: { "Cache-Control": "no-store" } });
    }
    const access = await resolveWorkspaceAccess(request, "manageTeam");
    const body = (await readJsonBody(request, 4 * 1024)) as { plan?: unknown; interval?: unknown };
    if (!isPaidPlan(body.plan) || !isInterval(body.interval)) {
      return Response.json({ error: "Choose a plan (pro or growth) and interval (monthly or annual)." }, { status: 400, headers: { "Cache-Control": "no-store" } });
    }
    const existing = await inWorkspace(access, () => loadBilling());
    if (!existing || existing.provider !== "razorpay" || existing.status !== "active" || !existing.periodEnd) {
      return Response.json({ quote: null }, { headers: { "Cache-Control": "no-store" } });
    }
    const paidThisTerm = await resolvePaidThisTerm(existing);
    if (paidThisTerm === null) {
      return Response.json({ quote: null, error: "Could not confirm the amount paid for the current term." }, { status: 503, headers: { "Cache-Control": "no-store" } });
    }
    const quote = upgradeQuote({
      currentPlan: existing.plan,
      newPlan: body.plan,
      interval: body.interval,
      purchasedAt: existing.updatedAt,
      periodEnd: existing.periodEnd,
      paidThisTerm,
    });
    return Response.json({ quote, currentPlan: existing.plan, periodEnd: existing.periodEnd }, { headers: { "Cache-Control": "no-store" } });
  } catch (error) {
    return errorResponse(error, "Razorpay quote");
  }
}
