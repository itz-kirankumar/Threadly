import Link from "next/link";
import Navbar from "@/components/Navbar";
import Footer from "@/components/Footer";

const PROVIDERS = [
  { name: "ChatGPT", note: "OpenAI responses with live web search" },
  { name: "Claude", note: "Anthropic answers with web search" },
  { name: "Gemini", note: "Google AI with Search grounding" },
  { name: "Perplexity", note: "Sonar answers with native citations" },
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
    body: "Every scan asks all four providers each question and measures whether answers mention you, cite your site, and where you rank against competitors.",
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
    <div className="flex min-h-screen flex-col bg-zinc-950">
      <Navbar />
      <main className="flex-grow">
        <section className="mx-auto max-w-4xl px-6 pb-20 pt-24 text-center">
          <p className="mb-4 inline-block rounded-full border border-violet-400/40 bg-violet-500/10 px-3 py-1 text-xs font-medium text-violet-300">
            Enterprise GEO Intelligence
          </p>
          <h1 className="text-4xl font-bold tracking-tight text-white sm:text-6xl">
            When buyers ask AI,
            <br />
            <span className="bg-gradient-to-r from-violet-400 to-fuchsia-400 bg-clip-text text-transparent">
              does it mention you?
            </span>
          </h1>
          <p className="mx-auto mt-6 max-w-2xl text-lg leading-relaxed text-zinc-400">
            Threadly monitors how ChatGPT, Claude, Gemini and Perplexity answer the questions your buyers ask —
            tracking brand mentions, citation share and share of voice against your competitors, scan after scan.
          </p>
          <div className="mt-10 flex flex-col items-center justify-center gap-3 sm:flex-row">
            <Link
              href="/portal"
              className="rounded-lg bg-violet-500 px-6 py-3 text-sm font-semibold text-white transition hover:bg-violet-400"
            >
              Start tracking your brand
            </Link>
            <Link
              href="/demo"
              className="rounded-lg border border-white/15 px-6 py-3 text-sm font-semibold text-zinc-200 transition hover:bg-white/5"
            >
              See a live demo
            </Link>
          </div>
          <p className="mt-4 text-xs text-zinc-600">No credit card. Google sign-in. Demo uses sample data.</p>
        </section>

        <section className="border-t border-white/5 bg-white/[0.02]">
          <div className="mx-auto max-w-6xl px-6 py-16">
            <h2 className="mb-8 text-center text-sm font-semibold uppercase tracking-widest text-zinc-500">
              Measured across the four assistants your buyers use
            </h2>
            <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
              {PROVIDERS.map((provider) => (
                <div key={provider.name} className="rounded-xl border border-white/10 bg-zinc-950 p-5">
                  <p className="font-semibold text-white">{provider.name}</p>
                  <p className="mt-1 text-sm text-zinc-500">{provider.note}</p>
                </div>
              ))}
            </div>
          </div>
        </section>

        <section className="mx-auto max-w-6xl px-6 py-16">
          <h2 className="mb-10 text-center text-2xl font-bold text-white">How it works</h2>
          <div className="grid gap-6 md:grid-cols-3">
            {STEPS.map((step, index) => (
              <div key={step.title} className="rounded-xl border border-white/10 bg-white/[0.03] p-6">
                <p className="mb-3 flex h-8 w-8 items-center justify-center rounded-lg bg-violet-500/15 text-sm font-bold text-violet-300">
                  {index + 1}
                </p>
                <h3 className="font-semibold text-white">{step.title}</h3>
                <p className="mt-2 text-sm leading-relaxed text-zinc-400">{step.body}</p>
              </div>
            ))}
          </div>
        </section>

        <section className="border-t border-white/5 bg-white/[0.02]">
          <div className="mx-auto max-w-6xl px-6 py-16">
            <h2 className="mb-10 text-center text-2xl font-bold text-white">The metrics that matter for GEO</h2>
            <div className="grid gap-4 sm:grid-cols-2">
              {METRICS.map((metric) => (
                <div key={metric.name} className="rounded-xl border border-white/10 bg-zinc-950 p-6">
                  <h3 className="font-semibold text-violet-300">{metric.name}</h3>
                  <p className="mt-2 text-sm leading-relaxed text-zinc-400">{metric.body}</p>
                </div>
              ))}
            </div>
            <p className="mt-8 text-center text-sm text-zinc-500">
              Every number in your workspace comes from your own scans — no illustrative dashboards.
            </p>
          </div>
        </section>

        <section className="mx-auto max-w-4xl px-6 py-20 text-center">
          <h2 className="text-3xl font-bold text-white">AI is the new first page of search.</h2>
          <p className="mx-auto mt-4 max-w-xl text-zinc-400">
            Buyers increasingly ask an assistant before they ever open a browser. Threadly tells you what those
            assistants say — and whether you're in the answer.
          </p>
          <Link
            href="/portal"
            className="mt-8 inline-block rounded-lg bg-violet-500 px-6 py-3 text-sm font-semibold text-white transition hover:bg-violet-400"
          >
            Open your workspace
          </Link>
        </section>
      </main>
      <Footer />
    </div>
  );
}
