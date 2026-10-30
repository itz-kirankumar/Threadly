"use client";

import Image from "next/image";
import Link from "next/link";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import {
  DEMO_STEPS,
  DEMO_STEP_LABELS,
  type DemoCampaign,
  type DemoCompany,
  type DemoContacts,
  type DemoDraft,
  type DemoEvent,
  type DemoResearch,
  type DemoResults,
  type DemoSocial,
  type DemoStep,
} from "@/lib/live-demo/types";

interface Preview {
  domain: string;
  name: string;
  description: string | null;
  category: string | null;
  iconDataUrl: string | null;
}

type Phase = "idle" | "running" | "done" | "error";
type StepStatus = "pending" | "running" | "done";
interface LogLine { id: number; step: DemoStep; text: string }

// How long a finished step's results stay on screen before the story moves on.
const DWELL_MS = 3800;

function normalizeDomain(input: string): string | null {
  const host = input.trim().toLowerCase().replace(/^https?:\/\//, "").replace(/^www\./, "").replace(/[/?#].*$/, "");
  return /^[a-z0-9-]+(\.[a-z0-9-]+)*\.[a-z]{2,}$/.test(host) ? host : null;
}

function SiteIcon({ name, icon, size = "h-9 w-9" }: { name: string; icon: string | null; size?: string }) {
  if (icon) {
    // eslint-disable-next-line
    return <img src={icon} alt="" className={`${size} shrink-0 rounded-lg border border-zinc-200 bg-white object-contain p-0.5`} />;
  }
  return (
    <span aria-hidden className={`${size} flex shrink-0 items-center justify-center rounded-lg bg-zinc-900 text-xs font-semibold text-white`}>
      {name.charAt(0).toUpperCase()}
    </span>
  );
}

function Letter({ text }: { text: string }) {
  return <span aria-hidden className="flex h-5 w-5 shrink-0 items-center justify-center rounded bg-zinc-100 text-[10px] font-bold text-zinc-700">{text.charAt(0).toUpperCase()}</span>;
}

// One click sets who the visitor sells to; it sharpens the company search.
const AUDIENCE_SUGGESTIONS = ["B2B SaaS companies", "Marketing agencies", "E-commerce brands", "Fintech startups"];

const PLATFORM_STYLE: Record<string, string> = {
  Reddit: "bg-orange-50 text-orange-800 ring-orange-200",
  X: "bg-zinc-100 text-zinc-900 ring-zinc-300",
  LinkedIn: "bg-sky-50 text-sky-800 ring-sky-200",
};

export default function LiveDemo() {
  const [input, setInput] = useState("");
  const [audience, setAudience] = useState("");
  const [preview, setPreview] = useState<Preview | null>(null);
  const [previewState, setPreviewState] = useState<"none" | "loading" | "ready" | "error">("none");
  const [previewError, setPreviewError] = useState("");
  const [phase, setPhase] = useState<Phase>("idle");
  const [status, setStatus] = useState<Record<DemoStep, StepStatus>>(() => Object.fromEntries(DEMO_STEPS.map((s) => [s, "pending"])) as Record<DemoStep, StepStatus>);
  const [results, setResults] = useState<DemoResults>({});
  const [logs, setLogs] = useState<LogLine[]>([]);
  const [viewing, setViewing] = useState<DemoStep>("research");
  const [follow, setFollowState] = useState(true);
  const followRef = useRef(true);
  const [error, setError] = useState("");
  const [runDomain, setRunDomain] = useState("");
  const lastSwitch = useRef(0);
  const pendingView = useRef<ReturnType<typeof setTimeout> | null>(null);
  const abortRef = useRef<AbortController | null>(null);
  const logEnd = useRef<HTMLLIElement>(null);
  const logId = useRef(0);

  const setFollow = useCallback((value: boolean) => {
    followRef.current = value;
    setFollowState(value);
  }, []);

  // Type-ahead preview: name, category and icon while the visitor types.
  useEffect(() => {
    const domain = normalizeDomain(input);
    if (!domain) {
      setPreviewState("none");
      return;
    }
    if (preview?.domain === domain || phase !== "idle") return;
    setPreviewState("loading");
    const controller = new AbortController();
    const timer = setTimeout(async () => {
      try {
        const res = await fetch(`/api/live-demo/preview?domain=${encodeURIComponent(domain)}`, { signal: controller.signal });
        const body = await res.json();
        if (!res.ok) {
          setPreviewError(body.error ?? "That site could not be reached.");
          setPreviewState("error");
          return;
        }
        setPreview(body as Preview);
        setPreviewState("ready");
      } catch (e) {
        if ((e as Error).name !== "AbortError") {
          setPreviewError("That site could not be reached.");
          setPreviewState("error");
        }
      }
    }, 400);
    return () => {
      clearTimeout(timer);
      controller.abort();
    };
  }, [input, phase, preview?.domain]);

  useEffect(() => () => abortRef.current?.abort(), []);
  useEffect(() => {
    const el = logEnd.current?.parentElement;
    if (el) el.scrollTop = el.scrollHeight;
  }, [logs.length]);
  // The workspace takes over the screen while it is open.
  useEffect(() => {
    if (phase === "idle") return;
    const prev = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    return () => {
      document.body.style.overflow = prev;
    };
  }, [phase]);

  // Story progression: show each step in order. A step's results stay on
  // screen for DWELL_MS, then the view moves to the next step once that step
  // has started, whether it is still running or already finished.
  const resultAt = useRef<Partial<Record<DemoStep, number>>>({});
  useEffect(() => {
    if (!follow || phase === "idle") return;
    const next = DEMO_STEPS[DEMO_STEPS.indexOf(viewing) + 1];
    if (!next || !results[viewing] || status[next] === "pending") return;
    const shownSince = Math.max(resultAt.current[viewing] ?? 0, lastSwitch.current);
    const timer = setTimeout(() => {
      setViewing(next);
      lastSwitch.current = Date.now();
    }, Math.max(0, shownSince + DWELL_MS - Date.now()));
    pendingView.current = timer;
    return () => clearTimeout(timer);
  }, [follow, phase, viewing, results, status]);

  async function start() {
    const domain = normalizeDomain(input) ?? preview?.domain;
    if (!domain) {
      setPreviewError("Enter a website, like example.com.");
      setPreviewState("error");
      return;
    }
    abortRef.current?.abort();
    const controller = new AbortController();
    abortRef.current = controller;
    setRunDomain(domain);
    setPhase("running");
    setError("");
    setResults({});
    setLogs([]);
    setFollow(true);
    setViewing("research");
    lastSwitch.current = Date.now();
    resultAt.current = {};
    setStatus(Object.fromEntries(DEMO_STEPS.map((s) => [s, "pending"])) as Record<DemoStep, StepStatus>);

    try {
      const res = await fetch("/api/live-demo/run", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ domain, audience: audience.trim() }),
        signal: controller.signal,
      });
      if (!res.ok || !res.body) {
        const body = await res.json().catch(() => ({}));
        throw new Error((body as { error?: string }).error ?? "The live demo could not start.");
      }
      const reader = res.body.getReader();
      const decoder = new TextDecoder();
      let buffer = "";
      let ended = false;
      for (;;) {
        const { value, done } = await reader.read();
        if (value) buffer += decoder.decode(value, { stream: true });
        let nl: number;
        while ((nl = buffer.indexOf("\n")) >= 0) {
          const line = buffer.slice(0, nl).trim();
          buffer = buffer.slice(nl + 1);
          if (!line) continue;
          const event = JSON.parse(line) as DemoEvent;
          if (event.type === "step") {
            setStatus((prev) => {
              const next = { ...prev };
              for (const s of DEMO_STEPS) if (next[s] === "running") next[s] = "done";
              next[event.step] = "running";
              return next;
            });
          } else if (event.type === "log") {
            logId.current += 1;
            const entry = { id: logId.current, step: event.step, text: event.text.trim() };
            setLogs((prev) => [...prev.slice(-80), entry]);
          } else if (event.type === "result") {
            resultAt.current[event.step] = Date.now();
            setResults((prev) => ({ ...prev, [event.step]: event.data }));
          } else if (event.type === "error") {
            setError(event.message);
            setPhase("error");
          } else if (event.type === "end") {
            ended = true;
            setStatus((prev) => Object.fromEntries(DEMO_STEPS.map((s) => [s, prev[s] === "running" ? "done" : prev[s]])) as Record<DemoStep, StepStatus>);
            setPhase("done");
          }
        }
        if (done) break;
      }
      if (!ended) setPhase((p) => (p === "error" ? p : "error"));
    } catch (e) {
      if ((e as Error).name === "AbortError") return;
      setError(e instanceof Error ? e.message : "The live demo could not finish.");
      setPhase("error");
    }
  }

  function close() {
    abortRef.current?.abort();
    if (pendingView.current) clearTimeout(pendingView.current);
    setPhase("idle");
  }

  const runningStep = DEMO_STEPS.find((s) => status[s] === "running");
  const viewIndex = DEMO_STEPS.indexOf(viewing);
  const counters = useMemo(() => {
    let searches = 0;
    let pages = 0;
    for (const l of logs) {
      if (/^searching/.test(l.text)) searches++;
      const m = l.text.match(/read(?:ing)? (\d+)/);
      if (m) pages += Number(m[1]);
      else if (/^(fetching|reading https)/.test(l.text)) pages++;
    }
    return { searches, pages };
  }, [logs]);

  const goTo = (step: DemoStep) => {
    if (status[step] === "pending") return;
    if (pendingView.current) clearTimeout(pendingView.current);
    setFollow(false);
    setViewing(step);
  };

  const brandName = results.research?.name ?? preview?.name ?? runDomain;
  const brandIcon = results.research?.iconDataUrl ?? preview?.iconDataUrl ?? null;

  return (
    <div id="live-demo" className="mx-auto w-full max-w-3xl scroll-mt-24">
      <form
        onSubmit={(e) => {
          e.preventDefault();
          start();
        }}
        className="relative"
      >
        <div className="flex items-center gap-2 rounded-2xl border-2 border-zinc-900 bg-white p-1.5 shadow-[0_10px_40px_-18px_rgba(30,27,75,0.45)]">
          <label htmlFor="demo-domain" className="sr-only">Your website</label>
          <input
            id="demo-domain"
            autoComplete="url"
            inputMode="url"
            placeholder="Paste your website, e.g. acme.com"
            value={input}
            onChange={(e) => setInput(e.target.value)}
            className="min-w-0 flex-1 bg-transparent px-3 py-2.5 text-base text-zinc-900 placeholder-zinc-400 focus:outline-none"
          />
          <button type="submit" className="shrink-0 rounded-xl bg-zinc-900 px-4 py-2.5 text-sm font-semibold text-white transition hover:bg-zinc-800">
            Find my leads
          </button>
        </div>
        {previewState !== "none" && (
          <div className="demo-pop-in mt-2 rounded-xl border border-zinc-200 bg-white/95 p-2 text-left shadow-sm backdrop-blur" aria-live="polite">
            {previewState === "loading" && (
              <p className="flex items-center gap-2 px-2 py-1.5 text-sm text-zinc-500">
                <span className="h-4 w-4 animate-spin rounded-full border-2 border-zinc-300 border-t-zinc-700" aria-hidden />
                Looking up {normalizeDomain(input)}
              </p>
            )}
            {previewState === "error" && <p className="px-2 py-1.5 text-sm text-rose-700">{previewError}</p>}
            {previewState === "ready" && preview && (
              <>
                <button type="submit" className="flex w-full items-center gap-3 rounded-lg px-2 py-1.5 text-left transition hover:bg-zinc-50">
                  <SiteIcon name={preview.name} icon={preview.iconDataUrl} size="h-7 w-7" />
                  <span className="min-w-0 flex-1">
                    <span className="block truncate text-sm font-semibold text-zinc-900">{preview.name} <span className="font-normal text-zinc-500">{preview.domain}</span></span>
                    {preview.category && <span className="block truncate text-xs text-zinc-500">{preview.category}</span>}
                  </span>
                  <span className="shrink-0 text-xs font-semibold text-zinc-900">Run research</span>
                </button>
                <div className="mt-1 flex flex-wrap items-center gap-1.5 border-t border-zinc-100 px-2 pt-2">
                  <span className="text-xs text-zinc-500">Customers:</span>
                  {AUDIENCE_SUGGESTIONS.map((a) => (
                    <button
                      key={a}
                      type="button"
                      onClick={() => setAudience(audience === a ? "" : a)}
                      aria-pressed={audience === a}
                      className={`rounded-full px-2.5 py-1 text-xs font-medium transition ${audience === a ? "bg-zinc-900 text-white" : "bg-zinc-100 text-zinc-700 hover:bg-zinc-200"}`}
                    >
                      {a}
                    </button>
                  ))}
                </div>
                <label className="mt-1.5 flex items-center gap-2 px-2 pb-0.5 text-xs text-zinc-500">
                  <span className="shrink-0">Who do you sell to?</span>
                  <input
                    value={audience}
                    maxLength={60}
                    onChange={(e) => setAudience(e.target.value)}
                    placeholder="Optional, e.g. B2B SaaS startups"
                    className="min-w-0 flex-1 rounded-md border border-zinc-200 bg-white px-2 py-1 text-xs text-zinc-900 placeholder-zinc-400 focus:border-zinc-500 focus:outline-none"
                  />
                </label>
              </>
            )}
          </div>
        )}
      </form>

      {phase !== "idle" && (
        <div className="demo-workspace-in fixed inset-0 z-[60] flex flex-col bg-[#f7f6f3] text-left text-zinc-900" role="dialog" aria-modal="true" aria-label={`Live demo for ${runDomain}`}>
          {/* Top bar and stepper */}
          <header className="flex items-center gap-4 border-b border-zinc-200 bg-[#f7f6f3]/90 px-4 py-3 backdrop-blur sm:px-6">
            <div className="flex w-56 shrink-0 items-center gap-2">
              <Image src="/threadly-mark.svg" alt="" width={22} height={22} />
              <span className="font-semibold">Threadly</span>
              <span className="hidden text-xs text-zinc-500 sm:inline">live demo</span>
            </div>
            <ol className="hidden min-w-0 flex-1 items-center gap-2 md:flex" aria-label="Steps">
              {DEMO_STEPS.map((s, i) => {
                const st = status[s];
                const active = viewing === s;
                return (
                  <li key={s} className={`flex items-center gap-2 ${active ? "shrink-0" : "min-w-0 flex-1"} last:flex-none`}>
                    <button
                      type="button"
                      disabled={st === "pending"}
                      onClick={() => goTo(s)}
                      aria-current={active ? "step" : undefined}
                      aria-label={`Step ${i + 1}: ${DEMO_STEP_LABELS[s]}`}
                      className={`flex shrink-0 items-center gap-2 rounded-full text-sm font-semibold transition ${active ? "border border-zinc-900 bg-white px-3 py-1" : ""}`}
                    >
                      {active && st === "running" && <span className="h-1.5 w-1.5 animate-pulse rounded-full bg-emerald-500" aria-hidden />}
                      <span className={`flex h-6 w-6 items-center justify-center rounded-full text-xs ${st === "done" || active ? "bg-zinc-900 text-white" : "border border-zinc-300 text-zinc-500"}`}>{i + 1}</span>
                      {active && <span className="whitespace-nowrap">{DEMO_STEP_LABELS[s]}</span>}
                    </button>
                    {i < DEMO_STEPS.length - 1 && <span aria-hidden className="h-px min-w-3 flex-1 bg-zinc-300"><span className="block h-px bg-zinc-900 transition-all duration-700" style={{ width: st === "done" ? "100%" : "0%" }} /></span>}
                  </li>
                );
              })}
            </ol>
            <p className="min-w-0 flex-1 truncate text-sm font-semibold md:hidden">{viewIndex + 1}. {DEMO_STEP_LABELS[viewing]}</p>
            <button type="button" onClick={close} className="shrink-0 rounded-lg border border-zinc-300 bg-white px-3 py-1.5 text-sm font-medium hover:bg-zinc-50">Close</button>
          </header>
          {/* Story progress (mobile and as a thin global bar) */}
          <div className="flex gap-1 px-4 pt-2 sm:px-6" aria-hidden>
            {DEMO_STEPS.map((s) => (
              <span key={s} className="h-0.5 flex-1 overflow-hidden rounded-full bg-zinc-200">
                <span className="block h-full bg-zinc-900" style={{ width: status[s] === "done" ? "100%" : status[s] === "running" ? "90%" : "0%", transition: status[s] === "running" ? "width 18s cubic-bezier(0.2,0.6,0.3,1)" : "width 400ms ease" }} />
              </span>
            ))}
          </div>

          <div className="flex min-h-0 flex-1">
            {/* Left rail: what has been found so far, and the agent log */}
            <aside className="hidden w-80 shrink-0 flex-col overflow-y-auto border-r border-zinc-200 px-5 py-4 lg:flex" aria-label="Findings">
              <RailStep n={1} step="research" status={status.research}>
                {results.research && (
                  <div className="demo-pop-in">
                    <div className="flex items-center gap-2">
                      <SiteIcon name={brandName} icon={brandIcon} size="h-6 w-6" />
                      <span className="font-semibold">{brandName}</span>
                      <span className="text-sm text-zinc-500">{results.research.domain}</span>
                    </div>
                    <p className="mt-2 line-clamp-5 text-sm leading-relaxed text-zinc-700">{results.research.summary}</p>
                  </div>
                )}
              </RailStep>
              <RailStep n={2} step="competitors" status={status.competitors}>
                {results.competitors && results.competitors.length > 0 && (
                  <div className="demo-pop-in">
                    <p className="text-[11px] font-semibold uppercase tracking-wider text-zinc-500">Competitors {results.competitors.length}</p>
                    <div className="mt-2 grid grid-cols-2 gap-1.5">
                      {results.competitors.slice(0, 8).map((c) => (
                        <a key={c.domain} href={`https://${c.domain}`} target="_blank" rel="noopener noreferrer" className="flex min-w-0 items-center gap-1.5 rounded-lg border border-zinc-200 bg-white px-2 py-1.5 text-xs hover:border-zinc-400">
                          <Letter text={c.domain} />
                          <span className="truncate">{c.domain}</span>
                        </a>
                      ))}
                    </div>
                    {results.competitors.length > 8 && <p className="mt-1.5 text-xs text-zinc-500">+{results.competitors.length - 8} more</p>}
                  </div>
                )}
              </RailStep>
              <RailStep n={3} step="campaigns" status={status.campaigns}>
                {results.campaigns && (
                  <ul className="demo-pop-in space-y-1.5">
                    {results.campaigns.map((c) => (
                      <li key={c.name} className={`flex items-center justify-between rounded-lg border px-2.5 py-2 text-sm ${c.selected ? "border-zinc-900 bg-white" : "border-zinc-200 text-zinc-500"}`}>
                        <span className="truncate">{c.name}</span>
                        {c.selected && results.companies && <span className="shrink-0 text-xs text-zinc-500">{results.companies.length} found</span>}
                      </li>
                    ))}
                  </ul>
                )}
              </RailStep>
              <RailStep n={4} step="companies" status={status.companies} />
              <RailStep n={5} step="social" status={status.social}>
                {results.social && <p className="demo-pop-in text-sm text-zinc-700">{results.social.leads.length} public posts with buying intent</p>}
              </RailStep>
              <RailStep n={6} step="contacts" status={status.contacts} />
              <RailStep n={7} step="pitch" status={status.pitch} />

              <div className="mt-4 rounded-xl border border-zinc-200 bg-white p-3">
                <p className="flex items-center gap-2 text-xs font-semibold">
                  {phase === "running" && <span className="h-1.5 w-1.5 animate-pulse rounded-full bg-emerald-500" aria-hidden />}
                  {phase === "running" && runningStep ? `Threadly is working on step ${DEMO_STEPS.indexOf(runningStep) + 1} of 7` : phase === "done" ? "Run complete" : "Stopped"}
                </p>
                <ol className="mt-2 max-h-48 space-y-1 overflow-y-auto font-mono text-[11px] leading-relaxed text-zinc-600" aria-live="polite">
                  {logs.slice(-14).map((l, i, arr) => {
                    const last = i === arr.length - 1 && phase === "running";
                    return (
                      <li key={l.id} className="demo-line-in flex gap-1.5">
                        <span aria-hidden className={last ? "text-zinc-900" : "text-emerald-600"}>{last ? ">" : "✓"}</span>
                        <span className={`truncate ${last ? "text-zinc-900" : ""}`}>{l.text}{last && <span className="demo-caret" aria-hidden />}</span>
                      </li>
                    );
                  })}
                  <li ref={logEnd} />
                </ol>
              </div>
            </aside>

            {/* Main stage */}
            <main className="min-w-0 flex-1 overflow-y-auto px-4 py-6 sm:px-8">
              <div key={viewing} className="demo-card-in mx-auto max-w-4xl">
                <Stage step={viewing} status={status[viewing]} results={results} logs={logs.filter((l) => l.step === viewing)} counters={counters} brand={{ name: brandName, icon: brandIcon }} />
              </div>
              {phase === "error" && (
                <div className="mx-auto mt-6 max-w-2xl rounded-xl border border-rose-200 bg-rose-50 p-4 text-sm text-rose-800">
                  <p>{error}</p>
                  <div className="mt-3 flex gap-2">
                    <button type="button" onClick={start} className="rounded-lg bg-zinc-900 px-3 py-1.5 font-semibold text-white">Retry</button>
                    <Link href="/portal" className="rounded-lg border border-rose-300 px-3 py-1.5 font-semibold">Open a workspace</Link>
                  </div>
                </div>
              )}
            </main>
          </div>

          {/* Bottom bar */}
          <footer className="flex flex-wrap items-center justify-between gap-3 border-t border-zinc-200 bg-white/80 px-4 py-3 backdrop-blur sm:px-6">
            <div className="flex items-center gap-2">
              <button type="button" onClick={() => goTo(DEMO_STEPS[Math.max(0, viewIndex - 1)])} disabled={viewIndex === 0} className="rounded-lg border border-zinc-300 bg-white px-3 py-1.5 text-sm disabled:opacity-40">Previous</button>
              <button type="button" onClick={() => goTo(DEMO_STEPS[Math.min(DEMO_STEPS.length - 1, viewIndex + 1)])} disabled={viewIndex === DEMO_STEPS.length - 1 || status[DEMO_STEPS[viewIndex + 1]] === "pending"} className="rounded-lg border border-zinc-300 bg-white px-3 py-1.5 text-sm disabled:opacity-40">Next</button>
              {!follow && phase === "running" && runningStep && (
                <button type="button" onClick={() => { setFollow(true); setViewing(runningStep); }} className="rounded-lg px-3 py-1.5 text-sm font-semibold text-zinc-900 underline-offset-4 hover:underline">Follow live</button>
              )}
            </div>
            <p className="hidden text-xs text-zinc-500 sm:block">Real public web data. Nothing is stored and nothing is sent.</p>
            <Link href="/portal" className="rounded-lg bg-emerald-600 px-4 py-2 text-sm font-semibold text-white hover:bg-emerald-500">
              {phase === "done" ? "Save these leads in a workspace" : "Open my workspace"}
            </Link>
          </footer>
        </div>
      )}
    </div>
  );
}

