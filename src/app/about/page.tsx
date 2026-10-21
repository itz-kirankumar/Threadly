import type { Metadata } from "next";
import Navbar from "@/components/Navbar";
import Footer from "@/components/Footer";
import Link from "next/link";
import { Sparkles, ArrowRight, ShieldCheck, Heart, Users } from "lucide-react";

export const metadata: Metadata = {
  title: "About Threadly | Our Story & Vision",
  description: "Learn how Threadly was founded to solve the brutal distribution dilemma facing consumer startups.",
};

export default function AboutPage() {
  return (
    <div className="min-h-screen flex flex-col bg-[#fdfcff] text-[#02010a]">
      <Navbar />

      <main className="flex-grow pt-32 pb-24">
        {/* Hero */}
        <div className="container mx-auto px-4 sm:px-6 lg:px-12 max-w-4xl text-center">
          <div className="inline-flex items-center gap-2 px-4 py-1.5 rounded-full bg-brand-violet/10 text-brand-violet text-xs sm:text-sm font-bold mb-6">
            <Sparkles className="w-4 h-4 text-brand-electric" />
            Company • The Threadly Story
          </div>

          <h1 className="text-4xl sm:text-5xl md:text-6xl font-black tracking-tight text-gray-900 leading-tight mb-6">
            <span>About </span>
            <span className="extruded-violet text-brand-bush">Threadly</span>
          </h1>

          <p className="text-lg sm:text-xl text-gray-600 leading-relaxed mb-12">
            We started Threadly because we were tired of seeing great consumer products die in the dark.
          </p>
        </div>

        {/* Narrative Section */}
        <div className="container mx-auto px-4 sm:px-6 lg:px-12 max-w-3xl text-left my-8 space-y-8 text-gray-700 leading-relaxed text-base sm:text-lg">
          <div className="p-8 sm:p-10 rounded-3xl bg-white border-2 border-gray-200 shadow-md">
            <h2 className="text-2xl font-black text-gray-900 mb-4">The Brutal B2C Reality</h2>
            <p className="mb-4">
              Building software has never been easier. Anyone can spin up Next.js apps, AI models, and cloud databases in a weekend. But distribution has never been harder.
            </p>
            <p>
              Ad costs on Meta, Google, and TikTok have skyrocketed to unsustainable levels for early-stage builders. Launch boards give you phantom upvotes from fellow founders who will never use your product. And posting in online communities often gets you banned as spam.
            </p>
          </div>

          <div className="p-8 sm:p-10 rounded-3xl bg-white border-2 border-gray-200 shadow-md">
            <h2 className="text-2xl font-black text-gray-900 mb-4">Our Core Conviction</h2>
            <p className="mb-4">
              We believe every great product has thousands of people actively searching for it right now—complaining on Reddit, tweeting on X, and asking questions in Discord servers.
            </p>
            <p>
              Threadly connects those dots. By combining intelligent social intent mining with a curated collective of 1,000+ enthusiastic consumer testers, we give B2C founders the unfair distribution advantage they need to survive and thrive.
            </p>
          </div>
        </div>

        {/* CTA */}
        <div className="container mx-auto px-4 sm:px-6 lg:px-12 max-w-4xl text-center mt-16">
          <Link 
            href="/#waitlist" 
            className="btn-tactile-violet px-8 py-4 rounded-2xl bg-brand-violet text-white font-black text-base inline-flex items-center gap-2"
          >
            <span>Join our journey</span>
            <ArrowRight className="w-5 h-5 text-brand-pastel" />
          </Link>
        </div>
      </main>

      <Footer />
    </div>
  );
}
