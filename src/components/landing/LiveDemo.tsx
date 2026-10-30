"use client";

import Link from "next/link";
import { useCallback, useEffect, useRef, useState } from "react";
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
  type DemoSignals,
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

// Typical duration of each step, used only to pace the story bar while a step
// is running; the bar completes when the step actually finishes.
const EXPECTED_MS: Record<DemoStep, number> = { research: 4000, competitors: 22000, campaigns: 1500, companies: 14000, signals: 9000, contacts: 1200, pitch: 1200 };
const MIN_DWELL_MS = 2200;

function normalizeDomain(input: string): string | null {
  const host = input.trim().toLowerCase().replace(/^https?:\/\//, "").replace(/^www\./, "").replace(/[/?#].*$/, "");
  return /^[a-z0-9-]+(\.[a-z0-9-]+)*\.[a-z]{2,}$/.test(host) ? host : null;
}

function SiteIcon({ name, icon, size = "h-9 w-9" }: { name: string; icon: string | null; size?: string }) {
  if (icon) {
    // eslint-disable-next-line
    return <img src={icon} alt="" className={`${size} shrink-0 rounded-lg border border-zinc-200 bg-white object-contain p-1`} />;
  }
  return (
    <span aria-hidden className={`${size} flex shrink-0 items-center justify-center rounded-lg bg-indigo-50 text-sm font-semibold text-indigo-700`}>
      {name.charAt(0).toUpperCase()}
    </span>
  );
}

export default function LiveDemo() {
  const [input, setInput] = useState("");
  const [audience, setAudience] = useState("");
  const [preview, setPreview] = useState<Preview | null>(null);
  const [previewState, setPreviewState] = useState<"none" | "loading" | "ready" | "error">("none");
  const [previewError, setPreviewError] = useState("");
  const [phase, setPhase] = useState<Phase>("idle");
  const [status, setStatus] = useState<Record<DemoStep, StepStatus>>(() => Object.fromEntries(DEMO_STEPS.map((s) => [s, "pending"])) as Record<DemoStep, StepStatus>);
  const [results, setResults] = useState<DemoResults>({});
  const [logs, setLogs] = useState<string[]>([]);
  const [viewing, setViewing] = useState<DemoStep>("research");
  const [follow, setFollowState] = useState(true);
  const followRef = useRef(true);
  const setFollow = useCallback((value: boolean) => {
    followRef.current = value;
    setFollowState(value);
  }, []);
  const [error, setError] = useState("");
  const [runDomain, setRunDomain] = useState("");
  const lastSwitch = useRef(0);
  const pendingView = useRef<ReturnType<typeof setTimeout> | null>(null);
  const abortRef = useRef<AbortController | null>(null);
  const startedAt = useRef<Partial<Record<DemoStep, number>>>({});

  // Type-ahead preview: the site's name and icon while the visitor types.
  useEffect(() => {
    const domain = normalizeDomain(input);
    if (!domain || phase === "running") {
      if (!domain) setPreviewState("none");
      return;
    }
    if (preview?.domain === domain) return;
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
    }, 450);
    return () => {
      clearTimeout(timer);
      controller.abort();
    };
  }, [input, phase, preview?.domain]);

  useEffect(() => () => abortRef.current?.abort(), []);

  // Move the story to a step, keeping each finished step on screen long
  // enough to read before the next one takes over.
  const showStep = useCallback((step: DemoStep) => {
    if (pendingView.current) clearTimeout(pendingView.current);
    const wait = Math.max(0, lastSwitch.current + MIN_DWELL_MS - Date.now());
    pendingView.current = setTimeout(() => {
      setViewing(step);
      lastSwitch.current = Date.now();
    }, wait);
  }, []);

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
    startedAt.current = {};
    setStatus(Object.fromEntries(DEMO_STEPS.map((s) => [s, "pending"])) as Record<DemoStep, StepStatus>);
    document.getElementById("live-demo")?.scrollIntoView({ behavior: "smooth", block: "start" });

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
            startedAt.current[event.step] = Date.now();
            setStatus((prev) => {
              const next = { ...prev };
              for (const s of DEMO_STEPS) if (next[s] === "running") next[s] = "done";
              next[event.step] = "running";
              return next;
            });
            setLogs([]);
            if (followRef.current) showStep(event.step);
          } else if (event.type === "log") {
            setLogs((prev) => [...prev.slice(-3), event.text.trim()]);
          } else if (event.type === "result") {
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

  function reset() {
    abortRef.current?.abort();
    setPhase("idle");
    setResults({});
    setLogs([]);
    setError("");
  }

  const active = phase !== "idle";
  const viewIndex = DEMO_STEPS.indexOf(viewing);
  const goTo = (i: number) => {
    const step = DEMO_STEPS[Math.max(0, Math.min(DEMO_STEPS.length - 1, i))];
    if (status[step] === "pending") return;
    if (pendingView.current) clearTimeout(pendingView.current);
    setFollow(false);
    setViewing(step);
  };
  const runningStep = DEMO_STEPS.find((s) => status[s] === "running");

  return (
    <div id="live-demo" className="mx-auto w-full max-w-3xl scroll-mt-24">
      {!active && (
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
            <div className="mt-2 rounded-xl border border-zinc-200 bg-white/95 p-2 text-left shadow-sm backdrop-blur" aria-live="polite">
              {previewState === "loading" && <p className="px-2 py-1.5 text-sm text-zinc-500">Looking up {normalizeDomain(input)}...</p>}
              {previewState === "error" && <p className="px-2 py-1.5 text-sm text-rose-700">{previewError}</p>}
              {previewState === "ready" && preview && (
                <button type="submit" className="flex w-full items-center gap-3 rounded-lg px-2 py-1.5 text-left transition hover:bg-zinc-50">
                  <SiteIcon name={preview.name} icon={preview.iconDataUrl} size="h-7 w-7" />
                  <span className="min-w-0 flex-1">
                    <span className="block truncate text-sm font-semibold text-zinc-900">{preview.name} <span className="font-normal text-zinc-500">{preview.domain}</span></span>
                    {preview.category && <span className="block truncate text-xs text-zinc-500">{preview.category}</span>}
                  </span>
                  <span className="shrink-0 text-xs font-semibold text-indigo-700">Run research</span>
                </button>
              )}
              {previewState === "ready" && (
                <label className="mt-1 flex items-center gap-2 border-t border-zinc-100 px-2 pt-2 text-xs text-zinc-500">
                  <span className="shrink-0">Who do you sell to?</span>
                  <input
                    value={audience}
                    maxLength={60}
                    onChange={(e) => setAudience(e.target.value)}
                    placeholder="Optional, e.g. B2B SaaS startups"
                    className="min-w-0 flex-1 rounded-md border border-zinc-200 bg-white px-2 py-1 text-xs text-zinc-900 placeholder-zinc-400 focus:border-indigo-400 focus:outline-none"
                  />
                </label>
              )}
            </div>
          )}
        </form>
      )}

      {active && (
        <div className="overflow-hidden rounded-3xl border border-white/70 bg-white/80 text-left shadow-[0_30px_80px_-30px_rgba(30,27,75,0.45)] backdrop-blur-xl">
          {/* Story bar */}
          <div className="flex gap-1.5 px-5 pt-5" role="tablist" aria-label="Demo steps">
            {DEMO_STEPS.map((s, i) => (
              <button
                key={s}
                type="button"
                role="tab"
                aria-selected={viewing === s}
                aria-label={`${i + 1}. ${DEMO_STEP_LABELS[s]} (${status[s]})`}
                disabled={status[s] === "pending"}
                onClick={() => goTo(i)}
                className="group h-6 flex-1 cursor-pointer disabled:cursor-default"
              >
                <span className="block h-1 overflow-hidden rounded-full bg-zinc-200">
                  <span
                    className={`block h-full rounded-full ${viewing === s ? "bg-indigo-600" : "bg-zinc-800"}`}
                    style={
                      status[s] === "done"
                        ? { width: "100%", transition: "width 300ms ease" }
                        : status[s] === "running"
                          ? { width: "92%", transition: `width ${EXPECTED_MS[s]}ms cubic-bezier(0.2, 0.6, 0.3, 1)` }
                          : { width: "0%" }
                    }
                  />
                </span>
              </button>
            ))}
          </div>

          <div className="flex items-center justify-between gap-3 px-5 pt-1">
            <div className="flex min-w-0 items-center gap-2.5">
              <SiteIcon name={results.research?.name ?? preview?.name ?? runDomain} icon={results.research?.iconDataUrl ?? preview?.iconDataUrl ?? null} size="h-7 w-7" />
              <div className="min-w-0">
                <p className="truncate text-sm font-semibold text-zinc-900">{results.research?.name ?? preview?.name ?? runDomain}</p>
                <p className="truncate text-xs text-zinc-500">Step {viewIndex + 1} of {DEMO_STEPS.length} · {DEMO_STEP_LABELS[viewing]}</p>
              </div>
            </div>
            <div className="flex shrink-0 items-center gap-1.5">
              {!follow && phase === "running" && (
                <button type="button" onClick={() => { setFollow(true); if (runningStep) setViewing(runningStep); }} className="rounded-lg px-2.5 py-1.5 text-xs font-semibold text-indigo-700 hover:bg-indigo-50">
                  Follow live
                </button>
              )}
              <button type="button" aria-label="Previous step" onClick={() => goTo(viewIndex - 1)} disabled={viewIndex === 0} className="rounded-lg border border-zinc-200 px-2.5 py-1.5 text-xs text-zinc-700 hover:bg-zinc-50 disabled:opacity-40">Prev</button>
              <button type="button" aria-label="Next step" onClick={() => goTo(viewIndex + 1)} disabled={viewIndex === DEMO_STEPS.length - 1 || status[DEMO_STEPS[viewIndex + 1]] === "pending"} className="rounded-lg border border-zinc-200 px-2.5 py-1.5 text-xs text-zinc-700 hover:bg-zinc-50 disabled:opacity-40">Next</button>
            </div>
          </div>

          {/* Step card */}
          <div key={viewing} className="demo-card-in min-h-[360px] px-5 pb-4 pt-4">
            <StepView step={viewing} status={status[viewing]} results={results} logs={viewing === runningStep ? logs : []} />
          </div>

          {/* Live activity */}
          <div className="flex items-center gap-2 border-t border-zinc-100 bg-zinc-50/80 px-5 py-2.5 font-mono text-[11px] text-zinc-600" aria-live="polite">
            {phase === "running" && <span className="h-1.5 w-1.5 shrink-0 animate-pulse rounded-full bg-emerald-500" aria-hidden />}
            <span className="truncate">
              {phase === "running"
                ? `${runningStep ? DEMO_STEP_LABELS[runningStep] : "Starting"}: ${logs[logs.length - 1] ?? "starting..."}`
                : phase === "done"
                  ? "Done. Every result above links to the page or search it came from."
                  : error}
            </span>
          </div>

          {(phase === "done" || phase === "error") && (
            <div className="flex flex-wrap items-center justify-between gap-3 border-t border-zinc-100 px-5 py-4">
              <p className="text-sm text-zinc-600">
                {phase === "done" ? "Save these companies, add licensed decision-maker data and approve sending in your workspace." : "Try another website, or run it in your own workspace."}
              </p>
              <div className="flex gap-2">
                <button type="button" onClick={reset} className="rounded-xl border border-zinc-200 px-4 py-2 text-sm font-semibold text-zinc-800 hover:bg-zinc-50">Try another site</button>
                <Link href="/portal" className="rounded-xl bg-indigo-600 px-4 py-2 text-sm font-semibold text-white hover:bg-indigo-500">Open my workspace</Link>
              </div>
            </div>
          )}
        </div>
      )}
    </div>
  );
}

