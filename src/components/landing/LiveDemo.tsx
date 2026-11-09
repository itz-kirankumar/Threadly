"use client";

import { createContext, useCallback, useContext, useEffect, useMemo, useRef, useState } from "react";
import OnboardModal from "./OnboardModal";
import ResearchReport from "./ResearchReport";
import ThreadLines from "./ThreadLines";
import { authorPicture, Avatar, CompanyTable, Logo, MessageFlow, PLATFORM_TONE, postLabel, SignalTable } from "./demo-tables";
import {
  DEMO_STEPS,
  DEMO_STEP_LABELS,
  type DemoCampaign,
  type DemoCompany,
  type DemoContacts,
  type DemoCrawler,
  type DemoDraft,
  type DemoEvent,
  type DemoFit,
  type DemoLocal,
  type DemoPlan,
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

// The free run reads and drafts; sending, posting and tracking happen in a
// workspace. These buttons open the onboarding sheet.
const OnboardContext = createContext<() => void>(() => {});

function ActionButton({ label, tone = "dark" }: { label: string; tone?: "dark" | "green" }) {
  const open = useContext(OnboardContext);
  return (
    <button type="button" onClick={open} style={tone === "green" ? undefined : { background: "#111114", color: "#fff" }} className={`rounded-lg px-3 py-1.5 text-xs font-semibold text-white transition hover:-translate-y-px ${tone === "green" ? "bg-violet-600 hover:bg-violet-500" : "hover:opacity-90"}`}>
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
// The steps this run's plan picked, plus the report the visitor ends on.
type View = DemoStep | "report";
const DEFAULT_VIEWS: View[] = [...DEMO_STEPS.filter((s) => s !== "local"), "report"];
const VIEW_LABELS: Record<View, string> = { ...DEMO_STEP_LABELS, report: "Research report" };
const RECENT_KEY = "threadly-recent-searches";
// Small digital businesses, the businesses Threadly serves.
const EXAMPLE_DOMAINS = ["tally.so", "plausible.io", "senja.io"];

const PLATFORM_STYLE: Record<string, string> = {
  Reddit: "bg-orange-50 text-orange-800 ring-orange-200",
  X: "bg-zinc-100 text-zinc-900 ring-zinc-300",
  LinkedIn: "bg-sky-50 text-sky-800 ring-sky-200",
  Quora: "bg-red-50 text-red-800 ring-red-200",
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
  const [viewing, setViewing] = useState<View>("research");
  const [follow, setFollow] = useState(true);
  const [error, setError] = useState("");
  const [runDomain, setRunDomain] = useState("");
  const [readAt, setReadAt] = useState("");
  // Set when the run cannot start: free runs used, or the demo is busy.
  const [blocked, setBlocked] = useState<null | "busy">(null);
  const [plan, setPlan] = useState<DemoPlan | null>(null);
  const [stats, setStats] = useState({ searches: 0, sources: 0 });
  const VIEWS: View[] = useMemo(() => (plan ? (plan.steps.length > 1 ? [...plan.steps, "report"] : ["research"]) : DEFAULT_VIEWS), [plan]);
  const lastSwitch = useRef(0);
  const resultAt = useRef<Partial<Record<DemoStep, number>>>({});
  const abortRef = useRef<AbortController | null>(null);
  const logBox = useRef<HTMLOListElement>(null);
  const logId = useRef(0);
  const panelRef = useRef<HTMLDivElement>(null);
  const [onboardOpen, setOnboardOpen] = useState(false);
  // The run takes the whole screen. Closing only hides it: it keeps working
  // and the pill under the search box brings it back.
  const [focusOpen, setFocusOpen] = useState(false);
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
    if (viewing === "report") return;
    const next = VIEWS[VIEWS.indexOf(viewing) + 1];
    if (!next || !results[viewing]) return;
    if (next === "report" ? phase !== "done" : status[next] === "pending") return;
    const shownSince = Math.max(resultAt.current[viewing] ?? 0, lastSwitch.current);
    const timer = setTimeout(() => {
      setViewing(next);
      lastSwitch.current = Date.now();
    }, Math.max(0, shownSince + DWELL_MS - Date.now()));
    return () => clearTimeout(timer);
  }, [follow, phase, viewing, results, status, VIEWS]);

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
    setFocusOpen(true);
    setReadAt(new Date().toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" }));
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
    setPlan(null);
    setStats({ searches: 0, sources: 0 });
    setStreamed(EMPTY_STREAM);
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
        body: JSON.stringify({ domain }),
        signal: controller.signal,
      });
      if (!res.ok || !res.body) {
        const body = (await res.json().catch(() => ({}))) as { error?: string; code?: string };
        if (body.code === "busy") {
          setBlocked("busy");
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
          } else if (event.type === "plan") {
            setPlan(event.data);
          } else if (event.type === "stats") {
            setStats(event.data);
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
  const counters = useMemo(() => ({ searches: stats.searches, pages: stats.sources }), [stats]);
  const brandName = results.research?.name ?? preview?.name ?? runDomain;
  const brandIcon = results.research?.iconDataUrl ?? preview?.iconDataUrl ?? null;
  const statusOf = (view: View): StepStatus => (view === "report" ? (phase === "done" ? "done" : "pending") : status[view]);
  const fit = results.research?.fit;
  const goTo = (step: View) => {
    if (statusOf(step) === "pending") return;
    setFollow(false);
    setViewing(step);
  };
  // The step the story should be on: the one running, else the last one
  // with results.
  const liveStep: View = runningStep ?? (phase === "done" && VIEWS.includes("report") ? "report" : [...DEMO_STEPS].reverse().find((s) => results[s]) ?? "research");
  // While the run is live, looking back pauses the story briefly, then it
  // returns to the live step. Once finished, every step stays open to browse.
  useEffect(() => {
    if (follow || phase !== "running") return;
    const timer = setTimeout(() => {
      setFollow(true);
      setViewing(liveStep);
      lastSwitch.current = Date.now();
    }, RETURN_MS);
    return () => clearTimeout(timer);
  }, [follow, phase, viewing, liveStep]);
  const planned = (step: DemoStep) => VIEWS.includes(step);
  // At the end of the run, after the emails have been on screen a while,
  // offer onboarding once.
  useEffect(() => {
    if (phase !== "done" || viewing !== "report" || autoOpened.current) return;
    const timer = setTimeout(() => {
      autoOpened.current = true;
      setOnboardOpen(true);
    }, 25000);
    return () => clearTimeout(timer);
  }, [phase, viewing]);
  const takeover = focusOpen && phase !== "idle";
  useEffect(() => {
    if (!takeover) return;
    const root = document.documentElement;
    const previous = root.style.overflow;
    root.style.overflow = "hidden";
    return () => { root.style.overflow = previous; };
  }, [takeover]);
  useEffect(() => {
    if (!takeover) return;
    const onKey = (e: KeyboardEvent) => { if (e.key === "Escape" && !onboardOpen) setFocusOpen(false); };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [takeover, onboardOpen]);
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
        <div className="search-shell flex items-center gap-2 rounded-2xl p-2" data-running={phase === "running"}>
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
        {blocked && <OutOfRuns onEligibility={openOnboard} />}
      </form>

      {phase !== "idle" && !focusOpen && (
        <button type="button" onClick={() => setFocusOpen(true)} className="demo-pop-in mx-auto mt-5 flex items-center gap-2 rounded-full border border-black/10 bg-white px-4 py-2 text-sm font-medium text-[#111114] shadow-sm transition-colors hover:border-[#5B3DF5]/50">
          {phase === "running" && <span className="h-1.5 w-1.5 animate-pulse rounded-full bg-[#5B3DF5]" aria-hidden />}
          {phase === "running" ? `Researching ${runDomain}: open` : phase === "done" ? `View the report on ${runDomain}` : "Open the run"}
        </button>
      )}
      {takeover && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-[#F6F5F2]/75 p-3 backdrop-blur-md sm:p-6" role="dialog" aria-modal="true" aria-label={`Live research on ${runDomain}`}>
        <ThreadLines mode="sides" target="#demo-panel" className="hidden lg:block" />
        <div id="demo-panel" data-running={phase === "running"} ref={panelRef} className="demo-workspace-in relative flex h-full max-h-[860px] w-full max-w-6xl flex-col overflow-hidden rounded-3xl border border-zinc-200 bg-[#FFFFFF] text-left shadow-[0_40px_100px_-50px_rgba(0,0,0,0.9)]" aria-label={`Live demo for ${runDomain}`}>
          {/* Stepper */}
          <div className="flex items-center gap-3 border-b border-zinc-200 bg-white/70 px-4 py-3 sm:px-6">
            <Logo name={brandName} icon={brandIcon} size="h-7 w-7" />
            <ol className="flex min-w-0 flex-1 items-center gap-2 overflow-x-auto" aria-label="Steps">
              {VIEWS.map((s, i) => {
                const st = statusOf(s);
                const active = viewing === s;
                return (
                  <li key={s} className={`flex items-center gap-2 ${active ? "shrink-0" : "flex-1"} last:flex-none`}>
                    <button
                      type="button"
                      disabled={st === "pending"}
                      onClick={() => goTo(s)}
                      aria-current={active ? "step" : undefined}
                      aria-label={`Step ${i + 1}: ${VIEW_LABELS[s]}`}
                      className={`flex shrink-0 items-center gap-2 rounded-full text-sm font-semibold transition ${active ? "border border-violet-300 bg-violet-50 px-3 py-1 text-violet-900" : ""}`}
                    >
                      {active && st === "running" && <span className="h-1.5 w-1.5 animate-pulse rounded-full bg-emerald-500" aria-hidden />}
                      <span className={`flex h-6 w-6 items-center justify-center rounded-full text-xs transition-colors duration-500 ${st === "done" || active ? "bg-violet-600 text-white" : "border border-dashed border-zinc-400 text-zinc-500"}`}>{i + 1}</span>
                      {active && <span className="whitespace-nowrap">{VIEW_LABELS[s]}</span>}
                    </button>
                    {i < VIEWS.length - 1 && <span aria-hidden className="h-px min-w-3 flex-1 bg-zinc-300"><span className="block h-px bg-violet-500 transition-all duration-700" style={{ width: st === "done" ? "100%" : "0%" }} /></span>}
                  </li>
                );
              })}
            </ol>
            <button type="button" aria-label="Close" onClick={() => setFocusOpen(false)} className="flex h-8 w-8 shrink-0 items-center justify-center rounded-full text-zinc-500 transition-colors hover:bg-zinc-100 hover:text-zinc-900">
              <svg viewBox="0 0 24 24" className="h-4 w-4" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" aria-hidden><path d="M6 6l12 12M18 6 6 18" /></svg>
            </button>
          </div>
          <StoryBars views={VIEWS} viewing={viewing} ready={viewing !== "report" && Boolean(results[viewing])} follow={follow} finished={viewing === "report"} />

          <div className="grid min-h-0 flex-1 grid-rows-[minmax(0,1fr)] lg:grid-cols-[300px_minmax(0,1fr)]">
            {/* Findings rail */}
            <aside className="demo-scroll hidden min-h-0 flex-col overflow-y-auto border-r border-zinc-200 px-5 py-4 lg:flex" aria-label="Findings">
              <RailStep n={1} step="research" status={status.research}>
                {results.research && (
                  <div className="demo-pop-in">
                    <p className="flex items-center gap-2"><Logo name={brandName} icon={brandIcon} size="h-5 w-5" /><span className="font-semibold">{brandName}</span><span className="truncate text-xs text-zinc-500">{results.research.domain}</span></p>
                    <p className="mt-1.5 line-clamp-4 text-xs leading-relaxed text-zinc-700">{results.research.summary}</p>
                    {results.crawler && (
                      <div className="mt-2 flex flex-wrap gap-1 text-[11px] text-zinc-600">
                        {[results.crawler.facts.founded, results.crawler.facts.location, results.crawler.facts.employees && `${results.crawler.facts.employees} people`].filter(Boolean).map((f) => <span key={String(f)} className="rounded-md border border-zinc-200 px-1.5 py-0.5">{f}</span>)}
                      </div>
                    )}
                  </div>
                )}
              </RailStep>
              {planned("crawler") && <RailStep n={VIEWS.indexOf("crawler") + 1} step="crawler" status={status.crawler}>
                {results.crawler && <p className="demo-pop-in text-xs text-zinc-700"><span className="font-semibold">{results.crawler.score}/100</span> AI readiness · {results.crawler.bots.filter((b) => b.status === "blocked").length} crawlers blocked</p>}
              </RailStep>}
              {planned("competitors") && <RailStep n={VIEWS.indexOf("competitors") + 1} step="competitors" status={status.competitors}>
                {competitorsShown.length > 0 && (
                  <div className="grid grid-cols-2 gap-1.5">
                    {competitorsShown.slice(0, 6).map((c) => (
                      <a key={c.domain} href={`https://${c.domain}`} target="_blank" rel="noopener noreferrer" className="demo-pop-in flex min-w-0 items-center gap-1.5 rounded-lg border border-zinc-200 bg-white px-2 py-1.5 text-xs hover:border-zinc-400">
                        <Logo name={c.domain} icon={c.iconDataUrl} size="h-4 w-4" />
                        <span className="truncate">{c.domain}</span>
                      </a>
                    ))}
                    {competitorsShown.length > 6 && <button type="button" onClick={() => goTo("competitors")} className="col-span-2 text-left text-xs text-zinc-500 hover:text-zinc-900">+{competitorsShown.length - 6} more</button>}
                  </div>
                )}
              </RailStep>}
              {planned("campaigns") && <RailStep n={VIEWS.indexOf("campaigns") + 1} step="campaigns" status={status.campaigns}>
                {results.campaigns?.[0] && <p className="demo-pop-in truncate rounded-lg border border-zinc-900 bg-white px-2.5 py-1.5 text-xs">{results.campaigns[0].name}</p>}
              </RailStep>}
              {planned("companies") && <RailStep n={VIEWS.indexOf("companies") + 1} step="companies" status={status.companies}>
                {companiesShown.length > 0 && (
                  <div className="flex -space-x-1.5">
                    {companiesShown.slice(0, 8).map((c) => <span key={c.domain} className="demo-pop-in" title={c.domain}><Logo name={c.name} icon={c.iconDataUrl} size="h-6 w-6" /></span>)}
                  </div>
                )}
              </RailStep>}
              {planned("local") && <RailStep n={VIEWS.indexOf("local") + 1} step="local" status={status.local}>
                {results.local && <p className="demo-pop-in text-xs text-zinc-700">{results.local.businesses.length} businesses in {results.local.city} from {results.local.provider}</p>}
              </RailStep>}
              {planned("social") && <RailStep n={VIEWS.indexOf("social") + 1} step="social" status={status.social}>
                {socialShown.length > 0 && (
                  <p className="text-xs text-zinc-700">
                    {(["Reddit", "X", "LinkedIn", "Quora"] as const).map((p) => `${socialShown.filter((l) => l.platform === p).length} ${p}`).join(" · ")}
                  </p>
                )}
              </RailStep>}
              {planned("contacts") && <RailStep n={VIEWS.indexOf("contacts") + 1} step="contacts" status={status.contacts}>
                {results.contacts && <p className="demo-pop-in text-xs text-zinc-700">{results.contacts.people.length} decision makers with profiles</p>}
              </RailStep>}
              {planned("pitch") && <RailStep n={VIEWS.indexOf("pitch") + 1} step="pitch" status={status.pitch} />}
              {VIEWS.includes("report") && <RailStep n={VIEWS.length} step="report" status={statusOf("report")} />}
              <div className="mt-3 rounded-xl border border-zinc-200 bg-white p-3">
                <p className="flex items-center gap-2 text-xs font-semibold">
                  {phase === "running" && <span className="h-1.5 w-1.5 animate-pulse rounded-full bg-emerald-500" aria-hidden />}
                  {phase === "running" && runningStep ? `Working on step ${VIEWS.indexOf(runningStep) + 1} of ${VIEWS.length}` : phase === "done" ? (fit && !fit.inSegment ? "Stopped: not a fit yet" : "Run complete") : "Stopped"}
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
                {stats.sources > 0 && <p className="mt-2 border-t border-zinc-100 pt-2 text-[11px] text-zinc-600"><span className="font-semibold tabular-nums">{stats.sources.toLocaleString()}</span> public sources read · {stats.searches} searches</p>}
              </div>
            </aside>

            {/* Stage */}
            <div key={viewing} className="demo-scroll min-h-0 min-w-0 overflow-y-auto px-4 py-5 sm:px-7">
              <div className="demo-story-in">
                <StepHeader views={VIEWS} view={viewing} results={results} streamed={streamed} done={statusOf(viewing) === "done"} readAt={readAt} />
                {viewing === "report" ? (
                  <ResearchReport
                    results={results}
                    action={<ActionButton tone="green" label="Turn this into a pipeline" />}
                    signals={results.social?.leads.length ? <SignalTable leads={results.social.leads} action={() => <ActionButton label="Post this reply" />} /> : null}
                    emails={results.pitch?.length ? <PitchStage drafts={results.pitch} /> : null}
                  />
                ) : (
                  <Stage step={viewing} status={status[viewing]} results={results} streamed={streamed} logs={logs.filter((l) => l.step === viewing)} counters={counters} brandIcon={brandIcon} plan={plan} onRetry={() => { setFocusOpen(false); setPhase("idle"); setInput(""); setPreview(null); }} />
                )}
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
              {!follow && phase === "running" ? (
                <button type="button" onClick={() => { setFollow(true); setViewing(liveStep); }} className="font-semibold text-zinc-900 underline underline-offset-4">Back to the live step</button>
              ) : (
                phase === "done" ? (fit && !fit.inSegment ? "Threadly is built for small digital businesses." : "Run complete. Use the steps above to look back through it.") : "Real public web data. Nothing is stored and nothing is sent."
              )}
            </p>
            <ActionButton tone="green" label={phase === "done" ? "Get leads like these every week" : "Start with Threadly"} />
          </div>
        </div>
        </div>
      )}
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

// Shown instead of the workspace when the owner's daily demo budget is used:
// what the visitor can do next.
function OutOfRuns({ onEligibility }: { onEligibility: () => void }) {
  return (
    <div className="demo-pop-in mx-auto mt-5 max-w-xl rounded-2xl border border-violet-200 bg-white p-5 text-left shadow-sm">
      <p className="font-semibold">The live demo is busy right now</p>
      <p className="mt-1 text-sm text-zinc-600">Give it a few minutes and try again, or check whether your team qualifies for full runs.</p>
      <button type="button" onClick={onEligibility} className="mt-4 rounded-xl bg-violet-600 px-4 py-2 text-sm font-semibold text-white hover:bg-violet-500">Check eligibility</button>
    </div>
  );
}

// Story-style progress: one bar per step. The bar of the step on screen
// fills while its results are shown, then the story moves on.
function StoryBars({ views, viewing, ready, follow, finished }: { views: View[]; viewing: View; ready: boolean; follow: boolean; finished: boolean }) {
  const at = views.indexOf(viewing);
  return (
    <div className="flex gap-1 bg-white/70 px-4 pb-2 sm:px-6" aria-hidden>
      {views.map((s, i) => (
        <span key={s} className="h-1 flex-1 overflow-hidden rounded-full bg-zinc-200">
          {i < at || finished ? (
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

// Sits at the top of every step: where you are and what the step found.
function StepHeader({ views, view, results, streamed, done, readAt }: { views: View[]; view: View; results: DemoResults; streamed: Streamed; done: boolean; readAt: string }) {
  const social = results.social?.leads ?? streamed.social;
  const summary: Record<View, string> = {
    research: results.research?.fit ? (results.research.fit.inSegment ? `${results.research.fit.reason} Decided from ${results.research.fit.sources} public sources.` : `Checked against ${results.research.fit.sources} public sources.`) : results.research ? `Read ${results.research.name}; checking what it is and how big it is.` : "Reading the homepage.",
    crawler: results.crawler ? `${results.crawler.passed} of ${results.crawler.total} checks passed.` : "Checking what AI assistants can read.",
    competitors: `${(results.competitors ?? streamed.competitors).length} competitors, named by independent comparison sources.`,
    campaigns: results.campaigns ? `${results.campaigns.length} audience${results.campaigns.length === 1 ? "" : "s"} to prospect.` : "Choosing who to target.",
    companies: `${(results.companies ?? streamed.companies).length} potential customers, each with the reason it was found.`,
    local: results.local ? `${results.local.businesses.length} local businesses in ${results.local.city} from ${results.local.provider}, ranked by how much they need you.` : "Searching the map for local businesses that need you.",
    social: `${social.filter((l) => l.intent !== "discussing the topic").length} people asking${social.some((l) => l.intent === "discussing the topic") ? `, ${social.filter((l) => l.intent === "discussing the topic").length} related conversations` : ""} on Reddit, X, LinkedIn and Quora.`,
    contacts: results.contacts ? `${results.contacts.people.length} decision makers from company team pages and public profiles, each with a message flow.` : "Reading each company's team page and public profiles.",
    pitch: results.pitch ? `${results.pitch.length} first emails written from each company's own words.` : "Writing first emails.",
    report: "Everything this run found, in one place.",
  };
  return (
    <header className="mb-4">
      <p className="flex items-center gap-1.5 text-xs text-[#6B6A72]">
        {!done && <span className="h-1.5 w-1.5 animate-pulse rounded-full bg-[#5B3DF5]" aria-hidden />}
        Step {views.indexOf(view) + 1} of {views.length}{done ? (readAt ? ` · read live at ${readAt}` : "") : " · working"}
      </p>
      <h3 className="mt-0.5 text-2xl font-medium tracking-tight text-[#111114]">{VIEW_LABELS[view]}</h3>
      <p className="mt-0.5 text-sm text-[#6B6A72]">{summary[view]}</p>
    </header>
  );
}

function RailStep({ n, step, status, children }: { n: number; step: View; status: StepStatus; children?: React.ReactNode }) {
  return (
    <section className={`border-b border-zinc-200 py-2.5 transition-opacity duration-500 ${status === "pending" ? "opacity-40" : ""}`}>
      <p className="font-mono text-[11px] text-zinc-600">
        <span aria-hidden className={status === "done" ? "text-emerald-600" : "text-zinc-400"}>{status === "done" ? "✓" : status === "running" ? "›" : "·"}</span> step {n} · {VIEW_LABELS[step]}
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

function Stage(props: { step: DemoStep; status: StepStatus; results: DemoResults; streamed: Streamed; logs: LogLine[]; counters: { searches: number; pages: number }; brandIcon: string | null; plan: DemoPlan | null; onRetry: () => void }) {
  const { step, status, results, streamed, logs, counters, brandIcon, plan, onRetry } = props;
  // Steps with live items show them as they arrive, before the final result.
  if (step === "competitors" && !results.competitors && streamed.competitors.length) return <CompetitorStage list={streamed.competitors} live summary={results.research} />;
  if (step === "companies" && !results.companies && streamed.companies.length) return <CompanyTable list={streamed.companies} live />;
  if (step === "social" && !results.social && status !== "pending") return <SocialStage leads={streamed.social} topic={null} live logs={logs} />;
  const data = results[step];
  if (!data) return status === "pending" ? <p className="mt-20 text-center text-sm text-zinc-500">Waiting for the previous step.</p> : <LiveCard step={step} logs={logs} counters={counters} />;
  switch (step) {
    case "research": {
      const r = data as DemoResearch;
      if (r.fit && !r.fit.inSegment) return <NotServed name={r.name} fit={r.fit} onRetry={onRetry} />;
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
          {r.category && <p className="mt-4 text-sm"><span className="text-zinc-500">Reads as </span><span className="font-semibold">{r.category}</span></p>}
          {r.keywords.length > 0 && (
            <>
              <p className="mt-6 text-[11px] font-semibold uppercase tracking-wider text-zinc-500">Keywords</p>
              <div className="mt-2 flex flex-wrap gap-1.5">
                {r.keywords.map((k, i) => <span key={k} className="demo-pop-in rounded-lg bg-zinc-100 px-2.5 py-1 text-sm text-zinc-700" style={{ animationDelay: `${i * 70}ms` }}>{k}</span>)}
              </div>
            </>
          )}
          {r.fit && <FitCard fit={r.fit} plan={plan} />}
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
      return (data as DemoCompany[]).length ? <CompanyTable list={data as DemoCompany[]} /> : <p className="mt-16 text-center text-sm text-zinc-600">No matching companies were found for this site.</p>;
    case "social": {
      const s = data as DemoSocial;
      return s.leads.length ? <SignalTable leads={s.leads} action={(reply) => <ActionButton label={reply ? "Post this reply" : "Draft a reply"} />} /> : <p className="mt-16 text-center text-sm text-zinc-600">No recent public posts on this topic.</p>;
    }
    case "contacts":
      return <ContactsStage contacts={data as DemoContacts} />;
    case "local":
      return <LocalStage local={data as DemoLocal} />;
    case "pitch":
      return <PitchStage drafts={data as DemoDraft[]} />;
  }
}

// Decision makers as profiles: picture, name linked to their public profile,
// title, where they were found, and the message flow to send them. People
// come from each company's own team page and from public profiles whose
// headline names the company. Emails are not guessed.
function ContactsStage({ contacts }: { contacts: DemoContacts }) {
  const [open, setOpen] = useState<string | null>(null);
  const byCompany = contacts.companies.map((c) => ({ ...c, people: contacts.people.filter((p) => p.domain === c.domain) }));
  const withPeople = byCompany.filter((c) => c.people.length);
  const without = byCompany.filter((c) => !c.people.length);
  const link = "font-medium text-violet-700 hover:underline";
  return (
    <div className="max-h-[56vh] overflow-auto pr-1 demo-scroll">
      <div className="mb-3 flex flex-wrap items-center gap-1.5 text-xs text-zinc-600">
        <span>Roles searched, by each company's kind:</span>
        {contacts.roles.map((r) => <span key={r} className="rounded-md border border-zinc-200 bg-white px-2 py-0.5 text-zinc-800">{r}</span>)}
      </div>
      <div className="space-y-4">
        {withPeople.map((c) => (
          <section key={c.domain}>
            <p className="mb-2 text-sm font-semibold">{c.name} <span className="font-mono text-xs font-normal text-zinc-500">{c.domain}</span>{c.roles?.length ? <span className="ml-2 text-xs font-normal text-zinc-500">searched: {c.roles.slice(0, 4).join(", ")}</span> : null}</p>
            <ul className="grid gap-2 sm:grid-cols-2">
              {c.people.map((p) => {
                const key = `${c.domain}-${p.name}`;
                const main = p.profileUrl ?? p.xUrl ?? p.source;
                return (
                  <li key={key} className="demo-pop-in rounded-2xl border border-zinc-200 bg-white p-3 shadow-sm">
                    <div className="flex items-start gap-3">
                      <Avatar name={p.name} src={p.photoUrl} size={44} />
                      <div className="min-w-0 flex-1">
                        <p className="flex items-center gap-1.5">
                          {main
                            ? <a href={main} target="_blank" rel="noopener noreferrer" title={`Open ${p.name}'s ${p.profileUrl ? "LinkedIn" : p.xUrl ? "X" : "team page"} profile`} className="truncate font-semibold text-zinc-900 underline decoration-zinc-300 underline-offset-4 hover:text-violet-700 hover:decoration-violet-400">{p.name}</a>
                            : <span className="truncate font-semibold">{p.name}</span>}
                          {p.profileUrl && <a href={p.profileUrl} target="_blank" rel="noopener noreferrer" aria-label={`${p.name} on LinkedIn`} className="shrink-0 rounded px-1 text-[10px] font-bold leading-4" style={{ background: "#0A66C2", color: "#fff" }}>in</a>}
                          {p.xUrl && <a href={p.xUrl} target="_blank" rel="noopener noreferrer" aria-label={`${p.name} on X`} className="shrink-0 rounded px-1 text-[10px] font-bold leading-4" style={{ background: "#111114", color: "#fff" }}>X</a>}
                        </p>
                        <p className="truncate text-xs text-zinc-600">{p.title}</p>
                        <p className="mt-1 text-[11px] text-zinc-500">
                          {p.source ? <a href={p.source} target="_blank" rel="noopener noreferrer" className={link}>Named on their team page</a> : "From a public profile that names the company"}
                        </p>
                        {p.likelyEmail && <p className="mt-0.5 truncate text-[11px] text-zinc-600" title={p.emailBasis ?? ""}><span className="font-medium">{p.likelyEmail}</span> · likely, not verified</p>}
                      </div>
                    </div>
                    {p.sequence && (
                      <button type="button" aria-expanded={open === key} onClick={() => setOpen(open === key ? null : key)} className="mt-3 w-full rounded-lg border border-violet-200 bg-violet-50 px-3 py-1.5 text-xs font-semibold text-violet-800 hover:border-violet-400">
                        {open === key ? "Hide message flow" : "View message flow"}
                      </button>
                    )}
                    {open === key && p.sequence && (
                      <div className="mt-2">
                        <MessageFlow to={p.name.split(/\s+/)[0]} sequence={p.sequence} action={<ActionButton label="Send from your workspace" />} />
                      </div>
                    )}
                  </li>
                );
              })}
            </ul>
          </section>
        ))}
        {!withPeople.length && <p className="text-sm text-zinc-500">No team page or public profile names someone in these roles at the companies in this run.</p>}
        {without.length > 0 && (
          <p className="text-xs text-zinc-500">No team page or matching public profile for {without.map((c) => c.name).join(", ")}.</p>
        )}
      </div>
      <p className="mt-3 text-xs text-zinc-500">People named on each company&apos;s own team page, and public profiles whose headline names the company. Check the profile before reaching out. Emails are never guessed: verified addresses come from a licensed provider in your workspace.</p>
    </div>
  );
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
        {audit.keywords && audit.keywords.checks.length > 0 && <KeywordPanel report={audit.keywords} />}
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
            {live ? <span className="inline-flex items-center gap-1"><span className="h-1.5 w-1.5 animate-pulse rounded-full bg-emerald-500" />{list.length} confirmed so far</span> : `✓ ${list.length} found`}
          </span>
        </p>
        <ul className="mt-3 grid grid-cols-2 gap-2 sm:grid-cols-3">
          {list.map((c, i) => (
            <li key={c.domain} className="demo-logo-in" style={{ animationDelay: live ? "0ms" : `${i * 70}ms` }}>
              <a href={`https://${c.domain}`} target="_blank" rel="noopener noreferrer" title={`${c.description ?? c.domain}${c.sources ? ` · named by ${c.sources} sources` : ""}`} className="flex h-full flex-col items-center gap-2 rounded-xl border border-zinc-200 bg-white px-2 py-3 text-center transition hover:-translate-y-0.5 hover:border-zinc-400 hover:shadow-md">
                <Logo name={c.domain} icon={c.iconDataUrl} size="h-9 w-9" />
                <span className="w-full truncate text-xs font-medium">{c.name && c.name !== c.domain ? c.name : c.domain}</span>
                {c.sources ? <span className="text-[10px] text-zinc-500">{c.sources} source{c.sources === 1 ? "" : "s"}</span> : null}
              </a>
            </li>
          ))}
          {live && <li className="flex items-center justify-center rounded-xl border border-dashed border-zinc-300 px-2 py-3 text-xs"><span className="demo-shimmer">checking more</span></li>}
        </ul>
      </div>
    </div>
  );
}

function SocialStage({ leads, topic, live, logs }: { leads: DemoSocialLead[]; topic: string | null; live: boolean; logs: LogLine[] }) {
  const lanes: Array<DemoSocialLead["platform"]> = ["Reddit", "X", "LinkedIn", "Quora"];
  const current = logs[logs.length - 1]?.text ?? "";
  return (
    <div>
      <div className="flex flex-wrap items-end justify-between gap-2">
        <div>
          <p className="text-sm text-zinc-600">
            {topic ? <>Public posts about <span className="font-semibold text-zinc-900">{topic}</span>, ranked by buying intent.</> : "Searching public posts for people asking for what you sell."} Nothing behind a login is read.
          </p>
        </div>
        {live && current && <p className="max-w-full truncate font-mono text-[11px] text-zinc-500"><span className="mr-1 inline-block h-1.5 w-1.5 animate-pulse rounded-full bg-emerald-500" />{current}</p>}
      </div>
      {!live && leads.length > 0 && (
        <div className="demo-pop-in mt-3 flex flex-wrap items-center justify-between gap-2 rounded-xl border border-zinc-900 bg-white px-4 py-2.5">
          <p className="text-sm"><span className="font-semibold">{leads.filter((l) => l.intent !== "discussing the topic").length} people</span> are asking about what you sell. Reply and track every thread from your workspace.</p>
          <ActionButton tone="green" label="Reach out to all" />
        </div>
      )}
      <div className="mt-4 grid gap-3 md:grid-cols-2 xl:grid-cols-4">
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
                      <Avatar name={l.authorName ?? l.author ?? l.community ?? lane} src={authorPicture(l)} size={20} tone={PLATFORM_TONE[lane]} />
                      {l.profileUrl
                        ? <a href={l.profileUrl} target="_blank" rel="noopener noreferrer" className="truncate font-medium text-violet-700 hover:underline">{l.authorName ?? l.author ?? "author"}</a>
                        : l.community?.startsWith("r/")
                          ? <a href={`https://www.reddit.com/${l.community}/`} target="_blank" rel="noopener noreferrer" className="truncate font-medium text-violet-700 hover:underline">{l.community}</a>
                          : <span className="truncate text-zinc-600">{l.authorName ?? l.author ?? "public post"}</span>}
                      <span className={`ml-auto shrink-0 rounded px-1.5 py-0.5 font-semibold ${l.intent === "discussing the topic" ? "bg-zinc-100 text-zinc-600" : "bg-emerald-50 text-emerald-800"}`}>{l.intent}</span>
                    </p>
                    <a href={l.url} target="_blank" rel="noopener noreferrer" className="mt-1 line-clamp-2 text-sm font-semibold hover:underline">{l.title}</a>
                    {l.snippet && <p className="mt-1 line-clamp-2 text-xs text-zinc-600">{l.snippet}</p>}
                    <p className="mt-1 text-[11px] text-zinc-500">{postLabel(l)}{l.matched?.length ? ` · mentions ${l.matched.slice(0, 2).join(", ")}` : ""}</p>
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

// Shown when the business is not one Threadly serves yet: the reason, with
// the public facts it rests on, instead of leads that would not fit.
function NotServed({ name, fit, onRetry }: { name: string; fit: DemoFit; onRetry: () => void }) {
  return (
    <div className="demo-pop-in mx-auto mt-4 max-w-xl rounded-2xl border border-zinc-200 bg-white p-7 shadow-sm">
      <p className="text-[11px] font-semibold uppercase tracking-wider text-violet-700">Not a fit yet</p>
      <h4 className="mt-1 text-xl font-semibold tracking-tight">We&apos;re starting with small digital businesses</h4>
      <p className="mt-3 text-[15px] leading-relaxed text-zinc-700">
        Threadly is initially serving small digital businesses: software and app makers, agencies, online stores, online courses and other online services, with a team of up to about 200 people. {fit.reason} So this run stops here, rather than finding leads that would not fit {name}.
      </p>
      {fit.facts.length > 0 && (
        <ul className="mt-4 space-y-1.5 rounded-xl bg-zinc-50 p-3 text-sm">
          {fit.facts.slice(0, 5).map((f) => (
            <li key={`${f.label}-${f.value}`} className="flex flex-wrap gap-x-2">
              <span className="font-semibold text-zinc-900">{f.label}</span>
              <span className="text-zinc-700">{f.value}</span>
              <span className="text-zinc-500">· {f.url ? <a href={f.url} target="_blank" rel="noopener noreferrer" className="underline underline-offset-2 hover:text-violet-700">{f.source}</a> : f.source}</span>
            </li>
          ))}
        </ul>
      )}
      <p className="mt-3 text-xs text-zinc-500">Checked against {fit.sources} public sources: the site&apos;s own pages, Wikidata and public company profiles.</p>
      <div className="mt-5 flex flex-wrap gap-2">
        <button type="button" onClick={onRetry} className="rounded-lg px-3 py-1.5 text-xs font-semibold" style={{ background: "#111114", color: "#fff" }}>Try another website</button>
        <ActionButton tone="green" label="Tell us about your business" />
      </div>
    </div>
  );
}

const SELLS_LABEL: Record<string, string> = { businesses: "Businesses", "local businesses": "Local businesses", consumers: "Consumers" };

// What the run concluded about the business, and the plays it chose.
function FitCard({ fit, plan }: { fit: DemoFit; plan: DemoPlan | null }) {
  return (
    <div className="mt-6 border-t border-zinc-100 pt-5">
      <div className="grid grid-cols-2 gap-3 text-sm sm:grid-cols-3">
        <div><p className="text-[11px] font-semibold uppercase tracking-wider text-zinc-500">Business</p><p className="mt-0.5 font-semibold capitalize">{fit.kind}</p></div>
        <div><p className="text-[11px] font-semibold uppercase tracking-wider text-zinc-500">Sells to</p><p className="mt-0.5 font-semibold">{fit.sellsTo.map((s) => SELLS_LABEL[s] ?? s).join(", ")}</p></div>
        <div><p className="text-[11px] font-semibold uppercase tracking-wider text-zinc-500">Team</p><p className="mt-0.5 font-semibold">{fit.team ? fit.team.label : "Small (no public count)"}</p>{fit.team && <p className="text-[11px] text-zinc-500">{fit.team.url ? <a href={fit.team.url} target="_blank" rel="noopener noreferrer" className="hover:underline">{fit.team.source}</a> : fit.team.source}</p>}</div>
      </div>
      {plan && plan.plays.length > 0 && (
        <>
          <p className="mt-5 text-[11px] font-semibold uppercase tracking-wider text-zinc-500">Plan for this business</p>
          <ol className="mt-2 space-y-1.5">
            {plan.plays.map((p, i) => (
              <li key={p.step} className="demo-pop-in flex gap-2 text-sm" style={{ animationDelay: `${i * 80}ms` }}>
                <span className="mt-0.5 flex h-5 w-5 shrink-0 items-center justify-center rounded-full bg-violet-600 text-[11px] font-semibold text-white">{i + 2}</span>
                <span><span className="font-semibold">{VIEW_LABELS[p.step]}</span> <span className="text-zinc-600">{p.why}</span></span>
              </li>
            ))}
          </ol>
        </>
      )}
    </div>
  );
}

// Local businesses from the map that may need what the visitor sells, with
// the listing facts behind each and a first message to send.
function LocalStage({ local }: { local: DemoLocal }) {
  const [open, setOpen] = useState<string | null>(null);
  if (!local.businesses.length) return <p className="mt-16 text-center text-sm text-zinc-600">No listings found for {local.types.join(" or ")} in {local.city}.</p>;
  return (
    <div>
      <div className="max-h-[52vh] overflow-auto rounded-2xl border border-black/[0.08] bg-white demo-scroll">
        <table className="w-full min-w-[620px] border-separate border-spacing-0 text-sm">
          <thead><tr>{["Business", "Why it may need you", "Contact"].map((h) => <th key={h} className="sticky top-0 z-10 bg-white px-4 py-3 text-left text-[11px] font-medium uppercase tracking-[0.08em] text-[#6B6A72]">{h}</th>)}</tr></thead>
          <tbody>
            {local.businesses.map((b, i) => {
              const key = `${b.name}-${i}`;
              return (
                <tr key={key} className="demo-row-in align-top" style={{ animationDelay: `${Math.min(i, 10) * 45}ms` }}>
                  <td className="border-t border-black/[0.06] px-4 py-3">
                    {b.mapsUrl ? <a href={b.mapsUrl} target="_blank" rel="noopener noreferrer" className="font-medium text-[#111114] underline decoration-zinc-300 underline-offset-4 hover:text-[#5B3DF5]">{b.name}</a> : <p className="font-medium">{b.name}</p>}
                    <p className="text-xs text-[#6B6A72]">{[b.category, b.address].filter(Boolean).join(" · ")}</p>
                    {b.rating !== null && <p className="text-xs text-[#4A4950]">{b.rating.toFixed(1)} ★ · {b.reviews ?? 0} reviews</p>}
                    {b.people && b.people.length > 0 && (
                      <ul className="mt-1.5 space-y-0.5 text-xs">
                        {b.people.map((p) => <li key={p.name}>{p.profileUrl ? <a href={p.profileUrl} target="_blank" rel="noopener noreferrer" className="font-medium text-[#5B3DF5] underline decoration-violet-200 underline-offset-2">{p.name}</a> : <span className="font-medium">{p.name}</span>} <span className="text-[#6B6A72]">{p.title}</span></li>)}
                      </ul>
                    )}
                    {b.sequence && (
                      <button type="button" aria-expanded={open === key} onClick={() => setOpen(open === key ? null : key)} className="mt-2 rounded-lg border border-violet-200 bg-violet-50 px-2.5 py-1 text-xs font-semibold text-violet-800 hover:border-violet-400">{open === key ? "Hide message flow" : "View message flow"}</button>
                    )}
                    {open === key && b.sequence && <div className="mt-2"><MessageFlow to={b.name} sequence={b.sequence} action={<ActionButton label="Send from your workspace" />} /></div>}
                  </td>
                  <td className="border-t border-black/[0.06] px-4 py-3"><div className="flex flex-wrap gap-1">{b.needs.map((n) => <span key={n} className="rounded bg-[#EEEBFF] px-1.5 py-0.5 text-xs font-medium text-[#2F1FA8]">{n}</span>)}</div></td>
                  <td className="border-t border-black/[0.06] px-4 py-3 text-xs text-[#4A4950]">
                    {b.phone && <p>{b.phone}</p>}
                    {b.website ? <a href={b.website} target="_blank" rel="noopener noreferrer" className="block max-w-[11rem] truncate text-[#5B3DF5] hover:underline">{b.website.replace(/^https?:\/\/(www\.)?/, "")}</a> : <p className="text-[#6B6A72]">No website listed</p>}
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>
      <p className="mt-3 text-xs text-zinc-500">{local.provider === "OpenStreetMap" ? "Listings © OpenStreetMap contributors. Google Maps listings, with ratings and reviews, appear once your Maps source is connected." : `Listings from ${local.provider}.`} Drafts only: nothing is sent from the demo.</p>
    </div>
  );
}

// Where the site shows up when buyers search for its services, and the
// keywords top pages share that the site does not use yet.
function KeywordPanel({ report }: { report: NonNullable<DemoCrawler["keywords"]> }) {
  const found = report.checks.filter((c) => c.position !== null).length;
  return (
    <div className="mt-5 border-t border-zinc-100 pt-4">
      <p className="text-[11px] font-semibold uppercase tracking-wider text-zinc-500">Your services</p>
      <div className="mt-2 flex flex-wrap gap-1.5">{report.services.map((s) => <span key={s} className="rounded-md bg-zinc-100 px-2 py-0.5 text-xs text-zinc-800">{s}</span>)}</div>
      <p className="mt-4 text-[11px] font-semibold uppercase tracking-wider text-zinc-500">Where you show up · top 20 for {found} of {report.checks.length} buyer searches</p>
      <ul className="mt-2 max-h-48 space-y-1 overflow-auto pr-1 text-xs demo-scroll">
        {report.checks.map((c) => (
          <li key={c.query} className="flex items-center justify-between gap-3 rounded-lg border border-zinc-100 px-2.5 py-1.5">
            <span className="truncate text-zinc-800">&ldquo;{c.query}&rdquo;</span>
            <span className="shrink-0 text-right">
              {c.position !== null ? <span className="font-semibold text-emerald-700">#{c.position}</span> : <span className="text-rose-700">not in top 20</span>}
              {c.leaders.length > 0 && <span className="ml-2 text-zinc-500">top: {c.leaders.slice(0, 2).join(", ")}</span>}
            </span>
          </li>
        ))}
      </ul>
      {report.suggestions.length > 0 && (
        <>
          <p className="mt-4 text-[11px] font-semibold uppercase tracking-wider text-zinc-500">Suggested keywords to add</p>
          <p className="mt-0.5 text-xs text-zinc-500">Phrases the top-ranking pages for these searches use and your homepage does not.</p>
          <div className="mt-2 flex flex-wrap gap-1.5">
            {report.suggestions.map((s) => <span key={s.phrase} title={`Used by ${s.pages} top pages`} className="rounded-md px-2 py-0.5 text-xs font-medium" style={{ background: "#EEEBFF", color: "#2F1FA8" }}>+ {s.phrase} <span className="opacity-60">{s.pages}</span></span>)}
          </div>
        </>
      )}
    </div>
  );
}
