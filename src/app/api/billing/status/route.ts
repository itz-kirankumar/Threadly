import { errorResponse } from "@/lib/api-request";
import { inWorkspace, resolveWorkspaceAccess } from "@/lib/geo/team";
import { loadPlan, PLAN_LABELS } from "@/lib/geo/plan";
import { billingConfigured, billingTestMode, canCheckout, dodoClient } from "@/lib/billing/dodo";
import { razorpayConfigured } from "@/lib/billing/razorpay";
import { loadBilling } from "@/lib/billing/store";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET(request: Request) {
  try {
    const access = await resolveWorkspaceAccess(request, "view");
    return await inWorkspace(access, async () => {
      const [plan, storedBilling] = await Promise.all([loadPlan(access.identity.email), loadBilling()]);
      // Dodo subscriptions: renewal semantics come from provider fields, not
      // the status enum. Refresh them live (best-effort) so the label never
      // invents "renews automatically" after a scheduled cancellation.
      let billing = storedBilling;
      if (billing?.provider === "dodo" && billing.subscriptionId && billingConfigured()) {
        try {
          const sub = await dodoClient().subscriptions.retrieve(billing.subscriptionId);
          billing = {
            ...billing,
            nextBillingDate: sub.next_billing_date ?? billing.nextBillingDate ?? null,
            cancelAtPeriodEnd: sub.cancel_at_next_billing_date ?? billing.cancelAtPeriodEnd ?? null,
          };
        } catch {
          // Provider unreachable - serve the last webhook-persisted values.
        }
      }
      return Response.json(
        {
          plan,
          planLabel: PLAN_LABELS[plan],
          billing,
          billingAvailable: billingConfigured() || razorpayConfigured(),
          providers: { dodo: billingConfigured(), razorpay: razorpayConfigured() },
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