function RailStep({ n, step, status, children }: { n: number; step: DemoStep; status: StepStatus; children?: React.ReactNode }) {
  return (
    <section className={`border-b border-zinc-200 py-3 ${status === "pending" ? "opacity-45" : ""}`}>
      <p className="font-mono text-[11px] text-zinc-600">
        <span aria-hidden className={status === "done" ? "text-emerald-600" : "text-zinc-400"}>{status === "done" ? "✓" : status === "running" ? "›" : "·"}</span> step {n} · {DEMO_STEP_LABELS[step]}
      </p>
      {children && <div className="mt-2">{children}</div>}
    </section>
  );
}

function LiveCard({ step, logs, counters }: { step: DemoStep; logs: LogLine[]; counters: { searches: number; pages: number } }) {
  return (
    <div className="mx-auto mt-10 max-w-xl rounded-2xl border border-zinc-200 bg-white p-8 shadow-sm">
      <p className="text-xs font-semibold uppercase tracking-widest text-zinc-500">Working on: {DEMO_STEP_LABELS[step]}</p>
      <div className="mt-5 grid grid-cols-2 gap-4">
        <div>
          <p className="text-5xl font-semibold tabular-nums tracking-tight">{counters.searches}</p>
          <p className="mt-1 text-sm text-zinc-500">web searches run</p>
        </div>
        <div>
          <p className="text-5xl font-semibold tabular-nums tracking-tight">{counters.pages}</p>
          <p className="mt-1 text-sm text-zinc-500">public pages read</p>
        </div>
      </div>
      <ul className="mt-6 space-y-1.5 border-t border-zinc-100 pt-4 font-mono text-xs text-zinc-600">
        {logs.slice(-4).map((l, i, arr) => (
          <li key={l.id} className="demo-line-in truncate">
            <span aria-hidden className="mr-1.5">{i === arr.length - 1 ? ">" : "✓"}</span>{l.text}
          </li>
        ))}
        {!logs.length && <li>starting</li>}
      </ul>
    </div>
  );
}

