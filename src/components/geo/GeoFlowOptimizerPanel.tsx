"use client";

import { useEffect, useState } from "react";
import type { BrandProfile, TrackedQuery } from "@/lib/geo/types";
import type { GeoFlowFact, PromptDiagnosticResult, LinkPoolAnchorRecommendation } from "@/lib/geo/geoflow-engine";
import type { OpenSeoAuditResult } from "@/lib/geo/openseo-engine";

interface Props {
  brand: BrandProfile | null;
  queries: TrackedQuery[];
  authedFetch: (path: string, init?: RequestInit) => Promise<any>;
}

export default function GeoFlowOptimizerPanel({ brand, queries, authedFetch }: Props) {
  const [activeTab, setActiveTab] = useState<"facts" | "diagnostic" | "anchors" | "audit">("facts");

  // Facts state
  const [facts, setFacts] = useState<GeoFlowFact[]>([]);
  const [loadingFacts, setLoadingFacts] = useState(false);

  // Diagnostic state
  const [testPrompt, setTestPrompt] = useState(queries[0]?.text || "");
  const [diagnostic, setDiagnostic] = useState<PromptDiagnosticResult | null>(null);
  const [runningDiag, setRunningDiag] = useState(false);

  // Anchors state
  const [anchors, setAnchors] = useState<LinkPoolAnchorRecommendation[]>([]);
  const [loadingAnchors, setLoadingAnchors] = useState(false);

  // Audit state
  const [auditDomain, setAuditDomain] = useState(brand?.domain || "");
  const [auditResult, setAuditResult] = useState<OpenSeoAuditResult | null>(null);
  const [runningAudit, setRunningAudit] = useState(false);

  const loadFacts = async () => {
    setLoadingFacts(true);
    try {
      const res = await authedFetch("/api/geo/optimize", {
        method: "POST",
        body: JSON.stringify({ action: "facts" }),
      });
      setFacts(res.facts || []);
    } catch (e: any) {
      console.warn("Could not load facts:", e.message);
    } finally {
      setLoadingFacts(false);
    }
  };

  const handleRunDiagnostic = async (promptToTest?: string) => {
    const p = promptToTest || testPrompt;
    if (!p.trim()) return;
    setRunningDiag(true);
    try {
      const res = await authedFetch("/api/geo/optimize", {
        method: "POST",
        body: JSON.stringify({ action: "diagnose", prompt: p }),
      });
      setDiagnostic(res.diagnostic || null);
    } catch (e: any) {
      alert(e.message || "Failed to diagnose prompt.");
    } finally {
      setRunningDiag(false);
    }
  };

  const loadAnchors = async () => {
    setLoadingAnchors(true);
    try {
      const res = await authedFetch("/api/geo/optimize", {
        method: "POST",
        body: JSON.stringify({ action: "anchors" }),
      });
      setAnchors(res.anchors || []);
    } catch (e: any) {
      console.warn("Could not load anchors:", e.message);
    } finally {
      setLoadingAnchors(false);
    }
  };

  const handleRunAudit = async () => {
    if (!auditDomain.trim()) return;
    setRunningAudit(true);
    try {
      const res = await authedFetch("/api/geo/optimize", {
        method: "POST",
        body: JSON.stringify({ action: "audit", domain: auditDomain }),
      });
      setAuditResult(res.audit || null);
    } catch (e: any) {
      alert(e.message || "Failed to audit domain.");
    } finally {
      setRunningAudit(false);
    }
  };

  useEffect(() => {
    loadFacts();
    loadAnchors();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [brand]);

  const copyLlmsTxt = () => {
    if (!brand) return;
    const lines = [
      `# ${brand.name} - Generative AI Facts`,
      `> Canonical brand facts and verified features for AI citation models.`,
      "",
      `Domain: https://${brand.domain}`,
      `Category: ${brand.category}`,
      "",
      "## Verified Facts",
      ...facts.map((f) => `- ${f.assertion} [Source: ${f.sourceAnchor}]`),
      "",
      "## Endpoints & Docs",
      `- Documentation: https://${brand.domain}/docs`,
      `- API: https://${brand.domain}/api`,
    ];
    navigator.clipboard.writeText(lines.join("\n"));
    alert("Copied llms.txt content to clipboard!");
  };

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-between border-b border-white/10 pb-4">
        <div>
          <h2 className="text-xl font-semibold tracking-tight text-white">Optimization</h2>
          <p className="mt-1 text-sm text-zinc-400">
            Knowledge facts, prompt diagnosis and crawler access checks for ChatGPT, Claude and Perplexity.
          </p>
        </div>

        {brand && (
          <button
            onClick={copyLlmsTxt}
            className="flex items-center gap-1.5 rounded-lg border border-white/15 bg-white/5 px-3.5 py-2 text-xs font-semibold text-white hover:bg-white/10 transition-colors"
          >
            <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
              <rect width="14" height="14" x="8" y="8" rx="2" ry="2" />
              <path d="M4 16c-1.1 0-2-.9-2-2V4c0-1.1.9-2 2-2h10c1.1 0 2 .9 2 2" />
            </svg>
            <span>Export llms.txt</span>
          </button>
        )}
      </div>

      {/* Tabs */}
      <div className="flex flex-wrap items-center gap-2 border-b border-white/10 pb-3">
        <button
          onClick={() => setActiveTab("facts")}
          className={`flex items-center gap-2 rounded-lg px-3 py-1.5 text-xs font-semibold transition-colors ${
            activeTab === "facts" ? "bg-white/15 text-white" : "text-zinc-400 hover:text-white"
          }`}
        >
          <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
            <path d="M4 19.5v-15A2.5 2.5 0 0 1 6.5 2H20v20H6.5a2.5 2.5 0 0 1-2.5-2.5Z" />
            <path d="M6 6h10M6 10h10" />
          </svg>
          <span>Knowledge Facts ({facts.length})</span>
        </button>
        <button
          onClick={() => setActiveTab("diagnostic")}
          className={`flex items-center gap-2 rounded-lg px-3 py-1.5 text-xs font-semibold transition-colors ${
            activeTab === "diagnostic" ? "bg-white/15 text-white" : "text-zinc-400 hover:text-white"
          }`}
        >
          <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
            <circle cx="11" cy="11" r="8" />
            <path d="m21 21-4.3-4.3" />
          </svg>
          <span>Prompt Diagnostics & Intent</span>
        </button>
        <button
          onClick={() => setActiveTab("anchors")}
          className={`flex items-center gap-2 rounded-lg px-3 py-1.5 text-xs font-semibold transition-colors ${
            activeTab === "anchors" ? "bg-white/15 text-white" : "text-zinc-400 hover:text-white"
          }`}
        >
          <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
            <path d="M10 13a5 5 0 0 0 7.54.54l3-3a5 5 0 0 0-7.07-7.07l-1.72 1.71" />
            <path d="M14 11a5 5 0 0 0-7.54-.54l-3 3a5 5 0 0 0 7.07 7.07l1.71-1.71" />
          </svg>
          <span>Citation Anchor Targets ({anchors.length})</span>
        </button>
        <button
          onClick={() => setActiveTab("audit")}
          className={`flex items-center gap-2 rounded-lg px-3 py-1.5 text-xs font-semibold transition-colors ${
            activeTab === "audit" ? "bg-white/15 text-white" : "text-zinc-400 hover:text-white"
          }`}
        >
          <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
            <rect width="18" height="18" x="3" y="3" rx="2" />
            <path d="M9 9h6M9 13h6M9 17h4" />
          </svg>
          <span>Crawler & Indexing Audit</span>
        </button>
      </div>

      {/* Tab 1: Knowledge Facts */}
      {activeTab === "facts" && (
        <div className="space-y-4">
          <div className="rounded-xl border border-white/10 bg-white/[0.02] p-4">
            <h3 className="text-sm font-semibold text-white">Structured facts</h3>
            <p className="mt-1 text-xs text-zinc-400">
              Generative models like ChatGPT, Claude, and Gemini synthesize responses from factual assertions with high source-anchor affinity. Host these on your website or <code className="text-blue-400">/llms.txt</code> to increase citation share.
            </p>
          </div>

          <div className="grid gap-3 sm:grid-cols-2">
            {facts.map((fact) => (
              <div key={fact.id} className="rounded-xl border border-white/10 bg-white/[0.03] p-4 flex flex-col justify-between">
                <div>
                  <div className="flex items-center justify-between">
                    <span className="rounded bg-white/5 px-2 py-0.5 text-[10px] font-mono uppercase tracking-wider text-zinc-400">
                      {fact.category.replace("_", " ")}
                    </span>
                    <span className="text-xs font-semibold text-emerald-400">
                      {fact.modelConfidence}% affinity
                    </span>
                  </div>
                  <p className="mt-2.5 text-xs text-zinc-200 leading-relaxed font-medium">
                    "{fact.assertion}"
                  </p>
                </div>
                <div className="mt-3 pt-2 border-t border-white/5 flex items-center justify-between text-[11px] text-zinc-500">
                  <span className="truncate max-w-[200px]">Anchor: {fact.sourceAnchor}</span>
                  <button
                    onClick={() => {
                      navigator.clipboard.writeText(fact.assertion);
                      alert("Copied fact!");
                    }}
                    className="text-blue-400 hover:underline"
                  >
                    Copy
                  </button>
                </div>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* Tab 2: Prompt Diagnostic & Distillation */}
      {activeTab === "diagnostic" && (
        <div className="space-y-4">
          <div className="rounded-xl border border-white/10 bg-white/[0.03] p-4 space-y-3">
            <h3 className="text-sm font-semibold text-white">Prompt diagnostic</h3>
            <p className="text-xs text-zinc-400">
              Test how LLMs parse buyer search queries, evaluate citation probability, and view high-converting distilled prompt variations.
            </p>

            <div className="flex flex-col sm:flex-row gap-2">
              <input
                type="text"
                placeholder="Enter a buyer query, e.g. What is the best AI citation tracking platform?"
                value={testPrompt}
                onChange={(e) => setTestPrompt(e.target.value)}
                className="flex-1 rounded-lg border border-white/10 bg-zinc-900 px-3 py-2 text-xs text-white placeholder-zinc-500 focus:outline-none focus:ring-1 focus:ring-blue-500"
              />
              <button
                onClick={() => handleRunDiagnostic()}
                disabled={runningDiag}
                className="rounded-lg bg-blue-600 px-4 py-2 text-xs font-semibold text-white hover:bg-blue-500 transition-colors"
              >
                {runningDiag ? "Diagnosing..." : "Run Diagnostic"}
              </button>
            </div>

            {queries.length > 0 && (
              <div className="flex flex-wrap items-center gap-1.5 pt-1">
                <span className="text-[11px] text-zinc-500">Tracked Queries:</span>
                {queries.slice(0, 4).map((q) => (
                  <button
                    key={q.id}
                    onClick={() => {
                      setTestPrompt(q.text);
                      handleRunDiagnostic(q.text);
                    }}
                    className="rounded bg-white/5 px-2 py-0.5 text-[11px] text-zinc-300 hover:bg-white/10 transition-colors truncate max-w-xs"
                  >
                    {q.text}
                  </button>
                ))}
              </div>
            )}
          </div>

          {diagnostic && (
            <div className="rounded-xl border border-white/10 bg-white/[0.02] p-5 space-y-4">
              <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
                <div className="rounded-lg border border-white/5 bg-white/[0.02] p-3">
                  <span className="text-[10px] text-zinc-400 uppercase">Intent Class</span>
                  <p className="text-sm font-bold text-blue-400 capitalize mt-0.5">{diagnostic.intent}</p>
                </div>
                <div className="rounded-lg border border-white/5 bg-white/[0.02] p-3">
                  <span className="text-[10px] text-zinc-400 uppercase">Clarity Score</span>
                  <p className="text-sm font-bold text-white mt-0.5">{diagnostic.clarityScore}/100</p>
                </div>
                <div className="rounded-lg border border-white/5 bg-white/[0.02] p-3">
                  <span className="text-[10px] text-zinc-400 uppercase">Citation Probability</span>
                  <p className="text-sm font-bold text-emerald-400 mt-0.5">{diagnostic.citationProbability}%</p>
                </div>
                <div className="rounded-lg border border-white/5 bg-white/[0.02] p-3">
                  <span className="text-[10px] text-zinc-400 uppercase">Key Terms Missing</span>
                  <p className="text-xs font-semibold text-amber-300 mt-0.5">
                    {diagnostic.keyMissingTerms.join(", ") || "None"}
                  </p>
                </div>
              </div>

              <div className="rounded-lg border border-blue-500/20 bg-blue-500/[0.04] p-3 text-xs text-zinc-300">
                <span className="font-bold text-blue-400">Engine Insights: </span>
                {diagnostic.insights}
              </div>

              <div>
                <h4 className="text-xs font-bold uppercase tracking-wider text-zinc-400 mb-2">
                  Recommended High-Yield Prompt Distillations
                </h4>
                <div className="space-y-2">
                  {diagnostic.suggestedDistillations.map((dist, idx) => (
                    <div
                      key={idx}
                      className="flex items-center justify-between rounded-lg border border-white/5 bg-white/[0.03] p-2.5 text-xs text-zinc-200"
                    >
                      <span className="font-mono text-zinc-300">"{dist}"</span>
                      <button
                        onClick={() => {
                          navigator.clipboard.writeText(dist);
                          alert("Copied prompt!");
                        }}
                        className="text-blue-400 hover:underline text-[11px] ml-2"
                      >
                        Copy
                      </button>
                    </div>
                  ))}
                </div>
              </div>
            </div>
          )}
        </div>
      )}

      {/* Tab 3: Citation Link Anchor Pool */}
      {activeTab === "anchors" && (
        <div className="space-y-4">
          <div className="rounded-xl border border-white/10 bg-white/[0.02] p-4">
            <h3 className="text-sm font-semibold text-white">Citation anchor pool</h3>
            <p className="mt-1 text-xs text-zinc-400">
              Generative AI search models heavily weight citations originating from verified practitioner communities and authoritative directories. Here are the top platforms recommended for your category:
            </p>
          </div>

          <div className="space-y-3">
            {anchors.map((anc, idx) => (
              <div key={idx} className="rounded-xl border border-white/10 bg-white/[0.03] p-4 flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3">
                <div className="space-y-1">
                  <div className="flex items-center gap-2">
                    <span className="font-bold text-white text-sm">{anc.platform}</span>
                    <span className="text-xs font-mono text-zinc-500">({anc.domain})</span>
                    <span className="rounded bg-purple-500/10 px-2 py-0.5 text-[10px] font-semibold text-purple-400 border border-purple-500/20">
                      Authority: {anc.authorityScore}
                    </span>
                  </div>
                  <p className="text-xs text-zinc-300 font-medium">
                    Anchor Theme: <span className="text-white">"{anc.recommendedAnchorTheme}"</span>
                  </p>
                  <p className="text-[11px] text-zinc-400">
                    Action: {anc.actionItem}
                  </p>
                </div>
                <div className="shrink-0">
                  <span className={`text-[10px] font-bold px-2 py-1 rounded uppercase tracking-wider ${
                    anc.expectedLlmWeight === "critical"
                      ? "bg-rose-500/15 text-rose-300 border border-rose-500/30"
                      : "bg-blue-500/15 text-blue-300 border border-blue-500/30"
                  }`}>
                    {anc.expectedLlmWeight} LLM weight
                  </span>
                </div>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* Tab 4: OpenSEO Crawler Audit */}
      {activeTab === "audit" && (
        <div className="space-y-4">
          <div className="rounded-xl border border-white/10 bg-white/[0.03] p-4 space-y-3">
            <h3 className="text-sm font-semibold text-white">Crawler and robots.txt audit</h3>
            <p className="text-xs text-zinc-400">
              Verify whether AI crawlers (GPTBot, ClaudeBot, PerplexityBot and others) are permitted to crawl your domain. Crawl permission does not guarantee citation.
            </p>

            <div className="flex flex-col sm:flex-row gap-2">
              <input
                type="text"
                placeholder="Enter domain, e.g. example.com"
                value={auditDomain}
                onChange={(e) => setAuditDomain(e.target.value)}
                className="flex-1 rounded-lg border border-white/10 bg-zinc-900 px-3 py-2 text-xs text-white placeholder-zinc-500 focus:outline-none focus:ring-1 focus:ring-blue-500"
              />
              <button
                onClick={handleRunAudit}
                disabled={runningAudit}
                className="rounded-lg bg-emerald-600 px-4 py-2 text-xs font-semibold text-white hover:bg-emerald-500 transition-colors"
              >
                {runningAudit ? "Auditing..." : "Audit Domain"}
              </button>
            </div>
          </div>

          {auditResult && (
            <div className="space-y-4">
              <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
                <div className="rounded-xl border border-white/10 bg-white/[0.03] p-3.5">
                  <p className="text-xs font-medium text-zinc-400 uppercase">Overall Readiness</p>
                  <p className="mt-1 text-2xl font-bold text-white">{auditResult.overallScore}/100</p>
                </div>
                <div className="rounded-xl border border-white/10 bg-white/[0.03] p-3.5">
                  <p className="text-xs font-medium text-emerald-400 uppercase">AI Bot Readiness</p>
                  <p className="mt-1 text-2xl font-bold text-emerald-400">{auditResult.aiReadinessScore}/100</p>
                </div>
                <div className="rounded-xl border border-white/10 bg-white/[0.03] p-3.5">
                  <p className="text-xs font-medium text-blue-400 uppercase">robots.txt Found</p>
                  <p className="mt-1 text-2xl font-bold text-white">{auditResult.hasRobotsTxt ? "Yes" : "No"}</p>
                </div>
                <div className="rounded-xl border border-white/10 bg-white/[0.03] p-3.5">
                  <p className="text-xs font-medium text-purple-400 uppercase">llms.txt (proposed)</p>
                  <p className="mt-1 text-2xl font-bold text-white">{auditResult.hasLlmsTxt ? "Active" : "Missing"}</p>
                </div>
              </div>

              {/* Crawlers Table */}
              <div className="overflow-hidden rounded-xl border border-white/10 bg-white/[0.02]">
                <table className="w-full text-left text-xs text-zinc-300">
                  <thead className="border-b border-white/10 bg-white/[0.03] text-[11px] uppercase tracking-wider text-zinc-400">
                    <tr>
                      <th className="px-4 py-3">AI Bot & User-Agent</th>
                      <th className="px-3 py-3">Engine</th>
                      <th className="px-3 py-3">Access Status</th>
                      <th className="px-4 py-3">Directive Guidance</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-white/5">
                    {auditResult.crawlerStatuses.map((bot) => (
                      <tr key={bot.userAgent} className="hover:bg-white/[0.02]">
                        <td className="px-4 py-3 font-semibold text-white">{bot.botName}</td>
                        <td className="px-3 py-3 text-zinc-400">{bot.engine}</td>
                        <td className="px-3 py-3">
                          <span
                            className={`rounded px-2 py-0.5 text-[10px] font-bold ${
                              bot.status === "allowed"
                                ? "bg-emerald-500/10 text-emerald-400 border border-emerald-500/20"
                                : bot.status === "blocked"
                                ? "bg-rose-500/10 text-rose-400 border border-rose-500/20"
                                : "bg-blue-500/10 text-blue-400 border border-blue-500/20"
                            }`}
                          >
                            {bot.status.toUpperCase()}
                          </span>
                        </td>
                        <td className="px-4 py-3 text-zinc-400 text-[11px]">{bot.recommendation}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </div>
          )}
        </div>
      )}
    </div>
  );
}
