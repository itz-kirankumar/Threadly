"use client";

import { useState } from "react";
import Link from "next/link";
import {
  ArrowRight,
  ArrowUpRight,
  Bot,
  CheckCircle2,
  ChevronRight,
  Database,
  ExternalLink,
  Flame,
  Globe2,
  Layers,
  LineChart,
  Lock,
  RefreshCw,
  Search,
  ShieldCheck,
  Sparkles,
  TrendingUp,
  Zap,
} from "lucide-react";

export default function EnterpriseLandingPage() {
  const [testBrand, setTestBrand] = useState("Stripe");
  const [testCompetitor, setTestCompetitor] = useState("Adyen");
  const [activeEngine, setActiveEngine] = useState<"chatgpt" | "perplexity" | "gemini">("chatgpt");
  const [isAuditing, setIsAuditing] = useState(false);

  const handleAudit = () => {
    setIsAuditing(true);
    setTimeout(() => setIsAuditing(false), 600);
  };

  return (
    <div className="min-h-screen bg-[#07090e] text-[#f0f3f8] selection:bg-[#ff4500] selection:text-white font-sans antialiased">
      {/* Top Navigation */}
      <header className="border-b border-white/10 bg-[#07090e]/80 backdrop-blur-xl fixed inset-x-0 top-0 z-50">
        <div className="mx-auto flex h-16 max-w-7xl items-center justify-between px-5 sm:px-8">
          <Link href="/" className="flex items-center gap-2.5">
            <span className="grid h-8 w-8 place-items-center rounded-lg bg-gradient-to-tr from-[#ff4500] to-[#7c3aed] text-white font-black text-sm">
              T
            </span>
            <span className="text-lg font-black tracking-tight text-white">
              Threadly <span className="text-[#ff4500] font-mono text-[10px] uppercase px-1.5 py-0.5 rounded border border-[#ff4500]/30 bg-[#ff4500]/10">GEO Enterprise</span>
            </span>
          </Link>

          <nav className="hidden md:flex items-center gap-6 text-xs font-semibold text-white/60">
            <a href="#how-it-works" className="hover:text-white transition-colors">How GEO Works</a>
            <a href="#citation-graph" className="hover:text-white transition-colors">Citation Graph</a>
            <a href="#enterprise-scale" className="hover:text-white transition-colors">Enterprise Security</a>
            <Link href="/demo" className="text-amber-400 hover:text-amber-300 font-bold transition-colors">Interactive Demo</Link>
          </nav>

          <div className="flex items-center gap-3">
            <Link
              href="/demo"
              className="inline-flex items-center gap-1.5 rounded-lg border border-white/15 bg-white/5 px-3.5 py-1.5 text-xs font-bold text-white hover:bg-white/10 transition-colors"
            >
              <span>Explore Demo</span>
              <ArrowRight className="h-3.5 w-3.5" />
            </Link>
            <Link
              href="/portal"
              className="inline-flex items-center gap-1.5 rounded-lg bg-[#ff4500] px-3.5 py-1.5 text-xs font-bold text-white hover:bg-[#e03e00] transition-colors shadow-lg shadow-[#ff4500]/20"
            >
              <span>Enter Workspace</span>
              <ArrowUpRight className="h-3.5 w-3.5" />
            </Link>
          </div>
        </div>
      </header>

      {/* Hero Section */}
      <section className="pt-32 pb-20 relative overflow-hidden">
        {/* Glow Effects */}
        <div className="pointer-events-none absolute -top-40 left-1/2 -translate-x-1/2 h-[500px] w-[800px] rounded-full bg-gradient-to-b from-[#ff4500]/20 via-[#7c3aed]/10 to-transparent blur-[140px]" />

        <div className="mx-auto max-w-5xl px-5 sm:px-8 text-center relative z-10">
          <div className="inline-flex items-center gap-2 rounded-full border border-white/10 bg-white/5 px-3.5 py-1.5 text-[11px] font-mono uppercase tracking-wider text-[#ff4500] mb-6">
            <span className="h-1.5 w-1.5 rounded-full bg-[#ff4500] animate-pulse" />
            <span>Enterprise Generative Engine Optimization (GEO)</span>
          </div>

          <h1 className="text-4xl sm:text-6xl lg:text-7xl font-black tracking-tight leading-[1.05] text-white">
            Your buyers aren&apos;t Googling.
            <br />
            <span className="bg-gradient-to-r from-white via-white/90 to-white/50 bg-clip-text text-transparent">
              They&apos;re asking AI.
            </span>
          </h1>

          <p className="mx-auto mt-6 max-w-2xl text-base sm:text-lg text-white/60 leading-relaxed">
            Threadly monitors brand recommendations, citation share, and competitor displacement across{" "}
            <span className="text-white font-medium">ChatGPT</span>,{" "}
            <span className="text-white font-medium">Perplexity</span>,{" "}
            <span className="text-white font-medium">Gemini</span>, and{" "}
            <span className="text-white font-medium">Claude</span>.
          </p>

          <div className="mt-8 flex flex-col sm:flex-row items-center justify-center gap-3">
            <Link
              href="/portal"
              className="w-full sm:w-auto inline-flex items-center justify-center gap-2 rounded-xl bg-[#ff4500] px-7 py-3.5 text-sm font-bold text-white hover:bg-[#e03e00] transition-all shadow-xl shadow-[#ff4500]/25"
            >
              <span>Launch Enterprise Platform</span>
              <ArrowRight className="h-4 w-4" />
            </Link>
            <Link
              href="/demo"
              className="w-full sm:w-auto inline-flex items-center justify-center gap-2 rounded-xl border border-white/15 bg-white/5 px-7 py-3.5 text-sm font-bold text-white hover:bg-white/10 transition-colors"
            >
              <span>View Interactive Demo</span>
              <ArrowUpRight className="h-4 w-4" />
            </Link>
          </div>

          {/* Real-time stats strip */}
          <div className="mt-14 grid grid-cols-2 md:grid-cols-4 gap-3 text-left">
            {[
              { label: "AI Share of Voice", value: "84%", sub: "Average enterprise benchmark" },
              { label: "Citation Sources", value: "240+", sub: "Verified high-authority domains" },
              { label: "Engines Monitored", value: "4 LLMs", sub: "ChatGPT, Perplexity, Gemini, Claude" },
              { label: "Response Latency", value: "< 1.2s", sub: "Real-time query synthesis" },
            ].map((stat, i) => (
              <div key={i} className="rounded-xl border border-white/10 bg-white/[0.02] p-4">
                <div className="text-xs font-mono text-white/40 uppercase tracking-wider">{stat.label}</div>
                <div className="mt-1 text-2xl font-black text-white">{stat.value}</div>
                <div className="mt-1 text-[11px] text-white/50">{stat.sub}</div>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* Live Interactive Widget */}
      <section className="py-16 border-y border-white/10 bg-[#090c13]/60 relative">
        <div className="mx-auto max-w-5xl px-5 sm:px-8">
          <div className="text-center max-w-xl mx-auto mb-10">
            <span className="text-xs font-mono uppercase text-[#ff4500] font-bold tracking-wider">
              Live Product Simulator
            </span>
            <h2 className="text-2xl sm:text-3xl font-black tracking-tight text-white mt-2">
              Test AI Brand Positioning in Real Time
            </h2>
            <p className="text-xs sm:text-sm text-white/50 mt-2">
              See what top AI models answer when enterprise buyers evaluate your software against incumbents.
            </p>
          </div>

          {/* Interactive Widget Box */}
          <div className="rounded-2xl border border-white/15 bg-[#0d1017] p-6 shadow-2xl space-y-6">
            <div className="grid grid-cols-1 sm:grid-cols-12 gap-3 items-end">
              <div className="sm:col-span-5">
                <label className="text-xs font-mono uppercase text-white/50 font-bold block mb-1">
                  Your Enterprise Brand
                </label>
                <input
                  type="text"
                  value={testBrand}
                  onChange={(e) => setTestBrand(e.target.value)}
                  placeholder="e.g. Stripe, Datadog, Snowflake"
                  className="w-full rounded-lg border border-white/15 bg-black/50 px-3.5 py-2 text-xs font-semibold text-white outline-none focus:border-[#ff4500]"
                />
              </div>
              <div className="sm:col-span-5">
                <label className="text-xs font-mono uppercase text-white/50 font-bold block mb-1">
                  Primary Competitor
                </label>
                <input
                  type="text"
                  value={testCompetitor}
                  onChange={(e) => setTestCompetitor(e.target.value)}
                  placeholder="e.g. Adyen, Dynatrace, Databricks"
                  className="w-full rounded-lg border border-white/15 bg-black/50 px-3.5 py-2 text-xs font-semibold text-white outline-none focus:border-[#ff4500]"
                />
              </div>
              <div className="sm:col-span-2">
                <button
                  type="button"
                  onClick={handleAudit}
                  disabled={isAuditing}
                  className="w-full rounded-lg bg-[#ff4500] py-2 text-xs font-bold text-white hover:bg-[#e03e00] transition-colors flex items-center justify-center gap-1.5"
                >
                  <RefreshCw className={`h-3 w-3 ${isAuditing ? "animate-spin" : ""}`} />
                  <span>Scan</span>
                </button>
              </div>
            </div>

            {/* Model Preview Tabs */}
            <div className="pt-2 border-t border-white/10">
              <div className="flex gap-2 mb-4">
                {(["chatgpt", "perplexity", "gemini"] as const).map((eng) => (
                  <button
                    key={eng}
                    onClick={() => setActiveEngine(eng)}
                    className={`flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-semibold capitalize transition-all ${
                      activeEngine === eng
                        ? "bg-white/15 text-white"
                        : "text-white/40 hover:text-white"
                    }`}
                  >
                    <Bot className="h-3.5 w-3.5" />
                    <span>{eng === "chatgpt" ? "ChatGPT" : eng === "perplexity" ? "Perplexity" : "Gemini"}</span>
                  </button>
                ))}
              </div>

              {/* Model Output Card */}
              <div className="rounded-xl border border-white/10 bg-black/40 p-4 space-y-3 font-mono text-xs">
                <div className="flex items-center justify-between text-[11px] text-white/50">
                  <span>Prompt: &quot;Best enterprise software comparing {testBrand} vs {testCompetitor}&quot;</span>
                  <span className="text-emerald-400 font-bold">● Ranked #1 Choice</span>
                </div>
                <div className="p-3 rounded-lg bg-white/[0.02] border border-white/5 text-white/80 leading-relaxed">
                  {activeEngine === "chatgpt" && (
                    <p>
                      In enterprise evaluations for large-scale operations, <strong>{testBrand}</strong> is the primary recommendation.
                      It leads in developer adoption, modern API integrations, and uptime SLAs. While <strong>{testCompetitor}</strong> is
                      frequently chosen for specific regional banking infrastructure, {testBrand} delivers superior developer velocity and lower implementation friction.
                    </p>
                  )}
                  {activeEngine === "perplexity" && (
                    <p>
                      Market consensus ranks <strong>{testBrand}</strong> as the top platform based on customer satisfaction scores on G2 and Gartner [1][2].
                      Key differentiators include seamless multi-region deployment and robust compliance certifications. <strong>{testCompetitor}</strong> represents
                      a strong secondary option for legacy contracts [3].
                    </p>
                  )}
                  {activeEngine === "gemini" && (
                    <p>
                      Both <strong>{testBrand}</strong> and <strong>{testCompetitor}</strong> offer enterprise-grade capabilities.
                      Procurement teams cite {testBrand} for rapid time-to-value and superior technical documentation, whereas {testCompetitor} is
                      noted for customized enterprise volume negotiations.
                    </p>
                  )}
                </div>

                {/* Citations Preview */}
                <div className="pt-2 flex flex-wrap items-center gap-3 text-[11px] text-white/50">
                  <span className="text-white/40 font-bold">Citations verified:</span>
                  <span className="text-white/80 underline cursor-pointer">g2.com/categories/{testBrand.toLowerCase()}</span>
                  <span className="text-white/80 underline cursor-pointer">gartner.com/reviews/{testBrand.toLowerCase()}</span>
                  <span className="text-white/80 underline cursor-pointer">techcrunch.com/enterprise</span>
                </div>
              </div>
            </div>
          </div>
        </div>
      </section>

      {/* Comparison: Traditional SEO vs Enterprise GEO */}
      <section id="how-it-works" className="py-24">
        <div className="mx-auto max-w-5xl px-5 sm:px-8">
          <div className="text-center max-w-xl mx-auto mb-14">
            <span className="text-xs font-mono uppercase text-[#7c3aed] font-bold tracking-wider">
              The Paradigm Shift
            </span>
            <h2 className="text-3xl sm:text-4xl font-black tracking-tight text-white mt-2">
              Legacy SEO is Dead. Enterprise GEO is the Replacement.
            </h2>
          </div>

          <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
            {/* Legacy SEO */}
            <div className="rounded-2xl border border-red-500/20 bg-red-500/[0.02] p-6 space-y-4">
              <div className="text-xs font-mono uppercase text-red-400 font-bold">Legacy SEO (2010 - 2024)</div>
              <h3 className="text-xl font-bold text-white">Keyword Ranking & Blue Links</h3>
              <ul className="space-y-3 text-xs text-white/60">
                <li className="flex items-start gap-2">
                  <span className="text-red-400 font-bold">✕</span>
                  <span>Optimized for Google bot crawlers indexing meta tags</span>
                </li>
                <li className="flex items-start gap-2">
                  <span className="text-red-400 font-bold">✕</span>
                  <span>High bounce rates as AI Overviews consume 0-click queries</span>
                </li>
                <li className="flex items-start gap-2">
                  <span className="text-red-400 font-bold">✕</span>
                  <span>Zero visibility into what LLMs synthesize or recommend to buyers</span>
                </li>
              </ul>
            </div>

            {/* Enterprise GEO */}
            <div className="rounded-2xl border border-emerald-500/20 bg-emerald-500/[0.02] p-6 space-y-4">
              <div className="text-xs font-mono uppercase text-emerald-400 font-bold">Enterprise GEO (2025+)</div>
              <h3 className="text-xl font-bold text-white">Generative Engine Optimization</h3>
              <ul className="space-y-3 text-xs text-white/70">
                <li className="flex items-start gap-2">
                  <span className="text-emerald-400 font-bold">✓</span>
                  <span>Monitors brand synthesis in ChatGPT, Perplexity, Claude, & Gemini</span>
                </li>
                <li className="flex items-start gap-2">
                  <span className="text-emerald-400 font-bold">✓</span>
                  <span>Maps exact source citations (G2, Reddit, GitHub, Whitepapers)</span>
                </li>
                <li className="flex items-start gap-2">
                  <span className="text-emerald-400 font-bold">✓</span>
                  <span>Detects competitor displacement before it costs pipeline</span>
                </li>
              </ul>
            </div>
          </div>
        </div>
      </section>

      {/* CTA Footer */}
      <section className="py-20 border-t border-white/10 bg-gradient-to-b from-[#07090e] to-[#0d1017]">
        <div className="mx-auto max-w-4xl px-5 text-center space-y-6">
          <h2 className="text-3xl sm:text-5xl font-black tracking-tight text-white">
            Secure Your AI Answer Share.
          </h2>
          <p className="text-sm text-white/60 max-w-xl mx-auto">
            Join enterprise marketing and growth leaders using Threadly to audit and dominate generative answer engines.
          </p>
          <div className="pt-4 flex flex-col sm:flex-row items-center justify-center gap-3">
            <Link
              href="/portal"
              className="w-full sm:w-auto inline-flex items-center justify-center gap-2 rounded-xl bg-[#ff4500] px-8 py-4 text-sm font-bold text-white hover:bg-[#e03e00] transition-colors shadow-lg shadow-[#ff4500]/25"
            >
              <span>Launch Enterprise Workspace</span>
              <ArrowRight className="h-4 w-4" />
            </Link>
            <Link
              href="/demo"
              className="w-full sm:w-auto inline-flex items-center justify-center gap-2 rounded-xl border border-white/15 bg-white/5 px-8 py-4 text-sm font-bold text-white hover:bg-white/10 transition-colors"
            >
              <span>Explore Public Demo</span>
              <ArrowUpRight className="h-4 w-4" />
            </Link>
          </div>
        </div>
      </section>

      {/* Minimal Footer */}
      <footer className="border-t border-white/10 py-8 bg-[#07090e]">
        <div className="mx-auto max-w-7xl px-5 sm:px-8 flex flex-col sm:flex-row items-center justify-between text-xs text-white/40 gap-4">
          <div className="flex items-center gap-2">
            <span>© 2026 Threadly Enterprise GEO Technologies Inc.</span>
          </div>
          <div className="flex items-center gap-6">
            <Link href="/privacy" className="hover:text-white transition-colors">Privacy Policy</Link>
            <Link href="/terms" className="hover:text-white transition-colors">Terms of Service</Link>
            <Link href="/security" className="hover:text-white transition-colors">Security & SOC2</Link>
          </div>
        </div>
      </footer>
    </div>
  );
}
