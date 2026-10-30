import { grantPack } from "@/lib/credits/ledger";
import { decideCreditGrant } from "@/lib/credits/fulfil";
import { withWorkspace } from "@/lib/portal-db";
import { savePlan } from "@/lib/geo/plan";
import { adminConfigured } from "@/lib/geo/admin-store";
import { appendAudit } from "@/lib/geo/store";
import { billingTestMode, isInterval, isPaidPlan, type BillingInterval, type PaidPlanId } from "@/lib/billing/dodo";
import { razorpayPlanFromPlanId, razorpayTestMode, verifyRazorpaySignature } from "@/lib/billing/razorpay";
import { decideTransition, type IncomingStatus } from "@/lib/billing/entitlement";
import { loadBilling, loadCheckoutAttempt, recordWebhookEvent, saveBilling, saveCheckoutAttempt, webhookEventProcessed } from "@/lib/billing/store";

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
    payment?: {
      entity?: {
        id?: string;
        order_id?: string;
        status?: string;
        amount?: number;
        currency?: string;
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

  // One-time order flow (Standard Checkout): reconcile the durable attempt.
  // Entitlement itself is granted by the verify route (signature + server-side
  // payment fetch); the webhook only keeps attempt state honest.
  if (type === "payment.captured" || type === "payment.failed") {
    const payment = event.payload?.payment?.entity ?? {};
    // Credit packs: add the credits (idempotent by payment id, so the verify
    // route and this webhook can both report the same payment).
    if (payment.notes?.kind === "credits") {
      const decision = decideCreditGrant({ provider: "razorpay", paymentId: payment.id, status: payment.status, amount: payment.amount, currency: payment.currency, tags: payment.notes });
      if (decision.grant) {
        try {
          await grantPack(decision.workspaceUid, decision.credits, decision.reason, decision.ref);
        } catch (error) {
          console.error("[credits] razorpay webhook grant failed", error);
          return Response.json({ error: "Credit grant failed." }, { status: 500 });
        }
      }
      return Response.json({ received: true });
    }
    const workspaceUid = payment.notes?.workspace_uid;
    if (workspaceUid && payment.order_id) {
      try {
        const attempt = await loadCheckoutAttempt(workspaceUid);
        if (attempt && attempt.providerRef === payment.order_id && (attempt.state === "issued" || attempt.state === "pending" || attempt.state === "uncertain")) {
          await saveCheckoutAttempt(workspaceUid, {
            ...attempt,
            state: type === "payment.captured" ? "reconciled" : "failed",
            updatedAt: new Date().toISOString(),
          });
        }
      } catch {
        // attempt reconciliation is best-effort
      }
    }
    return Response.json({ received: true });
  }

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
          mode: razorpayTestMode() ? "test" : "live",
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
            detail: `${plan} -> ${decision.action} (${decision.note}) via razorpay${razorpayTestMode() ? " - test mode" : ""}`,
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
