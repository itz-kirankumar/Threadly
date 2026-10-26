import type { Metadata } from "next";
import Navbar from "@/components/Navbar";
import Footer from "@/components/Footer";
import Pricing from "@/components/landing/Pricing";

export const metadata: Metadata = {
  title: "Pricing",
  description:
    "Threadly pricing: 7-day trial for $7 (10 questions, 1 full scan), Pro and Growth for marketing teams, and Enterprise for global brands. One-time purchases, no auto-renewal.",
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
            Measure how ChatGPT, Claude and Gemini talk about your brand. Start with the $7 trial, upgrade when
            your coverage grows - one-time purchases, no auto-renewal.
          </p>
        </div>
        <div className="mt-12">
          <Pricing />
        </div>
      </main>
      <Footer />
    </div>
  );
}
