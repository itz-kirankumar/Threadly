import Link from "next/link";
import QualifyForm from "./QualifyForm";

// Invite-only onboarding: the eligibility checks decide who is onboarded.
export default function EarlyAccess() {
  return (
    <section id="early-access" className="scroll-mt-20 border-t border-zinc-200/80 bg-white/60">
      <div className="mx-auto grid max-w-6xl gap-10 px-6 py-20 lg:grid-cols-[minmax(0,1fr)_minmax(0,1.15fr)]">
        <div>
          <p className="text-xs font-semibold uppercase tracking-widest text-indigo-600">Invite-only</p>
          <h2 className="mt-3 text-4xl font-semibold tracking-tight sm:text-5xl">Check your eligibility</h2>
          <p className="mt-4 text-zinc-600">
            Threadly onboards teams that can put leads to work. When you apply we read your company website, audit its AI readiness and score your business against a set of lead-generation checks. Pass the bar and you are onboarded on the spot; otherwise we tell you plainly that we cannot onboard you yet.
          </p>
          <ul className="mt-6 space-y-2 text-sm text-zinc-700">
            <li>✓ Work email on your company&apos;s domain</li>
            <li>✓ A live website that says what you sell, to businesses</li>
            <li>✓ A team and an outreach plan to use the leads</li>
            <li>Already onboarded? <Link href="/portal" className="font-semibold text-zinc-900 underline underline-offset-4">Sign in</Link></li>
          </ul>
        </div>
        <div className="rounded-3xl border border-zinc-200 bg-white p-6 shadow-[0_30px_80px_-40px_rgba(30,27,75,0.45)] sm:p-8">
          <QualifyForm />
        </div>
      </div>
    </section>
  );
}
