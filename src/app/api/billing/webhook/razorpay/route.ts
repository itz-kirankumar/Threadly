import { withWorkspace } from "@/lib/portal-db";
import { savePlan } from "@/lib/geo/plan";
import { adminConfigured } from "@/lib/geo/admin-store";
import { appendAudit } from "@/lib/geo/store";
import { billingTestMode, isInterval, isPaidPlan, type BillingInterval, type PaidPlanId } from "@/lib/billing/dodo";
import { razorpayPlanFromPlanId, verifyRazorpaySignature } from "@/lib/billing/razorpay";
import { decideTransition, type IncomingStatus } from "@/lib/billing/entitlement";
import { loadBilling, recordWebhookEvent, saveBilling, webhookEventProcessed } from "@/lib/billing/store";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

interface RazorpayWebhookPayload {
  event?: string;
  created_at?: number; // unix seconds
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

const STATUS_BY_EVENT: Record<string, IncomingStatus> = {
  "subscription.activated": "active",
  "subscription.charged": "active",
  "subscription.resumed": "active",
  "subscription.pending": "grace",
  "subscription.cancelled": "ended",
  "subscription.completed": "ended",
  "subscription.expired": "ended",
  "subscription.halted": "ended",
};

export async function POST(request: Request) {
  if (!process.env.RAZORPAY_WEBHOOK_SECRET || !process.env.RAZORPAY_KEY_ID) {
    return Response.json({ error: "Razorpay webhook is not configured." }, { status: 503 });
  }
  if (!adminConfigured()) {
    return Response.json({ error: "Workspace storage is not configured." }, { status: 503 });
  }
  const rawBody = await request.text();
  const signature = request.headers.get("x-razorpay-signature");
  if (!verifyRazorpaySignature(rawBody, signature)) {
    return Response.json({ error: "Invalid signature." }, { status: 400 });
  }
  const event = JSON.parse(rawBody) as RazorpayWebhookPayload;
  const type = event.event ?? "";
  const status = STATUS_BY_EVENT[type];
  if (!status) return Response.json({ received: true });

  const subscription = event.payload?.subscription?.entity ?? {};
  const notes = subscription.notes ?? {};
  const workspaceUid = notes.workspace_uid;
  const plan: PaidPlanId | null = isPaidPlan(notes.plan) ? notes.plan : razorpayPlanFromPlanId(subscription.plan_id);
  const interval: BillingInterval | null = isInterval(notes.interval) ? notes.interval : null;
  if (!workspaceUid || !plan) return Response.json({ received: true });

  // Razorpay retries deliveries; dedupe on event+subscription id.
  const eventId = subscription.id ? `${type}:${subscription.id}:${event.created_at ?? ""}` : null;
  const eventAt = event.created_at ? new Date(event.created_at * 1000).toISOString() : null;

  try {
    const result = await withWorkspace(
      workspaceUid,
      "",
      async () => {
        if (eventId && (await webhookEventProcessed(`razorpay:${eventId}`))) return "duplicate";
        const decision = decideTransition(await loadBilling(), {
          provider: "razorpay",
          eventId,
          eventAt,
          subscriptionId: subscription.id ?? null,
          customerId: subscription.customer_id ?? null,
          customerEmail: notes.email ?? null,
          plan,
          interval,
          status,
          mode: billingTestMode() ? "test" : "live",
        });
        if (decision.action === "ignore") return `ignored: ${decision.reason}`;
        if (decision.action === "downgrade") await savePlan("trial");
        else await savePlan(decision.plan);
        await saveBilling(decision.record);
        if (eventId) await recordWebhookEvent(`razorpay:${eventId}`);
        try {
          await appendAudit({
            actor: notes.email ?? "razorpay webhook",
            action: `billing.${type.replace(".", "_")}`,
            detail: `${plan} -> ${decision.action} (${decision.note}) via razorpay${billingTestMode() ? " - test mode" : ""}`,
          });
        } catch {
          // audit is best-effort
        }
        return decision.action;
      },
      { useAdmin: true },
    );
    return Response.json({ received: true, result });
  } catch (error) {
    return Response.json({ error: error instanceof Error ? error.message : "Could not apply billing update." }, { status: 500 });
  }
}
