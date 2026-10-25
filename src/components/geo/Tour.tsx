"use client";

import { useCallback, useEffect, useState } from "react";

export const TOUR_KEY = "threadly-tour-v2";

interface Step {
  tab: "overview" | "queries" | "citations" | "runs" | "settings";
  target: string; // data-tour attribute value
  title: string;
  body: string;
}

const STEPS: Step[] = [
  {
    tab: "overview",
    target: "metrics",
    title: "Your AI visibility at a glance",
    body: "Mention rate (how often assistants name your brand), citation share (how often they link your domain), share of voice vs competitors, and average position. Deltas compare against the previous scan.",
  },
  {
    tab: "overview",
    target: "providers",
    title: "One card per AI provider",
    body: "Each assistant is measured separately. Cards marked 'your key' run on an API key you added in Settings; the rest use the platform default.",
  },
  {
    tab: "overview",
    target: "run-scan",
    title: "Run a scan",
    body: "One press asks every configured provider all of your tracked questions, then extracts brand mentions, citations and competitor references from the answers. A scan takes a minute or two.",
  },
  {
    tab: "queries",
    target: "tab-queries",
    title: "Questions your buyers ask",
    body: "This tab holds the questions you track. Add your own or press Suggest to draft them with AI. Click any row to read the full answers and citations per provider.",
  },
  {
    tab: "citations",
    target: "tab-citations",
    title: "Citations leaderboard",
    body: "The domains AI assistants cite for your category - yours, your competitors', and third-party sources. These pages shape what AI says about you.",
  },
  {
    tab: "runs",
    target: "tab-runs",
    title: "Scan history and trends",
    body: "Every scan is stored here with per-provider status. The daily automatic scan (03:00 UTC) keeps building your history so the trend chart fills in over time.",
  },
  {
    tab: "settings",
    target: "tab-settings",
    title: "Settings and provider keys",
    body: "Update your brand and competitors here, and add your own AI provider keys - for the built-in providers or any custom OpenAI-compatible endpoint. Keys are encrypted at rest.",
  },
];

interface Props {
  onNavigate: (tab: Step["tab"]) => void;
  onDone: () => void;
}

interface Rect {
  top: number;
  left: number;
  width: number;
  height: number;
}

export default function Tour({ onNavigate, onDone }: Props) {
  const [step, setStep] = useState(0);
  const [rect, setRect] = useState<Rect | null>(null);
  const last = step === STEPS.length - 1;

  const finish = useCallback(() => {
    try {
      window.localStorage.setItem(TOUR_KEY, "done");
    } catch {
      // storage unavailable - still dismiss
    }
    onNavigate("overview");
    onDone();
  }, [onDone, onNavigate]);

  useEffect(() => {
    const current = STEPS[step];
    onNavigate(current.tab);
    let cancelled = false;
    let attempts = 0;
    const locate = () => {
      if (cancelled) return;
      const el = document.querySelector(`[data-tour="${current.target}"]`);
      if (el) {
        el.scrollIntoView({ block: "center", behavior: "instant" as ScrollBehavior });
        const r = el.getBoundingClientRect();
        setRect({ top: r.top, left: r.left, width: r.width, height: r.height });
      } else if (attempts < 20) {
        attempts += 1;
        setTimeout(locate, 150);
      }
    };
    const timer = setTimeout(locate, 120);
    const onResize = () => locate();
    window.addEventListener("resize", onResize);
    return () => {
      cancelled = true;
      clearTimeout(timer);
      window.removeEventListener("resize", onResize);
    };
  }, [step, onNavigate]);

  const current = STEPS[step];
  const pad = 8;
  const spot = rect
    ? {
        top: rect.top - pad,
        left: rect.left - pad,
        width: rect.width + pad * 2,
        height: rect.height + pad * 2,
      }
    : null;

  // Tooltip placement: below the spotlight when it fits, otherwise above.
  const viewportH = typeof window === "undefined" ? 800 : window.innerHeight;
  const tooltipBelow = spot ? spot.top + spot.height + 16 + 220 < viewportH : true;
  const tooltipStyle: React.CSSProperties = spot
    ? {
        top: tooltipBelow ? spot.top + spot.height + 16 : Math.max(16, spot.top - 236),
        left: Math.max(16, Math.min(spot.left, (typeof window === "undefined" ? 1200 : window.innerWidth) - 440)),
      }
    : { top: "50%", left: "50%", transform: "translate(-50%, -50%)" };

  return (
    <div className="fixed inset-0 z-50">
      <div className="absolute inset-0 bg-black/60" onClick={finish} />
      {spot && (
        <div
          className="pointer-events-none absolute rounded-xl border-2 border-violet-400 shadow-[0_0_0_9999px_rgba(0,0,0,0.6)]"
          style={{ top: spot.top, left: spot.left, width: spot.width, height: spot.height }}
        />
      )}
      <div
        className="absolute w-[min(26rem,calc(100vw-2rem))] rounded-2xl border border-white/10 bg-zinc-900 p-5 shadow-2xl"
        style={tooltipStyle}
      >
        <div className="flex items-center justify-between">
          <p className="text-xs font-medium uppercase tracking-wide text-violet-300">
            Product tour · {step + 1} of {STEPS.length}
          </p>
          <button type="button" onClick={finish} className="text-xs text-zinc-500 transition hover:text-zinc-300">
            Skip
          </button>
        </div>
        <div className="mt-1.5 flex gap-1">
          {STEPS.map((_, index) => (
            <span key={index} className={`h-1 flex-1 rounded-full ${index <= step ? "bg-violet-400" : "bg-white/10"}`} />
          ))}
        </div>
        <h3 className="mt-3 text-base font-semibold text-white">{current.title}</h3>
        <p className="mt-1.5 text-sm leading-relaxed text-zinc-400">{current.body}</p>
        <div className="mt-5 flex justify-between">
          <button
            type="button"
            disabled={step === 0}
            onClick={() => setStep(step - 1)}
            className="rounded-lg border border-white/15 px-4 py-2 text-sm text-zinc-300 transition hover:bg-white/5 disabled:opacity-40"
          >
            Back
          </button>
          {last ? (
            <button
              type="button"
              onClick={finish}
              className="rounded-lg bg-violet-500 px-5 py-2 text-sm font-semibold text-white transition hover:bg-violet-400"
            >
              Done
            </button>
          ) : (
            <button
              type="button"
              onClick={() => setStep(step + 1)}
              className="rounded-lg bg-violet-500 px-5 py-2 text-sm font-semibold text-white transition hover:bg-violet-400"
            >
              Next
            </button>
          )}
        </div>
      </div>
    </div>
  );
}
