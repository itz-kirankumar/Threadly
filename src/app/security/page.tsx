import type { Metadata } from "next";
import Navbar from "@/components/Navbar";
import Footer from "@/components/Footer";
import { ShieldCheck, Lock, Key, Server, CheckCircle2 } from "lucide-react";

export const metadata: Metadata = {
  title: "Security & Trust | Wisentry",
  description: "Learn about Wisentry's enterprise-grade security, data protection, and encryption protocols.",
};

export default function SecurityPage() {
  return (
    <div className="min-h-screen flex flex-col bg-[#fdfcff] text-[#02010a]">
      <Navbar />

      <main className="flex-grow pt-32 pb-24">
        <div className="container mx-auto px-4 sm:px-6 lg:px-12 max-w-4xl">
          <div className="inline-flex items-center gap-2 px-4 py-1.5 rounded-full bg-brand-violet/10 text-brand-violet text-xs font-bold mb-6">
            <Lock className="w-4 h-4 text-brand-electric" />
            Security & Trust
          </div>

          <h1 className="text-4xl sm:text-5xl font-black text-gray-900 tracking-tight mb-4">
            Security at Wisentry
          </h1>
          <p className="text-lg text-gray-600 mb-12">
            We treat your startup data, user feedback, and brand integrity with utmost care.
          </p>

          <div className="grid sm:grid-cols-2 gap-6 mb-12">
            <div className="p-8 rounded-3xl bg-white border-2 border-gray-200 shadow-md">
              <div className="w-12 h-12 rounded-2xl bg-brand-violet/10 text-brand-violet flex items-center justify-center mb-4">
                <Key className="w-6 h-6" />
              </div>
              <h3 className="text-xl font-black text-gray-900 mb-2">End-to-End Encryption</h3>
              <p className="text-gray-600 text-sm leading-relaxed">
                All traffic is encrypted in transit using TLS 1.3 and at rest with AES-256 standards across all databases and backups.
              </p>
            </div>

            <div className="p-8 rounded-3xl bg-white border-2 border-gray-200 shadow-md">
              <div className="w-12 h-12 rounded-2xl bg-emerald-50 text-emerald-600 flex items-center justify-center mb-4">
                <Server className="w-6 h-6" />
              </div>
              <h3 className="text-xl font-black text-gray-900 mb-2">SOC 2 Compliant Cloud</h3>
              <p className="text-gray-600 text-sm leading-relaxed">
                Our infrastructure is hosted on AWS with strict VPC isolation, automated failover, and continuous vulnerability scanning.
              </p>
            </div>
          </div>

          <div className="p-8 sm:p-10 rounded-3xl bg-white border-2 border-gray-200 shadow-md space-y-4 text-sm text-gray-700">
            <h2 className="text-xl font-black text-gray-900 mb-2">Responsible Disclosure</h2>
            <p>
              If you discover a security vulnerability or concern within the Wisentry platform, please let us know immediately by emailing security@wisentry.com. We acknowledge all reports within 24 hours.
            </p>
          </div>
        </div>
      </main>

      <Footer />
    </div>
  );
}
