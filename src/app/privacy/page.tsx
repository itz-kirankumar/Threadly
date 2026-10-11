import type { Metadata } from "next";
import Navbar from "@/components/Navbar";
import Footer from "@/components/Footer";
import { ShieldCheck } from "lucide-react";

export const metadata: Metadata = {
  title: "Privacy Policy | Wisentry",
  description: "Learn how Wisentry collects, uses, and safeguards founder and user data.",
};

export default function PrivacyPage() {
  return (
    <div className="min-h-screen flex flex-col bg-[#fdfcff] text-[#02010a]">
      <Navbar />

      <main className="flex-grow pt-32 pb-24">
        <div className="container mx-auto px-4 sm:px-6 lg:px-12 max-w-4xl">
          <div className="inline-flex items-center gap-2 px-4 py-1.5 rounded-full bg-brand-violet/10 text-brand-violet text-xs font-bold mb-6">
            <ShieldCheck className="w-4 h-4 text-brand-electric" />
            Legal & Compliance
          </div>

          <h1 className="text-4xl sm:text-5xl font-black text-gray-900 tracking-tight mb-4">
            Privacy Policy
          </h1>
          <p className="text-sm text-gray-500 mb-12">Last Updated: October 2026</p>

          <div className="prose max-w-none text-gray-700 leading-relaxed space-y-8 text-base">
            <section className="p-8 rounded-3xl bg-white border-2 border-gray-200 shadow-sm">
              <h2 className="text-xl font-bold text-gray-900 mb-3">1. Information We Collect</h2>
              <p className="mb-4">
                When you sign up for Wisentry, join our waitlist, or participate in the Beta Collective, we may collect:
              </p>
              <ul className="list-disc pl-6 space-y-2 text-sm">
                <li>Contact details such as your full name, email address, and Discord handle.</li>
                <li>Startup information including product name, industry category, URL, and growth goals.</li>
                <li>Usage data such as interaction with our platform features, signal matching results, and qualitative feedback logs.</li>
              </ul>
            </section>

            <section className="p-8 rounded-3xl bg-white border-2 border-gray-200 shadow-sm">
              <h2 className="text-xl font-bold text-gray-900 mb-3">2. How We Use Your Information</h2>
              <p className="mb-4">
                We use the information we collect to:
              </p>
              <ul className="list-disc pl-6 space-y-2 text-sm">
                <li>Match your startup with relevant consumer discussions and early adopter cohorts.</li>
                <li>Provide personalized signal alerts, product feedback reports, and onboarding support.</li>
                <li>Maintain community trust and prevent abusive, fraudulent, or automated spam activities.</li>
              </ul>
            </section>

            <section className="p-8 rounded-3xl bg-white border-2 border-gray-200 shadow-sm">
              <h2 className="text-xl font-bold text-gray-900 mb-3">3. Data Sharing & Third Parties</h2>
              <p className="mb-4">
                We never sell your personal data. We only share information with trusted infrastructure providers (such as hosting, database, and email delivery partners) necessary to deliver our services, under strict confidentiality agreements.
              </p>
            </section>

            <section className="p-8 rounded-3xl bg-white border-2 border-gray-200 shadow-sm">
              <h2 className="text-xl font-bold text-gray-900 mb-3">4. Your Privacy Rights</h2>
              <p className="mb-4">
                Depending on your location (including under GDPR and CCPA), you have the right to access, update, export, or delete your personal data at any time. To exercise these rights, please contact us at privacy@wisentry.com.
              </p>
            </section>
          </div>
        </div>
      </main>

      <Footer />
    </div>
  );
}
