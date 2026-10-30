import Link from "next/link";
import Navbar from "@/components/Navbar";
import PromoBanner from "@/components/PromoBanner";
import Footer from "@/components/Footer";
import Reveal from "@/components/landing/Reveal";
import LiveDemo from "@/components/landing/LiveDemo";
import Pricing from "@/components/landing/Pricing";
import Faq, { FAQ_ITEMS } from "@/components/landing/Faq";

const STEPS = [
  { title: "Research your company", body: "Reads your homepage for what you sell, the words you use and the audiences you name." },
  { title: "Map competitors", body: "Web searches and comparison articles, each candidate checked against its own homepage." },
  { title: "Define campaigns", body: "Audiences your site names, or the one you describe, each turned into a search for companies." },
  { title: "Find potential customers", body: "Company homepages read one by one, with publishers, directories and competitors left out." },
  { title: "Read public conversations", body: "Public Reddit, LinkedIn and X posts about your topic, as search engines index them." },
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
          <div className="pointer-events-none absolute -top-32 left-1/2 h-[420px] w-[720px] -translate-x-1/2 rounded-full bg-indigo-300/25 blur-[120px]" aria-hidden />
          <div className="relative mx-auto max-w-6xl px-6 pb-20 pt-14 text-center sm:pt-20">
            <p className="inline-flex items-center gap-2 rounded-full border border-zinc-200 bg-white px-3.5 py-1.5 text-xs font-medium text-zinc-700 shadow-sm">
              <span className="h-1.5 w-1.5 rounded-full bg-emerald-500" aria-hidden />
              Live demo on real web data. Nothing is stored.
            </p>
            <h1 className="mx-auto mt-6 max-w-3xl text-4xl font-semibold leading-[1.05] tracking-tight sm:text-6xl">
              Find the companies worth contacting,{" "}
              <span className="text-indigo-600">starting from your website.</span>
            </h1>
            <p className="mx-auto mt-5 max-w-2xl text-lg leading-relaxed text-zinc-600">
              Paste your website and watch Threadly research your market, map competitors, find matching companies and draft first emails from facts it can cite.
            </p>
            <div className="mt-6 flex flex-wrap items-center justify-center gap-2 text-xs text-zinc-600">
              <span className="rounded-full border border-zinc-200 bg-white px-3 py-1">Public pages only</span>
              <span className="rounded-full border border-zinc-200 bg-white px-3 py-1">Respects robots.txt</span>
              <span className="rounded-full border border-zinc-200 bg-white px-3 py-1">No card needed</span>
            </div>
            <div className="mt-8">
              <LiveDemo />
            </div>
          </div>
        </section>

        {/* How it works */}
        <section id="how-it-works" className="scroll-mt-20 border-t border-zinc-200/80">
          <div className="mx-auto max-w-6xl px-6 py-20">
            <Reveal>
              <p className="text-center text-xs font-semibold uppercase tracking-widest text-indigo-600">How it works</p>
              <h2 className="mt-3 text-center text-4xl font-semibold tracking-tight sm:text-5xl">Seven steps, one run</h2>
              <p className="mx-auto mt-4 max-w-2xl text-center text-zinc-600">
                The live demo above runs these steps on your site. In your workspace you edit each one, save companies to your CRM and approve what gets sent.
              </p>
            </Reveal>
            <ol className="mt-12 grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
              {STEPS.map((step, index) => (
                <Reveal key={step.title} delay={index * 60}>
                  <li className="h-full rounded-2xl border border-zinc-200 bg-white/80 p-5 shadow-sm backdrop-blur">
                    <p className="font-mono text-xs font-semibold text-indigo-600">{String(index + 1).padStart(2, "0")}</p>
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
              <p className="text-xs font-semibold uppercase tracking-widest text-indigo-600">Also included</p>
              <h2 className="mt-3 text-4xl font-semibold tracking-tight">See how AI assistants describe you</h2>
              <p className="mt-4 text-zinc-600">
                Buyers ask ChatGPT, Claude and Gemini before they open a browser. Threadly asks them the questions your buyers ask and tracks whether the answers name and cite you.
              </p>
              <Link href="/portal" className="mt-6 inline-block text-sm font-semibold text-indigo-700 hover:text-indigo-600">Track your AI visibility</Link>
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

        {/* Pricing and FAQ */}
        <section className="bg-zinc-950 text-zinc-100">
          <div className="mx-auto max-w-6xl px-6 py-24">
            <Reveal>
              <div className="text-center">
                <p className="text-xs font-semibold uppercase tracking-widest text-indigo-300">Pricing</p>
                <h2 className="mt-3 text-4xl font-semibold tracking-tight text-white sm:text-5xl">Simple, honest pricing</h2>
                <p className="mx-auto mt-4 max-w-xl text-zinc-400">
                  Start with a 7-day trial for $7, one-time and with no auto-renewal. Upgrade when your coverage grows.
                </p>
              </div>
            </Reveal>
            <div className="mt-12">
              <Pricing />
            </div>
            <script type="application/ld+json" dangerouslySetInnerHTML={{ __html: JSON.stringify(faqJsonLd) }} />
            <div className="mx-auto mt-24 max-w-3xl">
              <h2 className="text-center text-3xl font-semibold tracking-tight text-white">Questions, answered</h2>
              <div className="mt-8">
                <Faq />
              </div>
            </div>
          </div>
        </section>

        {/* Final CTA */}
        <section className="border-t border-zinc-200/80">
          <div className="mx-auto max-w-4xl px-6 py-24 text-center">
            <Reveal>
              <h2 className="text-4xl font-semibold tracking-tight sm:text-5xl">Run it on your own website</h2>
              <p className="mx-auto mt-4 max-w-xl text-lg text-zinc-600">
                Try the live demo above, then open a workspace to save companies, add licensed contact data and approve sending.
              </p>
              <div className="mt-8 flex flex-wrap items-center justify-center gap-3">
                <Link href="/#live-demo" className="rounded-full border border-zinc-300 bg-white px-6 py-2.5 text-sm font-semibold text-zinc-900 hover:bg-zinc-50">Try the live demo</Link>
                <Link href="/portal" className="rounded-full bg-zinc-900 px-6 py-2.5 text-sm font-semibold text-white hover:bg-zinc-800">Open your workspace</Link>
              </div>
            </Reveal>
          </div>
        </section>
      </main>
      <Footer tone="light" />
    </div>
  );
}
