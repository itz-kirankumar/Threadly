"use client";

import { useState } from "react";

export const TOUR_KEY = "threadly-tour-v1";

const STEPS: Array<{ title: string; body: string }> = [
  {
    title: "Welcome to your GEO workspace",
    body: "Threadly measures how AI assistants talk about your brand. You set up your brand and competitors during onboarding - this tour shows you around the workspace.",
  },
  {
    title: "Overview",
    body: "Your headline AI visibility metrics: mention rate (how often assistants name your brand), citation share (how often they link your domain), share of voice vs competitors, and average position. Each AI provider gets its own card.",
  },
  {
    title: "Questions",
    body: "The buyer questions you track. Add your own or use Suggest to generate them with AI. Every scan asks each provider these questions. Click any row to read the full answers and citations.",
  },
  {
    title: "Run a scan",
    body: "Press Run scan now to ask every configured AI provider all of your questions and extract mentions, citations and competitor references. Scans can take a minute or two.",
  },
  {
    title: "Citations",
    body: "The domains AI assistants cite for your category - yours, your competitors', and third-party sources. These are the pages that shape what AI says about you.",
  },
  {
    title: "Scans history",
    body: "Every scan is stored. Track trends over time, and let the daily automatic scan (03:00 UTC) build a continuous history.",
  },
  {
    title: "Settings & provider keys",
    body: "Update your brand and competitors, and add your own AI provider keys - for the built-in providers or any custom OpenAI-compatible endpoint. Keys are encrypted at rest and scans then run on your accounts.",
  },
];

interface Props {
  onDone: () => void;
}

export default function Tour({ onDone }: Props) {
  const [step, setStep] = useState(0);
  const last = step === STEPS.length - 1;

  function finish() {
    try {
      window.localStorage.setItem(TOUR_KEY, "done");
    } catch {
      // storage unavailable - still dismiss
    }
    onDone();
  }

  return (
    <div className="fixed inset-0 z-50 flex items-end justify-center bg-black/60 p-4 sm:items-center">
      <div className="w-full max-w-md rounded-2xl border border-white/10 bg-zinc-900 p-6 shadow-2xl">
        <div className="flex items-center justify-between">
          <p className="text-xs font-medium uppercase tracking-wide text-violet-300">
            Product tour · {step + 1} of {STEPS.length}
          </p>
          <button type="button" onClick={finish} className="text-xs text-zinc-500 transition hover:text-zinc-300">
            Skip
          </button>
        </div>
        <div className="mt-1 flex gap-1">
          {STEPS.map((_, index) => (
            <span
              key={index}
              className={`h-1 flex-1 rounded-full ${index <= step ? "bg-violet-400" : "bg-white/10"}`}
            />
          ))}
        </div>
        <h3 className="mt-4 text-lg font-semibold text-white">{STEPS[step].title}</h3>
        <p className="mt-2 text-sm leading-relaxed text-zinc-400">{STEPS[step].body}</p>
        <div className="mt-6 flex justify-between">
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