function Skeleton({ logs }: { logs: string[] }) {
  return (
    <div className="space-y-3">
      <div className="space-y-2">
        {[0, 1, 2].map((i) => <div key={i} className="h-12 animate-pulse rounded-xl bg-zinc-100" style={{ animationDelay: `${i * 120}ms` }} />)}
      </div>
      <ul className="space-y-1 font-mono text-[11px] text-zinc-500">
        {logs.map((l, i) => <li key={i} className="demo-line-in truncate">{l}</li>)}
      </ul>
    </div>
  );
}

function StepView({ step, status, results, logs }: { step: DemoStep; status: StepStatus; results: DemoResults; logs: string[] }) {
  const data = results[step];
  if (!data) return status === "pending" ? <p className="text-sm text-zinc-500">Waiting for the previous step.</p> : <Skeleton logs={logs} />;
  switch (step) {
    case "research": {
      const r = data as DemoResearch;
      return (
        <div className="space-y-4">
          <div className="flex items-center gap-3">
            <SiteIcon name={r.name} icon={r.iconDataUrl} size="h-12 w-12" />
            <div>
              <p className="text-lg font-semibold text-zinc-900">{r.name}</p>
              <a href={`https://${r.domain}`} target="_blank" rel="noopener noreferrer" className="text-sm text-zinc-500 hover:underline">{r.domain}</a>
            </div>
            <span className="ml-auto rounded-md border border-emerald-200 bg-emerald-50 px-2 py-1 text-xs font-semibold text-emerald-800">{r.readHomepage ? "Homepage read" : "Profile only"}</span>
          </div>
          <p className="text-[15px] leading-relaxed text-zinc-700">{r.summary}</p>
          {r.keywords.length > 0 && (
            <div>
              <p className="text-[11px] font-semibold uppercase tracking-wider text-zinc-500">Keywords from the homepage</p>
              <div className="mt-2 flex flex-wrap gap-1.5">
                {r.keywords.map((k, i) => <span key={k} className="demo-pop-in rounded-lg bg-zinc-100 px-2.5 py-1 text-sm text-zinc-700" style={{ animationDelay: `${i * 70}ms` }}>{k}</span>)}
              </div>
            </div>
          )}
        </div>
      );
    }
    case "competitors": {
      const list = data as DemoCompany[];
      if (!list.length) return <p className="text-sm text-zinc-600">No competitors could be confirmed from public pages for this site.</p>;
      return (
        <div>
          <p className="mb-3 text-sm text-zinc-600"><span className="font-semibold text-zinc-900">{list.length} competitors</span> found from web searches and comparison articles, each checked against its own homepage.</p>
          <ul className="grid gap-2 sm:grid-cols-2">
            {list.map((c, i) => (
              <li key={c.domain} className="demo-pop-in rounded-xl border border-zinc-200 bg-white px-3 py-2" style={{ animationDelay: `${i * 60}ms` }}>
                <a href={`https://${c.domain}`} target="_blank" rel="noopener noreferrer" className="text-sm font-semibold text-zinc-900 hover:underline">{c.domain}</a>
                {c.description && <p className="line-clamp-2 text-xs text-zinc-500">{c.description}</p>}
              </li>
            ))}
          </ul>
        </div>
      );
    }
    case "campaigns": {
      const list = data as DemoCampaign[];
      return (
        <div className="grid gap-3 sm:grid-cols-2">
          {list.map((c, i) => (
            <div key={c.name} className={`demo-pop-in rounded-xl border p-4 ${c.selected ? "border-indigo-300 bg-indigo-50/60" : "border-zinc-200 bg-white opacity-70"}`} style={{ animationDelay: `${i * 90}ms` }}>
              <div className="flex items-center justify-between gap-2">
                <p className="font-semibold text-zinc-900">{c.name}</p>
                {c.selected && <span className="text-[11px] font-semibold text-indigo-700">Used in this demo</span>}
              </div>
              <p className="mt-1 text-sm text-zinc-600">{c.description}</p>
              <p className="mt-2 text-xs text-zinc-500">Search: <span className="text-zinc-700">{c.searchQuery}</span></p>
              <div className="mt-2 flex flex-wrap gap-1">{c.roles.map((r) => <span key={r} className="rounded-md bg-white px-2 py-0.5 text-xs text-zinc-600 ring-1 ring-zinc-200">{r}</span>)}</div>
            </div>
          ))}
        </div>
      );
    }
    case "companies": {
      const list = data as DemoCompany[];
      if (!list.length) return <p className="text-sm text-zinc-600">No matching companies were found for this campaign. Try describing who you sell to.</p>;
      return (
        <ul className="divide-y divide-zinc-100 overflow-hidden rounded-xl border border-zinc-200 bg-white">
          {list.map((c, i) => (
            <li key={c.domain} className="demo-pop-in flex items-start gap-3 px-3 py-2.5" style={{ animationDelay: `${i * 70}ms` }}>
              <span aria-hidden className="mt-0.5 flex h-7 w-7 shrink-0 items-center justify-center rounded-md bg-zinc-100 text-xs font-semibold text-zinc-700">{c.name.charAt(0)}</span>
              <div className="min-w-0 flex-1">
                <p className="text-sm font-semibold text-zinc-900">{c.name} <a href={`https://${c.domain}`} target="_blank" rel="noopener noreferrer" className="font-mono text-xs font-normal text-zinc-500 hover:underline">{c.domain}</a></p>
                <p className="line-clamp-2 text-xs text-zinc-600">{c.description ?? "No description on the homepage."}</p>
              </div>
            </li>
          ))}
        </ul>
      );
    }
    case "signals": {
      const s = data as DemoSignals;
      return (
        <div>
          <p className="mb-3 text-sm text-zinc-600">Public posts about <span className="font-semibold text-zinc-900">{s.topic}</span>, as indexed by search. Nothing behind a login is read.</p>
          {s.posts.length === 0 ? (
            <p className="text-sm text-zinc-500">No public posts were found for this topic.</p>
          ) : (
            <ul className="space-y-2">
              {s.posts.map((p, i) => (
                <li key={p.url} className="demo-pop-in rounded-xl border border-zinc-200 bg-white px-3 py-2" style={{ animationDelay: `${i * 70}ms` }}>
                  <p className="text-xs font-semibold text-indigo-700">{p.platform}</p>
                  <a href={p.url} target="_blank" rel="noopener noreferrer" className="line-clamp-1 text-sm font-medium text-zinc-900 hover:underline">{p.title}</a>
                  {p.snippet && <p className="line-clamp-2 text-xs text-zinc-600">{p.snippet}</p>}
                </li>
              ))}
            </ul>
          )}
        </div>
      );
    }
    case "contacts": {
      const c = data as DemoContacts;
      return (
        <div className="rounded-xl border border-zinc-200 bg-gradient-to-br from-white to-indigo-50/60 p-5">
          <p className="font-semibold text-zinc-900">Who to contact</p>
          <p className="mt-1 text-sm text-zinc-600">
            In your workspace, Threadly looks up people in these roles{c.companies.length ? ` at ${c.companies.slice(0, 3).join(", ")}` : ""} through a licensed contact data provider, with a record of where each contact came from. It does not scrape profiles or guess addresses.
          </p>
          <div className="mt-3 flex flex-wrap gap-1.5">{c.roles.map((r) => <span key={r} className="rounded-lg bg-white px-2.5 py-1 text-sm text-zinc-700 ring-1 ring-zinc-200">{r}</span>)}</div>
        </div>
      );
    }
    case "pitch":
      return <Pitch drafts={data as DemoDraft[]} />;
  }
}

