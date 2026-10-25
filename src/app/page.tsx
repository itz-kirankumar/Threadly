import Link from "next/link";
import Navbar from "@/components/Navbar";
import Footer from "@/components/Footer";
import ScanSimulation from "@/components/landing/ScanSimulation";
import LenisProvider from "@/components/landing/LenisProvider";
import Reveal from "@/components/landing/Reveal";
import HeroGlow from "@/components/landing/HeroGlow";

const PROVIDERS = [
  { name: "ChatGPT", note: "Responses API with live web search" },
  { name: "Claude", note: "Anthropic answers with web search" },
  { name: "Gemini", note: "Google AI with Search grounding" },
];

const STEPS = [
  {
    title: "Set up your brand",
    body: "Your name, domain and the competitors you want to be measured against. Two minutes, no integrations.",
  },
  {
    title: "Track the questions buyers ask",
    body: "Add the questions your buyers type into AI assistants, or let Threadly suggest them from your category.",
  },
  {
    title: "See what AI says about you",
    body: "Every scan asks every provider each question and measures whether answers mention you, cite your site, and where you rank.",
  },
];

const METRICS = [
  { name: "Mention rate", body: "The share of AI answers that name your brand when buyers ask about your category." },
  { name: "Citation share", body: "How often your domain appears in the sources AI answers cite, versus every other source." },
  { name: "Share of voice", body: "Your mentions versus your competitors' mentions, across every tracked question." },
  { name: "Position", body: "When brands are named in an answer, where yours appears in the order." },
];

