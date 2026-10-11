import type { Metadata } from "next";
import Navbar from "@/components/Navbar";
import Footer from "@/components/Footer";
import Link from "next/link";
import { Cpu, ArrowRight, Zap, Shield, Sparkles, MessageSquare, Flame } from "lucide-react";

export const metadata: Metadata = {
  title: "AI Growth Engine | Wisentry",
  description: "The autonomous growth workforce designed to run your outreach, uncover customer friction, and scale B2C user acquisition.",
};

export default function AiEnginePage() {
  return (
    <div className="min-h-screen flex flex-col bg-[#fdfcff] text-[#02010a]">
      <Navbar />

      <main className="flex-grow pt-32 pb-24">
        {/* Hero */}
        <div className="container mx-auto px-4 sm:px-6 lg:px-12 max-w-5xl text-center">
          <div className="inline-flex items-center gap-2 px-4 py-1.5 rounded-full bg-brand-violet/10 text-brand-violet text-xs sm:text-sm font-bold mb-6">
            <Cpu className="w-4 h-4 text-brand-electric" />
            Autonomous Platform • 24/7 Growth Intelligence
          </div>

          <h1 className="text-4xl sm:text-5xl md:text-6xl lg:text-7xl font-black tracking-tight text-gray-900 leading-tight mb-6">
            <span>Autonomous </span>
            <span className="extruded-violet text-brand-bush">AI Engine</span>
          </h1>

          <p className="text-lg sm:text-xl text-gray-600 max-w-2xl mx-auto leading-relaxed mb-10">
            The infinite workforce your consumer product has been waiting for. Running around the clock to detect high-intent discussions, craft contextual value-first responses, and deliver qualified users.
          </p>

          <div className="flex justify-center mb-16">
            <Link 
              href="/#waitlist" 
              className="btn-tactile-violet px-8 py-4 rounded-2xl bg-brand-violet text-white font-black text-base flex items-center gap-2"
            >
              <span>Activate your growth agent</span>
              <ArrowRight className="w-5 h-5 text-brand-pastel" />
            </Link>
          </div>
        </div>

        {/* Feature Grid */}
        <div className="container mx-auto px-4 sm:px-6 lg:px-12 max-w-6xl my-16">
          <div className="grid md:grid-cols-3 gap-8">
            <div className="p-8 rounded-3xl bg-white border-2 border-gray-200 shadow-lg">
              <div className="w-12 h-12 rounded-2xl bg-brand-violet/10 text-brand-violet flex items-center justify-center mb-6">
                <MessageSquare className="w-6 h-6" />
              </div>
              <h3 className="text-2xl font-black text-gray-900 mb-3">Anti-Spam Value First</h3>
              <p className="text-gray-600 text-sm leading-relaxed">
                Our models generate insightful, context-aware comments that answer questions and genuinely help users—never triggering moderator bans or burning reputation.
              </p>
            </div>

            <div className="p-8 rounded-3xl bg-white border-2 border-gray-200 shadow-lg">
              <div className="w-12 h-12 rounded-2xl bg-emerald-50 text-emerald-600 flex items-center justify-center mb-6">
                <Zap className="w-6 h-6" />
              </div>
              <h3 className="text-2xl font-black text-gray-900 mb-3">Real-Time Routing</h3>
              <p className="text-gray-600 text-sm leading-relaxed">
                Connects straight into your Discord, Slack, or email. Get notified seconds after a qualified lead asks for recommendations in your niche.
              </p>
            </div>

            <div className="p-8 rounded-3xl bg-white border-2 border-gray-200 shadow-lg">
              <div className="w-12 h-12 rounded-2xl bg-purple-50 text-brand-bush flex items-center justify-center mb-6">
                <Shield className="w-6 h-6" />
              </div>
              <h3 className="text-2xl font-black text-gray-900 mb-3">Safety & Compliance</h3>
              <p className="text-gray-600 text-sm leading-relaxed">
                Full adherence to platform guidelines, rate limits, and API best practices. Protects your startup brand while systematically compounding distribution.
              </p>
            </div>
          </div>
        </div>
      </main>

      <Footer />
    </div>
  );
}
