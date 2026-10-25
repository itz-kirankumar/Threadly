import { withWorkspace } from "@/lib/portal-db";
import { savePlan, type PlanId } from "@/lib/geo/plan";
import { adminConfigured } from "@/lib/geo/admin-store";
import { appendAudit } from "@/lib/geo/store";
import { billingTestMode, dodoClient, isInterval, isPaidPlan, planFromProductId, type BillingInterval, type PaidPlanId } from "@/lib/billing/dodo";
import { loadBilling, saveBilling } from "@/lib/billing/store";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

interface SubscriptionPayload {
  subscription_id?: string;
  product_id?: string;
  status?: string;
  customer?: { customer_id?: string; email?: string };
  metadata?: Record<string, string>;
}

async function applyPlan(workspaceUid: string, plan: PlanId, record: Parameters<typeof saveBilling>[0]): Promise<void> {
  await withWorkspace(
    workspaceUid,
    "",
    async () => {
      if (record.status === "cancelled" || record.status === "expired" || record.status === "failed") {
        // Only downgrade when this subscription is still the active billing record -
        // a stale cancel event must not clobber a newer subscription.
        const current = await loadBilling();
        if (current?.subscriptionId && record.subscriptionId && current.subscriptionId !== record.subscriptionId) return;
        await savePlan("trial");
        await saveBilling(record);
        return;
      }
      await savePlan(plan);
      await saveBilling(record);
    },
    { useAdmin: true },
  );
}

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
  let event: { type?: string; data?: SubscriptionPayload };
  try {
    event = dodoClient().webhooks.unwrap(rawBody, { headers, key: webhookKey }) as typeof event;
  } catch {
    return Response.json({ error: "Invalid signature." }, { status: 400 });
  }

  const type = event.type ?? "";
  const data = event.data ?? {};
  if (!type.startsWith("subscription.")) {
    // payment.* events are acknowledged; plan state follows subscription events.
    return Response.json({ received: true });
  }

  const metadata = data.metadata ?? {};
  const workspaceUid = metadata.workspace_uid;
  const metaPlan = metadata.plan;
  const metaInterval = metadata.interval;
  const plan: PaidPlanId | null = isPaidPlan(metaPlan) ? metaPlan : planFromProductId(data.product_id);
  const interval: BillingInterval | null = isInterval(metaInterval) ? metaInterval : null;

  if (!workspaceUid || !plan) {
    // Not a Threadly workspace subscription (or legacy without metadata) - ack without action.
    return Response.json({ received: true });
  }

  const status = type === "subscription.active" || type === "subscription.renewed"
    ? "active"
    : type === "subscription.on_hold"
      ? "on_hold"
      : type === "subscription.cancelled"
        ? "cancelled"
        : type === "subscription.expired"
          ? "expired"
          : type === "subscription.failed"
            ? "failed"
            : (data.status ?? "unknown");

  try {
    await applyPlan(workspaceUid, plan, {
      provider: "dodo",
      plan,
      interval,
      status,
      subscriptionId: data.subscription_id ?? null,
      customerId: data.customer?.customer_id ?? null,
      customerEmail: data.customer?.email ?? null,
      mode: billingTestMode() ? "test" : "live",
      updatedAt: new Date().toISOString(),
    });
    try {
      await withWorkspace(
        workspaceUid,
        "",
        () =>
          appendAudit({
            actor: data.customer?.email ?? "billing webhook",
            action: `billing.${type.replace(".", "_")}`,
            detail: `${plan} subscription ${status}${billingTestMode() ? " - test mode" : ""}`,
          }),
        { useAdmin: true },
      );
    } catch {
      // audit is best-effort
    }
  } catch (error) {
    return Response.json({ error: error instanceof Error ? error.message : "Could not apply billing update." }, { status: 500 });
  }
  return Response.json({ received: true });
}
