import type { Metadata } from "next";
import Navbar from "@/components/Navbar";
import Footer from "@/components/Footer";
import Pricing from "@/components/landing/Pricing";
import CreditCalculator from "@/components/landing/CreditCalculator";

export const metadata: Metadata = {
  title: "Pricing",
  description:
    "Threadly pricing: pay per result with credits. Packs from $49 for 1,000 credits, no seat fees, invite-only beta with 200 free credits for qualified teams.",
};

export default function PricingPage() {
  return (
    <div className="site flex min-h-screen flex-col">
      <Navbar />
      <main className="mx-auto w-full max-w-6xl flex-grow px-6 py-16">
        <div className="text-center">
          <p className="eyebrow">Members&apos; pricing</p>
          <h1 className="mt-4 font-display text-6xl tracking-tight">Pay for leads, not seats</h1>
          <p className="mx-auto mt-4 max-w-2xl text-zinc-400">
            Threadly is invite-only. Qualified teams get 200 free credits, then pay per company, social lead,
            email, contact and AI visibility scan.
          </p>
        </div>
        <div className="mt-12">
          <CreditCalculator />
        </div>
        <div className="mt-6">
          <Pricing />
        </div>
      </main>
      <Footer />
    </div>
  );
}
