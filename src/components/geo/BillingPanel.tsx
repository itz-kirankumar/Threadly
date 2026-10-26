"use client";

import { useCallback, useEffect, useState } from "react";

interface BillingStatus {
  plan: "trial" | "pro" | "growth" | "enterprise";
  planLabel: string;
  billing: {
    provider?: "dodo" | "razorpay";
    plan: string;
    interval: "monthly" | "annual" | null;
    status: string;
    mode: "test" | "live";
    updatedAt: string;
    periodEnd?: string | null;
  } | null;
  billingAvailable: boolean;
  providers?: { dodo: boolean; razorpay: boolean };
  testMode: boolean;
  isOwner: boolean;
  canCheckout: boolean;
}

declare global {
  interface Window {
    Razorpay?: new (options: Record<string, unknown>) => { open: () => void; on: (event: string, handler: (response: unknown) => void) => void };
  }
}

function loadRazorpayScript(): Promise<void> {
  return new Promise((resolve, reject) => {
    if (window.Razorpay) return resolve();
    const script = document.createElement("script");
    script.src = "https://checkout.razorpay.com/v1/checkout.js";
    script.onload = () => resolve();
    script.onerror = () => reject(new Error("Could not load the Razorpay checkout."));
    document.body.appendChild(script);
  });
}

const PLANS = [
  { id: "pro" as const, name: "Pro", monthly: 49, annualMonthly: 39, blurb: "50 tracked questions, unlimited scans, 5 seats." },
  { id: "growth" as const, name: "Growth", monthly: 149, annualMonthly: 119, blurb: "150 tracked questions, 25 seats, audit log, API access." },
];

