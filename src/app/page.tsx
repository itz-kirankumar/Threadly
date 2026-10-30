import Link from "next/link";
import Navbar from "@/components/Navbar";
import Footer from "@/components/Footer";
import Reveal from "@/components/landing/Reveal";
import LiveDemo from "@/components/landing/LiveDemo";
import Pricing from "@/components/landing/Pricing";
import Faq, { FAQ_ITEMS } from "@/components/landing/Faq";
import EarlyAccess from "@/components/landing/EarlyAccess";
import Developers from "@/components/landing/Developers";
import { FIRST_PACK_BONUS_CAP, FIRST_PACK_BONUS_PERCENT } from "@/lib/credits/rates";

const STEPS = [
  { title: "Research your company", body: "Reads your homepage for what you sell, the words you use and the audiences you name." },
  { title: "AI readiness audit", body: "20 checks across crawler access, technical health, content clarity, structured data and business signals, scored out of 100." },
  { title: "Map competitors", body: "Web searches and comparison articles, each candidate checked against its own homepage." },
  { title: "Define campaigns", body: "Audiences your site and your competitors name, each turned into a search for companies." },
  { title: "Find potential customers", body: "Company homepages read one by one, with publishers, directories and competitors left out." },
  { title: "Reddit, X and LinkedIn leads", body: "Public posts from people asking for what you sell, ranked by buying intent, with a reply drafted for each." },
  { title: "Decision makers", body: "People in the roles you target, from a licensed contact data provider, with their source recorded." },
  { title: "Write the first email", body: "One draft per company that quotes the company's own words and lists every source." },
];

const MEMBERSHIP = [
  { title: "See it work", body: "Run the live demo on your own website. Real public data, with nothing stored and nothing sent." },
  { title: "Pass the checks", body: "We read your website, audit its readiness and score your business against a set of lead-generation checks." },
  { title: "Take your seat", body: "Teams that pass are onboarded at once with free credits. Sign in with the email you applied with." },
];

const PRINCIPLES = [
  { title: "Every fact has a source", body: "Each company, competitor and email line links to the page or search it came from. Nothing is invented to fill a gap." },
  { title: "Licensed contact data only", body: "Decision makers come from licensed providers with a record of where each contact came from. No profile scraping, no guessed addresses." },
  { title: "You approve every send", body: "Sending runs through approved campaigns that check suppression, unsubscribe, verification and daily caps before each email." },
  { title: "An audit trail you can export", body: "Owners and admins can export an append-only record of every outbound action: who, what, when and the outcome." },
];

const INTELLIGENCE = [
  { name: "Mention rate", body: "How often ChatGPT, Claude and Gemini name your brand for the questions your buyers ask." },
  { name: "Citation share", body: "How often your site is among the sources those answers cite." },
  { name: "Share of voice", body: "Your mentions against your competitors' across every tracked question." },
];

