"use client";

import Link from "next/link";
import { useState } from "react";

interface Test {
  id: string;
  label: string;
  points: number;
  max: number;
  passed: boolean;
  detail: string;
}

interface Outcome {
  status: "invited" | "waitlisted";
  score: number;
  threshold?: number;
  tests?: Test[];
  company?: string;
  already?: boolean;
}

const TEAM_SIZES = ["1", "2-10", "11-50", "51-200", "200+"];
const VOLUMES = ["0-100", "100-500", "500-2000", "2000+"];

// Onboarding eligibility: the server runs the business-capability tests and
// either onboards the applicant or says, plainly, that it cannot yet.
export default function QualifyForm({ defaultDomain = "", pack, compact = false }: { defaultDomain?: string; pack?: string; compact?: boolean }) {
  const [form, setForm] = useState({ email: "", domain: defaultDomain, role: "", teamSize: "", monthlyOutreach: "", useCase: "" });
  const [agree, setAgree] = useState(false);
  const [state, setState] = useState<"idle" | "sending" | "error">("idle");
  const [error, setError] = useState("");
  const [outcome, setOutcome] = useState<Outcome | null>(null);
  const set = (key: keyof typeof form) => (e: React.ChangeEvent<HTMLInputElement | HTMLTextAreaElement | HTMLSelectElement>) => setForm((f) => ({ ...f, [key]: e.target.value }));

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    setState("sending");
    setError("");
    try {
      const res = await fetch("/api/waitlist", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(form) });
      const body = await res.json();
      if (!res.ok) throw new Error(body.error ?? "Your application could not be sent.");
      setOutcome(body as Outcome);
      setState("idle");
    } catch (err) {
      setError(err instanceof Error ? err.message : "Your application could not be sent.");
      setState("error");
    }
  }

  const field = "w-full rounded-xl border border-zinc-200 bg-zinc-50 px-3 py-2.5 text-sm text-zinc-900 placeholder-zinc-400 transition focus:border-violet-500 focus:bg-white focus:ring-4 focus:ring-violet-100 focus:outline-none";

  if (state === "sending") {
    return (
      <div className="flex min-h-[320px] flex-col items-center justify-center text-center" aria-live="polite">
        <span className="h-8 w-8 animate-spin rounded-full border-2 border-zinc-200 border-t-zinc-900" aria-hidden />
        <p className="mt-4 font-semibold">Running eligibility checks</p>
        <ul className="mt-3 space-y-1 text-sm text-zinc-500">
          {["Reading your company website", "Auditing AI readiness", "Checking business signals", "Scoring lead-generation fit"].map((s, i) => (
            <li key={s} className="demo-line-in" style={{ animationDelay: `${i * 600}ms` }}>{s}</li>
          ))}
        </ul>
      </div>
    );
  }

  if (outcome) {
    const invited = outcome.status === "invited";
    return (
      <div className="demo-card-in" aria-live="polite">
        <p className={`inline-flex rounded-full px-3 py-1 text-xs font-semibold ${invited ? "bg-emerald-50 text-emerald-800" : "bg-rose-50 text-rose-800"}`}>
          Eligibility score {outcome.score}/100{outcome.threshold ? ` · bar ${outcome.threshold}` : ""}
        </p>
        <h3 className="mt-3 text-2xl font-semibold tracking-tight">{invited ? "You qualify. Welcome to Threadly." : "Sorry, we are unable to onboard you right now."}</h3>
        <p className="mt-2 text-sm leading-relaxed text-zinc-600">
          {invited
            ? `${outcome.already ? "This email is already approved." : "Your invite is in your inbox."} Sign in with Google as ${form.email || "the email you applied with"}${pack ? ` and pick the ${pack} pack` : ""} to start.`
            : "Threadly is invite-only and onboards teams that pass our lead-generation checks. Your application is kept on file; if your team, website or outreach plans change, apply again with a work email on your company's domain."}
        </p>
        {outcome.tests && outcome.tests.length > 0 && (
          <ul className="mt-4 grid gap-1.5 sm:grid-cols-2">
            {outcome.tests.map((t, i) => (
              <li key={t.id} className="demo-pop-in flex items-start gap-2 rounded-lg border border-zinc-200 px-2.5 py-2 text-xs" style={{ animationDelay: `${i * 60}ms` }}>
                <span aria-hidden className={t.points === t.max ? "text-emerald-600" : t.points > 0 ? "text-amber-600" : "text-rose-600"}>{t.points === t.max ? "✓" : t.points > 0 ? "◐" : "✕"}</span>
                <span className="min-w-0 flex-1"><span className="font-semibold">{t.label}</span> <span className="text-zinc-500">{t.points}/{t.max}</span><span className="block truncate text-zinc-500">{t.detail}</span></span>
              </li>
            ))}
          </ul>
        )}
        {invited ? (
          <Link href="/portal" className="mt-6 inline-block rounded-xl bg-violet-600 px-5 py-2.5 text-sm font-semibold text-white hover:bg-violet-500">Sign in and start</Link>
        ) : (
          <button type="button" onClick={() => setOutcome(null)} className="mt-6 text-sm font-semibold text-zinc-900 underline underline-offset-4">Apply with different details</button>
        )}
      </div>
    );
  }

  return (
    <form onSubmit={submit} className="grid gap-3">
      <div className={`grid gap-3 ${compact ? "" : "sm:grid-cols-2"}`}>
        <label className="grid gap-1 text-xs font-medium text-zinc-600">Work email
          <input required type="email" autoComplete="email" value={form.email} onChange={set("email")} placeholder="you@company.com" className={field} />
        </label>
        <label className="grid gap-1 text-xs font-medium text-zinc-600">Company website
          <input required autoComplete="url" value={form.domain} onChange={set("domain")} placeholder="company.com" className={field} />
        </label>
      </div>
      <div className="grid gap-3 sm:grid-cols-3">
        <label className="grid gap-1 text-xs font-medium text-zinc-600">Your role
          <input value={form.role} onChange={set("role")} placeholder="Founder" className={field} />
        </label>
        <label className="grid gap-1 text-xs font-medium text-zinc-600">Team size
          <select value={form.teamSize} onChange={set("teamSize")} className={field}>
            <option value="">Choose</option>
            {TEAM_SIZES.map((t) => <option key={t} value={t}>{t} people</option>)}
          </select>
        </label>
        <label className="grid gap-1 text-xs font-medium text-zinc-600">Prospects a month
          <select value={form.monthlyOutreach} onChange={set("monthlyOutreach")} className={field}>
            <option value="">Choose</option>
            {VOLUMES.map((v) => <option key={v} value={v}>{v}</option>)}
          </select>
        </label>
      </div>
      <label className="grid gap-1 text-xs font-medium text-zinc-600">Who do you want to reach, and how do you find them today?
        <textarea rows={compact ? 2 : 3} value={form.useCase} onChange={set("useCase")} placeholder="Heads of sales at mid-market SaaS companies; we prospect by hand on LinkedIn" className={field} />
      </label>
      <label className="flex items-start gap-2 text-xs text-zinc-600">
        <input type="checkbox" checked={agree} onChange={(e) => setAgree(e.target.checked)} className="mt-0.5" required />
        <span>Threadly may read my company&apos;s public website to check eligibility, and I accept the <Link href="/terms" className="underline">Terms</Link> and <Link href="/privacy" className="underline">Privacy policy</Link>.</span>
      </label>
      {state === "error" && <p className="text-sm text-rose-700">{error}</p>}
      <button type="submit" disabled={!agree} className="rounded-xl bg-violet-600 px-5 py-3 text-sm font-semibold text-white shadow-[0_10px_30px_-12px_rgba(124,58,237,0.7)] transition hover:bg-violet-500 disabled:opacity-40">
        Check my eligibility
      </button>
    </form>
  );
}
