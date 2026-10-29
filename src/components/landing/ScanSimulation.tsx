"use client";

import { useEffect, useState } from "react";

// Animated product mock for the landing hero: a scripted GEO scan of one buyer
// question across the three providers. Everything is a pure function of elapsed
// time so the loop is deterministic and cheap to re-render.

const QUESTION = "What is the best async video tool for remote teams?";
const BRAND = "Loomify";
const LOOP_MS = 15500;

const PROVIDERS = [
  {
    name: "ChatGPT",
    start: 1500,
    cps: 9, // ms per character
    answer:
      "For async video, Loom is the default pick for most teams. Loomify is a newer entrant with AI chapters and multilingual captions - strong for distributed support teams.",
    position: 2,
    cited: true,
    citations: ["loom.com", "loomify.io"],
  },
  {
    name: "Claude",
    start: 1900,
    cps: 9,
    answer:
      "Loom leads on ease of sharing. Loomify stands out for AI chaptering, turning raw walkthroughs into labelled demos automatically.",
    position: 1,
    cited: false,
    citations: ["loom.com", "g2.com"],
  },
  {
    name: "Gemini",
    start: 2300,
    cps: 9,
    answer:
      "Top picks include Loom, Vidyard and Loomify. Loomify undercuts on per-seat pricing and includes AI captions in 30+ languages.",
    position: 2,
    cited: true,
    citations: ["loomify.io", "vidyard.com"],
  },
];

const METRICS = [
  { label: "Mention rate", value: 75, suffix: "%", decimals: 0 },
  { label: "Citation share", value: 41, suffix: "%", decimals: 0 },
  { label: "Share of voice", value: 38, suffix: "%", decimals: 0 },
  { label: "Avg position", value: 2.1, suffix: "", decimals: 1 },
];

const METRICS_START = 7600;
const METRICS_DONE = 8900;
const FADE_START = 14400;

function typedCount(start: number, cps: number, text: string, t: number) {
  if (t < start) return 0;
  return Math.min(text.length, Math.floor((t - start) / cps));
}

// Wrap visible occurrences of the brand name in a highlight span.
function Highlighted({ text }: { text: string }) {
  const parts = text.split(BRAND);
  if (parts.length === 1) return <>{text}</>;
  return (
    <>
      {parts.map((part, i) => (
        <span key={i}>
          {part}
          {i < parts.length - 1 && (
            <mark className="rounded bg-violet-500/25 px-1 py-0.5 font-medium text-violet-200">{BRAND}</mark>
          )}
        </span>
      ))}
    </>
  );
}

