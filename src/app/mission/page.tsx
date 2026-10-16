import type { Metadata } from "next";
import Navbar from "@/components/Navbar";
import Footer from "@/components/Footer";
import Link from "next/link";
import { Compass, ArrowRight, ShieldCheck, Heart, Sparkles, Target } from "lucide-react";

export const metadata: Metadata = {
  title: "Our Mission | Threadly",
  description: "Eliminating the startup distribution tarpit so experience-makers can focus on building what consumers love.",
};

export default function MissionPage() {
  return (
    <div className="min-h-screen flex flex-col bg-[#fdfcff] text-[#02010a]">
      <Navbar />

      <main className="flex-grow pt-32 pb-24">
        {/* Hero */}
        <div className="container mx-auto px-4 sm:px-6 lg:px-12 max-w-4xl text-center">
          <div className="inline-flex items-center gap-2 px-4 py-1.5 rounded-full bg-brand-violet/10 text-brand-violet text-xs sm:text-sm font-bold mb-6">
            <Compass className="w-4 h-4 text-brand-electric" />
            Our North Star • Manifesto
          </div>

          <h1 className="text-4xl sm:text-5xl md:text-6xl font-black tracking-tight text-gray-900 leading-tight mb-6">
            <span>Our </span>
            <span className="extruded-violet text-brand-bush">Mission</span>
          </h1>

          <p className="text-lg sm:text-xl text-gray-600 leading-relaxed mb-12">
            To eliminate the B2C distribution tarpit, ensuring no transformative consumer product dies from obscurity.
          </p>
        </div>

        {/* 3 Core Tenets */}
        <div className="container mx-auto px-4 sm:px-6 lg:px-12 max-w-5xl my-12 grid md:grid-cols-3 gap-8">
          <div className="p-8 rounded-3xl bg-white border-2 border-gray-200 shadow-md">
            <div className="w-12 h-12 rounded-2xl bg-brand-violet/10 text-brand-violet flex items-center justify-center mb-6">
              <Heart className="w-6 h-6" />
            </div>
            <h3 className="text-2xl font-black text-gray-900 mb-3">Empower Makers</h3>
            <p className="text-gray-600 text-sm leading-relaxed">
              Founders should spend their creative energy perfecting user experiences, not wasting weeks hacking ad managers or cold messaging strangers.
            </p>
          </div>

          <div className="p-8 rounded-3xl bg-white border-2 border-gray-200 shadow-md">
            <div className="w-12 h-12 rounded-2xl bg-emerald-50 text-emerald-600 flex items-center justify-center mb-6">
              <Target className="w-6 h-6" />
            </div>
            <h3 className="text-2xl font-black text-gray-900 mb-3">Honest Validation</h3>
            <p className="text-gray-600 text-sm leading-relaxed">
              We replace polite founder upvotes with brutally honest consumer feedback before money is wasted scaling flawed features.
            </p>
          </div>

          <div className="p-8 rounded-3xl bg-white border-2 border-gray-200 shadow-md">
            <div className="w-12 h-12 rounded-2xl bg-purple-50 text-brand-bush flex items-center justify-center mb-6">
              <Sparkles className="w-6 h-6" />
            </div>
            <h3 className="text-2xl font-black text-gray-900 mb-3">Merit Over Ad Budgets</h3>
            <p className="text-gray-600 text-sm leading-relaxed">
              Great products deserve to win based on utility and love, not based on who has the largest VC war chest to burn on Meta ads.
            </p>
          </div>
        </div>

        {/* Bottom CTA */}
        <div className="container mx-auto px-4 sm:px-6 lg:px-12 max-w-4xl text-center mt-16">
          <Link 
            href="/#waitlist" 
            className="btn-tactile-violet px-8 py-4 rounded-2xl bg-brand-violet text-white font-black text-base inline-flex items-center gap-2"
          >
            <span>Join our mission</span>
            <ArrowRight className="w-5 h-5 text-brand-pastel" />
          </Link>
        </div>
      </main>

      <Footer />
    </div>
  );
}
