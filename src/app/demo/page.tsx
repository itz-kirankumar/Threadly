import type { Metadata } from "next";
import Link from "next/link";
import { ArrowRight, Radar, Target, Mail, Sparkles } from "lucide-react";

export const metadata: Metadata = {
  title: "Signal Radar Demo · Threadly",
  description: "See how Signal Radar finds buyers who are already describing your product's problem on X, Reddit and communities.",
};

const sampleSignals = [
  {
    id: "1",
    platform: "X",
    author: "@startup_maya",
    text: "We've been manually scrolling through Reddit for hours trying to find people who need our analytics tool. There has to be a better way to find potential customers who are already talking about this problem.",
    intent: "hot",
    relevance: 92,
    time: "2 min ago",
    pain: "Manual lead discovery is time-consuming",
  },
  {
    id: "2",
    platform: "Reddit",
    author: "u/growth_diego",
    text: "Looking for recommendations: what tools do B2B SaaS founders use to find high-intent leads on social? Apollo and LinkedIn Sales Nav feel too broad. I want to find people who are literally asking for what I build.",
    intent: "hot",
    relevance: 88,
    time: "14 min ago",
    pain: "Existing tools too broad for intent-based discovery",
  },
  {
    id: "3",
    platform: "X",
    author: "@indie_priya",
    text: "Day 47 of building in public: still haven't found my first 10 customers. The product is ready but I don't know where the buyers hang out. Tried cold email but 0 replies so far.",
    intent: "warm",
    relevance: 74,
    time: "38 min ago",
    pain: "Can't find first customers despite product being ready",
  },
  {
    id: "4",
    platform: "Reddit",
    author: "u/saas_builder_22",
    text: "Has anyone tried social listening tools for finding early customers? I'm pre-launch and want to find communities where people are discussing the exact pain point my product solves.",
    intent: "warm",
    relevance: 71,
    time: "1 hr ago",
    pain: "Needs social listening for pre-launch customer discovery",
  },
  {
    id: "5",
    platform: "X",
    author: "@devtools_raj",
    text: "Frustrating: we know our ICP hangs out on Twitter and Reddit but there's no good way to monitor conversations about developer tools pricing. Currently using Google Alerts but it misses 90% of relevant threads.",
    intent: "hot",
    relevance: 85,
    time: "1 hr ago",
    pain: "Google Alerts insufficient for social monitoring",
  },
];

function intentBadge(intent: string) {
  if (intent === "hot") return "bg-red-100 text-red-700 border-red-200";
  if (intent === "warm") return "bg-amber-100 text-amber-700 border-amber-200";
  return "bg-gray-100 text-gray-600 border-gray-200";
}