function Pitch({ drafts }: { drafts: DemoDraft[] }) {
  const [i, setI] = useState(0);
  const d = drafts[i];
  if (!d) return <p className="text-sm text-zinc-600">No companies to write to yet.</p>;
  return (
    <div className="space-y-3">
      {drafts.length > 1 && (
        <div className="flex flex-wrap gap-1.5">
          {drafts.map((x, j) => (
            <button key={x.domain} type="button" onClick={() => setI(j)} className={`rounded-lg px-2.5 py-1 text-xs font-semibold ${j === i ? "bg-zinc-900 text-white" : "bg-zinc-100 text-zinc-700 hover:bg-zinc-200"}`}>
              {x.company}
            </button>
          ))}
        </div>
      )}
      <div className="rounded-xl border border-zinc-200 bg-white">
        <p className="border-b border-zinc-100 px-4 py-2 text-sm text-zinc-500">To <span className="text-zinc-400">a decision maker at {d.company}</span></p>
        <p className="border-b border-zinc-100 px-4 py-2 text-sm"><span className="text-zinc-500">Subject </span><span className="font-semibold text-zinc-900">{d.subject}</span></p>
        <pre className="demo-type-in whitespace-pre-wrap px-4 py-3 font-sans text-sm leading-relaxed text-zinc-800">{d.body}</pre>
      </div>
      {d.sources.length > 0 && (
        <p className="text-xs text-zinc-500">Sources: {d.sources.map((s, j) => <a key={s} href={s} target="_blank" rel="noopener noreferrer" className="hover:underline">{j ? ", " : ""}{s.replace(/^https?:\/\//, "")}</a>)}</p>
      )}
    </div>
  );
}
