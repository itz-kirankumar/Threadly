"use client";

import { useCallback, useEffect, useState } from "react";
import { BILLING_COUNTRIES, loadRazorpayScript } from "./BillingPanel";

interface CreditEntry {
  at: string;
  credits: number;
  kind: "grant" | "charge" | "refund";
  units: number;
  detail: string;
  balanceAfter: number;
}

interface CreditsStatus {
  balance: number;
  granted: number;
  spent: number;
  history: CreditEntry[];
  rates: Array<{ id: string; label: string; credits: number }>;
  packs: Array<{ id: string; name: string; credits: number; amount: number; currency: string }>;
  isOwner: boolean;
}

const price = (amount: number) => `$${(amount / 100).toFixed(amount % 100 ? 2 : 0)}`;

// Credit balance, what each action costs, pack purchase and recent history.
export default function CreditsPanel({ authedFetch }: { authedFetch: (path: string, init?: RequestInit) => Promise<unknown> }) {
  const [status, setStatus] = useState<CreditsStatus | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);
  const [busy, setBusy] = useState<string | null>(null);
  const [country, setCountry] = useState("");

  const load = useCallback(async () => {
    try {
      setStatus((await authedFetch("/api/credits")) as CreditsStatus);
      setError(null);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Could not load credits.");
    }
  }, [authedFetch]);

  useEffect(() => {
    load();
    if (typeof window !== "undefined" && new URLSearchParams(window.location.search).get("credits") === "success") {
      setNotice("Payment received. Your credits appear as soon as the payment provider confirms it, usually within seconds.");
      let attempts = 0;
      const timer = setInterval(() => {
        attempts += 1;
        load();
        if (attempts >= 6) clearInterval(timer);
      }, 5000);
      return () => clearInterval(timer);
    }
  }, [load]);

  const buy = async (packId: string) => {
    setError(null);
    setNotice(null);
    if (!/^[A-Z]{2}$/.test(country)) {
      setError("Choose your billing country first.");
      return;
    }
    setBusy(packId);
    try {
      const out = (await authedFetch("/api/credits/checkout", { method: "POST", body: JSON.stringify({ pack: packId, billingCountry: country }) })) as
        | { provider: "dodo"; checkoutUrl: string }
        | { provider: "razorpay"; orderId: string; amount: number; currency: string; keyId: string; prefill?: { email?: string | null; contact?: string | null } };
      if (out.provider === "dodo") {
        window.location.href = out.checkoutUrl;
        return;
      }
      await loadRazorpayScript();
      if (!window.Razorpay) throw new Error("Could not load the Razorpay checkout.");
      const pack = status?.packs.find((p) => p.id === packId);
      const rzp = new window.Razorpay({
        key: out.keyId,
        order_id: out.orderId,
        amount: out.amount,
        currency: out.currency,
        name: "Threadly",
        description: `${pack?.name ?? "Credit"} pack, ${pack?.credits.toLocaleString() ?? ""} credits`,
        ...(out.prefill?.email || out.prefill?.contact ? { prefill: { ...(out.prefill.email ? { email: out.prefill.email } : {}), ...(out.prefill.contact ? { contact: out.prefill.contact } : {}) } } : {}),
        handler: async (response: { razorpay_payment_id?: string; razorpay_order_id?: string; razorpay_signature?: string }) => {
          try {
            const res = (await authedFetch("/api/credits/verify", {
              method: "POST",
              body: JSON.stringify({ orderId: response.razorpay_order_id, paymentId: response.razorpay_payment_id, signature: response.razorpay_signature }),
            })) as { added: number; balance: number };
            setNotice(res.added ? `${res.added.toLocaleString()} credits added. Balance: ${res.balance.toLocaleString()}.` : "This payment was already added.");
          } catch (err) {
            setError(err instanceof Error ? err.message : "The payment could not be confirmed yet. Credits are added once Razorpay confirms it.");
          } finally {
            setBusy(null);
            load();
          }
        },
        modal: { ondismiss: () => { setBusy(null); setError("Checkout closed. No payment was made."); } },
      });
      rzp.on("payment.failed", () => {
        setBusy(null);
        setError("The payment failed and no charge was made.");
      });
      rzp.open();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Checkout could not start.");
      setBusy(null);
    }
  };

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-end justify-between gap-3 rounded-xl border border-white/10 bg-white/[0.02] p-4">
        <div>
          <p className="text-xs font-medium uppercase tracking-wider text-zinc-500">Credit balance</p>
          <p className="mt-1 text-3xl font-semibold tabular-nums text-white">{status ? status.balance.toLocaleString() : "…"}</p>
          {status && <p className="mt-1 text-xs text-zinc-500">{status.granted.toLocaleString()} added · {status.spent.toLocaleString()} used</p>}
        </div>
        {status && (
          <ul className="grid grid-cols-2 gap-x-6 gap-y-1 text-xs text-zinc-400 sm:grid-cols-3">
            {status.rates.map((r) => <li key={r.id}><span className="tabular-nums text-zinc-200">{r.credits}</span> · {r.label}</li>)}
          </ul>
        )}
      </div>

      {notice && <p className="rounded-lg border border-emerald-400/30 bg-emerald-500/10 px-3.5 py-2.5 text-xs text-emerald-200">{notice}</p>}
      {error && <p className="rounded-lg border border-red-400/30 bg-red-500/10 px-3.5 py-2.5 text-xs text-red-200">{error}</p>}

      {status?.isOwner && (
        <div className="rounded-xl border border-white/10 bg-white/[0.02] p-4">
          <div className="flex flex-wrap items-center justify-between gap-2">
            <h4 className="text-sm font-semibold text-white">Buy credits</h4>
            <label className="flex items-center gap-2 text-[11px] text-zinc-400">
              Billing country
              <select value={country} onChange={(e) => setCountry(e.target.value)} className="rounded-md border border-zinc-700 bg-zinc-900 px-2 py-1 text-[11px] text-zinc-200">
                <option value="">Choose…</option>
                {BILLING_COUNTRIES.map((c) => <option key={c.code} value={c.code}>{c.name}</option>)}
              </select>
            </label>
          </div>
          <div className="mt-3 grid gap-3 sm:grid-cols-3">
            {status.packs.map((p) => (
              <div key={p.id} className="flex flex-col rounded-lg border border-white/10 p-3">
                <p className="text-sm font-semibold text-white">{p.name}</p>
                <p className="mt-1 text-lg font-bold text-white">{price(p.amount)}</p>
                <p className="text-xs text-zinc-400">{p.credits.toLocaleString()} credits · {((p.amount / p.credits)).toFixed(1)}¢ each</p>
                <button type="button" disabled={busy !== null} onClick={() => buy(p.id)} className="ui-btn-primary mt-3 rounded-lg px-3 py-1.5 text-xs font-semibold disabled:opacity-50">
                  {busy === p.id ? "Opening checkout…" : `Buy ${p.name}`}
                </button>
              </div>
            ))}
          </div>
          <p className="mt-2 text-[11px] text-zinc-500">One-time payment. Credits do not expire during the beta. India billing uses Razorpay; other countries use Dodo Payments.</p>
        </div>
      )}

      {status && status.history.length > 0 && (
        <div className="overflow-hidden rounded-xl border border-white/10">
          <table className="w-full text-left text-xs">
            <thead className="bg-white/[0.03] text-zinc-500">
              <tr><th className="px-3 py-2 font-medium">When</th><th className="px-3 py-2 font-medium">What</th><th className="px-3 py-2 text-right font-medium">Credits</th><th className="px-3 py-2 text-right font-medium">Balance</th></tr>
            </thead>
            <tbody>
              {status.history.map((e, i) => (
                <tr key={`${e.at}-${i}`} className="border-t border-white/5 text-zinc-300">
                  <td className="whitespace-nowrap px-3 py-2 text-zinc-500">{new Date(e.at).toLocaleString()}</td>
                  <td className="px-3 py-2">{e.detail}{e.units > 1 ? ` (${e.units})` : ""}</td>
                  <td className={`px-3 py-2 text-right tabular-nums ${e.credits < 0 ? "text-zinc-300" : "text-emerald-300"}`}>{e.credits > 0 ? `+${e.credits}` : e.credits}</td>
                  <td className="px-3 py-2 text-right tabular-nums text-zinc-500">{e.balanceAfter.toLocaleString()}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}
