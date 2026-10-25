"use client";

import { useState } from "react";

interface RedditPost {
  id: string;
  title: string;
  subreddit: string;
  score: number;
  comments: number;
  createdUtc: number;
  url: string;
  snippet: string;
}

interface Mention extends RedditPost {
  target: string;
  sentiment: "positive" | "neutral" | "negative";
}

interface Opportunity extends RedditPost {
  intentScore: number;
  intentReasons: string[];
}

interface RedditResult {
  scannedAt: string;
  windowDays: number;
  brand: string;
  competitors: string[];
  category: string;
  mentions: Mention[];
  opportunities: Opportunity[];
  topSubreddits: { name: string; count: number }[];
  queriesRun: number;
  queriesTotal: number;
}

function ageLabel(createdUtc: number): string {
  if (!createdUtc) return "date unknown";
  const hours = Math.max(1, Math.round((Date.now() / 1000 - createdUtc) / 3600));
  if (hours < 24) return `${hours}h ago`;
  return `${Math.round(hours / 24)}d ago`;
}

const SENTIMENT_STYLE: Record<Mention["sentiment"], string> = {
  positive: "border-emerald-400/30 bg-emerald-500/10 text-emerald-300",
  neutral: "border-white/10 bg-white/[0.04] text-zinc-400",
  negative: "border-rose-400/30 bg-rose-500/10 text-rose-300",
};

