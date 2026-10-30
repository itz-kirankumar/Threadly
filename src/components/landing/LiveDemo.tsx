"use client";

import { createContext, useCallback, useContext, useEffect, useMemo, useRef, useState } from "react";
import OnboardModal from "./OnboardModal";
import ResearchPreview from "./ResearchPreview";
import {
  DEMO_STEPS,
  DEMO_STEP_LABELS,
  type DemoCampaign,
  type DemoCompany,
  type DemoContacts,
  type DemoCrawler,
  type DemoDraft,
  type DemoEvent,
  type DemoResearch,
  type DemoResults,
  type DemoSocial,
  type DemoSocialLead,
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
interface Streamed { competitors: DemoCompany[]; companies: DemoCompany[]; social: DemoSocialLead[] }

// How long a finished step's results stay on screen before the story moves on.
const DWELL_MS = 4200;
const EMPTY_STREAM: Streamed = { competitors: [], companies: [], social: [] };

function normalizeDomain(input: string): string | null {
  const host = input.trim().toLowerCase().replace(/^https?:\/\//, "").replace(/^www\./, "").replace(/[/?#].*$/, "");
  return /^[a-z0-9-]+(\.[a-z0-9-]+)*\.[a-z]{2,}$/.test(host) ? host : null;
}

function Logo({ name, icon, size = "h-8 w-8" }: { name: string; icon: string | null | undefined; size?: string }) {
  if (icon) {
    return <img src={icon} alt="" className={`${size} shrink-0 rounded-lg border border-zinc-200 bg-white object-contain p-0.5`} />;
  }
  return (
    <span aria-hidden className={`${size} flex shrink-0 items-center justify-center rounded-lg bg-zinc-900 text-[11px] font-semibold text-white`}>
      {name.replace(/^www\./, "").charAt(0).toUpperCase()}
    </span>
  );
}

// The free run reads and drafts; sending, posting and tracking happen in a
// workspace. These buttons open the onboarding sheet.
const OnboardContext = createContext<() => void>(() => {});

function ActionButton({ label, tone = "dark" }: { label: string; tone?: "dark" | "green" }) {
  const open = useContext(OnboardContext);
  return (
    <button type="button" onClick={open} className={`rounded-lg px-3 py-1.5 text-xs font-semibold text-white transition hover:-translate-y-px ${tone === "green" ? "bg-violet-600 hover:bg-violet-500" : "bg-zinc-900 hover:bg-violet-700"}`}>
      {label}
    </button>
  );
}

// Animates a number up to its value.
function useCountUp(value: number, ms = 900): number {
  const [shown, setShown] = useState(0);
  const from = useRef(0);
  useEffect(() => {
    const start = performance.now();
    const base = from.current;
    let frame = 0;
    const tick = (now: number) => {
      const t = Math.min(1, (now - start) / ms);
      const next = Math.round(base + (value - base) * (1 - Math.pow(1 - t, 3)));
      setShown(next);
      from.current = next;
      if (t < 1) frame = requestAnimationFrame(tick);
    };
    frame = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(frame);
  }, [value, ms]);
  return shown;
}

function CountUp({ value, className }: { value: number; className?: string }) {
  return <span className={className}>{useCountUp(value)}</span>;
}

// How long a visitor can look back at an earlier step before the story
// returns to the live one.
const RETURN_MS = 4000;
const RECENT_KEY = "threadly-recent-searches";
const EXAMPLE_DOMAINS = ["stripe.com", "notion.so", "linear.app"];

const PLATFORM_STYLE: Record<string, string> = {
  Reddit: "bg-orange-50 text-orange-800 ring-orange-200",
  X: "bg-zinc-100 text-zinc-900 ring-zinc-300",
  LinkedIn: "bg-sky-50 text-sky-800 ring-sky-200",
};

export default function LiveDemo({ bonus = { percent: 100, cap: 5000 } }: { bonus?: { percent: number; cap: number } }) {
  const [input, setInput] = useState("");
  const [preview, setPreview] = useState<Preview | null>(null);
  const [previewState, setPreviewState] = useState<"none" | "loading" | "ready" | "error">("none");
  const [previewError, setPreviewError] = useState("");
  const [phase, setPhase] = useState<Phase>("idle");
  const [status, setStatus] = useState<Record<DemoStep, StepStatus>>(() => Object.fromEntries(DEMO_STEPS.map((s) => [s, "pending"])) as Record<DemoStep, StepStatus>);
  const [results, setResults] = useState<DemoResults>({});
  const [streamed, setStreamed] = useState<Streamed>(EMPTY_STREAM);
  const [logs, setLogs] = useState<LogLine[]>([]);
  const [viewing, setViewing] = useState<DemoStep>("research");
  const [follow, setFollow] = useState(true);
  const [error, setError] = useState("");
  const [runDomain, setRunDomain] = useState("");
  // Set when the run cannot start: free runs used, or the demo is busy.
  const [blocked, setBlocked] = useState<null | "free" | "busy">(null);
  const lastSwitch = useRef(0);
  const resultAt = useRef<Partial<Record<DemoStep, number>>>({});
  const abortRef = useRef<AbortController | null>(null);
  const logBox = useRef<HTMLOListElement>(null);
  const logId = useRef(0);
  const panelRef = useRef<HTMLDivElement>(null);
  const [onboardOpen, setOnboardOpen] = useState(false);
  const autoOpened = useRef(false);
  const openOnboard = useCallback(() => setOnboardOpen(true), []);
  const [focused, setFocused] = useState(false);
  const [recent, setRecent] = useState<string[]>([]);
  const [activeSuggestion, setActiveSuggestion] = useState(-1);
  // Recent searches stay in this browser only; the page works without them.
  useEffect(() => {
    try {
      setRecent(JSON.parse(localStorage.getItem(RECENT_KEY) ?? "[]"));
    } catch {
      setRecent([]);
    }
  }, []);
  const suggestions = useMemo(() => {
    if (!focused || phase === "running") return [];
    const typed = input.trim().toLowerCase();
    return [...new Set([...recent, ...EXAMPLE_DOMAINS])].filter((d) => d !== typed && d.includes(typed)).slice(0, 5);
  }, [focused, phase, input, recent]);

  // Type-ahead preview: name, category and icon while the visitor types.
  useEffect(() => {
    const domain = normalizeDomain(input);
    if (!domain) {
      setPreviewState("none");
      return;
    }
    if (preview?.domain === domain || phase === "running") return;
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
    if (logBox.current) logBox.current.scrollTop = logBox.current.scrollHeight;
  }, [logs.length]);

  // Story progression: each step in order, with its results on screen for
  // DWELL_MS, then on to the next step once it has started. No clicks needed.
  useEffect(() => {
    if (!follow || phase === "idle") return;
    const next = DEMO_STEPS[DEMO_STEPS.indexOf(viewing) + 1];
    if (!next || !results[viewing] || status[next] === "pending") return;
    const shownSince = Math.max(resultAt.current[viewing] ?? 0, lastSwitch.current);
    const timer = setTimeout(() => {
      setViewing(next);
      lastSwitch.current = Date.now();
    }, Math.max(0, shownSince + DWELL_MS - Date.now()));
    return () => clearTimeout(timer);
  }, [follow, phase, viewing, results, status]);

  const start = useCallback(async () => {
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
    setBlocked(null);
    setFocused(false);
    setRecent((prev) => {
      const next = [domain, ...prev.filter((d) => d !== domain)].slice(0, 4);
      try {
        localStorage.setItem(RECENT_KEY, JSON.stringify(next));
      } catch {
        // Private windows can refuse storage; history is optional.
      }
      return next;
    });
    setPhase("running");
    setError("");
    setResults({});
    setStreamed(EMPTY_STREAM);
    setLogs([]);
    setFollow(true);
    setViewing("research");
    lastSwitch.current = Date.now();
    resultAt.current = {};
    setStatus(Object.fromEntries(DEMO_STEPS.map((s) => [s, "pending"])) as Record<DemoStep, StepStatus>);
    requestAnimationFrame(() => panelRef.current?.scrollIntoView({ behavior: "smooth", block: "start" }));

    try {
      const res = await fetch("/api/live-demo/run", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ domain }),
        signal: controller.signal,
      });
      if (!res.ok || !res.body) {
        const body = (await res.json().catch(() => ({}))) as { error?: string; code?: string };
        if (body.code === "free_runs_used" || body.code === "busy") {
          setBlocked(body.code === "free_runs_used" ? "free" : "busy");
          setPhase("idle");
          return;
        }
        throw new Error(body.error ?? "The live demo could not start.");
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
          } else if (event.type === "item") {
            const key = event.step as keyof Streamed;
            if (key in EMPTY_STREAM) setStreamed((prev) => ({ ...prev, [key]: [...prev[key], event.data as never] }));
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
      if (!ended) setPhase("error");
    } catch (e) {
      if ((e as Error).name === "AbortError") return;
      setError(e instanceof Error ? e.message : "The live demo could not finish.");
      setPhase("error");
    }
  }, [input, preview?.domain]);

  const runningStep = DEMO_STEPS.find((s) => status[s] === "running");
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
  const brandName = results.research?.name ?? preview?.name ?? runDomain;
  const brandIcon = results.research?.iconDataUrl ?? preview?.iconDataUrl ?? null;
  const goTo = (step: DemoStep) => {
    if (status[step] === "pending") return;
    setFollow(false);
    setViewing(step);
  };
  // The step the story should be on: the one running, else the last one
  // with results.
  const liveStep = runningStep ?? [...DEMO_STEPS].reverse().find((s) => results[s]) ?? "research";
  // Looking back pauses the story briefly, then it returns to the live step.
  useEffect(() => {
    if (follow || phase === "idle") return;
    const timer = setTimeout(() => {
      setFollow(true);
      setViewing(liveStep);
      lastSwitch.current = Date.now();
    }, RETURN_MS);
    return () => clearTimeout(timer);
  }, [follow, phase, viewing, liveStep]);
  // At the end of the run, after the emails have been on screen a while,
  // offer onboarding once.
  useEffect(() => {
    if (phase !== "done" || viewing !== "pitch" || autoOpened.current) return;
    const timer = setTimeout(() => {
      autoOpened.current = true;
      setOnboardOpen(true);
    }, 16000);
    return () => clearTimeout(timer);
  }, [phase, viewing]);
  const competitorsShown = results.competitors ?? streamed.competitors;
  const companiesShown = results.companies ?? streamed.companies;
  const socialShown = results.social?.leads ?? streamed.social;

  return (
    <OnboardContext.Provider value={openOnboard}>
    <div id="live-demo" className="mx-auto w-full scroll-mt-24">
      <form
        onSubmit={(e) => {
          e.preventDefault();
          if (phase !== "running") start();
        }}
        className="relative mx-auto max-w-3xl"
      >
        <div className="relative">
        <div className="search-shell flex items-center gap-2 rounded-2xl p-2">
          {previewState === "ready" && preview ? (
            <span className="pl-1.5"><Logo name={preview.name} icon={preview.iconDataUrl} size="h-7 w-7" /></span>
          ) : (
            <svg viewBox="0 0 24 24" className="ml-2 h-5 w-5 shrink-0 text-[#6B6A72]" fill="none" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" aria-hidden><circle cx="11" cy="11" r="6.5" /><path d="m16 16 4 4" /></svg>
          )}
          <label htmlFor="demo-domain" className="sr-only">Your company website or domain</label>
          <input
            id="demo-domain"
            role="combobox"
            aria-expanded={suggestions.length > 0}
            aria-controls="demo-suggestions"
            aria-autocomplete="list"
            aria-activedescendant={activeSuggestion >= 0 ? `demo-suggestion-${activeSuggestion}` : undefined}
            autoComplete="off"
            inputMode="url"
            placeholder="Enter your company website or domain..."
            value={input}
            onChange={(e) => { setInput(e.target.value); setActiveSuggestion(-1); }}
            onFocus={() => setFocused(true)}
            onBlur={() => setTimeout(() => setFocused(false), 120)}
            onKeyDown={(e) => {
              if (!suggestions.length) return;
              if (e.key === "ArrowDown") { e.preventDefault(); setActiveSuggestion((i) => (i + 1) % suggestions.length); }
              else if (e.key === "ArrowUp") { e.preventDefault(); setActiveSuggestion((i) => (i <= 0 ? suggestions.length - 1 : i - 1)); }
              else if (e.key === "Escape") { setFocused(false); }
              else if (e.key === "Enter" && activeSuggestion >= 0) { e.preventDefault(); setInput(suggestions[activeSuggestion]); setActiveSuggestion(-1); setFocused(false); }
            }}
            className="min-w-0 flex-1 bg-transparent px-2 py-2.5 text-base text-[#111114] placeholder-[#6B6A72]/70 focus:outline-none"
          />
          {input && phase !== "running" && (
            <button type="button" aria-label="Clear" onClick={() => { setInput(""); setPreview(null); setBlocked(null); }} className="flex h-7 w-7 shrink-0 items-center justify-center rounded-full text-[#6B6A72] transition-colors hover:bg-black/[0.07] hover:text-[#111114]">
              <svg viewBox="0 0 24 24" className="h-4 w-4" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" aria-hidden><path d="M6 6l12 12M18 6 6 18" /></svg>
            </button>
          )}
          <button type="submit" disabled={phase === "running"} className="btn-primary shrink-0 rounded-xl px-5 py-2.5 text-sm font-medium disabled:opacity-60">
            {phase === "running" ? "Researching..." : <><span className="hidden sm:inline">Explore your market</span><span className="sm:hidden">Explore</span></>}
          </button>
        </div>
        {suggestions.length > 0 && (
          <ul id="demo-suggestions" role="listbox" aria-label="Suggestions" className="demo-pop-in absolute inset-x-0 top-full z-20 mt-2 overflow-hidden rounded-2xl border border-black/[0.08] bg-[#FFFFFF] p-1 text-left shadow-[0_24px_60px_-24px_rgba(0,0,0,0.9)]">
            {suggestions.map((s, i) => (
              <li key={s} id={`demo-suggestion-${i}`} role="option" aria-selected={activeSuggestion === i}>
                <button type="button" tabIndex={-1} onMouseDown={(e) => { e.preventDefault(); setInput(s); setFocused(false); }} className={`flex w-full items-center justify-between rounded-xl px-3 py-2 text-sm transition-colors ${activeSuggestion === i ? "bg-black/[0.07] text-[#111114]" : "text-[#6B6A72] hover:bg-black/[0.05]"}`}>
                  {s}
                  <span className="text-xs text-[#6B6A72]/70">{recent.includes(s) ? "Recent" : "Example"}</span>
                </button>
              </li>
            ))}
          </ul>
        )}
        </div>
        {phase === "idle" && previewState !== "none" && (
          <div className="demo-pop-in mt-2 rounded-xl border border-zinc-200 bg-white/95 px-3 py-2 text-left shadow-sm backdrop-blur" aria-live="polite">
            {previewState === "loading" && (
              <p className="flex items-center gap-2 text-sm text-zinc-500">
                <span className="h-4 w-4 animate-spin rounded-full border-2 border-zinc-300 border-t-zinc-700" aria-hidden />
                Looking up {normalizeDomain(input)}
              </p>
            )}
            {previewState === "error" && <p className="text-sm text-rose-700">{previewError}</p>}
            {previewState === "ready" && preview && (
              <p className="truncate text-sm text-zinc-700">
                <span className="font-semibold text-zinc-900">{preview.name}</span> <span className="text-zinc-500">{preview.domain}</span>
                {preview.category && <span className="text-zinc-500"> · {preview.category}</span>}
              </p>
            )}
          </div>
        )}
        {phase === "idle" && !blocked && (
          <div className="mt-5 text-center">
            <p className="text-sm text-[#6B6A72]">Start with a website. Let intelligence do the research.</p>
            <p className="mt-1 text-xs text-[#6B6A72]/75">Reads public pages only. Nothing is stored and nothing is sent.</p>
            <a href="#how-it-works" className="mt-5 inline-block rounded-full border border-black/[0.12] px-5 py-2 text-sm text-[#111114] transition-colors hover:border-[#5B3DF5]/50">See how it works</a>
          </div>
        )}
        {blocked && <OutOfRuns kind={blocked} onEligibility={openOnboard} />}
      </form>

      {phase !== "idle" && (
        <div ref={panelRef} className="demo-workspace-in mx-auto mt-8 max-w-6xl scroll-mt-20 overflow-hidden rounded-3xl border border-zinc-200 bg-[#FFFFFF] text-left shadow-[0_40px_100px_-50px_rgba(0,0,0,0.9)]" aria-label={`Live demo for ${runDomain}`}>
          {/* Stepper */}
          <div className="flex items-center gap-3 border-b border-zinc-200 bg-white/70 px-4 py-3 sm:px-6">
            <Logo name={brandName} icon={brandIcon} size="h-7 w-7" />
            <ol className="flex min-w-0 flex-1 items-center gap-2 overflow-x-auto" aria-label="Steps">
              {DEMO_STEPS.map((s, i) => {
                const st = status[s];
                const active = viewing === s;
                return (
                  <li key={s} className={`flex items-center gap-2 ${active ? "shrink-0" : "flex-1"} last:flex-none`}>
                    <button
                      type="button"
                      disabled={st === "pending"}
                      onClick={() => goTo(s)}
                      aria-current={active ? "step" : undefined}
                      aria-label={`Step ${i + 1}: ${DEMO_STEP_LABELS[s]}`}
                      className={`flex shrink-0 items-center gap-2 rounded-full text-sm font-semibold transition ${active ? "border border-violet-300 bg-violet-50 px-3 py-1 text-violet-900" : ""}`}
                    >
                      {active && st === "running" && <span className="h-1.5 w-1.5 animate-pulse rounded-full bg-emerald-500" aria-hidden />}
                      <span className={`flex h-6 w-6 items-center justify-center rounded-full text-xs transition-colors duration-500 ${st === "done" || active ? "bg-violet-600 text-white" : "border border-zinc-300 text-zinc-500"}`}>{i + 1}</span>
                      {active && <span className="whitespace-nowrap">{DEMO_STEP_LABELS[s]}</span>}
                    </button>
                    {i < DEMO_STEPS.length - 1 && <span aria-hidden className="h-px min-w-3 flex-1 bg-zinc-300"><span className="block h-px bg-violet-500 transition-all duration-700" style={{ width: st === "done" ? "100%" : "0%" }} /></span>}
                  </li>
                );
              })}
            </ol>
          </div>
          <StoryBars viewing={viewing} status={status} ready={Boolean(results[viewing])} follow={follow} />

          <div className="grid min-h-[560px] lg:grid-cols-[300px_minmax(0,1fr)]">
            {/* Findings rail */}
            <aside className="hidden flex-col border-r border-zinc-200 px-5 py-4 lg:flex" aria-label="Findings">
              <RailStep n={1} step="research" status={status.research}>
                {results.research && (
                  <div className="demo-pop-in">
                    <p className="flex items-center gap-2"><Logo name={brandName} icon={brandIcon} size="h-5 w-5" /><span className="font-semibold">{brandName}</span><span className="truncate text-xs text-zinc-500">{results.research.domain}</span></p>
                    <p className="mt-1.5 line-clamp-4 text-xs leading-relaxed text-zinc-700">{results.research.summary}</p>
                  </div>
                )}
              </RailStep>
              <RailStep n={2} step="crawler" status={status.crawler}>
                {results.crawler && <p className="demo-pop-in text-xs text-zinc-700"><span className="font-semibold">{results.crawler.score}/100</span> AI readiness · {results.crawler.bots.filter((b) => b.status === "blocked").length} crawlers blocked</p>}
              </RailStep>
              <RailStep n={3} step="competitors" status={status.competitors}>
                {competitorsShown.length > 0 && (
                  <div className="grid grid-cols-2 gap-1.5">
                    {competitorsShown.slice(0, 8).map((c) => (
                      <a key={c.domain} href={`https://${c.domain}`} target="_blank" rel="noopener noreferrer" className="demo-pop-in flex min-w-0 items-center gap-1.5 rounded-lg border border-zinc-200 bg-white px-2 py-1.5 text-xs hover:border-zinc-400">
                        <Logo name={c.domain} icon={c.iconDataUrl} size="h-4 w-4" />
                        <span className="truncate">{c.domain}</span>
                      </a>
                    ))}
                  </div>
                )}
              </RailStep>
              <RailStep n={4} step="campaigns" status={status.campaigns}>
                {results.campaigns?.[0] && <p className="demo-pop-in truncate rounded-lg border border-zinc-900 bg-white px-2.5 py-1.5 text-xs">{results.campaigns[0].name}</p>}
              </RailStep>
              <RailStep n={5} step="companies" status={status.companies}>
                {companiesShown.length > 0 && (
                  <div className="flex -space-x-1.5">
                    {companiesShown.slice(0, 8).map((c) => <span key={c.domain} className="demo-pop-in" title={c.domain}><Logo name={c.name} icon={c.iconDataUrl} size="h-6 w-6" /></span>)}
                  </div>
                )}
              </RailStep>
              <RailStep n={6} step="social" status={status.social}>
                {socialShown.length > 0 && (
                  <p className="text-xs text-zinc-700">
                    {(["Reddit", "X", "LinkedIn"] as const).map((p) => `${socialShown.filter((l) => l.platform === p).length} ${p}`).join(" · ")}
                  </p>
                )}
              </RailStep>
              <RailStep n={7} step="contacts" status={status.contacts} />
              <RailStep n={8} step="pitch" status={status.pitch} />
              <div className="mt-3 rounded-xl border border-zinc-200 bg-white p-3">
                <p className="flex items-center gap-2 text-xs font-semibold">
                  {phase === "running" && <span className="h-1.5 w-1.5 animate-pulse rounded-full bg-emerald-500" aria-hidden />}
                  {phase === "running" && runningStep ? `Working on step ${DEMO_STEPS.indexOf(runningStep) + 1} of ${DEMO_STEPS.length}` : phase === "done" ? "Run complete" : "Stopped"}
                </p>
                <ol ref={logBox} className="mt-2 max-h-40 space-y-1 overflow-y-auto font-mono text-[11px] leading-relaxed text-zinc-600" aria-live="polite">
                  {logs.slice(-14).map((l, i, arr) => {
                    const last = i === arr.length - 1 && phase === "running";
                    return (
                      <li key={l.id} className="demo-line-in flex gap-1.5">
                        <span aria-hidden className={last ? "text-zinc-900" : "text-emerald-600"}>{last ? ">" : "✓"}</span>
                        <span className={`truncate ${last ? "text-zinc-900" : ""}`}>{l.text}{last && <span className="demo-caret" aria-hidden />}</span>
                      </li>
                    );
                  })}
                </ol>
              </div>
            </aside>

            {/* Stage */}
            <div className="min-w-0 px-4 py-6 sm:px-8">
              <div key={viewing} className="demo-story-in">
                <Stage step={viewing} status={status[viewing]} results={results} streamed={streamed} logs={logs.filter((l) => l.step === viewing)} counters={counters} brandIcon={brandIcon} />
              </div>
              {phase === "error" && (
                <div className="mx-auto mt-6 max-w-2xl rounded-xl border border-rose-200 bg-rose-50 p-4 text-sm text-rose-800">
                  <p>{error || "The run stopped early."}</p>
                  <div className="mt-3"><ActionButton label="Check eligibility for full runs" /></div>
                </div>
              )}
            </div>
          </div>

          <div className="flex flex-wrap items-center justify-between gap-3 border-t border-zinc-200 bg-white/80 px-4 py-3 sm:px-6">
            <p className="text-xs text-zinc-500">
              {!follow ? (
                <button type="button" onClick={() => { setFollow(true); setViewing(liveStep); }} className="font-semibold text-zinc-900 underline underline-offset-4">Back to the live step</button>
              ) : (
                "Real public web data. Nothing is stored and nothing is sent."
              )}
            </p>
            <ActionButton tone="green" label={phase === "done" ? "Get leads like these every week" : "Start with Threadly"} />
          </div>
        </div>
      )}
      {phase === "done" && <div className="mx-auto max-w-6xl"><ResearchPreview results={results} category={preview?.category ?? null} /></div>}
      <OnboardModal
        open={onboardOpen}
        onClose={() => setOnboardOpen(false)}
        bonus={bonus}
        stats={{
          domain: runDomain || preview?.domain || "",
          name: brandName,
          readiness: results.crawler?.score ?? null,
          competitors: competitorsShown.length,
          companies: companiesShown.length,
          socialLeads: socialShown.length,
          drafts: results.pitch?.length ?? 0,
        }}
      />
    </div>
    </OnboardContext.Provider>
  );
}