export default function LandingPage() {
  const faqJsonLd = {
    "@context": "https://schema.org",
    "@type": "FAQPage",
    mainEntity: FAQ_ITEMS.map((item) => ({
      "@type": "Question",
      name: item.q,
      acceptedAnswer: { "@type": "Answer", text: item.a },
    })),
  };
  return (
    <div className="premium flex min-h-screen flex-col">
      <Navbar />
      <main className="flex-grow">
        {/* Hero with the live demo */}
        <section className="relative overflow-hidden">
          <div className="premium-aura pointer-events-none absolute inset-x-0 top-0 h-[760px]" aria-hidden />
          <div className="relative mx-auto max-w-6xl px-6 pb-24 pt-20 text-center sm:pt-28">
            <p className="premium-eyebrow">By invitation only</p>
            <h1 className="mx-auto mt-6 max-w-4xl font-display text-6xl leading-[1.02] tracking-tight sm:text-8xl">
              Pipeline, <em className="premium-gold-text">by invitation.</em>
            </h1>
            <p className="mx-auto mt-7 max-w-2xl text-lg leading-relaxed text-zinc-400">
              A private prospecting desk for B2B teams. Threadly reads your market, finds the companies and conversations worth your time, and drafts outreach from facts it can cite.
            </p>
            <div className="mt-12">
              <LiveDemo bonus={{ percent: FIRST_PACK_BONUS_PERCENT, cap: FIRST_PACK_BONUS_CAP }} />
            </div>
          </div>
        </section>

        {/* Membership */}
        <section className="border-t border-white/[0.07]">
          <div className="mx-auto max-w-6xl px-6 py-24">
            <Reveal>
              <p className="premium-eyebrow">Membership</p>
              <h2 className="mt-4 max-w-2xl font-display text-5xl leading-tight tracking-tight">Three steps to a seat at the desk</h2>
            </Reveal>
            <ol className="mt-14 grid gap-px overflow-hidden rounded-3xl border border-white/10 bg-white/10 md:grid-cols-3">
              {MEMBERSHIP.map((m, i) => (
                <Reveal key={m.title} delay={i * 90}>
                  <li className="h-full bg-[#0d0b13] p-8">
                    <p className="font-display text-4xl text-[#d4b26a]">{["I", "II", "III"][i]}</p>
                    <h3 className="mt-5 text-lg font-semibold">{m.title}</h3>
                    <p className="mt-2 text-sm leading-relaxed text-zinc-400">{m.body}</p>
                  </li>
                </Reveal>
              ))}
            </ol>
          </div>
        </section>

        {/* How it works */}
        <section id="how-it-works" className="scroll-mt-20 border-t border-white/[0.07]">
          <div className="mx-auto grid max-w-6xl gap-12 px-6 py-24 lg:grid-cols-[minmax(0,0.8fr)_minmax(0,1.2fr)]">
            <Reveal>
              <div className="lg:sticky lg:top-28">
                <p className="premium-eyebrow">The method</p>
                <h2 className="mt-4 font-display text-5xl leading-tight tracking-tight">Eight steps, one run</h2>
                <p className="mt-5 text-zinc-400">The live demo runs these on your site. In your workspace you edit each one, save companies to your CRM and approve what gets sent.</p>
              </div>
            </Reveal>
            <ol className="divide-y divide-white/[0.08] border-y border-white/[0.08]">
              {STEPS.map((step, index) => (
                <Reveal key={step.title} delay={index * 40}>
                  <li className="grid grid-cols-[3.5rem_minmax(0,1fr)] gap-4 py-6">
                    <span className="font-display text-2xl text-[#d4b26a]">{String(index + 1).padStart(2, "0")}</span>
                    <div>
                      <h3 className="font-semibold">{step.title}</h3>
                      <p className="mt-1 text-sm leading-relaxed text-zinc-400">{step.body}</p>
                    </div>
                  </li>
                </Reveal>
              ))}
            </ol>
          </div>
        </section>

        {/* Principles */}
        <section className="border-t border-white/[0.07] bg-white/[0.015]">
          <div className="mx-auto max-w-6xl px-6 py-24">
            <Reveal>
              <p className="premium-eyebrow">Standards</p>
              <h2 className="mt-4 max-w-2xl font-display text-5xl leading-tight tracking-tight">Built for teams that answer for their outreach</h2>
            </Reveal>
            <div className="mt-14 grid gap-x-12 gap-y-10 sm:grid-cols-2">
              {PRINCIPLES.map((item, index) => (
                <Reveal key={item.title} delay={index * 70}>
                  <div className="border-t border-[#d4b26a]/30 pt-5">
                    <h3 className="text-lg font-semibold">{item.title}</h3>
                    <p className="mt-2 text-sm leading-relaxed text-zinc-400">{item.body}</p>
                  </div>
                </Reveal>
              ))}
            </div>
          </div>
        </section>

        {/* Intelligence */}
        <section className="border-t border-white/[0.07]">
          <div className="mx-auto grid max-w-6xl items-center gap-12 px-6 py-24 lg:grid-cols-2">
            <Reveal>
              <p className="premium-eyebrow">Also included</p>
              <h2 className="mt-4 font-display text-5xl leading-tight tracking-tight">See how AI assistants describe you</h2>
              <p className="mt-5 text-zinc-400">
                Buyers ask ChatGPT, Claude and Gemini before they open a browser. Threadly asks them the questions your buyers ask and tracks whether the answers name and cite you.
              </p>
            </Reveal>
            <div className="grid gap-3">
              {INTELLIGENCE.map((m, index) => (
                <Reveal key={m.name} delay={index * 80}>
                  <div className="premium-card rounded-2xl p-5">
                    <h3 className="font-semibold">{m.name}</h3>
                    <p className="mt-1 text-sm text-zinc-400">{m.body}</p>
                  </div>
                </Reveal>
              ))}
            </div>
          </div>
        </section>

        {/* Developers */}
        <section id="developers" className="scroll-mt-20 border-t border-white/[0.07]">
          <div className="mx-auto max-w-6xl px-6 py-24">
            <Reveal>
              <Developers />
            </Reveal>
          </div>
        </section>

        <EarlyAccess />

        {/* Pricing */}
        <section className="border-t border-white/[0.07]">
          <div className="mx-auto max-w-6xl px-6 py-24">
            <Reveal>
              <div className="text-center">
                <p className="premium-eyebrow">Members&apos; pricing</p>
                <h2 className="mt-4 font-display text-5xl tracking-tight">Pay only for results</h2>
                <p className="mx-auto mt-4 max-w-xl text-zinc-400">
                  Members buy credits and spend them on companies, leads, emails and scans. No seats and no subscription.
                </p>
              </div>
            </Reveal>
            <div className="mt-12">
              <Pricing />
            </div>
          </div>
        </section>

        {/* FAQ: its own section, apart from pricing */}
        <section id="faq" className="scroll-mt-20 border-t border-white/[0.07] bg-white/[0.015]">
          <script type="application/ld+json" dangerouslySetInnerHTML={{ __html: JSON.stringify(faqJsonLd) }} />
          <div className="mx-auto grid max-w-6xl gap-12 px-6 py-24 lg:grid-cols-[minmax(0,0.8fr)_minmax(0,1.2fr)]">
            <Reveal>
              <div className="lg:sticky lg:top-28">
                <p className="premium-eyebrow">Questions</p>
                <h2 className="mt-4 font-display text-5xl leading-tight tracking-tight">Before you apply</h2>
                <p className="mt-5 text-zinc-400">How the data is collected, how credits work and how teams are onboarded.</p>
                <Link href="/contact" className="mt-6 inline-block text-sm font-semibold text-[#d4b26a] hover:text-[#f0dca6]">Write to us →</Link>
              </div>
            </Reveal>
            <Faq tone="light" />
          </div>
        </section>

        {/* Final CTA */}
        <section className="px-6 py-24">
          <Reveal>
            <div className="premium-seal relative mx-auto max-w-5xl overflow-hidden rounded-[2rem] px-8 py-20 text-center">
              <p className="premium-eyebrow">Membership is reviewed automatically</p>
              <h2 className="mx-auto mt-5 max-w-2xl font-display text-5xl leading-tight tracking-tight sm:text-6xl">Your seat is decided by your business</h2>
              <p className="mx-auto mt-5 max-w-xl text-lg text-zinc-400">
                Run the demo on your website, then check your eligibility. Teams that pass are onboarded on the spot.
              </p>
              <div className="mt-9 flex flex-wrap items-center justify-center gap-3">
                <Link href="/#early-access" className="btn-gold rounded-full px-7 py-3 text-sm font-semibold">Request an invitation</Link>
                <Link href="/portal" className="rounded-full border border-white/20 px-7 py-3 text-sm font-semibold transition hover:border-[#d4b26a]/60">Member sign in</Link>
              </div>
            </div>
          </Reveal>
        </section>
      </main>
      <Footer />
    </div>
  );
}