export default function RedditPanel({ authedFetch }: { authedFetch: (path: string, init?: RequestInit) => Promise<unknown> }) {
  const [result, setResult] = useState<RedditResult | null>(null);
  const [scanning, setScanning] = useState(false);
  const [error, setError] = useState("");

  async function scan() {
    setScanning(true);
    setError("");
    try {
      const data = (await authedFetch("/api/geo/reddit", { method: "POST", body: JSON.stringify({}) })) as RedditResult;
      setResult(data);
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : "Reddit scan failed.");
    } finally {
      setScanning(false);
    }
  }

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h2 className="text-lg font-semibold text-white">Reddit monitor</h2>
          <p className="mt-1 text-sm text-zinc-500">
            Buyer conversations, brand and competitor mentions from the last 30 days. AI assistants frequently cite
            public Reddit threads when answering product questions - being in the right thread is how you get cited.
          </p>
        </div>
        <button
          type="button"
          onClick={scan}
          disabled={scanning}
          className="rounded-lg bg-violet-500 px-4 py-2 text-sm font-semibold text-white transition hover:bg-violet-400 disabled:opacity-50"
        >
          {scanning ? "Scanning Reddit…" : result ? "Scan again" : "Scan Reddit now"}
        </button>
      </div>

      {error && <p className="rounded-lg border border-rose-500/30 bg-rose-500/10 px-3 py-2 text-sm text-rose-300">{error}</p>}

      {!result && !scanning && !error && (
        <div className="rounded-xl border border-white/10 bg-white/[0.02] p-8 text-center">
          <p className="text-sm text-zinc-400">
            Run a scan to find high-intent threads where buyers ask for products like yours, and every recent
            mention of your brand and competitors.
          </p>
          <p className="mt-2 text-xs text-zinc-600">
            Drafting replies and posting always stays with you - Threadly never posts to Reddit on your behalf.
          </p>
        </div>
      )}

      {result && (
        <>
          <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
            <div className="rounded-xl border border-white/10 bg-white/[0.03] p-4">
              <p className="text-xs font-medium uppercase tracking-wide text-zinc-500">Opportunities</p>
              <p className="mt-2 text-3xl font-semibold text-white">{result.opportunities.length}</p>
              <p className="mt-1 text-xs text-zinc-500">high-intent threads</p>
            </div>
            <div className="rounded-xl border border-white/10 bg-white/[0.03] p-4">
              <p className="text-xs font-medium uppercase tracking-wide text-zinc-500">Brand mentions</p>
              <p className="mt-2 text-3xl font-semibold text-white">{result.mentions.filter((m) => m.target === result.brand).length}</p>
              <p className="mt-1 text-xs text-zinc-500">last {result.windowDays} days</p>
            </div>
            <div className="rounded-xl border border-white/10 bg-white/[0.03] p-4">
              <p className="text-xs font-medium uppercase tracking-wide text-zinc-500">Competitor mentions</p>
              <p className="mt-2 text-3xl font-semibold text-white">{result.mentions.filter((m) => m.target !== result.brand).length}</p>
              <p className="mt-1 text-xs text-zinc-500">{result.competitors.length} competitors tracked</p>
            </div>
            <div className="rounded-xl border border-white/10 bg-white/[0.03] p-4">
              <p className="text-xs font-medium uppercase tracking-wide text-zinc-500">Negative mentions</p>
              <p className="mt-2 text-3xl font-semibold text-white">{result.mentions.filter((m) => m.sentiment === "negative").length}</p>
              <p className="mt-1 text-xs text-zinc-500">estimated sentiment</p>
            </div>
          </div>

          {result.topSubreddits.length > 0 && (
            <div className="rounded-xl border border-white/10 bg-white/[0.02] p-4">
              <p className="text-xs font-medium uppercase tracking-wide text-zinc-500">Where they are talking</p>
              <div className="mt-3 space-y-2">
                {result.topSubreddits.map((sub) => (
                  <div key={sub.name} className="flex items-center gap-3">
                    <span className="w-36 truncate text-sm text-zinc-300">r/{sub.name}</span>
                    <div className="h-1.5 flex-1 overflow-hidden rounded-full bg-white/[0.06]">
                      <div
                        className="h-full rounded-full bg-violet-400"
                        style={{ width: `${Math.round((sub.count / result.topSubreddits[0].count) * 100)}%` }}
                      />
                    </div>
                    <span className="w-6 text-right text-xs text-zinc-500">{sub.count}</span>
                  </div>
                ))}
              </div>
            </div>
          )}

          <div className="space-y-3">
            <div className="flex items-center justify-between">
              <h3 className="text-sm font-semibold text-white">High-intent opportunities</h3>
              <p className="text-xs text-zinc-600">score = intent phrases + recency</p>
            </div>
            {result.opportunities.length === 0 ? (
              <p className="rounded-lg border border-white/10 bg-white/[0.02] px-4 py-3 text-sm text-zinc-500">
                No high-intent threads found this window. Add a category to your brand profile (Settings) to sharpen the search.
              </p>
            ) : (
              result.opportunities.map((opp) => (
                <a
                  key={opp.id}
                  href={opp.url}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="block rounded-xl border border-white/10 bg-white/[0.02] p-4 transition hover:border-violet-400/40"
                >
                  <div className="flex items-start justify-between gap-3">
                    <p className="text-sm font-medium text-zinc-100">{opp.title}</p>
                    <span className="shrink-0 rounded-full bg-violet-500/15 px-2.5 py-1 text-xs font-semibold text-violet-300">
                      intent {opp.intentScore}
                    </span>
                  </div>
                  <p className="mt-1.5 text-xs text-zinc-500">
                    {opp.subreddit ? `r/${opp.subreddit} · ` : ""}{ageLabel(opp.createdUtc)}
                  </p>
                  {opp.intentReasons.length > 0 && (
                    <p className="mt-1.5 text-xs text-zinc-600">{opp.intentReasons.join(" · ")}</p>
                  )}
                </a>
              ))
            )}
          </div>

          <div className="space-y-3">
            <h3 className="text-sm font-semibold text-white">Mentions</h3>
            {result.mentions.length === 0 ? (
              <p className="rounded-lg border border-white/10 bg-white/[0.02] px-4 py-3 text-sm text-zinc-500">
                No brand or competitor mentions found in the last {result.windowDays} days.
              </p>
            ) : (
              result.mentions.map((mention) => (
                <a
                  key={mention.id}
                  href={mention.url}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="block rounded-xl border border-white/10 bg-white/[0.02] p-4 transition hover:border-violet-400/40"
                >
                  <div className="flex flex-wrap items-center gap-2">
                    <span className="rounded-full bg-white/[0.06] px-2.5 py-0.5 text-xs font-medium text-zinc-300">{mention.target}</span>
                    <span className={`rounded-full border px-2.5 py-0.5 text-xs ${SENTIMENT_STYLE[mention.sentiment]}`}>
                      {mention.sentiment}
                    </span>
                  </div>
                  <p className="mt-2 text-sm font-medium text-zinc-100">{mention.title}</p>
                  <p className="mt-1 text-xs text-zinc-500">
                    {mention.subreddit ? `r/${mention.subreddit} · ` : ""}{ageLabel(mention.createdUtc)}
                  </p>
                </a>
              ))
            )}
          </div>

          <p className="text-xs text-zinc-600">
            Scanned {result.scannedAt.replace("T", " ").slice(0, 16)} UTC · {result.queriesRun}/{result.queriesTotal} searches returned results.
            Sentiment is a keyword estimate, not a human reading.
          </p>
        </>
      )}
    </div>
  );
}