export default function LandingPage() {
  return (
    <div className="flex min-h-screen flex-col bg-zinc-950 text-zinc-100">
      <LenisProvider />
      <Navbar />
      <main className="flex-grow">
        {/* hero */}
        <section className="relative overflow-hidden">
          <div className="hero-grid absolute inset-0" />
          <HeroGlow />
          <div className="pointer-events-none absolute -top-40 right-[-10%] h-[480px] w-[480px] rounded-full bg-violet-600/20 blur-[140px]" />
          <div className="relative mx-auto max-w-6xl px-6 pb-24 pt-16 sm:pt-24">
            <div className="grid items-center gap-14 lg:grid-cols-[1.05fr_1fr]">
              <div>
                <Link
                  href="/demo"
                  className="inline-flex items-center gap-2 rounded-full border border-white/10 bg-white/[0.04] px-3.5 py-1.5 text-xs font-medium text-zinc-300 transition hover:border-violet-400/40 hover:text-white"
                >
                  <span className="h-1.5 w-1.5 rounded-full bg-violet-400" />
                  Enterprise GEO Intelligence
                  <span className="text-zinc-500">→</span>
                </Link>
                <h1 className="mt-7 font-display text-6xl leading-[1.02] tracking-tight text-white sm:text-7xl">
                  When buyers ask AI, does it{" "}
                  <span className="bg-gradient-to-r from-violet-300 via-fuchsia-300 to-orange-200 bg-clip-text pr-2 italic text-transparent">
                    mention you?
                  </span>
                </h1>
                <p className="mt-6 max-w-xl text-lg leading-relaxed text-zinc-400">
                  Threadly monitors how ChatGPT, Claude and Gemini answer the questions your buyers ask -
                  tracking mentions, citation share and share of voice against your competitors, scan after scan.
                </p>
                <div className="mt-9 flex flex-wrap items-center gap-4">
                  <Link
                    href="/portal"
                    className="rounded-full bg-white px-6 py-2.5 text-sm font-semibold text-zinc-950 transition hover:bg-zinc-200"
                  >
                    Start tracking your brand
                  </Link>
                  <Link href="/demo" className="text-sm font-semibold text-zinc-300 transition hover:text-white">
                    See the live demo →
                  </Link>
                </div>
                <p className="mt-5 font-mono text-xs text-zinc-600">no credit card · google sign-in · demo uses sample data</p>
              </div>
              <ScanSimulation />
            </div>
          </div>
        </section>

        {/* providers */}
        <section className="border-t border-white/[0.06]">
          <div className="mx-auto max-w-6xl px-6 py-16">
            <Reveal>
            <h2 className="mb-10 text-center font-mono text-xs uppercase tracking-[0.25em] text-zinc-500">
              Measured across the AI assistants your buyers use
            </h2>
            <div className="grid gap-3 sm:grid-cols-3">
              {PROVIDERS.map((provider, index) => (
                <Reveal key={provider.name} delay={index * 90}>
                  <div className="h-full rounded-xl border border-white/[0.08] bg-white/[0.02] p-5 transition hover:border-violet-400/40 hover:bg-violet-500/[0.06]">
                    <p className="font-semibold text-white">{provider.name}</p>
                    <p className="mt-1.5 text-[13px] leading-relaxed text-zinc-500">{provider.note}</p>
                  </div>
                </Reveal>
              ))}
            </div>
            </Reveal>
          </div>
        </section>

        {/* how it works */}
        <section className="border-t border-white/[0.06]">
          <div className="mx-auto max-w-6xl px-6 py-20">
            <h2 className="text-center font-display text-4xl tracking-tight text-white sm:text-5xl">
              Live in an afternoon
            </h2>
            <p className="mx-auto mt-4 max-w-xl text-center text-zinc-400">
              No crawlers to configure, no integrations to maintain. Three steps and your first scan is running.
            </p>
            <div className="mt-12 grid gap-px overflow-hidden rounded-2xl border border-white/[0.08] bg-white/[0.06] md:grid-cols-3">
              {STEPS.map((step, index) => (
                <Reveal key={step.title} delay={index * 110} className="bg-zinc-950">
                  <div className="p-8">
                    <p className="font-mono text-sm text-violet-400">0{index + 1}</p>
                    <h3 className="mt-4 text-lg font-semibold text-white">{step.title}</h3>
                    <p className="mt-2 text-sm leading-relaxed text-zinc-400">{step.body}</p>
                  </div>
                </Reveal>
              ))}
            </div>
          </div>
        </section>

        {/* metrics */}
        <section className="border-t border-white/[0.06]">
          <div className="mx-auto max-w-6xl px-6 py-20">
            <h2 className="text-center font-display text-4xl tracking-tight text-white sm:text-5xl">
              Know your{" "}
              <span className="bg-gradient-to-r from-violet-300 to-fuchsia-300 bg-clip-text pr-2 italic text-transparent">
                share of the answer
              </span>
            </h2>
            <div className="mt-12 grid gap-3 sm:grid-cols-2">
              {METRICS.map((metric, index) => (
                <Reveal key={metric.name} delay={index * 80}>
                  <div className="h-full rounded-xl border border-white/[0.08] bg-white/[0.02] p-6 transition hover:border-fuchsia-400/30">
                    <h3 className="font-semibold text-violet-300">{metric.name}</h3>
                    <p className="mt-2 text-sm leading-relaxed text-zinc-400">{metric.body}</p>
                  </div>
                </Reveal>
              ))}
            </div>
            <p className="mt-8 text-center font-mono text-xs text-zinc-600">
              every number in your workspace comes from your own scans - no illustrative dashboards
            </p>
          </div>
        </section>

        {/* final CTA */}
        <section className="border-t border-white/[0.06]">
          <div className="mx-auto max-w-4xl px-6 py-24 text-center">
            <Reveal>
            <h2 className="font-display text-5xl tracking-tight text-white sm:text-6xl">
              AI is the new first page of search.
            </h2>
            <p className="mx-auto mt-5 max-w-xl text-lg text-zinc-400">
              Buyers ask an assistant before they ever open a browser. Threadly tells you what those assistants say -
              and whether you're in the answer.
            </p>
            <Link
              href="/portal"
              className="mt-9 inline-block rounded-full bg-white px-7 py-3 text-sm font-semibold text-zinc-950 transition hover:bg-zinc-200"
            >
              Open your workspace
            </Link>
            </Reveal>
          </div>
        </section>
      </main>
      <Footer />
    </div>
  );
}
