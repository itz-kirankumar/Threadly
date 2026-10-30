import Link from "next/link";
import Navbar from "@/components/Navbar";
import PromoBanner from "@/components/PromoBanner";
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
    <div className="flex min-h-screen flex-col bg-[#f7f6f3] text-zinc-900">
      <div className="bg-zinc-950">
        <PromoBanner />
      </div>
      <Navbar tone="light" />
      <main className="flex-grow">
        {/* Hero with the live demo */}
        <section className="relative overflow-hidden">
          <div className="landing-network pointer-events-none absolute inset-0" aria-hidden />
          <div className="pointer-events-none absolute -top-40 left-1/2 h-[480px] w-[860px] -translate-x-1/2 rounded-full bg-gradient-to-r from-violet-400/35 via-fuchsia-300/25 to-indigo-300/30 blur-[120px]" aria-hidden />
          <div className="relative mx-auto max-w-6xl px-6 pb-20 pt-14 text-center sm:pt-20">
            <p className="inline-flex items-center gap-2 rounded-full border border-violet-200 bg-white/90 px-3.5 py-1.5 text-xs font-medium text-violet-900 shadow-sm">
              <span className="relative flex h-2 w-2" aria-hidden><span className="absolute inline-flex h-full w-full animate-ping rounded-full bg-violet-400 opacity-60" /><span className="relative inline-flex h-2 w-2 rounded-full bg-violet-600" /></span>
              Live demo on real web data. Nothing is stored.
            </p>
            <h1 className="mx-auto mt-6 max-w-3xl text-4xl font-semibold leading-[1.05] tracking-tight sm:text-6xl">
              Find the companies worth contacting,{" "}
              <span className="bg-gradient-to-r from-violet-600 via-fuchsia-600 to-violet-500 bg-clip-text text-transparent">starting from your website.</span>
            </h1>
            <p className="mx-auto mt-5 max-w-2xl text-lg leading-relaxed text-zinc-600">
              Paste your website and watch Threadly research your market, map competitors, find matching companies and draft first emails from facts it can cite.
            </p>
            <div className="mt-6 flex flex-wrap items-center justify-center gap-2 text-xs text-zinc-600">
              <span className="rounded-full border border-violet-100 bg-white px-3 py-1">Public pages only</span>
              <span className="rounded-full border border-violet-100 bg-white px-3 py-1">Respects robots.txt</span>
              <span className="rounded-full border border-violet-100 bg-white px-3 py-1">No card needed</span>
            </div>
            <div className="mt-8">
              <LiveDemo bonus={{ percent: FIRST_PACK_BONUS_PERCENT, cap: FIRST_PACK_BONUS_CAP }} />
            </div>
          </div>
        </section>

        {/* How it works */}
        <section id="how-it-works" className="scroll-mt-20 border-t border-zinc-200/80">
          <div className="mx-auto max-w-6xl px-6 py-20">
            <Reveal>
              <p className="text-center text-xs font-semibold uppercase tracking-widest text-violet-600">How it works</p>
              <h2 className="mt-3 text-center text-4xl font-semibold tracking-tight sm:text-5xl">Eight steps, one run</h2>
              <p className="mx-auto mt-4 max-w-2xl text-center text-zinc-600">
                The live demo above runs these steps on your site. In your workspace you edit each one, save companies to your CRM and approve what gets sent.
              </p>
            </Reveal>
            <ol className="mt-12 grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
              {STEPS.map((step, index) => (
                <Reveal key={step.title} delay={index * 60}>
                  <li className="h-full rounded-2xl border border-zinc-200 bg-white/80 p-5 shadow-sm backdrop-blur">
                    <p className="font-mono text-xs font-semibold text-violet-600">{String(index + 1).padStart(2, "0")}</p>
                    <h3 className="mt-2 font-semibold">{step.title}</h3>
                    <p className="mt-1.5 text-sm leading-relaxed text-zinc-600">{step.body}</p>
                  </li>
                </Reveal>
              ))}
            </ol>
          </div>
        </section>

        {/* Principles */}
        <section className="border-t border-zinc-200/80 bg-white/60">
          <div className="mx-auto max-w-6xl px-6 py-20">
            <Reveal>
              <h2 className="text-center text-4xl font-semibold tracking-tight sm:text-5xl">Built for teams that answer for their outreach</h2>
              <p className="mx-auto mt-4 max-w-2xl text-center text-zinc-600">
                Revenue, security and legal teams can see where every lead came from and what was sent.
              </p>
            </Reveal>
            <div className="mt-12 grid gap-3 sm:grid-cols-2">
              {PRINCIPLES.map((item, index) => (
                <Reveal key={item.title} delay={index * 70}>
                  <div className="h-full rounded-2xl border border-zinc-200 bg-white p-6 shadow-sm">
                    <h3 className="font-semibold">{item.title}</h3>
                    <p className="mt-2 text-sm leading-relaxed text-zinc-600">{item.body}</p>
                  </div>
                </Reveal>
              ))}
            </div>
          </div>
        </section>

        {/* Intelligence */}
        <section className="border-t border-zinc-200/80">
          <div className="mx-auto grid max-w-6xl items-center gap-10 px-6 py-20 lg:grid-cols-2">
            <Reveal>
              <p className="text-xs font-semibold uppercase tracking-widest text-violet-600">Also included</p>
              <h2 className="mt-3 text-4xl font-semibold tracking-tight">See how AI assistants describe you</h2>
              <p className="mt-4 text-zinc-600">
                Buyers ask ChatGPT, Claude and Gemini before they open a browser. Threadly asks them the questions your buyers ask and tracks whether the answers name and cite you.
              </p>
              <Link href="/portal" className="mt-6 inline-block text-sm font-semibold text-violet-700 hover:text-violet-600">Track your AI visibility</Link>
            </Reveal>
            <div className="grid gap-3">
              {INTELLIGENCE.map((m, index) => (
                <Reveal key={m.name} delay={index * 80}>
                  <div className="rounded-2xl border border-zinc-200 bg-white p-5 shadow-sm">
                    <h3 className="font-semibold">{m.name}</h3>
                    <p className="mt-1 text-sm text-zinc-600">{m.body}</p>
                  </div>
                </Reveal>
              ))}
            </div>
          </div>
        </section>

        {/* Developers */}
        <section id="developers" className="scroll-mt-20 border-t border-zinc-200/80">
          <div className="mx-auto max-w-6xl px-6 py-20">
            <Reveal>
              <Developers />
            </Reveal>
          </div>
        </section>

        <EarlyAccess />

        {/* Pricing */}
        <section className="bg-zinc-950 text-zinc-100">
          <div className="mx-auto max-w-6xl px-6 py-24">
            <Reveal>
              <div className="text-center">
                <p className="text-xs font-semibold uppercase tracking-widest text-violet-300">Pricing</p>
                <h2 className="mt-3 text-4xl font-semibold tracking-tight text-white sm:text-5xl">Pay only for results</h2>
                <p className="mx-auto mt-4 max-w-xl text-zinc-400">
                  Threadly is invite-only. Invited teams buy credits and spend them on companies, leads, emails and scans. No seats and no subscription.
                </p>
              </div>
            </Reveal>
            <div className="mt-12">
              <Pricing />
            </div>
          </div>
        </section>

        {/* FAQ: its own section, apart from pricing */}
        <section id="faq" className="scroll-mt-20 bg-gradient-to-b from-violet-50/70 to-[#f7f6f3]">
          <script type="application/ld+json" dangerouslySetInnerHTML={{ __html: JSON.stringify(faqJsonLd) }} />
          <div className="mx-auto grid max-w-6xl gap-10 px-6 py-24 lg:grid-cols-[minmax(0,0.8fr)_minmax(0,1.2fr)]">
            <Reveal>
              <div className="lg:sticky lg:top-28">
                <p className="text-xs font-semibold uppercase tracking-widest text-violet-600">FAQ</p>
                <h2 className="mt-3 text-4xl font-semibold tracking-tight sm:text-5xl">Questions, answered</h2>
                <p className="mt-4 text-zinc-600">How the data is collected, how credits work and how teams get onboarded.</p>
                <div className="mt-8 rounded-2xl border border-violet-200 bg-white p-5">
                  <p className="font-semibold">Still deciding?</p>
                  <p className="mt-1 text-sm text-zinc-600">Read the docs, or write to us and a person will answer.</p>
                  <div className="mt-4 flex flex-wrap gap-2 text-sm">
                    <Link href="/docs" className="rounded-lg border border-zinc-300 px-3 py-1.5 font-semibold hover:border-violet-400">Docs</Link>
                    <Link href="/contact" className="rounded-lg bg-violet-600 px-3 py-1.5 font-semibold text-white hover:bg-violet-500">Contact us</Link>
                  </div>
                </div>
              </div>
            </Reveal>
            <Faq tone="light" />
          </div>
        </section>

        {/* Final CTA */}
        <section className="px-6 pb-24">
          <Reveal>
            <div className="relative mx-auto max-w-6xl overflow-hidden rounded-[2rem] bg-gradient-to-br from-violet-700 via-violet-600 to-fuchsia-600 px-8 py-16 text-center text-white shadow-[0_40px_100px_-40px_rgba(91,33,182,0.9)]">
              <div className="landing-network pointer-events-none absolute inset-0 opacity-30" aria-hidden />
              <h2 className="relative text-4xl font-semibold tracking-tight sm:text-5xl">Find the companies worth contacting</h2>
              <p className="relative mx-auto mt-4 max-w-xl text-lg text-violet-100">
                Run the live demo on your website, then check your eligibility. Qualified teams are onboarded on the spot.
              </p>
              <div className="relative mt-8 flex flex-wrap items-center justify-center gap-3">
                <Link href="/#early-access" className="rounded-full bg-white px-6 py-2.5 text-sm font-semibold text-violet-700 shadow-lg hover:bg-violet-50">Check eligibility</Link>
                <Link href="/#live-demo" className="rounded-full border border-white/40 px-6 py-2.5 text-sm font-semibold text-white hover:bg-white/10">Try the live demo</Link>
                <Link href="/portal" className="rounded-full px-4 py-2.5 text-sm font-semibold text-violet-100 underline-offset-4 hover:underline">Sign in</Link>
              </div>
            </div>
          </Reveal>
        </section>
      </main>
      <Footer tone="light" />
    </div>
  );
}
