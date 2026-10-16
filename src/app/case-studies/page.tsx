import type { Metadata } from "next";
import Navbar from "@/components/Navbar";
import Footer from "@/components/Footer";
import Link from "next/link";
import { BarChart3, ArrowRight, Star, TrendingUp, CheckCircle2 } from "lucide-react";

export const metadata: Metadata = {
  title: "Case Studies & Success Stories | Threadly",
  description: "Real growth results from B2C startups using Threadly to escape the distribution tarpit.",
};

export default function CaseStudiesPage() {
  return (
    <div className="min-h-screen flex flex-col bg-[#fdfcff] text-[#02010a]">
      <Navbar />

      <main className="flex-grow pt-32 pb-24">
        {/* Hero */}
        <div className="container mx-auto px-4 sm:px-6 lg:px-12 max-w-5xl text-center">
          <div className="inline-flex items-center gap-2 px-4 py-1.5 rounded-full bg-brand-violet/10 text-brand-violet text-xs sm:text-sm font-bold mb-6">
            <BarChart3 className="w-4 h-4 text-emerald-600" />
            Verified Case Studies • Real B2C Outcomes
          </div>

          <h1 className="text-4xl sm:text-5xl md:text-6xl lg:text-7xl font-black tracking-tight text-gray-900 leading-tight mb-6">
            <span>Stories of </span>
            <span className="extruded-violet text-brand-bush">success</span>
          </h1>

          <p className="text-lg sm:text-xl text-gray-600 max-w-2xl mx-auto leading-relaxed mb-10">
            See how consumer founders replaced random ads with high-intent social conversations and cohort testing to build durable distribution.
          </p>
        </div>

        {/* 3 Detailed Case Studies */}
        <div className="container mx-auto px-4 sm:px-6 lg:px-12 max-w-5xl my-12 space-y-12">
          
          <div className="p-8 sm:p-12 rounded-3xl bg-white border-2 border-gray-200 shadow-xl grid md:grid-cols-12 gap-8 items-center">
            <div className="md:col-span-4 text-left">
              <span className="text-xs font-bold uppercase tracking-wider text-brand-violet mb-2 block">FinTech • Consumer</span>
              <div className="text-5xl sm:text-6xl font-black text-brand-violet mb-2">82%</div>
              <div className="text-sm font-extrabold uppercase text-gray-500 tracking-wider">Conversion Lift</div>
            </div>
            <div className="md:col-span-8 text-left">
              <h2 className="text-2xl font-black text-gray-900 mb-3">&quot;We stopped burning $3.5k/month on Facebook ads.&quot;</h2>
              <p className="text-gray-600 text-sm leading-relaxed mb-4">
                Before Threadly, PocketSplit spent thousands on Meta ads with an 84% day-1 drop-off. By switching to Threadly&apos;s Signal Radar, they found 350+ roommates actively complaining about Splitwise&apos;s new paywalls on Reddit. Over 60% joined their beta within 48 hours.
              </p>
              <div className="text-xs font-bold text-gray-800">
                — Marcus Chen, Founder of PocketSplit
              </div>
            </div>
          </div>

          <div className="p-8 sm:p-12 rounded-3xl bg-white border-2 border-gray-200 shadow-xl grid md:grid-cols-12 gap-8 items-center">
            <div className="md:col-span-4 text-left">
              <span className="text-xs font-bold uppercase tracking-wider text-brand-bush mb-2 block">AI Media • Creative Studio</span>
              <div className="text-5xl sm:text-6xl font-black text-brand-bush mb-2">400+</div>
              <div className="text-sm font-extrabold uppercase text-gray-500 tracking-wider">Hours Saved</div>
            </div>
            <div className="md:col-span-8 text-left">
              <h2 className="text-2xl font-black text-gray-900 mb-3">&quot;The feedback saved us from building the wrong product.&quot;</h2>
              <p className="text-gray-600 text-sm leading-relaxed mb-4">
                Lumina was about to build a complex timeline editor. When they pushed their prototype to the Threadly Beta Collective, 140+ testers highlighted that all they wanted was 1-click preset exports. They cut 3 months of unnecessary dev work and doubled user satisfaction.
              </p>
              <div className="text-xs font-bold text-gray-800">
                — Elena Rostova, Product Lead at Lumina AI
              </div>
            </div>
          </div>

          <div className="p-8 sm:p-12 rounded-3xl bg-white border-2 border-gray-200 shadow-xl grid md:grid-cols-12 gap-8 items-center">
            <div className="md:col-span-4 text-left">
              <span className="text-xs font-bold uppercase tracking-wider text-brand-electric mb-2 block">Productivity • Mobile</span>
              <div className="text-5xl sm:text-6xl font-black text-brand-electric mb-2">1,000</div>
              <div className="text-sm font-extrabold uppercase text-gray-500 tracking-wider">Active Users in 12 Days</div>
            </div>
            <div className="md:col-span-8 text-left">
              <h2 className="text-2xl font-black text-gray-900 mb-3">&quot;We launched on Product Hunt with 1,000 loyal fans behind us.&quot;</h2>
              <p className="text-gray-600 text-sm leading-relaxed mb-4">
                HabitZen used Threadly&apos;s referral engine to turn their initial 150 Discord beta testers into 1,000 active daily users before their public launch. On launch day, their community drove them straight to the #1 Product of the Day.
              </p>
              <div className="text-xs font-bold text-gray-800">
                — Priya Sharma, Co-Founder of HabitZen
              </div>
            </div>
          </div>

        </div>

        {/* Bottom CTA */}
        <div className="container mx-auto px-4 sm:px-6 lg:px-12 max-w-4xl text-center mt-16">
          <Link 
            href="/#waitlist" 
            className="btn-tactile-violet px-8 py-4 rounded-2xl bg-brand-violet text-white font-black text-base inline-flex items-center gap-2"
          >
            <span>Start your growth story</span>
            <ArrowRight className="w-5 h-5 text-brand-pastel" />
          </Link>
        </div>
      </main>

      <Footer />
    </div>
  );
}
