import type { Metadata } from "next";
import Navbar from "@/components/Navbar";
import Footer from "@/components/Footer";
import Link from "next/link";
import { Sparkles, ArrowRight, CheckCircle2, Zap, Users } from "lucide-react";

export const metadata: Metadata = {
  title: "Careers at Wisentry | Build the Future of Distribution",
  description: "Join the team helping the next generation of consumer startups acquire their first 1,000 real users.",
};

export default function CareersPage() {
  return (
    <div className="min-h-screen flex flex-col bg-[#fdfcff] text-[#02010a]">
      <Navbar />

      <main className="flex-grow pt-32 pb-24">
        {/* Hero */}
        <div className="container mx-auto px-4 sm:px-6 lg:px-12 max-w-4xl text-center">
          <div className="inline-flex items-center gap-2 px-4 py-1.5 rounded-full bg-brand-violet/10 text-brand-violet text-xs sm:text-sm font-bold mb-6">
            <Zap className="w-4 h-4 text-brand-electric" />
            We Are Hiring • Remote First
          </div>

          <h1 className="text-4xl sm:text-5xl md:text-6xl font-black tracking-tight text-gray-900 leading-tight mb-6">
            <span>Careers at </span>
            <span className="extruded-violet text-brand-bush">Wisentry</span>
          </h1>

          <p className="text-lg sm:text-xl text-gray-600 leading-relaxed mb-12">
            Help us build the growth engine for the next generation of consumer internet products.
          </p>
        </div>

        {/* Open Positions List */}
        <div className="container mx-auto px-4 sm:px-6 lg:px-12 max-w-4xl my-12 space-y-6">
          <div className="p-6 sm:p-8 rounded-3xl bg-white border-2 border-gray-200 shadow-md flex flex-col sm:flex-row items-start sm:items-center justify-between gap-6 hover:border-brand-violet/40 transition-all">
            <div>
              <span className="text-xs font-bold uppercase tracking-wider text-brand-violet mb-1 block">Engineering • Remote</span>
              <h3 className="text-xl font-black text-gray-900 mb-1">Founding Full-Stack Engineer (Next.js / Node / AI)</h3>
              <p className="text-gray-600 text-sm">Lead development of our real-time intent mining engine and automated routing pipeline.</p>
            </div>
            <a 
              href="mailto:careers@wisentry.com?subject=Founding Full-Stack Engineer"
              className="btn-tactile-violet px-6 py-3 rounded-xl bg-brand-violet text-white text-xs sm:text-sm font-bold shrink-0"
            >
              Apply now
            </a>
          </div>

          <div className="p-6 sm:p-8 rounded-3xl bg-white border-2 border-gray-200 shadow-md flex flex-col sm:flex-row items-start sm:items-center justify-between gap-6 hover:border-brand-violet/40 transition-all">
            <div>
              <span className="text-xs font-bold uppercase tracking-wider text-brand-bush mb-1 block">Community • Remote</span>
              <h3 className="text-xl font-black text-gray-900 mb-1">Head of Early Adopter Collective</h3>
              <p className="text-gray-600 text-sm">Grow and nurture our 1,000+ consumer beta testing collective across Discord and social channels.</p>
            </div>
            <a 
              href="mailto:careers@wisentry.com?subject=Head of Early Adopter Collective"
              className="btn-tactile-violet px-6 py-3 rounded-xl bg-brand-violet text-white text-xs sm:text-sm font-bold shrink-0"
            >
              Apply now
            </a>
          </div>

          <div className="p-6 sm:p-8 rounded-3xl bg-white border-2 border-gray-200 shadow-md flex flex-col sm:flex-row items-start sm:items-center justify-between gap-6 hover:border-brand-violet/40 transition-all">
            <div>
              <span className="text-xs font-bold uppercase tracking-wider text-brand-electric mb-1 block">Growth • Remote</span>
              <h3 className="text-xl font-black text-gray-900 mb-1">Growth & Viral Systems Lead</h3>
              <p className="text-gray-600 text-sm">Design viral referral loops, founder onboarding funnels, and organic growth playbooks.</p>
            </div>
            <a 
              href="mailto:careers@wisentry.com?subject=Growth & Viral Systems Lead"
              className="btn-tactile-violet px-6 py-3 rounded-xl bg-brand-violet text-white text-xs sm:text-sm font-bold shrink-0"
            >
              Apply now
            </a>
          </div>
        </div>

        {/* Perks */}
        <div className="container mx-auto px-4 sm:px-6 lg:px-12 max-w-4xl text-center mt-16 p-8 rounded-3xl bg-[#faf8fc] border-2 border-brand-violet/20">
          <h2 className="text-2xl font-black text-gray-900 mb-4">Why Work at Wisentry?</h2>
          <div className="grid sm:grid-cols-3 gap-6 text-sm text-gray-700 mt-6">
            <div>🚀 Competitive equity & salary</div>
            <div>🌍 100% remote work worldwide</div>
            <div>⚡ High impact from Day 1</div>
          </div>
        </div>
      </main>

      <Footer />
    </div>
  );
}
