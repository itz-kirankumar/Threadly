"use client";

import { Suspense, useEffect, useState } from "react";
import { useSearchParams } from "next/navigation";
import Link from "next/link";
import { onAuthStateChanged, type User } from "firebase/auth";
import SupportLink from "@/components/SupportLink";
import Footer from "@/components/Footer";
import { getFirebaseAuth } from "@/lib/firebase-client";

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
  trial: { name: "7-Day Trial", monthly: 7, annual: 7 },
};

function CheckoutInner() {
  const params = useSearchParams();
  const requestedPlan = params.get("plan");
  const planId = requestedPlan === "growth" || requestedPlan === "trial" ? requestedPlan : "pro";
  const isTrial = planId === "trial";
  const interval = isTrial ? "weekly" : params.get("interval") === "monthly" ? "monthly" : "annual";
  const plan = PLANS[planId];
  const price = interval === "annual" ? plan.annual : plan.monthly;
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [testMode, setTestMode] = useState<boolean | null>(null);
  const [activePlanLabel, setActivePlanLabel] = useState<string | null>(null);
  const [claimRef, setClaimRef] = useState<string | null>(null);
  const [checkingPlan, setCheckingPlan] = useState(true);
  const [promoOpen, setPromoOpen] = useState(false);
  const [promoCode, setPromoCode] = useState("");
  const [promoEmail, setPromoEmail] = useState("");
  const [promoContact, setPromoContact] = useState("");
  const [currentUser, setCurrentUser] = useState<User | null>(null);

  // A signed-in visitor who already has a paid plan must not buy a second one
  // here: route them to manage/upgrade before any payment happens.
  useEffect(() => {
    let cancelled = false;
    const unsubscribe = onAuthStateChanged(getFirebaseAuth(), async (user) => {
      if (cancelled) return;
      setCurrentUser(user);
      if (!user) {
        setCheckingPlan(false);
        return;
      }
      try {
        const token = await user.getIdToken();
        const res = await fetch("/api/billing/status", {
          headers: { Authorization: `Bearer ${token}` },
          cache: "no-store",
        });
        if (!cancelled && res.ok) {
          const data = (await res.json()) as { plan?: string; planLabel?: string };
          if (data.plan && data.plan !== "trial") {
            setActivePlanLabel(data.planLabel || "paid");
          }
        }
      } catch {
        // Status check failed - leave the guest flow usable rather than blocking it.
      } finally {
        if (!cancelled) setCheckingPlan(false);
      }
    });
    return () => {
      cancelled = true;
      unsubscribe();
    };
  }, []);

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
      const headers: Record<string, string> = { "Content-Type": "application/json" };
      if (currentUser) {
        try {
          headers.Authorization = `Bearer ${await currentUser.getIdToken()}`;
        } catch {
          // Token refresh failed - the server treats the call as a guest.
        }
      }
      const res = await fetch("/api/billing/guest/order", {
        method: "POST",
        headers,
        body: JSON.stringify({ plan: planId, interval }),
      });
      const order = await res.json();
      if (res.status === 409 && order.code === "active_plan") {
        setActivePlanLabel((prev) => prev || "paid");
        setBusy(false);
        return;
      }
      if (!res.ok) throw new Error(order.error || "Could not start checkout.");
      setTestMode(Boolean(order.testMode));
      // Persist purchase authority immediately, BEFORE the modal opens: if the
      // browser dies between capture and confirm, this browser can still
      // recover the purchase through the claim page.
      try {
        sessionStorage.setItem("threadly_claim", JSON.stringify({ claimId: order.claimId, claimSecret: order.claimSecret }));
        setClaimRef(order.claimId);
      } catch {
        // Storage unavailable - the post-confirm redirect still carries recovery.
      }
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

  const redeem = async () => {
    setBusy(true);
    setError(null);
    try {
      const headers: Record<string, string> = { "Content-Type": "application/json" };
      if (currentUser) {
        try { headers.Authorization = `Bearer ${await currentUser.getIdToken()}`; } catch { /* guest path */ }
      }
      const res = await fetch("/api/billing/guest/redeem", {
        method: "POST",
        headers,
        body: JSON.stringify({ plan: "trial", interval: "weekly", email: promoEmail, contact: promoContact, promoCode }),
      });
      const data = await res.json();
      if (res.status === 409 && data.code === "active_plan") {
        setActivePlanLabel((prev) => prev || "paid");
        setBusy(false);
        return;
      }
      if (!res.ok) throw new Error(data.error || "That code could not be applied.");
      sessionStorage.setItem("threadly_claim", JSON.stringify({ claimId: data.claimId, claimSecret: data.claimSecret }));
      window.location.href = `/billing/claim/${data.claimId}`;
    } catch (err) {
      setError(err instanceof Error ? err.message : "That code could not be applied.");
      setBusy(false);
    }
  };

  return (
    <div className="flex min-h-screen flex-col">
    <main className="mx-auto flex w-full max-w-md flex-1 flex-col justify-center px-6 py-16">
      <Link href="/" className="mb-8 text-sm text-zinc-500 hover:text-zinc-300">&larr; Threadly</Link>
      <h1 className="text-2xl font-semibold text-white">{isTrial ? plan.name : `${plan.name} - ${interval === "annual" ? "Annual" : "Monthly"}`}</h1>
      <p className="mt-1 text-3xl font-bold text-white">${price}<span className="text-sm font-normal text-zinc-500"> {isTrial ? "one-time - 7 days" : interval === "annual" ? "/year" : "/month"}</span></p>
      <div className="mt-6 rounded-xl border border-amber-400/30 bg-amber-500/10 p-4 text-sm text-amber-100">
        Enter the email and mobile number of the Threadly account you want this plan linked to. Use these same details when signing in or creating your account.
      </div>
      <p className="mt-3 text-xs text-zinc-500">One-time purchase for the selected term - no auto-renewal. No sign-in needed to pay: you link the plan to your account after payment.</p>
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
      {isTrial && !activePlanLabel && (
        <div className="mt-4">
          {!promoOpen ? (
            <button type="button" onClick={() => setPromoOpen(true)} className="text-xs text-zinc-400 underline underline-offset-2 hover:text-zinc-200">
              Have a code?
            </button>
          ) : (
            <div className="rounded-xl border border-white/10 bg-white/[0.03] p-4">
              <label className="block text-xs text-zinc-400">Promo code</label>
              <input
                value={promoCode}
                onChange={(e) => setPromoCode(e.target.value)}
                placeholder="GOTHREADLY100"
                className="mt-1 w-full rounded-lg border border-white/10 bg-zinc-900 px-3 py-2 text-sm text-white outline-none focus:border-white/30"
              />
              {promoCode.trim() && (
                <>
                  <label className="mt-3 block text-xs text-zinc-400">Account email</label>
                  <input
                    value={promoEmail}
                    onChange={(e) => setPromoEmail(e.target.value)}
                    type="email"
                    placeholder="you@example.com"
                    className="mt-1 w-full rounded-lg border border-white/10 bg-zinc-900 px-3 py-2 text-sm text-white outline-none focus:border-white/30"
                  />
                  <label className="mt-3 block text-xs text-zinc-400">Account mobile (with country code)</label>
                  <input
                    value={promoContact}
                    onChange={(e) => setPromoContact(e.target.value)}
                    type="tel"
                    placeholder="+91 98765 43210"
                    className="mt-1 w-full rounded-lg border border-white/10 bg-zinc-900 px-3 py-2 text-sm text-white outline-none focus:border-white/30"
                  />
                  <button
                    type="button"
                    onClick={redeem}
                    disabled={busy || !promoEmail.trim() || !promoContact.trim()}
                    className="mt-4 w-full rounded-lg bg-emerald-400 px-4 py-3 text-sm font-semibold text-emerald-950 transition hover:bg-emerald-300 disabled:opacity-50"
                  >
                    {busy ? "Applying…" : "Claim free trial"}
                  </button>
                  <p className="mt-2 text-[11px] text-zinc-500">If the code is valid, the trial is free - no payment is taken. The details above must match your Threadly account.</p>
                </>
              )}
            </div>
          )}
        </div>
      )}
      {activePlanLabel ? (
        <div className="mt-6 rounded-xl border border-emerald-400/30 bg-emerald-500/10 p-4 text-sm text-emerald-100">
          <p className="font-semibold">You already have an active {activePlanLabel} plan.</p>
          <p className="mt-1 text-emerald-200/80">
            You are signed in, so this checkout is disabled - a second purchase would not add anything. Manage or upgrade your plan from your billing settings instead.
          </p>
          <Link
            href="/portal"
            className="mt-3 inline-block rounded-lg bg-emerald-400 px-4 py-2 text-xs font-semibold text-emerald-950 transition hover:bg-emerald-300"
          >
            Go to billing settings
          </Link>
        </div>
      ) : (
        <button
          type="button"
          onClick={pay}
          disabled={busy || checkingPlan}
          className="mt-6 rounded-lg bg-white px-4 py-3 text-sm font-semibold text-zinc-900 transition hover:bg-zinc-200 disabled:opacity-50"
        >
          {busy ? "Opening secure checkout…" : checkingPlan ? "Checking your account…" : `Pay $${price} securely`}
        </button>
      )}
      {claimRef && (
        <p className="mt-3 text-[11px] text-zinc-500">
          Purchase reference: <span className="font-mono text-zinc-300">{claimRef}</span> - keep it to recover this purchase if anything interrupts the payment.
        </p>
      )}
      <p className="mt-3 text-center text-[11px] text-zinc-600">
        Payments by Razorpay.
      </p>
    </main>
    <Footer />
    </div>
  );
}

export default function CheckoutPage() {
  return (
    <Suspense>
      <CheckoutInner />
    </Suspense>
  );
}
