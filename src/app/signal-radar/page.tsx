import type { Metadata } from "next";
import Navbar from "@/components/Navbar";
import Footer from "@/components/Footer";
import XDiscovery from "@/components/XDiscovery";
import { xProvider } from "@/lib/apify-x";
import Link from "next/link";
import { Target, Search, ArrowRight, Zap, CheckCircle2, ShieldCheck, Flame, Cpu, BarChart3 } from "lucide-react";

export const metadata: Metadata = {
  title: "Agentic Signal Radar | Wisentry",
  description: "Search recent public X posts for customer problems and open the original conversations.",
};

export const dynamic = "force-dynamic";

export default function SignalRadarPage() {
  const provider = xProvider();

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
            Search recent public X conversations for the customer problems your product solves. Open original posts, review available engagement, and decide which conversations deserve a thoughtful response.
          </p>

          <div className="flex flex-col sm:flex-row items-center justify-center gap-4 mb-16">
            <Link 
              href="#live-x-discovery"
              className="btn-tactile-violet px-8 py-4 rounded-2xl bg-brand-violet text-white font-black text-base flex items-center gap-2"
            >
              <span>Search live X posts</span>
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
              <h3 className="text-2xl font-black text-gray-900 mb-3">Live X Conversation Search</h3>
              <p className="text-gray-600 text-sm leading-relaxed">
                Search up to 10 recent public X posts for a customer pain point, then open the original conversation and review its available public metrics.
              </p>
            </div>

            <div className="p-8 rounded-3xl bg-white border-2 border-gray-200 shadow-lg hover:border-brand-violet/40 transition-all">
              <div className="w-12 h-12 rounded-2xl bg-emerald-50 text-emerald-600 flex items-center justify-center mb-6">
                <Flame className="w-6 h-6" />
              </div>
              <h3 className="text-2xl font-black text-gray-900 mb-3">Original Conversation Links</h3>
              <p className="text-gray-600 text-sm leading-relaxed">
                Every result links back to the public X post, so you can read the surrounding context before deciding whether to respond.
              </p>
            </div>

            <div className="p-8 rounded-3xl bg-white border-2 border-gray-200 shadow-lg hover:border-brand-violet/40 transition-all">
              <div className="w-12 h-12 rounded-2xl bg-brand-electric/10 text-brand-electric flex items-center justify-center mb-6">
                <Cpu className="w-6 h-6" />
              </div>
              <h3 className="text-2xl font-black text-gray-900 mb-3">Public Engagement Context</h3>
              <p className="text-gray-600 text-sm leading-relaxed">
                Review available likes, replies, and reposts alongside each post. Wisentry does not assign an automated buying-intent score.
              </p>
            </div>
          </div>
        </div>

        <XDiscovery provider={provider} />
      </main>

      <Footer />
    </div>
  );
}
