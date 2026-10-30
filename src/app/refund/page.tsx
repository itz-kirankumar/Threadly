import type { Metadata } from "next";
import Navbar from "@/components/Navbar";
import Footer from "@/components/Footer";
import { Receipt } from "lucide-react";

export const metadata: Metadata = {
  title: "Refund and Cancellation Policy | Threadly",
  description: "Refund and cancellation policy for Threadly plans and purchases.",
};

export default function RefundPage() {
  return (
    <div className="min-h-screen flex flex-col site">
      <Navbar />

      <main className="flex-grow pt-32 pb-24">
        <div className="container mx-auto px-4 sm:px-6 lg:px-12 max-w-4xl">
          <div className="inline-flex items-center gap-2 px-4 py-1.5 rounded-full bg-brand-violet/10 text-brand-violet text-xs font-bold mb-6">
            <Receipt className="w-4 h-4 text-brand-electric" />
            Legal Agreement
          </div>

          <h1 className="text-4xl sm:text-5xl font-black text-gray-900 tracking-tight mb-4">
            Refund and Cancellation Policy
          </h1>
          <p className="text-sm text-gray-500 mb-12">Last Updated: October 2026</p>

          <div className="prose max-w-none text-gray-700 leading-relaxed space-y-8 text-base">
            <section className="p-8 rounded-3xl bg-white border-2 border-gray-200 shadow-sm">
              <h2 className="text-xl font-bold text-gray-900 mb-3">Refunds</h2>
              <p>
                Threadly does not offer voluntary refunds. This does not limit remedies required by law or the
                payment provider&apos;s buyer terms. For incorrect or duplicate charges, or a payment without plan
                activation, contact{" "}
                <a href="mailto:hello@gothreadly.live" className="text-brand-violet underline underline-offset-2">
                  hello@gothreadly.live
                </a>{" "}
                with the payment reference for review and correction.
              </p>
            </section>

            <section className="p-8 rounded-3xl bg-white border-2 border-gray-200 shadow-sm">
              <h2 className="text-xl font-bold text-gray-900 mb-3">Cancellation</h2>
              <p>
                Recurring subscriptions can be cancelled through{" "}
                <a href="mailto:hello@gothreadly.live" className="text-brand-violet underline underline-offset-2">
                  hello@gothreadly.live
                </a>{" "}
                to stop future renewals, with access continuing through the paid term. Razorpay one-time plans expire
                at the end of their purchased term and do not auto-renew.
              </p>
            </section>
          </div>
        </div>
      </main>

      <Footer />
    </div>
  );
}
