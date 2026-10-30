"use client";

import { useCallback, useEffect, useState } from "react";
import type { BrandProfile, TrackedQuery } from "@/lib/geo/types";
import type { CitationSourceSummary, GeoFlowFact, PromptDiagnosticResult } from "@/lib/geo/geoflow-engine";
import type { OpenSeoAuditResult } from "@/lib/geo/openseo-engine";

interface Props {
  brand: BrandProfile | null;
  queries: TrackedQuery[];
  authedFetch: (path: string, init?: RequestInit) => Promise<any>;
  // The public demo has no session: the tools explain themselves instead of calling the API.
  readOnly?: boolean;
}

type View = "facts" | "question" | "sources" | "audit";

const RELATION_LABELS = { yours: "Your site", competitor: "Competitor", third_party: "Third party" } as const;

const tabBtn = (active: boolean) =>
  `rounded-lg px-3 py-1.5 text-xs font-semibold transition-colors ${active ? "bg-white/15 text-white" : "text-zinc-400 hover:text-white"}`;
const primaryBtn = "ui-btn-primary";
const secondaryBtn = "ui-btn-secondary";
const card = "ui-card p-4";

function pct(n: number, d: number): string {
  return d ? `${Math.round((n / d) * 100)}%` : "No data";
}

function errorMessage(e: unknown, fallback: string): string {
  return e instanceof Error && e.message ? e.message : fallback;
}