export default function DemoPage() {
  return (
    <div className="min-h-screen bg-[#faf9f7] text-[#0a0a0a]">
      {/* Header */}
      <header className="border-b-2 border-[#0a0a0a] bg-[#faf9f7]/95 backdrop-blur-md">
        <div className="mx-auto flex h-[68px] max-w-5xl items-center justify-between px-5">
          <Link href="/" className="flex items-center gap-2">
            <span className="text-[22px] font-black tracking-[-0.05em]">
              threadly<span className="text-[#ff4500]">.</span>
            </span>
          </Link>
          <div className="flex items-center gap-3">
            <span className="rounded-full border border-amber-300 bg-amber-50 px-3 py-1 text-[11px] font-bold text-amber-800">
              Interactive Demo · Sample Data
            </span>
            <Link
              href="/portal/login"
              className="inline-flex items-center gap-2 rounded-full border-2 border-[#ff4500] bg-[#ff4500] px-4 py-2 text-[12px] font-extrabold text-white shadow-[2px_2px_0_#0a0a0a]"
            >
              Sign in for live data <ArrowRight className="h-3.5 w-3.5" />
            </Link>
          </div>
        </div>
      </header>

      <main className="mx-auto max-w-5xl px-5 py-10">
        {/* Demo banner */}
        <div className="mb-8 rounded-2xl border-2 border-[#0a0a0a] bg-white p-6 shadow-[5px_5px_0_#0a0a0a]">
          <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
            <div>
              <div className="flex items-center gap-2">
                <Radar className="h-6 w-6 text-[#ff4500]" />
                <h1 className="text-[24px] font-black tracking-[-0.04em]">Signal Radar</h1>
                <span className="rounded-full bg-[#ff4500]/10 px-2.5 py-0.5 text-[10px] font-black text-[#ff4500]">
                  DEMO WORKSPACE
                </span>
              </div>
              <p className="mt-1 text-[14px] text-gray-600">
                Search query: <span className="font-semibold text-gray-900">&quot;finding first customers for B2B SaaS&quot;</span>
                <span className="ml-2 text-[12px] text-gray-400">· 5 signals scored · illustrative data</span>
              </p>
            </div>
            <div className="flex gap-2">
              <div className="rounded-xl border border-gray-200 bg-gray-50 px-3 py-2 text-center min-w-[64px]">
                <div className="text-[18px] font-black">3</div>
                <div className="text-[9px] font-bold uppercase tracking-wider text-red-600">Hot</div>
              </div>
              <div className="rounded-xl border border-gray-200 bg-gray-50 px-3 py-2 text-center min-w-[64px]">
                <div className="text-[18px] font-black">2</div>
                <div className="text-[9px] font-bold uppercase tracking-wider text-amber-600">Warm</div>
              </div>
            </div>
          </div>
        </div>

        {/* Signal list */}
        <div className="space-y-3.5">
          {sampleSignals.map((signal) => (
            <div
              key={signal.id}
              className="rounded-2xl border-2 border-[#0a0a0a] bg-white p-5 shadow-[3px_3px_0_#0a0a0a] transition-all hover:-translate-y-0.5 hover:shadow-[5px_5px_0_#ff4500]"
            >
              <div className="flex items-start justify-between gap-4">
                <div className="min-w-0 flex-1">
                  <div className="flex items-center gap-2">
                    <span className="rounded-md border border-gray-200 bg-gray-100 px-2 py-0.5 text-[10px] font-bold text-gray-700">
                      {signal.platform}
                    </span>
                    <span className="text-[12px] font-bold text-gray-800">{signal.author}</span>
                    <span className="text-[11px] text-gray-400">{signal.time}</span>
                  </div>
                  <p className="mt-2 text-[14px] leading-relaxed text-gray-900">{signal.text}</p>
                  <div className="mt-3 flex flex-wrap items-center gap-2">
                    <span className={`rounded-full border px-2.5 py-0.5 text-[10px] font-bold uppercase tracking-wider ${intentBadge(signal.intent)}`}>
                      {signal.intent} intent
                    </span>
                    <span className="text-[11px] text-gray-500 font-medium">
                      <Target className="mr-1 inline h-3.5 w-3.5 text-[#ff4500]" />
                      {signal.relevance}% relevance
                    </span>
                    <span className="text-[11px] text-gray-500 font-medium">
                      <Sparkles className="mr-1 inline h-3.5 w-3.5 text-[#7c3aed]" />
                      {signal.pain}
                    </span>
                  </div>
                </div>
                <Link
                  href="/portal/login"
                  className="shrink-0 rounded-xl border-2 border-[#0a0a0a] bg-white px-3.5 py-2 text-[11px] font-bold transition-colors hover:bg-gray-100"
                  title="Sign in to draft a reply"
                >
                  <Mail className="mr-1.5 inline h-3.5 w-3.5 text-[#ff4500]" />
                  Draft reply
                </Link>
              </div>
            </div>
          ))}
        </div>

        {/* CTA */}
        <div className="mt-10 rounded-2xl border-2 border-[#0a0a0a] bg-[#0a0a0a] p-8 text-center text-white shadow-[6px_6px_0_#ff4500]">
          <h2 className="text-[28px] font-black tracking-[-0.04em]">
            This is sample data. Your signals are live.
          </h2>
          <p className="mx-auto mt-2 max-w-lg text-[14px] text-white/70">
            Sign in with Google to search for real buying signals on X and Reddit.
            Enter your customer&apos;s problem and get results in under a minute.
          </p>
          <Link
            href="/portal/login"
            className="mt-6 inline-flex items-center gap-2 rounded-2xl border-2 border-[#ff4500] bg-[#ff4500] px-7 py-3.5 text-[15px] font-black text-white hover:bg-[#e03d00]"
          >
            Launch Signal Radar for your product <ArrowRight className="h-4 w-4" />
          </Link>
        </div>
      </main>
    </div>
  );
}
