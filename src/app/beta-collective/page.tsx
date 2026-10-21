import type { Metadata } from "next";
import Navbar from "@/components/Navbar";
import Footer from "@/components/Footer";
import Link from "next/link";
import { Users, ArrowRight, CheckCircle2, Star, ShieldCheck, Heart, Sparkles } from "lucide-react";

export const metadata: Metadata = {
  title: "Beta Collective | Threadly",
  description: "Access 1,000+ pre-vetted consumer early adopters ready to test your product, give qualitative feedback, and evangelize.",
};

export default function BetaCollectivePage() {
  return (
    <div className="min-h-screen flex flex-col bg-[#fdfcff] text-[#02010a]">
      <Navbar />

      <main className="flex-grow pt-32 pb-24">
        {/* Hero */}
        <div className="container mx-auto px-4 sm:px-6 lg:px-12 max-w-5xl text-center">
          <div className="inline-flex items-center gap-2 px-4 py-1.5 rounded-full bg-brand-violet/10 text-brand-violet text-xs sm:text-sm font-bold mb-6">
            <Users className="w-4 h-4 text-brand-bush" />
            Curated Early Adopters • 1,000+ Verified Testers
          </div>

          <h1 className="text-4xl sm:text-5xl md:text-6xl lg:text-7xl font-black tracking-tight text-gray-900 leading-tight mb-6">
            <span>Agentic </span>
            <span className="extruded-violet text-brand-bush">Beta Collective</span>
          </h1>

          <p className="text-lg sm:text-xl text-gray-600 max-w-2xl mx-auto leading-relaxed mb-10">
            Never launch to an empty room again. Tap into our private cohort of tech-forward consumers, product enthusiasts, and early adopters eager to stress-test your UX and give voice-of-customer reviews.
          </p>

          <div className="flex justify-center mb-16">
            <Link 
              href="/#waitlist" 
              className="btn-tactile-violet px-8 py-4 rounded-2xl bg-brand-violet text-white font-black text-base flex items-center gap-2"
            >
              <span>Apply for Cohort 1.0</span>
              <ArrowRight className="w-5 h-5 text-brand-pastel" />
            </Link>
          </div>
        </div>

        {/* 3 Pillars */}
        <div className="container mx-auto px-4 sm:px-6 lg:px-12 max-w-6xl my-16">
          <div className="grid md:grid-cols-3 gap-8">
            <div className="p-8 rounded-3xl bg-white border-2 border-gray-200 shadow-lg">
              <div className="w-12 h-12 rounded-2xl bg-brand-violet/10 text-brand-violet flex items-center justify-center mb-6">
                <ShieldCheck className="w-6 h-6" />
              </div>
              <h3 className="text-2xl font-black text-gray-900 mb-3">100% Real Humans</h3>
              <p className="text-gray-600 text-sm leading-relaxed">
                Zero bots or fake click farms. Every member of the Threadly Collective is manually vetted to ensure thoughtful, authentic feedback on your app.
              </p>
            </div>

            <div className="p-8 rounded-3xl bg-white border-2 border-gray-200 shadow-lg">
              <div className="w-12 h-12 rounded-2xl bg-emerald-50 text-emerald-600 flex items-center justify-center mb-6">
                <Star className="w-6 h-6" />
              </div>
              <h3 className="text-2xl font-black text-gray-900 mb-3">48-Hour Feedback SLA</h3>
              <p className="text-gray-600 text-sm leading-relaxed">
                Get video screencasts, friction logs, and qualitative survey answers within 48 hours of deploying your beta link to the cohort.
              </p>
            </div>

            <div className="p-8 rounded-3xl bg-white border-2 border-gray-200 shadow-lg">
              <div className="w-12 h-12 rounded-2xl bg-purple-50 text-brand-bush flex items-center justify-center mb-6">
                <Sparkles className="w-6 h-6" />
              </div>
              <h3 className="text-2xl font-black text-gray-900 mb-3">Organic Advocates</h3>
              <p className="text-gray-600 text-sm leading-relaxed">
                Testers who fall in love with your solution become your Day-1 launch evangelists on Product Hunt, Twitter, and App Store reviews.
              </p>
            </div>
          </div>
        </div>
      </main>

      <Footer />
    </div>
  );
}