// Shown instead of the workspace when a run cannot start: what the visitor
// can do next, without the mechanics of the limit.
function OutOfRuns({ kind, onEligibility }: { kind: "free" | "busy"; onEligibility: () => void }) {
  if (kind === "busy") {
    return (
      <div className="demo-pop-in mx-auto mt-5 max-w-xl rounded-2xl border border-violet-200 bg-white p-5 text-left shadow-sm">
        <p className="font-semibold">The live demo is busy right now</p>
        <p className="mt-1 text-sm text-zinc-600">Give it a few minutes and try again, or check whether your team qualifies for full runs.</p>
        <button type="button" onClick={onEligibility} className="mt-4 rounded-xl bg-violet-600 px-4 py-2 text-sm font-semibold text-white hover:bg-violet-500">Check eligibility</button>
      </div>
    );
  }
  return (
    <div className="demo-modal-in mx-auto mt-6 max-w-3xl overflow-hidden rounded-3xl border border-violet-200 bg-white text-left shadow-[0_30px_80px_-40px_rgba(91,33,182,0.55)]">
      <div className="bg-violet-700 px-6 py-5 text-white">
        <p className="text-xs font-semibold uppercase tracking-widest text-violet-100">Free runs used</p>
        <p className="mt-1 text-2xl font-semibold tracking-tight">You&apos;ve seen what Threadly finds. Keep going with full runs.</p>
        <p className="mt-1 text-sm text-violet-100">Full runs find every matching company, look up decision makers and send from your own domain.</p>
      </div>
      <div className="grid gap-px bg-zinc-100 sm:grid-cols-3">
        <button type="button" onClick={onEligibility} className="group bg-white p-5 text-left transition hover:bg-violet-50">
          <p className="text-sm font-semibold">New here?</p>
          <p className="mt-1 text-xs text-zinc-600">Check your eligibility. Qualified teams are onboarded on the spot.</p>
          <span className="mt-3 inline-block rounded-lg bg-violet-600 px-3 py-1.5 text-xs font-semibold text-white group-hover:bg-violet-500">Check eligibility</span>
        </button>
        <a href="/portal" className="group bg-white p-5 transition hover:bg-violet-50">
          <p className="text-sm font-semibold">Already onboarded?</p>
          <p className="mt-1 text-xs text-zinc-600">Sign in and run it from your workspace with the credits you have left.</p>
          <span className="mt-3 inline-block rounded-lg border border-zinc-300 px-3 py-1.5 text-xs font-semibold text-zinc-900 group-hover:border-violet-400">Sign in</span>
        </a>
        <a href="/portal" className="group bg-white p-5 transition hover:bg-violet-50">
          <p className="text-sm font-semibold">Out of credits?</p>
          <p className="mt-1 text-xs text-zinc-600">Top up with a credit pack. Your first pack earns bonus credits.</p>
          <span className="mt-3 inline-block rounded-lg border border-zinc-300 px-3 py-1.5 text-xs font-semibold text-zinc-900 group-hover:border-violet-400">Upgrade now</span>
        </a>
      </div>
    </div>
  );
}