export default function ScanSimulation() {
  const [t, setT] = useState(0);
  const [reduced, setReduced] = useState(false);

  useEffect(() => {
    if (typeof window !== "undefined" && window.matchMedia("(prefers-reduced-motion: reduce)").matches) {
      setReduced(true);
      return;
    }
    let raf = 0;
    const t0 = performance.now();
    const tick = (now: number) => {
      setT((now - t0) % LOOP_MS);
      raf = requestAnimationFrame(tick);
    };
    raf = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(raf);
  }, []);

  // Reduced motion: show the finished state, no animation.
  const time = reduced ? METRICS_DONE : t;
  const questionChars = reduced ? QUESTION.length : Math.min(QUESTION.length, Math.floor(Math.max(0, time - 300) / 28));
  const metricProgress = reduced ? 1 : Math.min(1, Math.max(0, (time - METRICS_START) / (METRICS_DONE - METRICS_START)));
  const eased = 1 - Math.pow(1 - metricProgress, 3);
  const opacity = reduced ? 1 : time < FADE_START ? 1 : Math.max(0, 1 - (time - FADE_START) / (LOOP_MS - FADE_START));

  return (
    <div
      className="relative overflow-hidden rounded-2xl border border-white/10 bg-zinc-950/90 shadow-[0_0_80px_-20px_rgba(124,58,237,0.35)]"
      style={{ opacity }}
      aria-hidden="true"
    >
      {/* window chrome */}
      <div className="flex items-center gap-2 border-b border-white/10 px-4 py-2.5">
        <span className="h-2.5 w-2.5 rounded-full bg-zinc-700" />
        <span className="h-2.5 w-2.5 rounded-full bg-zinc-700" />
        <span className="h-2.5 w-2.5 rounded-full bg-zinc-700" />
        <span className="ml-2 font-mono text-[11px] text-zinc-500">sample scan · fictional brand · 3 providers</span>
        <span className="ml-auto flex items-center gap-1.5 font-mono text-[11px] text-emerald-400">
          <span className="h-1.5 w-1.5 animate-pulse rounded-full bg-emerald-400" />
          live
        </span>
      </div>

      <div className="p-4 sm:p-5">
        {/* question - invisible full text reserves the final height so the
            panel never grows while the question types in */}
        <p className="relative mb-4 font-mono text-[13px] leading-relaxed text-zinc-300">
          <span className="invisible" aria-hidden="true">
            <span className="mr-2">?</span>
            {QUESTION}
          </span>
          <span className="absolute inset-0">
            <span className="mr-2 text-violet-400">?</span>
            {QUESTION.slice(0, questionChars)}
            {questionChars < QUESTION.length && <span className="animate-pulse text-violet-400">▍</span>}
          </span>
        </p>

        {/* provider answers */}
        <div className="grid gap-3 sm:grid-cols-2">
          {PROVIDERS.map((p) => {
            const chars = typedCount(p.start, p.cps, p.answer, time);
            const done = chars >= p.answer.length;
            const started = chars > 0;
            return (
              <div key={p.name} className="relative rounded-xl border border-white/10 bg-white/[0.03] p-3">
                {/* invisible completed-state copy reserves the card's final
                    size, so typing never changes the panel height */}
                <div className="invisible" aria-hidden="true">
                  <div className="mb-1.5 flex items-center justify-between">
                    <span className="text-xs font-semibold">{p.name}</span>
                    <span className="rounded-full border px-2 py-0.5 font-mono text-[10px]">
                      mentioned · #{p.position}
                    </span>
                  </div>
                  <p className="text-[12px] leading-relaxed">
                    <Highlighted text={p.answer} />
                  </p>
                  <div className="mt-2 flex flex-wrap gap-1.5">
                    {p.citations.map((c) => (
                      <span key={c} className="rounded border px-1.5 py-0.5 font-mono text-[10px]">
                        {c}
                      </span>
                    ))}
                  </div>
                </div>
                <div className="absolute inset-0 p-3">
                <div className="mb-1.5 flex items-center justify-between">
                  <span className="text-xs font-semibold text-zinc-200">{p.name}</span>
                  {done ? (
                    <span className="rounded-full border border-violet-400/40 bg-violet-500/15 px-2 py-0.5 font-mono text-[10px] text-violet-300">
                      mentioned · #{p.position}
                    </span>
                  ) : started ? (
                    <span className="flex items-center gap-1 font-mono text-[10px] text-zinc-500">
                      <span className="h-1.5 w-1.5 animate-pulse rounded-full bg-violet-400" />
                      answering
                    </span>
                  ) : (
                    <span className="font-mono text-[10px] text-zinc-600">queued</span>
                  )}
                </div>
                <p className="text-[12px] leading-relaxed text-zinc-400">
                  <Highlighted text={p.answer.slice(0, chars)} />
                </p>
                {done && (
                  <div className="mt-2 flex flex-wrap gap-1.5">
                    {p.citations.map((c) => (
                      <span
                        key={c}
                        className={`rounded border px-1.5 py-0.5 font-mono text-[10px] ${
                          c.includes("loomify")
                            ? "border-violet-400/40 bg-violet-500/15 text-violet-300"
                            : "border-white/10 text-zinc-500"
                        }`}
                      >
                        {c}
                      </span>
                    ))}
                  </div>
                )}
                </div>
              </div>
            );
          })}
        </div>

        {/* metrics strip */}
        <div className="mt-4 grid grid-cols-2 gap-3 border-t border-white/10 pt-4 sm:grid-cols-4">
          {METRICS.map((m) => {
            const v = m.value * eased;
            return (
              <div key={m.label}>
                <p className="font-mono text-xl font-semibold text-white">
                  {v.toFixed(m.decimals)}
                  <span className="text-violet-400">{m.suffix}</span>
                </p>
                <p className="mt-0.5 text-[11px] text-zinc-500">{m.label}</p>
              </div>
            );
          })}
        </div>
      </div>

      {/* loop progress */}
      <div className="h-0.5 w-full bg-white/5">
        <div className="h-full bg-violet-500/60" style={{ width: `${(time / LOOP_MS) * 100}%` }} />
      </div>
    </div>
  );
}
