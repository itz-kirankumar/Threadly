"use client";

import Link from "next/link";
import { useState } from "react";

interface Outcome {
  status: "invited" | "waitlisted";
  score: number;
  reasons: string[];
  already?: boolean;
}

// Beta access request. The server scores lead-generation fit and either
// invites at once or adds to the waitlist; the reasons are shown either way.
export default function EarlyAccess() {
  const [form, setForm] = useState({ email: "", domain: "", role: "", useCase: "" });
  const [state, setState] = useState<"idle" | "sending" | "error">("idle");
  const [error, setError] = useState("");
  const [outcome, setOutcome] = useState<Outcome | null>(null);
  const set = (key: keyof typeof form) => (e: React.ChangeEvent<HTMLInputElement | HTMLTextAreaElement>) => setForm((f) => ({ ...f, [key]: e.target.value }));

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    setState("sending");
    setError("");
    try {
      const res = await fetch("/api/waitlist", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(form) });
      const body = await res.json();
      if (!res.ok) throw new Error(body.error ?? "Your request could not be sent.");
      setOutcome(body as Outcome);
      setState("idle");
    } catch (err) {
      setError(err instanceof Error ? err.message : "Your request could not be sent.");
      setState("error");
    }
  }

  const field = "w-full rounded-xl border border-zinc-300 bg-white px-3 py-2.5 text-sm text-zinc-900 placeholder-zinc-400 focus:border-zinc-900 focus:outline-none";
  return (
    <section id="early-access" className="scroll-mt-20 border-t border-zinc-200/80 bg-white/60">
      <div className="mx-auto grid max-w-6xl gap-10 px-6 py-20 lg:grid-cols-[minmax(0,1fr)_minmax(0,1.1fr)]">
        <div>
          <p className="text-xs font-semibold uppercase tracking-widest text-indigo-600">Invite-only beta</p>
          <h2 className="mt-3 text-4xl font-semibold tracking-tight sm:text-5xl">Request access</h2>
          <p className="mt-4 text-zinc-600">
            Threadly opens to teams in batches. Tell us who you are and we score your fit for lead generation from your work email, your company homepage and your use case. Teams that qualify are invited straight away; everyone else joins the waitlist and hears from us as spots open.
          </p>
          <ul className="mt-6 space-y-2 text-sm text-zinc-700">
            <li>✓ Sign in with Google using the email you apply with</li>
            <li>✓ Pay only for what you use, starting with free credits</li>
            <li>✓ Already invited? <Link href="/portal" className="font-semibold text-zinc-900 underline underline-offset-4">Sign in</Link></li>
          </ul>
        </div>

        <div className="rounded-3xl border border-zinc-200 bg-white p-6 shadow-[0_30px_80px_-40px_rgba(30,27,75,0.45)] sm:p-8">
          {outcome ? (
            <div className="demo-card-in" aria-live="polite">
              <p className={`inline-flex rounded-full px-3 py-1 text-xs font-semibold ${outcome.status === "invited" ? "bg-emerald-50 text-emerald-800" : "bg-amber-50 text-amber-800"}`}>
                {outcome.status === "invited" ? "Invited" : "On the waitlist"} · fit score {outcome.score}/100
              </p>
              <h3 className="mt-4 text-2xl font-semibold">{outcome.status === "invited" ? "You're in." : "You're on the list."}</h3>
              <p className="mt-2 text-sm text-zinc-600">
                {outcome.status === "invited"
                  ? `${outcome.already ? "This email is already approved." : "Your invite is on its way to your inbox."} Sign in with Google using ${form.email || "the same email"} to open your workspace.`
                  : "We invite teams in batches and will email you when a spot opens. Applying with a work email on your company's domain and describing who you sell to raises your score."}
              </p>
              <ul className="mt-4 space-y-1 text-xs text-zinc-600">
                {outcome.reasons.map((r) => <li key={r} className="font-mono">{r}</li>)}
              </ul>
              {outcome.status === "invited" ? (
                <Link href="/portal" className="mt-6 inline-block rounded-xl bg-zinc-900 px-5 py-2.5 text-sm font-semibold text-white hover:bg-zinc-800">Sign in to Threadly</Link>
              ) : (
                <button type="button" onClick={() => setOutcome(null)} className="mt-6 text-sm font-semibold text-zinc-900 underline underline-offset-4">Update my application</button>
              )}
            </div>
          ) : (
            <form onSubmit={submit} className="grid gap-4">
              <div className="grid gap-4 sm:grid-cols-2">
                <label className="grid gap-1.5 text-sm font-medium">Work email
                  <input required type="email" autoComplete="email" value={form.email} onChange={set("email")} placeholder="you@company.com" className={field} />
                </label>
                <label className="grid gap-1.5 text-sm font-medium">Company website
                  <input required autoComplete="url" value={form.domain} onChange={set("domain")} placeholder="company.com" className={field} />
                </label>
              </div>
              <label className="grid gap-1.5 text-sm font-medium">Your role
                <input value={form.role} onChange={set("role")} placeholder="Founder, Head of Sales, Growth lead" className={field} />
              </label>
              <label className="grid gap-1.5 text-sm font-medium">What do you want Threadly to do for you?
                <textarea rows={3} value={form.useCase} onChange={set("useCase")} placeholder="Who you sell to and how you find leads today" className={field} />
              </label>
              {state === "error" && <p className="text-sm text-rose-700">{error}</p>}
              <button type="submit" disabled={state === "sending"} className="rounded-xl bg-zinc-900 px-5 py-3 text-sm font-semibold text-white hover:bg-zinc-800 disabled:opacity-60">
                {state === "sending" ? "Checking your fit..." : "Request access"}
              </button>
              <p className="text-xs text-zinc-500">We read your company homepage to score fit. We store your application and email you once about it.</p>
            </form>
          )}
        </div>
      </div>
    </section>
  );
}