// Story-style progress: one bar per step. The bar of the step on screen
// fills while its results are shown, then the story moves on.
function StoryBars({ viewing, status, ready, follow }: { viewing: DemoStep; status: Record<DemoStep, StepStatus>; ready: boolean; follow: boolean }) {
  const at = DEMO_STEPS.indexOf(viewing);
  return (
    <div className="flex gap-1 bg-white/70 px-4 pb-2 sm:px-6" aria-hidden>
      {DEMO_STEPS.map((s, i) => (
        <span key={s} className="h-1 flex-1 overflow-hidden rounded-full bg-zinc-200">
          {i < at || (i !== at && status[s] === "done" && i < at) ? (
            <span className="block h-full w-full bg-violet-600" />
          ) : i === at ? (
            ready ? (
              <span key={`${s}-${follow}`} className={`block h-full bg-violet-600 ${follow ? "demo-story-fill" : "w-full opacity-40"}`} />
            ) : (
              <span className="demo-story-wait block h-full w-1/3 bg-violet-500/70" />
            )
          ) : null}
        </span>
      ))}
    </div>
  );
}

function RailStep({ n, step, status, children }: { n: number; step: DemoStep; status: StepStatus; children?: React.ReactNode }) {
  return (
    <section className={`border-b border-zinc-200 py-2.5 transition-opacity duration-500 ${status === "pending" ? "opacity-40" : ""}`}>
      <p className="font-mono text-[11px] text-zinc-600">
        <span aria-hidden className={status === "done" ? "text-emerald-600" : "text-zinc-400"}>{status === "done" ? "✓" : status === "running" ? "›" : "·"}</span> step {n} · {DEMO_STEP_LABELS[step]}
      </p>
      {children && <div className="mt-2">{children}</div>}
    </section>
  );
}

