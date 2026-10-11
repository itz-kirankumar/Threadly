import type { Metadata } from "next";
import Navbar from "@/components/Navbar";
import Footer from "@/components/Footer";
import Link from "next/link";
import { Target, Search, ArrowRight, Zap, CheckCircle2, ShieldCheck, Flame, Cpu, BarChart3 } from "lucide-react";

export const metadata: Metadata = {
  title: "Agentic Signal Radar | Wisentry",
  description: "Monitor live social discussions across Reddit, X, and forums to catch consumers looking for solutions right now.",
};

export default function SignalRadarPage() {
  return (
    <div className="min-h-screen flex flex-col bg-[#fdfcff] text-[#02010a]">
      <Navbar />

      <main className="flex-grow pt-32 pb-24">
        {/* Hero Section */}
        <div className="container mx-auto px-4 sm:px-6 lg:px-12 max-w-5xl text-center">
          <div className="inline-flex items-center gap-2 px-4 py-1.5 rounded-full bg-brand-violet/10 text-brand-violet text-xs sm:text-sm font-bold mb-6">
            <Target className="w-4 h-4 text-brand-electric" />
            Platform Core • Social Intent Intelligence
          </div>

          <h1 className="text-4xl sm:text-5xl md:text-6xl lg:text-7xl font-black tracking-tight text-gray-900 leading-tight mb-6">
            <span>Agentic </span>
            <span className="extruded-violet text-brand-bush">Signal Radar</span>
          </h1>

          <p className="text-lg sm:text-xl text-gray-600 max-w-2xl mx-auto leading-relaxed mb-10">
            Stop waiting for customers to stumble onto your landing page. Wisentry scans live discussions across Reddit, X, and niche communities to surface consumers actively expressing pain points you solve.
          </p>

          <div className="flex flex-col sm:flex-row items-center justify-center gap-4 mb-16">
            <Link 
              href="/#waitlist" 
              className="btn-tactile-violet px-8 py-4 rounded-2xl bg-brand-violet text-white font-black text-base flex items-center gap-2"
            >
              <span>Get live signal alerts</span>
              <ArrowRight className="w-5 h-5 text-brand-pastel" />
            </Link>
          </div>
        </div>

        {/* Feature Grid */}
        <div className="container mx-auto px-4 sm:px-6 lg:px-12 max-w-6xl my-16">
          <div className="grid md:grid-cols-3 gap-8">
            <div className="p-8 rounded-3xl bg-white border-2 border-gray-200 shadow-lg hover:border-brand-violet/40 transition-all">
              <div className="w-12 h-12 rounded-2xl bg-brand-violet/10 text-brand-violet flex items-center justify-center mb-6">
                <Search className="w-6 h-6" />
              </div>
              <h3 className="text-2xl font-black text-gray-900 mb-3">Multi-Channel Listening</h3>
              <p className="text-gray-600 text-sm leading-relaxed">
                Connect your niche keywords and track real-time discussions across subreddits, X/Twitter quote-tweets, Discord communities, and Product Hunt forums without touching manual search bars.
              </p>
            </div>

            <div className="p-8 rounded-3xl bg-white border-2 border-gray-200 shadow-lg hover:border-brand-violet/40 transition-all">
              <div className="w-12 h-12 rounded-2xl bg-emerald-50 text-emerald-600 flex items-center justify-center mb-6">
                <Flame className="w-6 h-6" />
              </div>
              <h3 className="text-2xl font-black text-gray-900 mb-3">Competitor Churn Radar</h3>
              <p className="text-gray-600 text-sm leading-relaxed">
                Receive instant alerts whenever a user complains about an existing competitor&apos;s pricing change, buggy update, or missing feature—giving you the perfect warm opening.
              </p>
            </div>

            <div className="p-8 rounded-3xl bg-white border-2 border-gray-200 shadow-lg hover:border-brand-violet/40 transition-all">
              <div className="w-12 h-12 rounded-2xl bg-brand-electric/10 text-brand-electric flex items-center justify-center mb-6">
                <Cpu className="w-6 h-6" />
              </div>
              <h3 className="text-2xl font-black text-gray-900 mb-3">Intent Scoring & Filtering</h3>
              <p className="text-gray-600 text-sm leading-relaxed">
                Our semantic model filters out spam, bot chatter, and irrelevant posts. You only see verified discussions with buying intent above 85%.
              </p>
            </div>
          </div>
        </div>

        {/* Live Simulation Preview */}
        <div className="container mx-auto px-4 sm:px-6 lg:px-12 max-w-4xl my-16">
          <div className="rounded-3xl border-2 border-brand-violet/20 bg-[#faf8fc] p-6 sm:p-10 shadow-xl">
            <div className="flex items-center justify-between mb-6 pb-4 border-b border-gray-200">
              <div className="flex items-center gap-2">
                <span className="flex h-3 w-3 rounded-full bg-emerald-500 animate-pulse" />
                <span className="text-xs font-mono font-bold text-gray-700 uppercase">Live Intent Stream Preview</span>
              </div>
              <span className="text-xs font-bold text-brand-violet bg-white px-3 py-1 rounded-full border border-purple-100">
                Avg Response Window: &lt; 15 mins
              </span>
            </div>

            <div className="space-y-4">
              <div className="p-4 rounded-2xl bg-white border border-gray-200 shadow-sm flex flex-col sm:flex-row items-start sm:items-center justify-between gap-4">
                <div>
                  <div className="text-xs font-bold text-brand-violet mb-1">Reddit • r/SideProject (2 mins ago)</div>
                  <div className="text-sm font-semibold text-gray-900">&quot;Looking for a simple way to test mobile UI without setting up TestFlight for 50 people...&quot;</div>
                </div>
                <span className="px-3 py-1 rounded-full bg-emerald-100 text-emerald-800 text-xs font-bold shrink-0">
                  96% Match
                </span>
              </div>

              <div className="p-4 rounded-2xl bg-white border border-gray-200 shadow-sm flex flex-col sm:flex-row items-start sm:items-center justify-between gap-4">
                <div>
                  <div className="text-xs font-bold text-brand-violet mb-1">X / Twitter (14 mins ago)</div>
                  <div className="text-sm font-semibold text-gray-900">&quot;Anyone know a consumer finance app that actually helps track shared roommate expenses cleanly?&quot;</div>
                </div>
                <span className="px-3 py-1 rounded-full bg-emerald-100 text-emerald-800 text-xs font-bold shrink-0">
                  91% Match
                </span>
              </div>
            </div>
          </div>
        </div>
      </main>

      <Footer />
    </div>
  );
}
