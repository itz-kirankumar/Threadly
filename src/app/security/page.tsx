import Navbar from "@/components/Navbar";
import Footer from "@/components/Footer";
import type { Metadata } from "next";
import { ShieldCheck, Lock, Key, Server } from "lucide-react";

export const metadata: Metadata = {
  title: "Security | Threadly",
  description: "How Threadly protects your workspace data and handles AI provider credentials.",
};

const ITEMS = [
  {
    icon: Lock,
    title: "Per-user data isolation",
    body: "Every workspace lives under your Google account's user ID in Firebase Realtime Database, and the database rules deny all cross-user reads and writes. There is no shared dataset.",
  },
  {
    icon: Key,
    title: "Provider keys stay server-side",
    body: "OpenAI, Anthropic, Gemini and Perplexity API keys exist only as server environment variables. They are never sent to the browser, never logged, and never appear in scan results.",
  },
  {
    icon: ShieldCheck,
    title: "Authenticated API access",
    body: "Every workspace API call verifies your Google-issued Firebase ID token on the server before touching data. Scan endpoints are rate-limited per account.",
  },
  {
    icon: Server,
    title: "Managed infrastructure",
    body: "Threadly runs on Vercel and Google Firebase. All traffic is encrypted in transit with TLS. We rely on these providers' infrastructure controls rather than claiming our own certifications.",
  },
];

export default function SecurityPage() {
  return (
    <div className="min-h-screen flex flex-col bg-[#fdfcff] text-[#02010a]">
      <Navbar />

      <main className="flex-grow pt-32 pb-24 px-6">
        <div className="max-w-4xl mx-auto">
          <h1 className="text-4xl sm:text-5xl font-black tracking-tight mb-4">Security at Threadly</h1>
          <p className="text-lg text-gray-600 mb-16 max-w-2xl">
            The practices behind how we handle your workspace, your brand data and the credentials that power scans.
          </p>

          <div className="grid sm:grid-cols-2 gap-6 mb-12">
            {ITEMS.map((item) => (
              <div key={item.title} className="p-8 rounded-3xl bg-white border-2 border-gray-200 shadow-md">
                <div className="w-12 h-12 rounded-2xl bg-brand-violet/10 text-brand-violet flex items-center justify-center mb-4">
                  <item.icon className="w-6 h-6" />
                </div>
                <h3 className="text-xl font-black text-gray-900 mb-2">{item.title}</h3>
                <p className="text-gray-600 text-sm leading-relaxed">{item.body}</p>
              </div>
            ))}
          </div>

          <div className="p-8 sm:p-10 rounded-3xl bg-white border-2 border-gray-200 shadow-md space-y-4 text-sm text-gray-700">
            <h2 className="text-xl font-black text-gray-900 mb-2">Responsible Disclosure</h2>
            <p>
              If you discover a security vulnerability or concern within the Threadly platform, please report it by
              opening a security advisory on the GitHub repository. We acknowledge all reports as quickly as possible.
            </p>
          </div>
        </div>
      </main>

      <Footer />
    </div>
  );
}