function LiveCard({ step, logs, counters }: { step: DemoStep; logs: LogLine[]; counters: { searches: number; pages: number } }) {
  return (
    <div className="mx-auto mt-6 max-w-xl rounded-2xl border border-zinc-200 bg-white p-8 shadow-sm">
      <p className="text-xs font-semibold uppercase tracking-widest text-zinc-500">Working on: {DEMO_STEP_LABELS[step]}</p>
      <div className="mt-5 grid grid-cols-2 gap-4">
        <div>
          <CountUp value={counters.searches} className="block text-5xl font-semibold tabular-nums tracking-tight" />
          <p className="mt-1 text-sm text-zinc-500">web searches run</p>
        </div>
        <div>
          <CountUp value={counters.pages} className="block text-5xl font-semibold tabular-nums tracking-tight" />
          <p className="mt-1 text-sm text-zinc-500">public pages read</p>
        </div>
      </div>
      <ul className="mt-6 space-y-1.5 border-t border-zinc-100 pt-4 font-mono text-xs text-zinc-600">
        {logs.slice(-4).map((l, i, arr) => (
          <li key={l.id} className="demo-line-in truncate"><span aria-hidden className="mr-1.5">{i === arr.length - 1 ? ">" : "✓"}</span>{l.text}</li>
        ))}
        {!logs.length && <li>starting</li>}
      </ul>
    </div>
  );
}

