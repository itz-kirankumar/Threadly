import type { Metadata } from "next";
import Navbar from "@/components/Navbar";
import Footer from "@/components/Footer";
import Pricing from "@/components/landing/Pricing";
import Faq from "@/components/landing/Faq";

export const metadata: Metadata = {
  title: "Pricing",
  description:
    "Threadly pricing: free starter plan, Pro and Growth for marketing teams, and Enterprise for global brands. Every plan is free during early access.",
};

export default function PricingPage() {
  return (
    <div className="flex min-h-screen flex-col bg-zinc-950">
      <Navbar />
      <main className="mx-auto w-full max-w-6xl flex-grow px-6 py-16">
        <div className="text-center">
          <p className="text-xs font-semibold uppercase tracking-widest text-violet-400">Pricing</p>
          <h1 className="mt-3 text-4xl font-bold tracking-tight text-white">Enterprise GEO intelligence, priced for every team</h1>
          <p className="mx-auto mt-4 max-w-2xl text-zinc-400">
            Measure how ChatGPT, Claude and Gemini talk about your brand. Start free, upgrade when your coverage
            grows - every paid plan is free during early access.
          </p>
        </div>
        <div className="mt-12">
          <Pricing />
        </div>

        <div className="mx-auto mt-16 max-w-5xl">
          <h2 className="text-center text-xl font-semibold text-white">Questions</h2>
          <div className="mt-6">
            <Faq />
          </div>
        </div>
      </main>
      <Footer />
    </div>
  );
}
