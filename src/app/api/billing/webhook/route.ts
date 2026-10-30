import { withWorkspace } from "@/lib/portal-db";
import { grantPack } from "@/lib/credits/ledger";
import { decideCreditGrant } from "@/lib/credits/fulfil";
import { savePlan } from "@/lib/geo/plan";
import { adminConfigured } from "@/lib/geo/admin-store";
import { appendAudit } from "@/lib/geo/store";
import { billingTestMode, dodoClient, isInterval, isPaidPlan, planFromProductId, type BillingInterval, type PaidPlanId } from "@/lib/billing/dodo";
import { decideTransition, type IncomingStatus } from "@/lib/billing/entitlement";
import { loadBilling, loadCheckoutAttempt, recordWebhookEvent, saveBilling, saveCheckoutAttempt, webhookEventProcessed } from "@/lib/billing/store";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

interface SubscriptionPayload {
  subscription_id?: string;
  product_id?: string;
  status?: string;
  created_at?: string;
  updated_at?: string;
  next_billing_date?: string;
  cancel_at_next_billing_date?: boolean;
  customer?: { customer_id?: string; email?: string };
  metadata?: Record<string, string>;
}

const STATUS_BY_EVENT: Record<string, IncomingStatus> = {
  "subscription.active": "active",
  "subscription.renewed": "active",
  "subscription.plan_changed": "active",
  "subscription.past_due": "grace",
  "subscription.on_hold": "grace",
  "subscription.cancelled": "ended",
  "subscription.expired": "ended",
  "subscription.failed": "ended",
};

export async function POST(request: Request) {
  const webhookKey = process.env.DODO_PAYMENTS_WEBHOOK_KEY;
  if (!webhookKey || !process.env.DODO_PAYMENTS_API_KEY) {
    return Response.json({ error: "Billing webhook is not configured." }, { status: 503 });
  }
  if (!adminConfigured()) {
    return Response.json({ error: "Workspace storage is not configured." }, { status: 503 });
  }
  const rawBody = await request.text();
  const headers: Record<string, string> = {};
  for (const name of ["webhook-id", "webhook-signature", "webhook-timestamp"]) {
    const value = request.headers.get(name);
    if (value) headers[name] = value;
  }
  let event: { type?: string; timestamp?: string; data?: SubscriptionPayload };
  try {
    event = dodoClient().webhooks.unwrap(rawBody, { headers, key: webhookKey }) as typeof event;
  } catch {
    return Response.json({ error: "Invalid signature." }, { status: 400 });
  }

  const type = event.type ?? "";
  // Credit packs are one-time payments: add the credits once per payment id.
  if (type === "payment.succeeded") {
    const payment = (event.data ?? {}) as { payment_id?: string; status?: string; total_amount?: number; currency?: string; metadata?: Record<string, string>; product_cart?: Array<{ product_id?: string }> | null };
    const decision = decideCreditGrant({
      provider: "dodo",
      paymentId: payment.payment_id,
      status: payment.status ?? "succeeded",
      amount: payment.total_amount,
      currency: payment.currency,
      tags: payment.metadata,
      productIds: (payment.product_cart ?? []).map((item) => item.product_id ?? "").filter(Boolean),
    });
    if (decision.grant) {
      try {
        await grantPack(decision.workspaceUid, decision.credits, decision.reason, decision.ref);
      } catch (error) {
        console.error("[credits] dodo webhook grant failed", error);
        return Response.json({ error: "Credit grant failed." }, { status: 500 });
      }
    }
    return Response.json({ received: true });
  }
  if (!type.startsWith("subscription.")) return Response.json({ received: true });
  const status = STATUS_BY_EVENT[type];
  if (!status) return Response.json({ received: true });

  const data = event.data ?? {};
  const metadata = data.metadata ?? {};
  const workspaceUid = metadata.workspace_uid;
  const plan: PaidPlanId | null = isPaidPlan(metadata.plan) ? metadata.plan : planFromProductId(data.product_id);
  const interval: BillingInterval | null = isInterval(metadata.interval) ? metadata.interval : null;
  if (!workspaceUid || !plan) return Response.json({ received: true });

  const eventId = headers["webhook-id"] ?? null;
  const eventAt = event.timestamp ?? data.updated_at ?? data.created_at ?? null;

  try {
    const result = await withWorkspace(
      workspaceUid,
      "",
      async () => {
        if (eventId && (await webhookEventProcessed(`dodo:${eventId}`))) return "duplicate";
        const decision = decideTransition(await loadBilling(), {
          provider: "dodo",
          eventId,
          eventAt,
          subscriptionId: data.subscription_id ?? null,
          customerId: data.customer?.customer_id ?? null,
          customerEmail: data.customer?.email ?? null,
          plan,
          interval,
          status,
          mode: billingTestMode() ? "test" : "live",
          nextBillingDate: data.next_billing_date ?? null,
          cancelAtPeriodEnd: data.cancel_at_next_billing_date ?? null,
        });
        if (decision.action === "ignore") return `ignored: ${decision.reason}`;
        if (decision.action === "downgrade") await savePlan("trial");
        else await savePlan(decision.plan);
        await saveBilling(decision.record);
        if (eventId) await recordWebhookEvent(`dodo:${eventId}`);
        // A confirmed subscription reconciles any uncertain/pending checkout attempt.
        try {
          const attempt = await loadCheckoutAttempt(workspaceUid);
          if (attempt && attempt.provider === "dodo" && (attempt.state === "uncertain" || attempt.state === "pending")) {
            await saveCheckoutAttempt(workspaceUid, { ...attempt, state: "reconciled", updatedAt: new Date().toISOString() });
          }
        } catch {
          // best-effort
        }
        try {
          await appendAudit({
            actor: data.customer?.email ?? "billing webhook",
            action: `billing.${type.replace(".", "_")}`,
            detail: `${plan} -> ${decision.action} (${decision.note})${billingTestMode() ? " - test mode" : ""}`,
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
