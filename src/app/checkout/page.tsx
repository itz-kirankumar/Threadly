"use client";

import { Suspense, useEffect, useState } from "react";
import { useSearchParams } from "next/navigation";
import Link from "next/link";
import SupportLink from "@/components/SupportLink";

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
    script.onerror = () => reject(new Error("Could not load the checkout."));
    document.body.appendChild(script);
  });
}

const PLANS: Record<string, { name: string; monthly: number; annual: number }> = {
  pro: { name: "Pro", monthly: 49, annual: 468 },
  growth: { name: "Growth", monthly: 149, annual: 1428 },
};

function CheckoutInner() {
  const params = useSearchParams();
  const planId = params.get("plan") === "growth" ? "growth" : "pro";
  const interval = params.get("interval") === "monthly" ? "monthly" : "annual";
  const plan = PLANS[planId];
  const price = interval === "annual" ? plan.annual : plan.monthly;
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [testMode, setTestMode] = useState<boolean | null>(null);

  useEffect(() => {
    fetch("/api/billing/guest/order", { cache: "no-store" })
      .then((r) => r.json())
      .then((d) => setTestMode(Boolean(d.testMode)))
      .catch(() => setTestMode(null));
  }, []);

  const pay = async () => {
    setBusy(true);
    setError(null);
    try {
      const res = await fetch("/api/billing/guest/order", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ plan: planId, interval }),
      });
      const order = await res.json();
      if (!res.ok) throw new Error(order.error || "Could not start checkout.");
      setTestMode(Boolean(order.testMode));
      await loadRazorpayScript();
      if (!window.Razorpay) throw new Error("Could not load the checkout.");
      const rzp = new window.Razorpay({
        key: order.keyId,
        order_id: order.orderId,
        amount: order.amount,
        currency: order.currency,
        name: "Threadly",
        description: `${plan.name} - ${interval}`,
        handler: async (response: { razorpay_payment_id?: string; razorpay_order_id?: string; razorpay_signature?: string }) => {
          try {
            const confirm = await fetch("/api/billing/guest/confirm", {
              method: "POST",
              headers: { "Content-Type": "application/json" },
              body: JSON.stringify({
                claimId: order.claimId,
                orderId: response.razorpay_order_id,
                paymentId: response.razorpay_payment_id,
                signature: response.razorpay_signature,
              }),
            });
            const confirmed = await confirm.json();
            if (!confirm.ok) throw new Error(confirmed.error || "Payment could not be confirmed yet.");
            sessionStorage.setItem("threadly_claim", JSON.stringify({ claimId: order.claimId, claimSecret: order.claimSecret }));
            window.location.href = `/billing/claim/${order.claimId}`;
          } catch (err) {
            setError(err instanceof Error ? err.message : "Payment could not be confirmed yet. Your claim link keeps the purchase safe.");
            setBusy(false);
          }
        },
        modal: { ondismiss: () => { setBusy(false); } },
      });
      rzp.on("payment.failed", () => {
        setBusy(false);
        setError("The payment failed - no charge was made. Try again.");
      });
      rzp.open();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Could not start checkout.");
      setBusy(false);
    }
  };

  return (
    <main className="mx-auto flex min-h-screen max-w-md flex-col justify-center px-6 py-16">
      <Link href="/" className="mb-8 text-sm text-zinc-500 hover:text-zinc-300">&larr; Threadly</Link>
      <h1 className="text-2xl font-semibold text-white">{plan.name} - {interval === "annual" ? "Annual" : "Monthly"}</h1>
      <p className="mt-1 text-3xl font-bold text-white">${price}<span className="text-sm font-normal text-zinc-500"> {interval === "annual" ? "/year" : "/month"}</span></p>
      <div className="mt-6 rounded-xl border border-amber-400/30 bg-amber-500/10 p-4 text-sm text-amber-100">
        Enter the email and mobile number of the Threadly account you want this plan linked to. Use these same details when signing in or creating your account.
      </div>
      <p className="mt-3 text-xs text-zinc-500">One-time purchase for the selected term. No sign-in needed to pay - you link the plan to your account after payment.</p>
      {testMode && (
        <div className="mt-3 rounded-xl border border-amber-400/30 bg-amber-500/10 p-3 text-xs text-amber-200">
          TEST MODE - no real charges. Payments run against the Razorpay sandbox, and while launch is prepared a purchase can only be linked to pre-approved test accounts.
        </div>
      )}
      {error && (
        <div className="mt-4 rounded-lg border border-red-400/30 bg-red-500/10 px-3.5 py-2.5 text-xs text-red-200">
          <p>{error}</p>
          <SupportLink reference={undefined} />
        </div>
      )}
      <button
        type="button"
        onClick={pay}
        disabled={busy}
        className="mt-6 rounded-lg bg-white px-4 py-3 text-sm font-semibold text-zinc-900 transition hover:bg-zinc-200 disabled:opacity-50"
      >
        {busy ? "Opening secure checkout…" : `Pay $${price} securely`}
      </button>
      <p className="mt-3 text-center text-[11px] text-zinc-600">
        Payments by Razorpay.
      </p>
    </main>
  );
}

export default function CheckoutPage() {
  return (
    <Suspense>
      <CheckoutInner />
    </Suspense>
  );
}
