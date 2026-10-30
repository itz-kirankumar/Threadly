import Link from "next/link";
import QualifyForm from "./QualifyForm";

// Invite-only onboarding: the eligibility checks decide who is onboarded.
export default function EarlyAccess() {
  return (
    <section id="early-access" className="scroll-mt-20 border-t border-black/[0.07]">
      <div className="mx-auto grid max-w-6xl gap-10 px-6 py-20 lg:grid-cols-[minmax(0,1fr)_minmax(0,1.15fr)]">
        <div>
          <p className="eyebrow">Eligibility</p>
          <h2 className="mt-4 font-display text-5xl leading-tight tracking-tight">Request an invitation</h2>
          <p className="mt-4 text-zinc-600">
            Threadly onboards teams that can put leads to work. When you apply we check your domain and mail setup, read your website and score your business across identity, business, capacity and intent. Pass and you are onboarded on the spot; otherwise we tell you plainly that we cannot onboard you yet.
          </p>
          <ul className="mt-6 space-y-2 text-sm text-zinc-700">
            <li>✓ Personal work email on your company&apos;s domain</li>
            <li>✓ An established website selling to businesses</li>
            <li>✓ A team, budget and sending setup to use the leads</li>
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
