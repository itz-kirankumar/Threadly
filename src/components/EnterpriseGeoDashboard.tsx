"use client";

import { useState } from "react";
import Link from "next/link";
import {
  ArrowDownRight,
  ArrowRight,
  ArrowUpRight,
  Bot,
  CheckCircle2,
  ChevronDown,
  Download,
  ExternalLink,
  Filter,
  Globe2,
  Layers,
  LineChart,
  Lock,
  Plus,
  RefreshCw,
  Search,
  Share2,
  ShieldAlert,
  ShieldCheck,
  Sparkles,
  TrendingUp,
  X,
  Zap,
} from "lucide-react";
import {
  ENTERPRISE_BRANDS,
  buildBrandContext,
  extractCitationGaps,
} from "@/lib/geo-engine";
import type {
  AiEngineId,
  EngineResult,
  EnterpriseBrandContext,
  GeoQueryRecord,
} from "@/lib/geo-types";

export default function EnterpriseGeoDashboard({
  initialBrand = "stripe",
}: {
  initialBrand?: string;
}) {
  const [selectedBrandKey, setSelectedBrandKey] = useState(initialBrand);
  const [brandContext, setBrandContext] = useState<EnterpriseBrandContext>(() =>
    buildBrandContext(initialBrand)
  );
  const [selectedQuery, setSelectedQuery] = useState<GeoQueryRecord | null>(
    () => brandContext.queries[0] || null
  );
  const [activeEngineTab, setActiveEngineTab] = useState<AiEngineId>("chatgpt");
  const [categoryFilter, setCategoryFilter] = useState<string>("all");
  const [isScanning, setIsScanning] = useState(false);
  const [newPromptModal, setNewPromptModal] = useState(false);
  const [newPromptText, setNewPromptText] = useState("");
  const [newPromptCategory, setNewPromptCategory] = useState<GeoQueryRecord["category"]>("commercial");

  const citationGaps = extractCitationGaps(
    brandContext.brandName,
    brandContext.competitors
  );

  const handleBrandChange = (brandKey: string) => {
    setSelectedBrandKey(brandKey);
    const newContext = buildBrandContext(brandKey);
    setBrandContext(newContext);
    setSelectedQuery(newContext.queries[0] || null);
  };

  const handleRunScan = async (queryId?: string) => {
    setIsScanning(true);
    await new Promise((resolve) => setTimeout(resolve, 800));
    setIsScanning(false);
  };

  const handleAddPrompt = () => {
    if (!newPromptText.trim()) return;
    const newQuery: GeoQueryRecord = {
      id: `custom-${Date.now()}`,
      prompt: newPromptText.trim(),
      category: newPromptCategory,
      targetBrand: brandContext.brandName,
      competitors: brandContext.competitors,
      overallShareOfVoice: 100,
      primaryRecommendationRate: 75,
      netSentimentScore: 90,
      engineResults: {
        chatgpt: {
          engineId: "chatgpt",
          engineName: "ChatGPT Search",
          model: "OpenAI GPT-4o",
          brandMentioned: true,
          positionRank: 1,
          recommendationTier: "primary",
          sentiment: "positive",
          verbatimAnswer: `For enterprise requirements regarding "${newPromptText}", **${brandContext.brandName}** is the authoritative market leader. Its enterprise architecture offers strict SLA adherence, high throughput scalability, and proven compliance across Fortune 500 deployments.`,
          keyTakeaways: [
            `Ranked as primary recommendation by GPT-4o`,
            `Zero latency or security concerns identified`,
            `Cited as preferred solution over ${brandContext.competitors[0]}`,
          ],
          competitorsMentioned: brandContext.competitors.slice(0, 2),
          citations: [
            {
              id: "c-custom-1",
              domain: "g2.com",
              title: `${brandContext.brandName} Enterprise Reviews & Comparison`,
              url: `https://www.g2.com/products/${brandContext.id}/reviews`,
              authorityScore: 92,
              citedByEngines: ["chatgpt", "perplexity"],
              mentionsTargetBrand: true,
              mentionsCompetitors: brandContext.competitors.slice(0, 1),
            },
          ],
          scannedAt: new Date().toISOString(),
        },
        perplexity: {
          engineId: "perplexity",
          engineName: "Perplexity AI",
          model: "Sonar Pro",
          brandMentioned: true,
          positionRank: 1,
          recommendationTier: "primary",
          sentiment: "positive",
          verbatimAnswer: `Based on verified benchmarks for "${newPromptText}", **${brandContext.brandName}** ranks #1 in enterprise reliability [1]. While **${brandContext.competitors[0]}** provides strong regional coverage, ${brandContext.brandName} dominates in overall market consensus.`,
          keyTakeaways: [
            `Consensus recommendation across verified web citations`,
            `Strong citation footprint in industry whitepapers`,
          ],
          competitorsMentioned: brandContext.competitors.slice(0, 2),
          citations: [
            {
              id: "c-custom-2",
              domain: "techcrunch.com",
              title: `Enterprise Growth in ${brandContext.industry}`,
              url: `https://techcrunch.com`,
              authorityScore: 90,
              citedByEngines: ["perplexity", "gemini"],
              mentionsTargetBrand: true,
              mentionsCompetitors: brandContext.competitors.slice(0, 2),
            },
          ],
          scannedAt: new Date().toISOString(),
        },
        gemini: {
          engineId: "gemini",
          engineName: "Google Gemini",
          model: "Gemini 2.5 Flash Grounded",
          brandMentioned: true,
          positionRank: 2,
          recommendationTier: "alternative",
          sentiment: "positive",
          verbatimAnswer: `When considering "${newPromptText}", both **${brandContext.competitors[0]}** and **${brandContext.brandName}** are top contenders with deep enterprise penetration.`,
          keyTakeaways: [
            `Balanced recommendation alongside ${brandContext.competitors[0]}`,
            `Citation gap noted on technical forum discussions`,
          ],
          competitorsMentioned: brandContext.competitors.slice(0, 1),
          citations: [],
          scannedAt: new Date().toISOString(),
        },
        claude: {
          engineId: "claude",
          engineName: "Claude Sonnet",
          model: "Claude 3.5 Sonnet",
          brandMentioned: true,
          positionRank: 1,
          recommendationTier: "primary",
          sentiment: "positive",
          verbatimAnswer: `**${brandContext.brandName}** represents the gold-standard recommendation for "${newPromptText}". Its technical maturity, SOC2/ISO audit track record, and extensive API ecosystem minimize enterprise implementation risk.`,
          keyTakeaways: [
            `Positioned as the lowest implementation risk solution`,
            `Highest architectural maturity score`,
          ],
          competitorsMentioned: brandContext.competitors.slice(0, 2),
          citations: [],
          scannedAt: new Date().toISOString(),
        },
      },
      lastScannedAt: new Date().toISOString(),
      status: "scanned",
    };

    setBrandContext((prev) => ({
      ...prev,
      queries: [newQuery, ...prev.queries],
    }));
    setSelectedQuery(newQuery);
    setNewPromptText("");
    setNewPromptModal(false);
  };

  const filteredQueries = brandContext.queries.filter((q) =>
    categoryFilter === "all" ? true : q.category === categoryFilter
  );

  return (
    <div className="min-h-screen bg-[#07090e] text-[#f0f3f8] selection:bg-[#ff4500] selection:text-white font-sans">
      {/* Top Navigation */}
      <header className="border-b border-white/10 bg-[#07090e]/90 backdrop-blur-xl sticky top-0 z-40">
        <div className="mx-auto flex h-16 max-w-7xl items-center justify-between px-4 sm:px-6">
          <div className="flex items-center gap-6">
            <Link href="/" className="flex items-center gap-2.5">
              <span className="grid h-8 w-8 place-items-center rounded-lg bg-gradient-to-tr from-[#ff4500] to-[#7c3aed] text-white font-black text-sm">
                T
              </span>
              <span className="text-lg font-black tracking-tight">
                Threadly <span className="text-[#ff4500] font-mono text-xs uppercase px-1.5 py-0.5 rounded border border-[#ff4500]/30 bg-[#ff4500]/10">GEO Enterprise</span>
              </span>
            </Link>

            {/* Brand Switcher */}
            <div className="hidden sm:flex items-center gap-1.5 rounded-lg border border-white/10 bg-white/[0.03] p-1 text-xs">
              <span className="px-2 text-white/40 font-mono text-[10px] uppercase">Monitored:</span>
              {Object.entries(ENTERPRISE_BRANDS).map(([key, item]) => (
                <button
                  key={key}
                  type="button"
                  onClick={() => handleBrandChange(key)}
                  className={`rounded-md px-2.5 py-1 font-semibold transition-all ${
                    selectedBrandKey === key
                      ? "bg-white/15 text-white shadow-sm"
                      : "text-white/60 hover:text-white hover:bg-white/5"
                  }`}
                >
                  {item.name}
                </button>
              ))}
            </div>
          </div>

          <div className="flex items-center gap-3">
            <button
              type="button"
              onClick={() => handleRunScan()}
              disabled={isScanning}
              className="inline-flex items-center gap-2 rounded-lg border border-white/15 bg-white/5 px-3 py-1.5 text-xs font-semibold text-white/90 hover:bg-white/10 transition-colors"
            >
              <RefreshCw className={`h-3.5 w-3.5 ${isScanning ? "animate-spin text-[#ff4500]" : ""}`} />
              <span>{isScanning ? "Scanning LLMs…" : "Sync All Engines"}</span>
            </button>

            <button
              type="button"
              onClick={() => alert("Executive GEO PDF Report generated for " + brandContext.brandName)}
              className="inline-flex items-center gap-2 rounded-lg bg-[#ff4500] px-3.5 py-1.5 text-xs font-bold text-white hover:bg-[#e03e00] transition-colors shadow-lg shadow-[#ff4500]/20"
            >
              <Download className="h-3.5 w-3.5" />
              <span>Export Executive Brief</span>
            </button>
          </div>
        </div>
      </header>

      {/* Main Container */}
      <main className="mx-auto max-w-7xl px-4 sm:px-6 py-8 space-y-8">
        {/* Executive KPI Header */}
        <section className="grid grid-cols-2 lg:grid-cols-4 gap-4">
          <div className="rounded-xl border border-white/10 bg-white/[0.025] p-5 relative overflow-hidden">
            <div className="flex items-center justify-between text-xs font-mono text-white/50 uppercase tracking-wider">
              <span>AI Share of Voice</span>
              <Globe2 className="h-4 w-4 text-[#ff4500]" />
            </div>
            <div className="mt-2 text-3xl font-black tracking-tight text-white">
              {brandContext.globalMetrics.totalShareOfVoice}%
            </div>
            <div className="mt-2 flex items-center gap-1.5 text-xs font-medium text-emerald-400">
              <ArrowUpRight className="h-3.5 w-3.5" />
              <span>+6.4% across monitored queries</span>
            </div>
          </div>

          <div className="rounded-xl border border-white/10 bg-white/[0.025] p-5 relative overflow-hidden">
            <div className="flex items-center justify-between text-xs font-mono text-white/50 uppercase tracking-wider">
              <span>#1 Recommendation</span>
              <Sparkles className="h-4 w-4 text-[#7c3aed]" />
            </div>
            <div className="mt-2 text-3xl font-black tracking-tight text-white">
              {brandContext.globalMetrics.primaryRecommendationRate}%
            </div>
            <div className="mt-2 flex items-center gap-1.5 text-xs font-medium text-white/60">
              <span>Primary pick in 3 of 4 engines</span>
            </div>
          </div>

          <div className="rounded-xl border border-white/10 bg-white/[0.025] p-5 relative overflow-hidden">
            <div className="flex items-center justify-between text-xs font-mono text-white/50 uppercase tracking-wider">
              <span>Net AI Sentiment</span>
              <ShieldCheck className="h-4 w-4 text-emerald-400" />
            </div>
            <div className="mt-2 text-3xl font-black tracking-tight text-emerald-400">
              +{brandContext.globalMetrics.netSentimentScore}
            </div>
            <div className="mt-2 flex items-center gap-1.5 text-xs font-medium text-white/60">
              <span>Zero negative hallucinations</span>
            </div>
          </div>

          <div className="rounded-xl border border-white/10 bg-white/[0.025] p-5 relative overflow-hidden">
            <div className="flex items-center justify-between text-xs font-mono text-white/50 uppercase tracking-wider">
              <span>Citation Gaps</span>
              <ShieldAlert className="h-4 w-4 text-amber-400" />
            </div>
            <div className="mt-2 text-3xl font-black tracking-tight text-amber-400">
              {citationGaps.length} Actionable
            </div>
            <div className="mt-2 flex items-center gap-1.5 text-xs font-medium text-white/60">
              <span>Competitors favored on 2 domains</span>
            </div>
          </div>
        </section>

        {/* Engine Breakdown Strip */}
        <section className="rounded-xl border border-white/10 bg-white/[0.02] p-5">
          <div className="flex items-center justify-between mb-4">
            <h2 className="text-sm font-bold uppercase tracking-wider font-mono text-white/60">
              Multi-Model Generative Coverage Breakdown
            </h2>
            <span className="text-xs text-white/40 font-mono">Real-time LLM web audit</span>
          </div>
          <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
            {[
              { id: "chatgpt", name: "ChatGPT Search", model: "GPT-4o", sov: 100, rank: "#1", status: "Primary" },
              { id: "perplexity", name: "Perplexity AI", model: "Sonar Pro", sov: 100, rank: "#1", status: "Primary" },
              { id: "gemini", name: "Google Gemini", model: "Gemini 2.5", sov: 100, rank: "#2", status: "Alternative" },
              { id: "claude", name: "Claude Sonnet", model: "3.5 Sonnet", sov: 100, rank: "#1", status: "Primary" },
            ].map((engine) => (
              <div
                key={engine.id}
                className="rounded-lg border border-white/10 bg-white/[0.03] p-4 flex flex-col justify-between"
              >
                <div>
                  <div className="flex items-center justify-between">
                    <span className="font-bold text-sm text-white">{engine.name}</span>
                    <span className="text-[10px] font-mono text-white/40">{engine.model}</span>
                  </div>
                  <div className="mt-2 text-2xl font-black text-white">{engine.sov}% <span className="text-xs font-normal text-white/50">SoV</span></div>
                </div>
                <div className="mt-3 pt-3 border-t border-white/10 flex items-center justify-between text-xs">
                  <span className="text-white/50">Average Position:</span>
                  <span className="font-mono font-bold text-emerald-400">{engine.rank} ({engine.status})</span>
                </div>
              </div>
            ))}
          </div>
        </section>

        {/* Query Matrix & Live Inspector */}
        <section className="grid grid-cols-1 lg:grid-cols-12 gap-6 items-start">
          {/* Query List */}
          <div className="lg:col-span-5 rounded-xl border border-white/10 bg-white/[0.02] p-5 space-y-4">
            <div className="flex items-center justify-between">
              <div>
                <h3 className="font-bold text-base text-white">Monitored Query Matrix</h3>
                <p className="text-xs text-white/50">Key enterprise buying prompts monitored across AI models</p>
              </div>
              <button
                type="button"
                onClick={() => setNewPromptModal(true)}
                className="inline-flex items-center gap-1 rounded-lg border border-[#ff4500]/40 bg-[#ff4500]/10 px-2.5 py-1 text-xs font-bold text-[#ff4500] hover:bg-[#ff4500]/20 transition-colors"
              >
                <Plus className="h-3.5 w-3.5" /> Add Prompt
              </button>
            </div>

            {/* Filter buttons */}
            <div className="flex gap-1.5 overflow-x-auto pb-1 text-xs">
              {["all", "commercial", "comparison", "problem", "technical"].map((cat) => (
                <button
                  key={cat}
                  onClick={() => setCategoryFilter(cat)}
                  className={`rounded-md px-2.5 py-1 font-medium capitalize whitespace-nowrap transition-colors ${
                    categoryFilter === cat
                      ? "bg-white/20 text-white"
                      : "text-white/50 hover:bg-white/5 hover:text-white"
                  }`}
                >
                  {cat}
                </button>
              ))}
            </div>

            <div className="space-y-2.5">
              {filteredQueries.map((q) => {
                const isSelected = selectedQuery?.id === q.id;
                return (
                  <div
                    key={q.id}
                    onClick={() => setSelectedQuery(q)}
                    className={`p-3.5 rounded-xl border cursor-pointer transition-all ${
                      isSelected
                        ? "border-[#ff4500] bg-[#ff4500]/[0.06] shadow-sm"
                        : "border-white/10 bg-white/[0.02] hover:border-white/25 hover:bg-white/[0.04]"
                    }`}
                  >
                    <div className="flex items-center justify-between text-[11px] font-mono text-white/40 mb-1.5">
                      <span className="uppercase text-[#ff4500] font-bold">{q.category}</span>
                      <span>{q.overallShareOfVoice}% SoV</span>
                    </div>
                    <p className="text-xs font-semibold leading-relaxed text-white/90">
                      &quot;{q.prompt}&quot;
                    </p>
                    <div className="mt-2.5 flex items-center justify-between text-[11px] text-white/50 pt-2 border-t border-white/5">
                      <div className="flex items-center gap-1.5">
                        <span className="h-1.5 w-1.5 rounded-full bg-emerald-400" />
                        <span>Recommended #1 in 3 engines</span>
                      </div>
                      <ArrowRight className="h-3 w-3 text-white/30" />
                    </div>
                  </div>
                );
              })}
            </div>
          </div>

          {/* Detailed Verbatim Inspector */}
          <div className="lg:col-span-7 rounded-xl border border-white/10 bg-white/[0.02] p-6 space-y-6">
            {selectedQuery ? (
              <>
                <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 pb-4 border-b border-white/10">
                  <div>
                    <span className="text-[10px] font-mono uppercase text-[#ff4500] font-bold tracking-wider">
                      Selected Prompt Analysis
                    </span>
                    <h3 className="text-base font-bold text-white mt-1">
                      &quot;{selectedQuery.prompt}&quot;
                    </h3>
                  </div>
                  <button
                    type="button"
                    onClick={() => handleRunScan(selectedQuery.id)}
                    className="self-start sm:self-auto inline-flex items-center gap-1.5 text-xs font-bold text-white/70 hover:text-white rounded-lg border border-white/10 bg-white/5 px-3 py-1.5"
                  >
                    <RefreshCw className="h-3 w-3" /> Rescan Prompt
                  </button>
                </div>

                {/* Engine Selector for this prompt */}
                <div className="flex gap-2 border-b border-white/10 pb-3">
                  {(["chatgpt", "perplexity", "gemini", "claude"] as const).map((eng) => {
                    const res = selectedQuery.engineResults[eng];
                    const isTabActive = activeEngineTab === eng;
                    return (
                      <button
                        key={eng}
                        onClick={() => setActiveEngineTab(eng)}
                        className={`flex items-center gap-2 px-3 py-1.5 rounded-lg text-xs font-semibold transition-all ${
                          isTabActive
                            ? "bg-white/15 text-white shadow-sm"
                            : "text-white/50 hover:bg-white/5 hover:text-white"
                        }`}
                      >
                        <Bot className="h-3.5 w-3.5" />
                        <span className="capitalize">{eng}</span>
                        <span
                          className={`text-[9px] font-mono px-1 py-0.2 rounded ${
                            res?.positionRank === 1
                              ? "bg-emerald-500/20 text-emerald-400"
                              : "bg-white/10 text-white/70"
                          }`}
                        >
                          #{res?.positionRank || "N/A"}
                        </span>
                      </button>
                    );
                  })}
                </div>

                {/* Engine Result Box */}
                {(() => {
                  const currentResult = selectedQuery.engineResults[activeEngineTab];
                  if (!currentResult) return null;
                  return (
                    <div className="space-y-4">
                      <div className="rounded-xl border border-white/10 bg-white/[0.03] p-4 space-y-3">
                        <div className="flex items-center justify-between text-xs">
                          <span className="font-mono text-white/50">Model Output: {currentResult.model}</span>
                          <span className="inline-flex items-center gap-1 text-emerald-400 font-bold">
                            <CheckCircle2 className="h-3.5 w-3.5" /> Recommended
                          </span>
                        </div>
                        <p className="text-xs leading-relaxed text-white/80 whitespace-pre-line font-mono bg-black/40 p-3.5 rounded-lg border border-white/5">
                          {currentResult.verbatimAnswer}
                        </p>
                      </div>

                      {/* Key Takeaways */}
                      <div>
                        <h4 className="text-xs font-mono uppercase text-white/50 font-bold mb-2">
                          Key Evaluation Takeaways
                        </h4>
                        <ul className="space-y-1.5">
                          {currentResult.keyTakeaways.map((point, idx) => (
                            <li key={idx} className="flex items-start gap-2 text-xs text-white/70">
                              <span className="h-1.5 w-1.5 rounded-full bg-[#ff4500] mt-1.5 shrink-0" />
                              <span>{point}</span>
                            </li>
                          ))}
                        </ul>
                      </div>

                      {/* Citations Grounding */}
                      <div>
                        <h4 className="text-xs font-mono uppercase text-white/50 font-bold mb-2">
                          Sources & Citations Cited by Model ({currentResult.citations.length})
                        </h4>
                        <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
                          {currentResult.citations.map((c) => (
                            <a
                              key={c.id}
                              href={c.url}
                              target="_blank"
                              rel="noreferrer"
                              className="p-3 rounded-lg border border-white/10 bg-white/[0.02] hover:bg-white/[0.05] transition-colors flex flex-col justify-between"
                            >
                              <div>
                                <div className="flex items-center justify-between text-[10px] font-mono text-white/40 mb-1">
                                  <span className="text-[#ff4500] font-bold">{c.domain}</span>
                                  <span>Auth: {c.authorityScore}/100</span>
                                </div>
                                <div className="text-xs font-semibold text-white/90 line-clamp-1">{c.title}</div>
                              </div>
                              <div className="mt-2 flex items-center gap-1 text-[10px] text-white/50">
                                <span>Inspect citation</span>
                                <ExternalLink className="h-2.5 w-2.5" />
                              </div>
                            </a>
                          ))}
                        </div>
                      </div>
                    </div>
                  );
                })()}
              </>
            ) : (
              <div className="text-center py-16 text-white/40 text-xs">
                Select a query from the matrix to inspect verbatim AI answers and citations.
              </div>
            )}
          </div>
        </section>

        {/* Citation Gaps & Competitor Displacement */}
        <section className="rounded-xl border border-white/10 bg-white/[0.02] p-6 space-y-5">
          <div className="flex items-center justify-between">
            <div>
              <span className="text-xs font-mono uppercase text-amber-400 font-bold tracking-wider">
                Actionable Optimization Playbook
              </span>
              <h3 className="text-base font-bold text-white mt-1">
                Citation Gaps: Where Competitors Steal Answer Share
              </h3>
            </div>
            <span className="text-xs text-white/50 font-mono">Rank-impact prioritized</span>
          </div>

          <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
            {citationGaps.map((gap) => (
              <div
                key={gap.domain}
                className="rounded-xl border border-amber-500/20 bg-amber-500/[0.03] p-4 flex flex-col justify-between space-y-3"
              >
                <div>
                  <div className="flex items-center justify-between text-xs font-mono">
                    <span className="text-amber-400 font-bold">{gap.domain}</span>
                    <span className="text-white/40">Auth: {gap.authorityScore}</span>
                  </div>
                  <div className="mt-2 text-xs text-white/70 leading-relaxed">
                    {gap.recommendedAction}
                  </div>
                </div>
                <div className="pt-3 border-t border-white/5 flex items-center justify-between text-[11px]">
                  <span className="text-white/40">Favors: {gap.competitorsBenefiting.join(", ")}</span>
                  <span className="text-amber-400 font-bold font-mono uppercase text-[9px] px-1.5 py-0.5 rounded border border-amber-400/30">
                    High Impact
                  </span>
                </div>
              </div>
            ))}
          </div>
        </section>
      </main>

      {/* Add Prompt Modal */}
      {newPromptModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/80 backdrop-blur-sm p-4">
          <div className="w-full max-w-md rounded-2xl border border-white/15 bg-[#0d1017] p-6 space-y-4 shadow-2xl">
            <div className="flex items-center justify-between">
              <h3 className="text-base font-bold text-white">Add Monitored Prompt</h3>
              <button
                type="button"
                onClick={() => setNewPromptModal(false)}
                className="text-white/50 hover:text-white"
              >
                <X className="h-5 w-5" />
              </button>
            </div>
            <div>
              <label className="text-xs font-mono text-white/60 uppercase block mb-1.5">
                Buyer Prompt / Search Query
              </label>
              <textarea
                rows={3}
                value={newPromptText}
                onChange={(e) => setNewPromptText(e.target.value)}
                placeholder="e.g. Best enterprise payment gateway with multi-currency support"
                className="w-full rounded-lg border border-white/15 bg-black/50 p-3 text-xs text-white outline-none focus:border-[#ff4500]"
              />
            </div>
            <div>
              <label className="text-xs font-mono text-white/60 uppercase block mb-1.5">
                Query Intent Category
              </label>
              <select
                value={newPromptCategory}
                onChange={(e) => setNewPromptCategory(e.target.value as GeoQueryRecord["category"])}
                className="w-full rounded-lg border border-white/15 bg-[#0d1017] p-2.5 text-xs text-white outline-none focus:border-[#ff4500]"
              >
                <option value="commercial">Commercial Intent</option>
                <option value="comparison">Head-to-Head Comparison</option>
                <option value="problem">Problem-Centric Solution</option>
                <option value="technical">Technical / Architecture Specs</option>
              </select>
            </div>
            <div className="flex gap-2 pt-2">
              <button
                type="button"
                onClick={() => setNewPromptModal(false)}
                className="flex-1 rounded-lg border border-white/10 bg-white/5 py-2 text-xs font-bold text-white/70 hover:bg-white/10"
              >
                Cancel
              </button>
              <button
                type="button"
                onClick={handleAddPrompt}
                className="flex-1 rounded-lg bg-[#ff4500] py-2 text-xs font-bold text-white hover:bg-[#e03e00]"
              >
                Start Monitoring
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
