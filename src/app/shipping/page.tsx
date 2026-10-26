import type { Metadata } from "next";
import Navbar from "@/components/Navbar";
import Footer from "@/components/Footer";
import { Package } from "lucide-react";

export const metadata: Metadata = {
  title: "Shipping and Exchange Policy | Threadly",
  description: "How Threadly delivers plan access: digital delivery only, no physical shipping.",
};

export default function ShippingPage() {
  return (
    <div className="min-h-screen flex flex-col bg-[#fdfcff] text-[#02010a]">
      <Navbar />

      <main className="flex-grow pt-32 pb-24">
        <div className="container mx-auto px-4 sm:px-6 lg:px-12 max-w-4xl">
          <div className="inline-flex items-center gap-2 px-4 py-1.5 rounded-full bg-brand-violet/10 text-brand-violet text-xs font-bold mb-6">
            <Package className="w-4 h-4 text-brand-electric" />
            Legal Agreement
          </div>

          <h1 className="text-4xl sm:text-5xl font-black text-gray-900 tracking-tight mb-4">
            Shipping and Exchange Policy
          </h1>
          <p className="text-sm text-gray-500 mb-12">Last Updated: October 2026</p>

          <div className="prose max-w-none text-gray-700 leading-relaxed space-y-8 text-base">
            <section className="p-8 rounded-3xl bg-white border-2 border-gray-200 shadow-sm">
              <h2 className="text-xl font-bold text-gray-900 mb-3">No physical shipping</h2>
              <p>
                Threadly is a digital service. No physical products are sold or shipped, so there is no shipping
                address, shipping charge, or delivery carrier involved in any purchase.
              </p>
            </section>

            <section className="p-8 rounded-3xl bg-white border-2 border-gray-200 shadow-sm">
              <h2 className="text-xl font-bold text-gray-900 mb-3">Digital delivery</h2>
              <p>
                Plan access is delivered digitally. Once your payment is confirmed, the plan is activated on the
                Threadly account registered with the email and mobile number used at checkout. If you paid without
                signing in, the purchase is linked when you sign in or create your account with those same details
                using the claim link shown at checkout. If a payment succeeds but your plan is not activated, contact{" "}
                <a href="mailto:hello@gothreadly.live" className="text-brand-violet underline underline-offset-2">
                  hello@gothreadly.live
                </a>{" "}
                with your payment reference.
              </p>
            </section>

            <section className="p-8 rounded-3xl bg-white border-2 border-gray-200 shadow-sm">
              <h2 className="text-xl font-bold text-gray-900 mb-3">Exchange</h2>
              <p>
                Plans are digital and term-based, so exchanges do not apply. Plan changes are managed from your
                billing settings, and cancellations and refunds follow the{" "}
                <a href="/refund" className="text-brand-violet underline underline-offset-2">
                  Refund and Cancellation Policy
                </a>
                .
              </p>
            </section>
          </div>
        </div>
      </main>

      <Footer />
    </div>
  );
}