export default function GeoFlowOptimizerPanel({ brand, queries, authedFetch, readOnly = false }: Props) {
  const [view, setView] = useState<View>("facts");
  const [notice, setNotice] = useState("");

  const [facts, setFacts] = useState<GeoFlowFact[]>([]);
  const [factsError, setFactsError] = useState("");

  const [question, setQuestion] = useState(queries[0]?.text || "");
  const [diagnostic, setDiagnostic] = useState<PromptDiagnosticResult | null>(null);
  const [checking, setChecking] = useState(false);

  const [sources, setSources] = useState<(CitationSourceSummary & { scanFinishedAt: string | null }) | null>(null);
  const [sourcesError, setSourcesError] = useState("");

  const [auditDomain, setAuditDomain] = useState(brand?.domain || "");
  const [audit, setAudit] = useState<OpenSeoAuditResult | null>(null);
  const [auditError, setAuditError] = useState("");
  const [auditing, setAuditing] = useState(false);

  const call = useCallback((payload: Record<string, unknown>) =>
    authedFetch("/api/geo/optimize", { method: "POST", body: JSON.stringify(payload) }), [authedFetch]);

  const loadFacts = useCallback(async () => {
    setFactsError("");
    try {
      const res = await call({ action: "facts" });
      setFacts(res.facts || []);
    } catch (e) {
      setFactsError(errorMessage(e, "Brand facts could not be loaded."));
    }
  }, [call]);

  const loadSources = useCallback(async () => {
    setSourcesError("");
    try {
      setSources(await call({ action: "sources" }));
    } catch (e) {
      setSourcesError(errorMessage(e, "Cited sources could not be loaded."));
    }
  }, [call]);

  useEffect(() => {
    if (readOnly) return;
    loadFacts();
    loadSources();
  }, [loadFacts, loadSources, brand, readOnly]);

  if (readOnly) {
    return (
      <div className="space-y-4">
        <h2 className="ui-page-title">Optimization</h2>
        <div className={`${card} space-y-2 text-sm text-zinc-300`}>
          <p>In a signed-in workspace, this tab shows:</p>
          <ul className="list-disc space-y-1 pl-5 text-zinc-400">
            <li>Brand facts from your profile, ready to publish, and the facts still needing your input.</li>
            <li>A question check: how often you were mentioned and cited for tracked questions of the same intent.</li>
            <li>The domains AI answers cite most in your latest scan.</li>
            <li>A robots.txt and llms.txt audit of your site, reported as pass or fail checks.</li>
          </ul>
          <p className="text-zinc-400">Sign in to run these on your own brand.</p>
        </div>
      </div>
    );
  }

  async function checkQuestion(text?: string) {
    const q = (text ?? question).trim();
    if (!q) return;
    setChecking(true);
    setNotice("");
    try {
      const res = await call({ action: "diagnose", prompt: q });
      setDiagnostic(res.diagnostic || null);
    } catch (e) {
      setNotice(errorMessage(e, "The question could not be checked."));
    } finally {
      setChecking(false);
    }
  }

  async function runAudit() {
    if (!auditDomain.trim()) return;
    setAuditing(true);
    setAuditError("");
    try {
      const res = await call({ action: "audit", domain: auditDomain });
      setAudit(res.audit || null);
    } catch (e) {
      setAudit(null);
      setAuditError(errorMessage(e, "The audit could not run. Retry, or contact hello@gothreadly.live."));
    } finally {
      setAuditing(false);
    }
  }

  async function copy(text: string, label: string) {
    try {
      await navigator.clipboard.writeText(text);
      setNotice(`${label} copied.`);
    } catch {
      setNotice("Copy is not available in this browser. Select the text to copy it.");
    }
  }

  function llmsTxtDraft(): string {
    if (!brand) return "";
    const known = facts.filter((f) => f.assertion);
    const missing = facts.filter((f) => !f.assertion);
    return [
      `# ${brand.name}`,
      "",
      `> ${known[0]?.assertion ?? `${brand.name} at https://${brand.domain}`}`,
      "",
      "## Facts",
      ...known.slice(1).map((f) => `- ${f.assertion}`),
      ...missing.map((f) => `- ${f.label}: [${f.guidance}]`),
      "",
      "## Links",
      `- Website: https://${brand.domain}`,
    ].join("\n");
  }

  return (
    <div className="space-y-6">
      <div className="flex flex-col gap-2 border-b border-white/10 pb-4 sm:flex-row sm:items-center sm:justify-between">
        <div>
          <h2 className="ui-page-title">Optimization</h2>
          <p className="ui-page-subtitle">
            Brand facts to publish, what your scans show for a question, the sources AI answers cite, and crawler access for your site.
          </p>
        </div>
        {brand && (
          <button onClick={() => copy(llmsTxtDraft(), "llms.txt draft")} className={secondaryBtn} disabled={!facts.length}>
            Copy llms.txt draft
          </button>
        )}
      </div>

      {notice && <p role="status" className="rounded-lg border border-white/10 bg-white/[0.03] px-3 py-2 text-sm text-zinc-300">{notice}</p>}

      <div className="flex flex-wrap items-center gap-1 border-b border-white/10 pb-3" role="tablist" aria-label="Optimization views">
        <button role="tab" aria-selected={view === "facts"} onClick={() => setView("facts")} className={tabBtn(view === "facts")}>Brand facts</button>
        <button role="tab" aria-selected={view === "question"} onClick={() => setView("question")} className={tabBtn(view === "question")}>Question check</button>
        <button role="tab" aria-selected={view === "sources"} onClick={() => setView("sources")} className={tabBtn(view === "sources")}>
          Cited sources{sources ? ` (${sources.sources.length})` : ""}
        </button>
        <button role="tab" aria-selected={view === "audit"} onClick={() => setView("audit")} className={tabBtn(view === "audit")}>Crawler audit</button>
      </div>

      {view === "facts" && (
        <div className="space-y-4">
          <p className="text-xs text-zinc-400">
            Statements AI assistants can quote are more useful when your own site states them clearly and links the evidence. Facts marked as needing input are not filled in for you.
          </p>
          {factsError && (
            <div className="rounded-xl border border-rose-500/20 bg-rose-500/10 p-4 text-sm text-rose-300">
              <p>{factsError}</p>
              <button onClick={loadFacts} className={`${secondaryBtn} mt-3`}>Retry</button>
            </div>
          )}
          <div className="grid gap-3 sm:grid-cols-2">
            {facts.map((fact) => (
              <div key={fact.id} className={`${card} flex flex-col justify-between`}>
                <div>
                  <div className="flex items-center justify-between gap-2">
                    <span className="text-xs font-semibold text-zinc-200">{fact.label}</span>
                    <span className="text-[11px] text-zinc-500">{fact.source === "brand_profile" ? "From brand profile" : "Needs your input"}</span>
                  </div>
                  {fact.assertion
                    ? <p className="mt-2.5 text-xs leading-relaxed text-zinc-200">{fact.assertion}</p>
                    : null}
                  <p className="mt-2 text-[11px] text-zinc-400">{fact.guidance}</p>
                </div>
                {fact.assertion && (
                  <div className="mt-3 border-t border-white/5 pt-2 text-right">
                    <button onClick={() => copy(fact.assertion as string, "Fact")} className="text-[11px] text-blue-400 hover:underline">Copy</button>
                  </div>
                )}
              </div>
            ))}
          </div>
        </div>
      )}

      {view === "question" && (
        <div className="space-y-4">
          <div className={`${card} space-y-3`}>
            <p className="text-xs text-zinc-400">
              Check a buyer question against your stored scans: its intent class and how often you were mentioned for tracked questions of the same intent.
            </p>
            <form className="flex flex-col gap-2 sm:flex-row" onSubmit={(e) => { e.preventDefault(); checkQuestion(); }}>
              <input
                type="text"
                aria-label="Buyer question"
                placeholder="For example: best expense software for small teams"
                value={question}
                maxLength={500}
                onChange={(e) => setQuestion(e.target.value)}
                className="flex-1 rounded-lg border border-white/10 bg-zinc-900 px-3 py-2 text-xs text-white placeholder-zinc-500 focus:outline-none focus:ring-1 focus:ring-blue-500"
              />
              <button type="submit" disabled={checking || !question.trim()} className={primaryBtn}>{checking ? "Checking..." : "Check question"}</button>
            </form>
            {queries.length > 0 && (
              <div className="flex flex-wrap items-center gap-1.5 pt-1">
                <span className="text-[11px] text-zinc-500">Tracked:</span>
                {queries.slice(0, 4).map((q) => (
                  <button key={q.id} onClick={() => { setQuestion(q.text); checkQuestion(q.text); }}
                    className="max-w-xs truncate rounded bg-white/5 px-2 py-0.5 text-[11px] text-zinc-300 hover:bg-white/10">
                    {q.text}
                  </button>
                ))}
              </div>
            )}
          </div>

          {diagnostic && (
            <div className={`${card} space-y-4`}>
              <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
                <div>
                  <p className="text-[10px] uppercase text-zinc-400">Intent</p>
                  <p className="mt-0.5 text-sm font-semibold capitalize text-white">{diagnostic.intent}</p>
                </div>
                <div>
                  <p className="text-[10px] uppercase text-zinc-400">Tracked questions, same intent</p>
                  <p className="mt-0.5 text-sm font-semibold text-white">{diagnostic.evidence.trackedQuestions}</p>
                </div>
                <div>
                  <p className="text-[10px] uppercase text-zinc-400">Mentioned in</p>
                  <p className="mt-0.5 text-sm font-semibold text-white">
                    {diagnostic.evidence.answersMentioningBrand} of {diagnostic.evidence.scannedAnswers} answers
                  </p>
                  <p className="text-[11px] text-zinc-500">{pct(diagnostic.evidence.answersMentioningBrand, diagnostic.evidence.scannedAnswers)}</p>
                </div>
                <div>
                  <p className="text-[10px] uppercase text-zinc-400">Cited in</p>
                  <p className="mt-0.5 text-sm font-semibold text-white">
                    {diagnostic.evidence.answersCitingBrand} of {diagnostic.evidence.scannedAnswers} answers
                  </p>
                  <p className="text-[11px] text-zinc-500">{pct(diagnostic.evidence.answersCitingBrand, diagnostic.evidence.scannedAnswers)}</p>
                </div>
              </div>
              <p className="text-[11px] text-zinc-500">
                {diagnostic.intentBasis} Counts come from your latest stored scan.
                {diagnostic.trackedMatch ? " This question is already tracked." : " This question is not tracked yet."}
              </p>
              {diagnostic.suggestedQuestions.length > 0 && (
                <div>
                  <h4 className="mb-2 text-xs font-bold uppercase tracking-wider text-zinc-400">Related questions you could track</h4>
                  <ul className="space-y-2">
                    {diagnostic.suggestedQuestions.map((s) => (
                      <li key={s} className="flex items-center justify-between rounded-lg border border-white/5 bg-white/[0.03] p-2.5 text-xs text-zinc-200">
                        <span>{s}</span>
                        <button onClick={() => copy(s, "Question")} className="ml-2 text-[11px] text-blue-400 hover:underline">Copy</button>
                      </li>
                    ))}
                  </ul>
                </div>
              )}
            </div>
          )}
        </div>
      )}

      {view === "sources" && (
        <div className="space-y-4">
          <p className="text-xs text-zinc-400">
            Domains cited by AI answers in your latest scan. Being present on the sources assistants already cite is one way to be cited with them.
          </p>
          {sourcesError ? (
            <div className="rounded-xl border border-rose-500/20 bg-rose-500/10 p-4 text-sm text-rose-300">
              <p>{sourcesError}</p>
              <button onClick={loadSources} className={`${secondaryBtn} mt-3`}>Retry</button>
            </div>
          ) : !sources ? (
            <p className="text-sm text-zinc-500">Loading cited sources...</p>
          ) : sources.scannedAnswers === 0 ? (
            <p className={`${card} text-sm text-zinc-400`}>No scanned answers yet. Run a scan to see which sources AI assistants cite.</p>
          ) : (
            <div className="overflow-x-auto rounded-xl border border-white/10 bg-white/[0.02]">
              <table className="w-full text-left text-xs text-zinc-300">
                <caption className="px-4 pt-3 text-left text-[11px] text-zinc-500">
                  Based on {sources.scannedAnswers} scanned answers{sources.scanFinishedAt ? `, scan finished ${new Date(sources.scanFinishedAt).toLocaleString()}` : ""}.
                </caption>
                <thead className="border-b border-white/10 text-[11px] uppercase tracking-wider text-zinc-400">
                  <tr>
                    <th scope="col" className="px-4 py-3">Domain</th>
                    <th scope="col" className="px-3 py-3">Relation</th>
                    <th scope="col" className="px-3 py-3">Answers citing</th>
                    <th scope="col" className="px-3 py-3">Citations</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-white/5">
                  {sources.sources.map((s) => (
                    <tr key={s.domain}>
                      <td className="px-4 py-3">
                        <a href={s.sampleUrl} target="_blank" rel="noopener noreferrer" className="font-semibold text-white hover:underline">{s.domain}</a>
                      </td>
                      <td className="px-3 py-3 text-zinc-400">{RELATION_LABELS[s.relation]}</td>
                      <td className="px-3 py-3">{s.answersCiting} of {sources.scannedAnswers}</td>
                      <td className="px-3 py-3">{s.citations}</td>
                    </tr>
                  ))}
                  {sources.sources.length === 0 && (
                    <tr><td colSpan={4} className="px-4 py-8 text-center text-zinc-500">The scanned answers did not cite any sources.</td></tr>
                  )}
                </tbody>
              </table>
            </div>
          )}
        </div>
      )}

      {view === "audit" && (
        <div className="space-y-4">
          <div className={`${card} space-y-3`}>
            <p className="text-xs text-zinc-400">
              Reads robots.txt and llms.txt from a public domain and reports which AI user agents are permitted. Crawl permission does not guarantee citation.
            </p>
            <form className="flex flex-col gap-2 sm:flex-row" onSubmit={(e) => { e.preventDefault(); runAudit(); }}>
              <input
                type="text"
                aria-label="Domain to audit"
                placeholder="example.com"
                value={auditDomain}
                onChange={(e) => setAuditDomain(e.target.value)}
                className="flex-1 rounded-lg border border-white/10 bg-zinc-900 px-3 py-2 text-xs text-white placeholder-zinc-500 focus:outline-none focus:ring-1 focus:ring-blue-500"
              />
              <button type="submit" disabled={auditing || !auditDomain.trim()} className={primaryBtn}>{auditing ? "Auditing..." : "Run audit"}</button>
            </form>
          </div>

          {auditError && <p className="rounded-xl border border-rose-500/20 bg-rose-500/10 p-4 text-sm text-rose-300">{auditError}</p>}

          {audit && (
            <div className="space-y-4">
              <div className={card}>
                <p className="text-sm font-semibold text-white">{audit.checksPassed} of {audit.checksTotal} checks passed for {audit.domain}</p>
                <p className="text-[11px] text-zinc-500">Audited {new Date(audit.auditedAt).toLocaleString()}</p>
                <ul className="mt-3 space-y-1.5">
                  {audit.checks.map((c) => (
                    <li key={c.id} className="text-xs">
                      <span className={c.passed ? "font-semibold text-emerald-400" : "font-semibold text-rose-400"}>{c.passed ? "Pass" : "Fail"}</span>
                      <span className="ml-2 text-zinc-200">{c.label}</span>
                      <span className="ml-2 text-zinc-500">{c.detail}</span>
                    </li>
                  ))}
                </ul>
              </div>
              {(audit.criticalIssues.length > 0 || audit.recommendations.length > 0) && (
                <div className={`${card} space-y-2 text-xs`}>
                  {audit.criticalIssues.map((i) => <p key={i} className="text-amber-300">{i}</p>)}
                  {audit.recommendations.map((r) => <p key={r} className="text-zinc-300">{r}</p>)}
                </div>
              )}
              <div className="overflow-x-auto rounded-xl border border-white/10 bg-white/[0.02]">
                <table className="w-full text-left text-xs text-zinc-300">
                  <thead className="border-b border-white/10 bg-white/[0.03] text-[11px] uppercase tracking-wider text-zinc-400">
                    <tr>
                      <th scope="col" className="px-4 py-3">User agent</th>
                      <th scope="col" className="px-3 py-3">What it is</th>
                      <th scope="col" className="px-3 py-3">Status</th>
                      <th scope="col" className="px-4 py-3">Detail</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-white/5">
                    {audit.crawlerStatuses.map((bot) => (
                      <tr key={bot.userAgent}>
                        <td className="px-4 py-3 font-semibold text-white">{bot.botName}</td>
                        <td className="px-3 py-3 text-zinc-400">{bot.engine}</td>
                        <td className="px-3 py-3">
                          {bot.status === "blocked" ? "Disallowed" : bot.status === "allowed" ? "Explicitly allowed" : "No specific rule"}
                        </td>
                        <td className="px-4 py-3 text-[11px] text-zinc-400">{bot.recommendation}</td>
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