export default function BillingPanel({ authedFetch }: { authedFetch: (path: string, init?: RequestInit) => Promise<unknown> }) {
  const [status, setStatus] = useState<BillingStatus | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [annual, setAnnual] = useState(true);
  const [busyPlan, setBusyPlan] = useState<string | null>(null);
  const [provider, setProvider] = useState<"dodo" | "razorpay">("dodo");
  const [notice, setNotice] = useState<string | null>(null);

  const [quote, setQuote] = useState<{ due: number; currency: string; credit: number; remainingDays: number } | null>(null);
  const load = useCallback(async () => {
    try {
      const next = (await authedFetch("/api/billing/status")) as BillingStatus;
      setStatus(next);
      setQuote(null);
      if (next.billing?.provider === "razorpay" && next.billing.status === "active" && next.billing.plan === "pro" && next.billing.interval) {
        try {
          const q = (await authedFetch("/api/billing/razorpay/quote", {
            method: "POST",
            body: JSON.stringify({ plan: "growth", interval: next.billing.interval }),
          })) as { quote?: { due: number; currency: string; credit: number; remainingDays: number } | null };
          setQuote(q.quote ?? null);
        } catch {
          setQuote(null);
        }
      }
      setError(null);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Could not load billing.");
    }
  }, [authedFetch]);

  useEffect(() => {
    load();
    if (typeof window !== "undefined" && new URLSearchParams(window.location.search).get("billing") === "success") {
      setNotice("Checkout complete - your plan updates as soon as the payment provider confirms it (usually a few seconds).");
      // Poll a few times for the webhook to land.
      let attempts = 0;
      const timer = setInterval(() => {
        attempts += 1;
        load();
        if (attempts >= 6) clearInterval(timer);
      }, 5000);
      return () => clearInterval(timer);
    }
  }, [load]);

  const razorpayCheckout = async (plan: "pro" | "growth") => {
    const order = (await authedFetch("/api/billing/razorpay/order", {
      method: "POST",
      body: JSON.stringify({ plan, interval: annual ? "annual" : "monthly" }),
    })) as { orderId: string; amount: number; currency: string; keyId: string; prefill?: { email?: string | null; contact?: string | null } };
    await loadRazorpayScript();
    if (!window.Razorpay) throw new Error("Could not load the Razorpay checkout.");
    const rzp = new window.Razorpay({
      key: order.keyId,
      order_id: order.orderId,
      amount: order.amount,
      currency: order.currency,
      name: "Threadly",
      description: `${plan === "pro" ? "Pro" : "Growth"} - ${annual ? "annual" : "monthly"}`,
      ...(order.prefill?.email || order.prefill?.contact
        ? { prefill: { ...(order.prefill.email ? { email: order.prefill.email } : {}), ...(order.prefill.contact ? { contact: order.prefill.contact } : {}) }, readonly: { email: Boolean(order.prefill.email), contact: Boolean(order.prefill.contact) } }
        : {}),
      handler: async (response: { razorpay_payment_id?: string; razorpay_order_id?: string; razorpay_signature?: string }) => {
        try {
          await authedFetch("/api/billing/razorpay/verify", {
            method: "POST",
            body: JSON.stringify({
              orderId: response.razorpay_order_id,
              paymentId: response.razorpay_payment_id,
              signature: response.razorpay_signature,
            }),
          });
          setNotice("Payment confirmed - your plan is updated.");
          setBusyPlan(null);
          load();
        } catch (err) {
          setError(err instanceof Error ? err.message : "Payment could not be verified. No entitlement was granted.");
          setBusyPlan(null);
        }
      },
      modal: {
        ondismiss: () => {
          setBusyPlan(null);
          setError("Checkout closed - no payment was made.");
        },
      },
    });
    rzp.on("payment.failed", () => {
      setBusyPlan(null);
      setError("The payment failed - no charge was made. Try again or use another payment method.");
    });
    rzp.open();
  };

  const checkout = async (plan: "pro" | "growth") => {
    setBusyPlan(plan);
    setError(null);
    try {
      if (status?.providers?.razorpay && (!status.providers?.dodo || provider === "razorpay")) {
        await razorpayCheckout(plan);
        return;
      }
      const payload = (await authedFetch("/api/billing/checkout", {
        method: "POST",
        body: JSON.stringify({ plan, interval: annual ? "annual" : "monthly" }),
      })) as { checkoutUrl?: string };
      if (!payload.checkoutUrl) throw new Error("No checkout link returned.");
      window.location.href = payload.checkoutUrl;
    } catch (err) {
      setError(err instanceof Error ? err.message : "Could not start checkout.");
      setBusyPlan(null);
    }
  };

  if (!status && !error) return <p className="text-sm text-zinc-500">Loading billing…</p>;

  return (
    <div className="space-y-5">
      <div>
        <h3 className="text-sm font-semibold text-white">Billing</h3>
        <p className="mt-1 text-xs text-zinc-500">Plan and subscription for this workspace.</p>
      </div>

      {notice && (
        <p className="rounded-lg border border-emerald-400/30 bg-emerald-500/10 px-3.5 py-2.5 text-xs text-emerald-200">{notice}</p>
      )}
      {error && (
        <p className="rounded-lg border border-red-400/30 bg-red-500/10 px-3.5 py-2.5 text-xs text-red-200">{error}</p>
      )}

      {status && (
        <>
          <div className="rounded-xl border border-white/10 bg-white/[0.02] p-4">
            <div className="flex flex-wrap items-center gap-2.5">
              <span className="text-sm font-medium text-white">Current plan: {status.planLabel}</span>
              {status.billing?.mode === "test" && (
                <span className="rounded-full bg-amber-500/15 px-2 py-0.5 text-[11px] font-medium text-amber-300">
                  Test mode - no real charges
                </span>
              )}
            </div>
            {status.billing && (
              <p className="mt-1.5 text-xs text-zinc-500">
                {status.billing.provider === "razorpay" ? "One-time purchase" : "Subscription"} {status.billing.status}
                {status.billing.provider ? ` via ${status.billing.provider === "dodo" ? "Dodo Payments" : "Razorpay"}` : ""}
                {status.billing.interval ? ` · ${status.billing.interval} term` : ""}
                {status.billing.provider === "razorpay" && status.billing.periodEnd
                  ? ` · expires ${new Date(status.billing.periodEnd).toLocaleDateString()} (${Math.max(0, Math.ceil((Date.parse(status.billing.periodEnd) - Date.now()) / 86400000))} days left)`
                  : status.billing.provider === "dodo" && status.billing.status === "active"
                    ? " · renews automatically"
                    : status.billing.provider === "dodo"
                      ? ` · ${status.billing.status}`
                      : ""}
                {` · updated ${new Date(status.billing.updatedAt).toLocaleString()}`}
              </p>
            )}
            {status.plan === "trial" && (
              <p className="mt-1.5 text-xs text-zinc-500">Free trial: 1 full scan, 10 tracked questions, 7-day history.</p>
            )}
          </div>

          {status.billingAvailable && status.isOwner && !status.canCheckout && (
            <p className="rounded-lg border border-white/10 bg-white/[0.02] px-3.5 py-2.5 text-xs text-zinc-500">Billing is in test mode while launch is prepared - checkout opens when payments go live.</p>
          )}
          {status.billingAvailable && status.isOwner && status.canCheckout && (
            <>
              <div className="flex items-center gap-3 text-sm">
                <span className={annual ? "text-zinc-500" : "text-zinc-200"}>Monthly</span>
                <button
                  type="button"
                  role="switch"
                  aria-checked={annual}
                  onClick={() => setAnnual(!annual)}
                  className={`relative h-6 w-11 rounded-full transition ${annual ? "bg-violet-500" : "bg-zinc-700"}`}
                >
                  <span className={`absolute top-0.5 h-5 w-5 rounded-full bg-white transition-all ${annual ? "left-[22px]" : "left-0.5"}`} />
                </button>
                <span className={annual ? "text-zinc-200" : "text-zinc-500"}>
                  Annual <span className="ml-1 rounded-full bg-emerald-500/15 px-2 py-0.5 text-[11px] font-medium text-emerald-300">Save 20%</span>
                </span>
              </div>

              <div className="grid gap-4 md:grid-cols-2">
                {PLANS.map((plan) => (
                  <div key={plan.id} className="rounded-xl border border-white/10 bg-white/[0.02] p-4">
                    <div className="flex items-baseline justify-between">
                      <h4 className="text-sm font-semibold text-white">{plan.name}</h4>
                      <p className="text-sm text-zinc-300">
                        <span className="text-lg font-bold text-white">${annual ? plan.annualMonthly : plan.monthly}</span>/mo
                      </p>
                    </div>
                    <p className="mt-1 text-xs text-zinc-500">{plan.blurb}</p>
                    <p className="mt-0.5 text-[11px] text-zinc-600">{annual ? "Billed annually" : "Billed monthly"}</p>
                    <button
                      type="button"
                      disabled={busyPlan !== null || status.plan === plan.id}
                      onClick={() => checkout(plan.id)}
                      className="mt-3.5 w-full rounded-lg border border-white/15 py-2 text-sm font-semibold text-white transition hover:bg-white/[0.06] disabled:cursor-not-allowed disabled:opacity-50"
                    >
                      {status.plan === plan.id
                        ? "Current plan"
                        : busyPlan === plan.id
                          ? "Opening checkout…"
                          : quote && plan.id === "growth" && provider === "razorpay"
                            ? `Upgrade to ${plan.name} - pay $${(quote.due / 100).toFixed(2)}`
                            : `Upgrade to ${plan.name}`}
                    </button>
                  </div>
                ))}
              </div>

              <p className="text-[11px] leading-relaxed text-zinc-600">
                {quote && provider === "razorpay" && status.billing?.plan === "pro" && (
                  <span className="mt-1.5 block text-[11px] text-zinc-500">
                    Upgrade quote: ${(quote.credit / 100).toFixed(2)} unused Pro time credited against Growth for the remaining {quote.remainingDays} days - you pay only the difference. The term end date does not change.
                  </span>
                )}
                {status.providers?.dodo && status.providers?.razorpay ? (
                  <span className="mt-2 inline-flex items-center gap-1 rounded-full border border-zinc-700 p-0.5 text-[11px]">
                    <button
                      type="button"
                      onClick={() => setProvider("dodo")}
                      className={`rounded-full px-2.5 py-1 ${provider === "dodo" ? "bg-zinc-100 text-zinc-900" : "text-zinc-400"}`}
                    >
                      Card via Dodo (subscription)
                    </button>
                    <button
                      type="button"
                      onClick={() => setProvider("razorpay")}
                      className={`rounded-full px-2.5 py-1 ${provider === "razorpay" ? "bg-zinc-100 text-zinc-900" : "text-zinc-400"}`}
                    >
                      Razorpay (one-time)
                    </button>
                  </span>
                ) : status.providers?.razorpay ? (
                  "Checkout uses Razorpay - one-time purchase, each payment covers the selected term."
                ) : (
                  "Checkout uses Dodo Payments."
                )}
                {status.testMode ? " Billing is in test mode while launch is prepared - checkouts run against the payment sandbox and no real card is charged." : ""}
              </p>
            </>
          )}

          {status.billingAvailable && !status.isOwner && (
            <p className="text-xs text-zinc-500">Only the workspace owner can change the plan.</p>
          )}
        </>
      )}
    </div>
  );
}
