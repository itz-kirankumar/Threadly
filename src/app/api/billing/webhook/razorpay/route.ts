import { withWorkspace } from "@/lib/portal-db";
import { savePlan, type PlanId } from "@/lib/geo/plan";
import { adminConfigured } from "@/lib/geo/admin-store";
import { appendAudit } from "@/lib/geo/store";
import { billingTestMode, isInterval, isPaidPlan, type BillingInterval, type PaidPlanId } from "@/lib/billing/dodo";
import { razorpayPlanFromPlanId, verifyRazorpaySignature } from "@/lib/billing/razorpay";
import { loadBilling, saveBilling } from "@/lib/billing/store";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

interface RazorpayWebhookPayload {
  event?: string;
  payload?: {
    subscription?: {
      entity?: {
        id?: string;
        plan_id?: string;
        status?: string;
        customer_id?: string;
        notes?: Record<string, string>;
      };
    };
  };
}

const ACTIVE_EVENTS = new Set(["subscription.activated", "subscription.charged", "subscription.resumed"]);
const DOWNGRADE_EVENTS = new Set(["subscription.cancelled", "subscription.expired", "subscription.halted"]);

export async function POST(request: Request) {
  if (!process.env.RAZORPAY_WEBHOOK_SECRET || !process.env.RAZORPAY_KEY_ID) {
    return Response.json({ error: "Razorpay webhook is not configured." }, { status: 503 });
  }
  if (!adminConfigured()) {
    return Response.json({ error: "Workspace storage is not configured." }, { status: 503 });
  }
  const rawBody = await request.text();
  if (!verifyRazorpaySignature(rawBody, request.headers.get("x-razorpay-signature"))) {
    return Response.json({ error: "Invalid signature." }, { status: 400 });
  }
  const event = JSON.parse(rawBody) as RazorpayWebhookPayload;
  const type = event.event ?? "";
  if (!type.startsWith("subscription.")) {
    return Response.json({ received: true });
  }
  const subscription = event.payload?.subscription?.entity ?? {};
  const notes = subscription.notes ?? {};
  const workspaceUid = notes.workspace_uid;
  const plan: PaidPlanId | null = isPaidPlan(notes.plan) ? notes.plan : razorpayPlanFromPlanId(subscription.plan_id);
  const interval: BillingInterval | null = isInterval(notes.interval) ? notes.interval : null;
  if (!workspaceUid || !plan) {
    return Response.json({ received: true });
  }

  const status = ACTIVE_EVENTS.has(type)
    ? "active"
    : DOWNGRADE_EVENTS.has(type)
      ? type === "subscription.halted"
        ? "failed"
        : "cancelled"
      : (subscription.status ?? "unknown");
  if (!ACTIVE_EVENTS.has(type) && !DOWNGRADE_EVENTS.has(type)) {
    return Response.json({ received: true });
  }

  try {
    await withWorkspace(
      workspaceUid,
      "",
      async () => {
        if (status === "active") {
          await savePlan(plan as PlanId);
        } else {
          // Only downgrade when this subscription is still the active billing record.
          const current = await loadBilling();
          if (current?.subscriptionId && subscription.id && current.subscriptionId !== subscription.id) return;
          await savePlan("trial");
        }
        await saveBilling({
          provider: "razorpay",
          plan,
          interval,
          status,
          subscriptionId: subscription.id ?? null,
          customerId: subscription.customer_id ?? null,
          customerEmail: notes.email ?? null,
          mode: billingTestMode() ? "test" : "live",
          updatedAt: new Date().toISOString(),
        });
        try {
          await appendAudit({
            actor: notes.email ?? "razorpay webhook",
            action: `billing.${type.replace(".", "_")}`,
            detail: `${plan} subscription ${status} via razorpay${billingTestMode() ? " - test mode" : ""}`,
          });
        } catch {
          // audit is best-effort
        }
      },
      { useAdmin: true },
    );
  } catch (error) {
    return Response.json({ error: error instanceof Error ? error.message : "Could not apply billing update." }, { status: 500 });
  }
  return Response.json({ received: true });
}
