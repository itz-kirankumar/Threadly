import type { Metadata } from "next";
import Navbar from "@/components/Navbar";
import Footer from "@/components/Footer";
import { FileText } from "lucide-react";

export const metadata: Metadata = {
  title: "Terms of Service | Threadly",
  description: "Terms and conditions governing use of the Threadly platform and community.",
};

export default function TermsPage() {
  return (
    <div className="min-h-screen flex flex-col bg-[#fdfcff] text-[#02010a]">
      <Navbar />

      <main className="flex-grow pt-32 pb-24">
        <div className="container mx-auto px-4 sm:px-6 lg:px-12 max-w-4xl">
          <div className="inline-flex items-center gap-2 px-4 py-1.5 rounded-full bg-brand-violet/10 text-brand-violet text-xs font-bold mb-6">
            <FileText className="w-4 h-4 text-brand-electric" />
            Legal Agreement
          </div>

          <h1 className="text-4xl sm:text-5xl font-black text-gray-900 tracking-tight mb-4">
            Terms of Service
          </h1>
          <p className="text-sm text-gray-500 mb-12">Last Updated: October 2026</p>

          <div className="prose max-w-none text-gray-700 leading-relaxed space-y-8 text-base">
            <section className="p-8 rounded-3xl bg-white border-2 border-gray-200 shadow-sm">
              <h2 className="text-xl font-bold text-gray-900 mb-3">1. Acceptance of Terms</h2>
              <p>
                By accessing or using Threadly, you agree to be bound by these Terms of Service. If you do not agree to these terms, please do not use our services.
              </p>
            </section>

            <section className="p-8 rounded-3xl bg-white border-2 border-gray-200 shadow-sm">
              <h2 className="text-xl font-bold text-gray-900 mb-3">2. Acceptable Use & Anti-Spam Policy</h2>
              <p className="mb-4">
                Threadly exists to foster authentic, value-driven connections between builders and early adopters. You agree not to:
              </p>
              <ul className="list-disc pl-6 space-y-2 text-sm">
                <li>Deploy automated scrapers, mass spam bots, or deceptive marketing tactics through our platform.</li>
                <li>Harass, misrepresent, or spam members of our Beta Collective.</li>
                <li>Attempt to reverse-engineer our proprietary intent extraction algorithms.</li>
              </ul>
            </section>

            <section className="p-8 rounded-3xl bg-white border-2 border-gray-200 shadow-sm">
              <h2 className="text-xl font-bold text-gray-900 mb-3">3. Beta Cohorts & Intellectual Property</h2>
              <p>
                You retain all ownership and intellectual property rights in your startup, products, and designs submitted to Threadly. Threadly retains all rights in its platform, algorithms, brand assets, and methodologies.
              </p>
            </section>

            <section className="p-8 rounded-3xl bg-white border-2 border-gray-200 shadow-sm">
              <h2 className="text-xl font-bold text-gray-900 mb-3">4. Limitation of Liability</h2>
              <p>
                Threadly provides AI-answer monitoring and GEO analytics on an &quot;as is&quot; basis. Answers from third-party AI providers vary between runs; while we strive for accurate measurement, we do not guarantee specific visibility, traffic, or revenue outcomes.
              </p>
            </section>
          </div>
        </div>
      </main>

      <Footer />
    </div>
  );
}
