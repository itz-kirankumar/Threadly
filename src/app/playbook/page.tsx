import type { Metadata } from "next";
import Navbar from "@/components/Navbar";
import Footer from "@/components/Footer";
import Link from "next/link";
import { ArrowRight, Check, Target, Compass, Sparkles, Layers } from "lucide-react";

export const metadata: Metadata = {
  title: "The 3-Step Distribution Playbook | Threadly",
  description: "The complete tactical roadmap for consumer founders to go from Day 0 to their first 1,000 real active users.",
};

export default function PlaybookPage() {
  return (
    <div className="min-h-screen flex flex-col bg-[#fdfcff] text-[#02010a]">
      <Navbar />

      <main className="flex-grow pt-32 pb-24">
        {/* Hero */}
        <div className="container mx-auto px-4 sm:px-6 lg:px-12 max-w-5xl text-center">
          <div className="inline-flex items-center gap-2 px-4 py-1.5 rounded-full bg-brand-violet/10 text-brand-violet text-xs sm:text-sm font-bold mb-6">
            <Compass className="w-4 h-4 text-brand-bush" />
            Tactical Methodology • The Zero-to-1,000 Roadmap
          </div>

          <h1 className="text-4xl sm:text-5xl md:text-6xl lg:text-7xl font-black tracking-tight text-gray-900 leading-tight mb-6">
            <span>The 3-Step </span>
            <span className="extruded-violet text-brand-bush">Playbook</span>
          </h1>

          <p className="text-lg sm:text-xl text-gray-600 max-w-2xl mx-auto leading-relaxed mb-10">
            No vague growth hacks or wasted ad spend. Here is the exact phased system consumer founders use on Threadly to acquire and retain their first 1,000 passionate users.
          </p>

          <div className="flex justify-center mb-16">
            <Link 
              href="/#waitlist" 
              className="btn-tactile-violet px-8 py-4 rounded-2xl bg-brand-violet text-white font-black text-base flex items-center gap-2"
            >
              <span>Execute with Threadly</span>
              <ArrowRight className="w-5 h-5 text-brand-pastel" />
            </Link>
          </div>
        </div>

        {/* 3 Step Cards */}
        <div className="container mx-auto px-4 sm:px-6 lg:px-12 max-w-5xl my-12 space-y-12">
          
          <div className="p-8 sm:p-12 rounded-3xl bg-white border-2 border-gray-200 shadow-xl flex flex-col md:flex-row gap-8 items-start">
            <div className="w-16 h-16 rounded-2xl bg-brand-violet text-white text-2xl font-black flex items-center justify-center shrink-0">
              01
            </div>
            <div className="flex-1 text-left">
              <span className="text-xs font-bold uppercase tracking-wider text-brand-violet mb-2 block">Phase 1 • Days 1-7</span>
              <h2 className="text-3xl font-black text-gray-900 mb-4">Niche Alignment & Competitor Vulnerability</h2>
              <p className="text-gray-600 text-base leading-relaxed mb-6">
                Map the exact subreddits, X circles, and communities where potential buyers gather. Define competitor shortfalls—pricing hikes, abandoned features, bad customer service—to identify immediate conversion triggers.
              </p>
              <div className="space-y-2 text-sm text-gray-700">
                <div className="flex items-center gap-2">
                  <Check className="w-4 h-4 text-emerald-500" />
                  <span>Pinpoint 5 primary competitor complaint vectors</span>
                </div>
                <div className="flex items-center gap-2">
                  <Check className="w-4 h-4 text-emerald-500" />
                  <span>Configure automated keywords on Threadly Signal Radar</span>
                </div>
              </div>
            </div>
          </div>

          <div className="p-8 sm:p-12 rounded-3xl bg-white border-2 border-gray-200 shadow-xl flex flex-col md:flex-row gap-8 items-start">
            <div className="w-16 h-16 rounded-2xl bg-brand-bush text-white text-2xl font-black flex items-center justify-center shrink-0">
              02
            </div>
            <div className="flex-1 text-left">
              <span className="text-xs font-bold uppercase tracking-wider text-brand-bush mb-2 block">Phase 2 • Days 8-21</span>
              <h2 className="text-3xl font-black text-gray-900 mb-4">Warm Infiltration & Beta Feedback Sprint</h2>
              <p className="text-gray-600 text-base leading-relaxed mb-6">
                Engage live discussions using value-first responses. Invite interested users to your private beta or waitlist. Distribute your prototype to Threadly&apos;s vetted cohort of 1,000+ testers for instant UX feedback.
              </p>
              <div className="space-y-2 text-sm text-gray-700">
                <div className="flex items-center gap-2">
                  <Check className="w-4 h-4 text-emerald-500" />
                  <span>Average 15-minute response time to competitor complaints</span>
                </div>
                <div className="flex items-center gap-2">
                  <Check className="w-4 h-4 text-emerald-500" />
                  <span>Resolve core UX friction points in 48 hours</span>
                </div>
              </div>
            </div>
          </div>

          <div className="p-8 sm:p-12 rounded-3xl bg-white border-2 border-gray-200 shadow-xl flex flex-col md:flex-row gap-8 items-start">
            <div className="w-16 h-16 rounded-2xl bg-brand-electric text-white text-2xl font-black flex items-center justify-center shrink-0">
              03
            </div>
            <div className="flex-1 text-left">
              <span className="text-xs font-bold uppercase tracking-wider text-brand-electric mb-2 block">Phase 3 • Days 22-30</span>
              <h2 className="text-3xl font-black text-gray-900 mb-4">Referral Multipliers & Public Launch Surge</h2>
              <p className="text-gray-600 text-base leading-relaxed mb-6">
                Equip your initial 100 passionate testers with exclusive invite access and viral referral incentives. When you launch publicly on Product Hunt or the App Store, you launch with momentum, ratings, and active users.
              </p>
              <div className="space-y-2 text-sm text-gray-700">
                <div className="flex items-center gap-2">
                  <Check className="w-4 h-4 text-emerald-500" />
                  <span>Achieve organic K-factor &gt; 1.2 with referral hooks</span>
                </div>
                <div className="flex items-center gap-2">
                  <Check className="w-4 h-4 text-emerald-500" />
                  <span>Surpass 1,000 active, retained consumer users</span>
                </div>
              </div>
            </div>
          </div>

        </div>
      </main>

      <Footer />
    </div>
  );
}
