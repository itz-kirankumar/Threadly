import type { Metadata } from "next";
import Navbar from "@/components/Navbar";
import Footer from "@/components/Footer";
import { Mail } from "lucide-react";

export const metadata: Metadata = {
  title: "Contact Us | Threadly",
  description: "How to reach Threadly support for billing, plans, and product questions.",
};

export default function ContactPage() {
  return (
    <div className="min-h-screen flex flex-col bg-[#fdfcff] text-[#02010a]">
      <Navbar />

      <main className="flex-grow pt-32 pb-24">
        <div className="container mx-auto px-4 sm:px-6 lg:px-12 max-w-4xl">
          <div className="inline-flex items-center gap-2 px-4 py-1.5 rounded-full bg-brand-violet/10 text-brand-violet text-xs font-bold mb-6">
            <Mail className="w-4 h-4 text-brand-electric" />
            Support
          </div>

          <h1 className="text-4xl sm:text-5xl font-black text-gray-900 tracking-tight mb-4">
            Contact Us
          </h1>
          <p className="text-sm text-gray-500 mb-12">Last Updated: October 2026</p>

          <div className="prose max-w-none text-gray-700 leading-relaxed space-y-8 text-base">
            <section className="p-8 rounded-3xl bg-white border-2 border-gray-200 shadow-sm">
              <h2 className="text-xl font-bold text-gray-900 mb-3">Support email</h2>
              <p>
                For product questions, billing, refunds, cancellations, and account help, email{" "}
                <a href="mailto:hello@gothreadly.live" className="text-brand-violet underline underline-offset-2">
                  hello@gothreadly.live
                </a>
                . For anything about a payment, include the payment reference from your receipt or checkout so we can
                match it to your payment.
              </p>
            </section>

            <section className="p-8 rounded-3xl bg-white border-2 border-gray-200 shadow-sm">
              <h2 className="text-xl font-bold text-gray-900 mb-3">What to expect</h2>
              <p>
                Payment-error reports (incorrect or duplicate charges, or a payment without plan activation) are
                reviewed and corrected under the{" "}
                <a href="/refund" className="text-brand-violet underline underline-offset-2">
                  Refund and Cancellation Policy
                </a>
                . Include your account email and the payment reference for the fastest resolution.
              </p>
            </section>
          </div>
        </div>
      </main>

      <Footer />
    </div>
  );
}