function Stage({ step, status, results, logs, counters, brand }: { step: DemoStep; status: StepStatus; results: DemoResults; logs: LogLine[]; counters: { searches: number; pages: number }; brand: { name: string; icon: string | null } }) {
  const data = results[step];
  if (!data) return status === "pending" ? <p className="mt-20 text-center text-sm text-zinc-500">Waiting for the previous step.</p> : <LiveCard step={step} logs={logs} counters={counters} />;
  switch (step) {
    case "research": {
      const r = data as DemoResearch;
      return (
        <div className="mx-auto mt-6 max-w-xl rounded-2xl border border-zinc-200 bg-white p-7 shadow-sm">
          <div className="flex items-start gap-3">
            <SiteIcon name={r.name} icon={brand.icon} size="h-11 w-11" />
            <div className="min-w-0 flex-1">
              <p className="text-lg font-semibold">{r.name}</p>
              <a href={`https://${r.domain}`} target="_blank" rel="noopener noreferrer" className="text-sm text-zinc-500 hover:underline">{r.domain}</a>
            </div>
            <span className="rounded-md border border-zinc-200 px-2.5 py-1 text-xs font-semibold">✓ Found</span>
          </div>
          <p className="mt-5 text-[15px] leading-relaxed text-zinc-700">{r.summary}</p>
          {r.keywords.length > 0 && (
            <>
              <p className="mt-6 text-[11px] font-semibold uppercase tracking-wider text-zinc-500">Keywords</p>
              <div className="mt-2 flex flex-wrap gap-1.5">
                {r.keywords.map((k, i) => <span key={k} className="demo-pop-in rounded-lg bg-zinc-100 px-2.5 py-1 text-sm text-zinc-700" style={{ animationDelay: `${i * 70}ms` }}>{k}</span>)}
              </div>
            </>
          )}
        </div>
      );
    }
    case "competitors": {
      const list = data as DemoCompany[];
      const r = results.research;
      return (
        <div className="grid gap-6 rounded-2xl border border-zinc-200 bg-white p-6 shadow-sm md:grid-cols-2">
          <div>
            <p className="text-[11px] font-semibold uppercase tracking-wider text-zinc-500">Product</p>
            <p className="mt-2 rounded-lg bg-zinc-100 px-3 py-2 font-semibold">{r?.summary.split(/[.:]/)[0]}</p>
            <ul className="mt-2 space-y-1 pl-3 text-sm text-zinc-600">{r?.keywords.slice(0, 4).map((k) => <li key={k}>{k}</li>)}</ul>
          </div>
          <div>
            <p className="text-[11px] font-semibold uppercase tracking-wider text-zinc-500">Competitors <span className="ml-1 rounded border border-zinc-200 px-1.5 py-0.5 normal-case tracking-normal text-zinc-700">✓ {list.length} found</span></p>
            {list.length === 0 && <p className="mt-3 text-sm text-zinc-500">No competitors could be confirmed from public pages.</p>}
            <ul className="mt-2 space-y-1.5">
              {list.map((c, i) => (
                <li key={c.domain} className="demo-pop-in flex items-center gap-2 rounded-lg bg-zinc-50 px-3 py-2" style={{ animationDelay: `${i * 60}ms` }}>
                  <Letter text={c.domain} />
                  <a href={`https://${c.domain}`} target="_blank" rel="noopener noreferrer" className="truncate text-sm hover:underline">{c.domain}</a>
                </li>
              ))}
            </ul>
          </div>
        </div>
      );
    }
    case "campaigns": {
      const list = data as DemoCampaign[];
      return (
        <div className="grid gap-4 md:grid-cols-2">
          {list.map((c, i) => (
            <div key={c.name} className={`demo-pop-in rounded-2xl border bg-white p-5 shadow-sm ${c.selected ? "border-zinc-900" : "border-zinc-200 opacity-70"}`} style={{ animationDelay: `${i * 100}ms` }}>
              <p className="font-semibold">{c.name}</p>
              <p className="mt-1 text-sm text-zinc-600">{c.description}</p>
              <p className="mt-3 text-[11px] font-semibold uppercase tracking-wider text-zinc-500">Search</p>
              <p className="text-sm">{c.searchQuery}</p>
              <p className="mt-3 text-[11px] font-semibold uppercase tracking-wider text-zinc-500">Roles</p>
              <div className="mt-1 flex flex-wrap gap-1">{c.roles.map((r) => <span key={r} className="rounded-md bg-zinc-100 px-2 py-0.5 text-xs text-zinc-700">{r}</span>)}</div>
            </div>
          ))}
        </div>
      );
    }
    case "companies": {
      const list = data as DemoCompany[];
      if (!list.length) return <p className="mt-16 text-center text-sm text-zinc-600">No matching companies were found. Try describing who you sell to.</p>;
      return (
        <div className="overflow-hidden rounded-2xl border border-zinc-200 bg-white shadow-sm">
          <table className="w-full text-left text-sm">
            <thead className="border-b border-zinc-200 text-[11px] uppercase tracking-wider text-zinc-500">
              <tr><th scope="col" className="px-4 py-3">Company</th><th scope="col" className="px-4 py-3">Description</th></tr>
            </thead>
            <tbody className="divide-y divide-zinc-100">
              {list.map((c, i) => (
                <tr key={c.domain} className="demo-pop-in" style={{ animationDelay: `${i * 80}ms` }}>
                  <td className="w-56 px-4 py-3 align-top">
                    <p className="flex items-center gap-2 font-semibold"><Letter text={c.name} />{c.name}</p>
                    <a href={`https://${c.domain}`} target="_blank" rel="noopener noreferrer" className="ml-7 font-mono text-xs text-zinc-500 hover:underline">{c.domain}</a>
                  </td>
                  <td className="px-4 py-3 align-top text-zinc-600"><span className="line-clamp-2">{c.description ?? "No description on the homepage."}</span></td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      );
    }
    case "social":
      return <SocialStage data={data as DemoSocial} />;
    case "contacts": {
      const c = data as DemoContacts;
      return (
        <div className="mx-auto mt-6 max-w-xl rounded-2xl border border-zinc-200 bg-white p-7 shadow-sm">
          <p className="text-lg font-semibold">Decision makers</p>
          <p className="mt-2 text-sm leading-relaxed text-zinc-600">
            In your workspace, Threadly looks up people in these roles{c.companies.length ? ` at ${c.companies.slice(0, 3).join(", ")}` : ""} through a licensed contact data provider and records where each contact came from. Profiles are not scraped and addresses are not guessed.
          </p>
          <div className="mt-4 flex flex-wrap gap-1.5">{c.roles.map((r, i) => <span key={r} className="demo-pop-in rounded-lg border border-zinc-200 px-2.5 py-1 text-sm" style={{ animationDelay: `${i * 80}ms` }}>{r}</span>)}</div>
        </div>
      );
    }
    case "pitch":
      return <PitchStage drafts={data as DemoDraft[]} />;
  }
}

function SocialStage({ data }: { data: DemoSocial }) {
  const [filter, setFilter] = useState<"All" | "Reddit" | "X" | "LinkedIn">("All");
  const leads = data.leads.filter((l) => filter === "All" || l.platform === filter);
  return (
    <div>
      <div className="flex flex-wrap items-end justify-between gap-3">
        <div>
          <p className="text-lg font-semibold">Social leads</p>
          <p className="text-sm text-zinc-600">Public posts about <span className="font-semibold text-zinc-900">{data.topic}</span>, ranked by buying intent. Found through search; nothing behind a login.</p>
        </div>
        <div className="flex gap-1" role="tablist" aria-label="Platform">
          {(["All", "Reddit", "X", "LinkedIn"] as const).map((p) => (
            <button key={p} type="button" role="tab" aria-selected={filter === p} onClick={() => setFilter(p)} className={`rounded-lg px-3 py-1.5 text-xs font-semibold ${filter === p ? "bg-zinc-900 text-white" : "bg-white text-zinc-700 ring-1 ring-zinc-200 hover:bg-zinc-50"}`}>
              {p} {p === "All" ? data.leads.length : data.leads.filter((l) => l.platform === p).length}
            </button>
          ))}
        </div>
      </div>
      {leads.length === 0 && <p className="mt-10 text-center text-sm text-zinc-500">No public posts found here.</p>}
      <ul className="mt-4 grid gap-3 md:grid-cols-2">
        {leads.map((l, i) => (
          <li key={l.url} className="demo-pop-in flex flex-col rounded-2xl border border-zinc-200 bg-white p-4 shadow-sm" style={{ animationDelay: `${i * 80}ms` }}>
            <div className="flex items-center gap-2 text-xs">
              <span className={`rounded-md px-2 py-0.5 font-semibold ring-1 ${PLATFORM_STYLE[l.platform]}`}>{l.platform}</span>
              <span className="truncate text-zinc-600">{l.author ?? l.community ?? "public post"}</span>
              <span className="ml-auto shrink-0 rounded-md bg-emerald-50 px-2 py-0.5 font-semibold text-emerald-800 ring-1 ring-emerald-200">{l.intent}</span>
            </div>
            <a href={l.url} target="_blank" rel="noopener noreferrer" className="mt-2 line-clamp-2 font-semibold hover:underline">{l.title}</a>
            {l.snippet && <p className="mt-1 line-clamp-3 text-sm text-zinc-600">{l.snippet}</p>}
            {l.reply && (
              <div className="mt-3 rounded-xl bg-zinc-50 p-3">
                <p className="text-[11px] font-semibold uppercase tracking-wider text-zinc-500">Suggested reply</p>
                <p className="demo-type-in mt-1 whitespace-pre-wrap text-sm text-zinc-800">{l.reply}</p>
              </div>
            )}
          </li>
        ))}
      </ul>
    </div>
  );
}

function PitchStage({ drafts }: { drafts: DemoDraft[] }) {
  const [i, setI] = useState(0);
  const d = drafts[i];
  if (!d) return <p className="mt-16 text-center text-sm text-zinc-600">No companies to write to yet.</p>;
  return (
    <div className="grid gap-4 md:grid-cols-[220px_minmax(0,1fr)]">
      <ul className="space-y-2">
        {drafts.map((x, j) => (
          <li key={x.domain}>
            <button type="button" onClick={() => setI(j)} className={`w-full rounded-xl border px-3 py-2.5 text-left ${j === i ? "border-zinc-900 bg-white" : "border-zinc-200 bg-white/60 hover:bg-white"}`}>
              <p className="flex items-center gap-2 text-sm font-semibold"><Letter text={x.company} />{x.company}</p>
              <p className="ml-7 font-mono text-xs text-zinc-500">{x.domain}</p>
            </button>
          </li>
        ))}
      </ul>
      <div key={d.domain} className="demo-card-in rounded-2xl border border-zinc-200 bg-white shadow-sm">
        <p className="border-b border-zinc-100 px-5 py-3 text-sm"><span className="text-zinc-500">To </span><span className="text-zinc-400">a decision maker at {d.company}</span></p>
        <p className="border-b border-zinc-100 px-5 py-3 text-sm"><span className="text-zinc-500">Subj </span><span className="font-semibold">{d.subject}</span></p>
        <pre className="demo-type-in whitespace-pre-wrap px-5 py-4 font-sans text-[15px] leading-relaxed text-zinc-800">{d.body}</pre>
        <div className="flex flex-wrap items-center justify-between gap-2 border-t border-zinc-100 px-5 py-3 text-xs text-zinc-500">
          <span>{d.engine === "model" ? "Written for this company from its homepage" : "Composed from this company's own homepage"}</span>
          <span className="truncate">Sources: {d.sources.map((s) => s.replace(/^https?:\/\//, "").replace(/\/$/, "")).join(", ")}</span>
        </div>
      </div>
    </div>
  );
}