function Stage(props: { step: DemoStep; status: StepStatus; results: DemoResults; streamed: Streamed; logs: LogLine[]; counters: { searches: number; pages: number }; brandIcon: string | null }) {
  const { step, status, results, streamed, logs, counters, brandIcon } = props;
  // Steps with live items show them as they arrive, before the final result.
  if (step === "competitors" && !results.competitors && streamed.competitors.length) return <CompetitorStage list={streamed.competitors} live summary={results.research} />;
  if (step === "companies" && !results.companies && streamed.companies.length) return <CompanyStage list={streamed.companies} live />;
  if (step === "social" && !results.social && status !== "pending") return <SocialStage leads={streamed.social} topic={null} live logs={logs} />;
  const data = results[step];
  if (!data) return status === "pending" ? <p className="mt-20 text-center text-sm text-zinc-500">Waiting for the previous step.</p> : <LiveCard step={step} logs={logs} counters={counters} />;
  switch (step) {
    case "research": {
      const r = data as DemoResearch;
      return (
        <div className="mx-auto mt-4 max-w-xl rounded-2xl border border-zinc-200 bg-white p-7 shadow-sm">
          <div className="flex items-start gap-3">
            <Logo name={r.name} icon={brandIcon} size="h-11 w-11" />
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
    case "crawler":
      return <CrawlerStage audit={data as DemoCrawler} />;
    case "competitors":
      return <CompetitorStage list={data as DemoCompany[]} live={false} summary={results.research} />;
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
    case "companies":
      return <CompanyStage list={data as DemoCompany[]} live={false} />;
    case "social": {
      const s = data as DemoSocial;
      return <SocialStage leads={s.leads} topic={s.topic} live={false} logs={[]} />;
    }
    case "contacts": {
      const c = data as DemoContacts;
      return (
        <div className="mx-auto mt-4 max-w-xl rounded-2xl border border-zinc-200 bg-white p-7 shadow-sm">
          <p className="text-lg font-semibold">Decision makers</p>
          <p className="mt-2 text-sm leading-relaxed text-zinc-600">
            For invited workspaces, Threadly looks up people in these roles{c.companies.length ? ` at ${c.companies.slice(0, 3).join(", ")}` : ""} through a licensed contact data provider and records where each contact came from. Profiles are not scraped and addresses are not guessed.
          </p>
          <div className="mt-4 flex flex-wrap gap-1.5">{c.roles.map((r, i) => <span key={r} className="demo-pop-in rounded-lg border border-zinc-200 px-2.5 py-1 text-sm" style={{ animationDelay: `${i * 80}ms` }}>{r}</span>)}</div>
        </div>
      );
    }
    case "pitch":
      return <PitchStage drafts={data as DemoDraft[]} />;
  }
}

function CrawlerStage({ audit }: { audit: DemoCrawler }) {
  const tone = audit.score >= 75 ? "text-emerald-600" : audit.score >= 50 ? "text-amber-600" : "text-rose-600";
  const circumference = 2 * Math.PI * 42;
  return (
    <div className="grid gap-6 rounded-2xl border border-zinc-200 bg-white p-6 shadow-sm md:grid-cols-[200px_minmax(0,1fr)]">
      <div className="flex flex-col items-center text-center">
        <div className="relative h-36 w-36">
          <svg viewBox="0 0 100 100" className="h-36 w-36 -rotate-90" aria-hidden>
            <circle cx="50" cy="50" r="42" className="fill-none stroke-zinc-100" strokeWidth="9" />
            <circle cx="50" cy="50" r="42" className={`demo-ring fill-none stroke-current ${tone}`} strokeWidth="9" strokeLinecap="round" strokeDasharray={circumference} style={{ ["--ring-to" as string]: `${circumference * (1 - audit.score / 100)}` }} />
          </svg>
          <p className={`absolute inset-0 flex flex-col items-center justify-center ${tone}`}>
            <CountUp value={audit.score} className="text-4xl font-semibold tabular-nums" />
            <span className="text-xs font-semibold">Grade {audit.grade}</span>
          </p>
        </div>
        <p className="mt-2 text-sm font-semibold">AI readiness score</p>
        <p className="text-xs text-zinc-500">{audit.passed} of {audit.total} checks passed. Readiness, not a promise of citation.</p>
      </div>
      <div className="min-w-0 space-y-3">
        {audit.categories.map((cat, ci) => (
          <div key={cat.name} className="demo-pop-in" style={{ animationDelay: `${ci * 140}ms` }}>
            <div className="flex items-center gap-3">
              <p className="w-36 shrink-0 text-xs font-semibold">{cat.name}</p>
              <span className="h-1.5 flex-1 overflow-hidden rounded-full bg-zinc-100">
                <span className="demo-bar block h-full rounded-full bg-violet-600" style={{ ["--bar-to" as string]: `${(cat.score / cat.max) * 100}%`, animationDelay: `${200 + ci * 140}ms` }} />
              </span>
              <span className="w-12 text-right text-xs tabular-nums text-zinc-500">{cat.score}/{cat.max}</span>
            </div>
            <ul className="mt-1.5 flex flex-wrap gap-1">
              {cat.checks.map((c) => (
                <li key={c.label} title={c.detail} className={`rounded-md px-1.5 py-0.5 text-[11px] ring-1 ${c.passed ? "bg-emerald-50 text-emerald-800 ring-emerald-200" : "bg-rose-50 text-rose-800 ring-rose-200"}`}>
                  {c.passed ? "✓" : "✕"} {c.label}
                </li>
              ))}
            </ul>
          </div>
        ))}
        <p className="mt-4 text-[11px] font-semibold uppercase tracking-wider text-zinc-500">AI crawlers</p>
        <ul className="mt-2 flex flex-wrap gap-1.5">
          {audit.bots.map((b, i) => (
            <li key={b.name} title={b.engine} className={`demo-pop-in rounded-md px-2 py-1 text-xs ring-1 ${b.status === "blocked" ? "bg-rose-50 text-rose-800 ring-rose-200" : "bg-emerald-50 text-emerald-800 ring-emerald-200"}`} style={{ animationDelay: `${300 + i * 60}ms` }}>
              {b.name} {b.status === "blocked" ? "blocked" : "allowed"}
            </li>
          ))}
        </ul>
        {audit.issues.length > 0 && <p className="mt-3 text-xs text-rose-700">{audit.issues[0]}</p>}
        <div className="pt-1"><ActionButton label="Track AI visibility weekly" /></div>
      </div>
    </div>
  );
}

function CompetitorStage({ list, live, summary }: { list: DemoCompany[]; live: boolean; summary?: DemoResearch }) {
  return (
    <div className="grid gap-6 rounded-2xl border border-zinc-200 bg-white p-6 shadow-sm md:grid-cols-[minmax(0,0.9fr)_minmax(0,1.1fr)]">
      <div>
        <p className="text-[11px] font-semibold uppercase tracking-wider text-zinc-500">Product</p>
        <p className="mt-2 rounded-lg bg-zinc-100 px-3 py-2 font-semibold">{summary?.summary.split(/[.:]/)[0]}</p>
        <ul className="mt-2 space-y-1 pl-3 text-sm text-zinc-600">{summary?.keywords.slice(0, 4).map((k) => <li key={k}>{k}</li>)}</ul>
      </div>
      <div>
        <p className="flex items-center gap-2 text-[11px] font-semibold uppercase tracking-wider text-zinc-500">
          Competitors
          <span className="rounded border border-zinc-200 px-1.5 py-0.5 normal-case tracking-normal text-zinc-700">
            {live ? <span className="inline-flex items-center gap-1"><span className="h-1.5 w-1.5 animate-pulse rounded-full bg-emerald-500" />{list.length} verified so far</span> : `✓ ${list.length} found`}
          </span>
        </p>
        <ul className="mt-3 grid grid-cols-2 gap-2 sm:grid-cols-3">
          {list.map((c, i) => (
            <li key={c.domain} className="demo-logo-in" style={{ animationDelay: live ? "0ms" : `${i * 70}ms` }}>
              <a href={`https://${c.domain}`} target="_blank" rel="noopener noreferrer" title={c.description ?? c.domain} className="flex h-full flex-col items-center gap-2 rounded-xl border border-zinc-200 bg-white px-2 py-3 text-center transition hover:-translate-y-0.5 hover:border-zinc-400 hover:shadow-md">
                <Logo name={c.domain} icon={c.iconDataUrl} size="h-9 w-9" />
                <span className="w-full truncate text-xs font-medium">{c.domain}</span>
              </a>
            </li>
          ))}
          {live && <li className="flex items-center justify-center rounded-xl border border-dashed border-zinc-300 px-2 py-3 text-xs"><span className="demo-shimmer">checking more</span></li>}
        </ul>
      </div>
    </div>
  );
}

function CompanyStage({ list, live }: { list: DemoCompany[]; live: boolean }) {
  if (!list.length) return <p className="mt-16 text-center text-sm text-zinc-600">No matching companies were found for this site.</p>;
  return (
    <div className="overflow-hidden rounded-2xl border border-zinc-200 bg-white shadow-sm">
      <p className="flex items-center gap-2 border-b border-zinc-100 px-4 py-3 text-sm font-semibold">
        {live && <span className="h-1.5 w-1.5 animate-pulse rounded-full bg-emerald-500" aria-hidden />}
        {list.length} potential customers {live ? "found so far" : "found"}
      </p>
      <ul className="divide-y divide-zinc-100">
        {list.map((c, i) => (
          <li key={c.domain} className="demo-pop-in flex items-start gap-3 px-4 py-3" style={{ animationDelay: live ? "0ms" : `${i * 70}ms` }}>
            <Logo name={c.name} icon={c.iconDataUrl} size="h-8 w-8" />
            <div className="min-w-0 flex-1">
              <p className="text-sm font-semibold">{c.name} <a href={`https://${c.domain}`} target="_blank" rel="noopener noreferrer" className="font-mono text-xs font-normal text-zinc-500 hover:underline">{c.domain}</a></p>
              <p className="line-clamp-2 text-sm text-zinc-600">{c.description ?? "No description on the homepage."}</p>
            </div>
          </li>
        ))}
      </ul>
    </div>
  );
}

function SocialStage({ leads, topic, live, logs }: { leads: DemoSocialLead[]; topic: string | null; live: boolean; logs: LogLine[] }) {
  const lanes: Array<DemoSocialLead["platform"]> = ["Reddit", "X", "LinkedIn"];
  const current = logs[logs.length - 1]?.text ?? "";
  return (
    <div>
      <div className="flex flex-wrap items-end justify-between gap-2">
        <div>
          <p className="text-lg font-semibold">Reddit, X and LinkedIn leads</p>
          <p className="text-sm text-zinc-600">
            {topic ? <>Public posts about <span className="font-semibold text-zinc-900">{topic}</span>, ranked by buying intent.</> : "Searching public posts for people asking for what you sell."} Nothing behind a login is read.
          </p>
        </div>
        {live && current && <p className="max-w-full truncate font-mono text-[11px] text-zinc-500"><span className="mr-1 inline-block h-1.5 w-1.5 animate-pulse rounded-full bg-emerald-500" />{current}</p>}
      </div>
      {!live && leads.length > 0 && (
        <div className="demo-pop-in mt-3 flex flex-wrap items-center justify-between gap-2 rounded-xl border border-zinc-900 bg-white px-4 py-2.5">
          <p className="text-sm"><span className="font-semibold">{leads.length} people</span> are asking about what you sell. Reply and track every thread from your workspace.</p>
          <ActionButton tone="green" label="Reach out to all" />
        </div>
      )}
      <div className="mt-4 grid gap-3 md:grid-cols-3">
        {lanes.map((lane) => {
          const items = leads.filter((l) => l.platform === lane);
          const scanning = live && new RegExp(`\\b${lane}\\b`, "i").test(current);
          return (
            <section key={lane} className={`rounded-2xl border bg-white/80 p-3 transition ${scanning ? "border-zinc-900 shadow-md" : "border-zinc-200"}`} aria-label={`${lane} posts`}>
              <p className="flex items-center justify-between text-xs font-semibold">
                <span className={`rounded-md px-2 py-0.5 ring-1 ${PLATFORM_STYLE[lane]}`}>{lane}</span>
                <span className="text-zinc-500">{scanning ? <span className="demo-shimmer">surfing</span> : `${items.length} posts`}</span>
              </p>
              <ul className="mt-3 space-y-2">
                {items.map((l) => (
                  <li key={l.url} className="demo-pop-in rounded-xl border border-zinc-200 bg-white p-3">
                    <p className="flex items-center gap-1.5 text-[11px]">
                      <span className="truncate text-zinc-600">{l.author ?? l.community ?? "public post"}</span>
                      <span className="ml-auto shrink-0 rounded bg-emerald-50 px-1.5 py-0.5 font-semibold text-emerald-800">{l.intent}</span>
                    </p>
                    <a href={l.url} target="_blank" rel="noopener noreferrer" className="mt-1 line-clamp-2 text-sm font-semibold hover:underline">{l.title}</a>
                    {l.snippet && <p className="mt-1 line-clamp-2 text-xs text-zinc-600">{l.snippet}</p>}
                    {l.reply && (
                      <div className="mt-2 rounded-lg bg-zinc-50 p-2">
                        <p className="text-[10px] font-semibold uppercase tracking-wider text-zinc-500">Suggested reply</p>
                        <p className="demo-type-in mt-0.5 whitespace-pre-wrap text-xs text-zinc-800">{l.reply}</p>
                      </div>
                    )}
                    {!live && <div className="mt-2"><ActionButton label={l.reply ? "Post this reply" : "Draft a reply"} /></div>}
                  </li>
                ))}
                {!items.length && <li className="rounded-xl border border-dashed border-zinc-200 p-3 text-center text-xs text-zinc-400">{live ? <span className="demo-shimmer">waiting</span> : "none found"}</li>}
              </ul>
            </section>
          );
        })}
      </div>
    </div>
  );
}

function PitchStage({ drafts }: { drafts: DemoDraft[] }) {
  const [i, setI] = useState(0);
  // Cycle through the drafts on its own, like the rest of the story.
  useEffect(() => {
    if (drafts.length < 2) return;
    const timer = setInterval(() => setI((x) => (x + 1) % drafts.length), 7000);
    return () => clearInterval(timer);
  }, [drafts.length]);
  const d = drafts[i];
  if (!d) return <p className="mt-16 text-center text-sm text-zinc-600">No companies to write to yet.</p>;
  return (
    <div className="grid gap-4 md:grid-cols-[220px_minmax(0,1fr)]">
      <ul className="space-y-2">
        {drafts.map((x, j) => (
          <li key={x.domain}>
            <button type="button" onClick={() => setI(j)} className={`w-full rounded-xl border px-3 py-2.5 text-left transition ${j === i ? "border-zinc-900 bg-white shadow-sm" : "border-zinc-200 bg-white/60 hover:bg-white"}`}>
              <p className="truncate text-sm font-semibold">{x.company}</p>
              <p className="truncate font-mono text-xs text-zinc-500">{x.domain}</p>
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
        <div className="flex flex-wrap items-center justify-between gap-2 border-t border-zinc-100 px-5 py-3">
          <span className="text-xs text-zinc-500">A full run writes one for every company it finds.</span>
          <ActionButton tone="green" label="Find the decision maker and send" />
        </div>
      </div>
    </div>
  );
}
