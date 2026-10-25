import { errorResponse } from "@/lib/api-request";
import { inWorkspace, resolveWorkspaceAccess } from "@/lib/geo/team";
import { loadPlan, PLAN_LABELS } from "@/lib/geo/plan";
import { billingConfigured, billingTestMode, canCheckout } from "@/lib/billing/dodo";
import { loadBilling } from "@/lib/billing/store";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET(request: Request) {
  try {
    const access = await resolveWorkspaceAccess(request, "view");
    return await inWorkspace(access, async () => {
      const [plan, billing] = await Promise.all([loadPlan(access.identity.email), loadBilling()]);
      return Response.json(
        {
          plan,
          planLabel: PLAN_LABELS[plan],
          billing,
          billingAvailable: billingConfigured(),
          testMode: billingTestMode(),
          isOwner: access.role === "owner",
          canCheckout: canCheckout(access.identity.email),
        },
        { headers: { "Cache-Control": "no-store" } },
      );
    });
  } catch (error) {
    return errorResponse(error, "Billing status");
  }
}
