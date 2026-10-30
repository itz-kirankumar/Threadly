import Link from "next/link";
import Navbar from "@/components/Navbar";
import Footer from "@/components/Footer";
import Reveal from "@/components/landing/Reveal";
import LiveDemo from "@/components/landing/LiveDemo";
import Pricing from "@/components/landing/Pricing";
import Faq from "@/components/landing/Faq";
import { FAQ_ITEMS } from "@/components/landing/faq-items";
import ProductShowcase from "@/components/landing/ProductShowcase";
import HowItWorks from "@/components/landing/HowItWorks";
import AIVisibility from "@/components/landing/AIVisibility";
import CreditCalculator from "@/components/landing/CreditCalculator";
import ThreadLines from "@/components/landing/ThreadLines";
import EarlyAccess from "@/components/landing/EarlyAccess";
import Developers from "@/components/landing/Developers";
import { FIRST_PACK_BONUS_CAP, FIRST_PACK_BONUS_PERCENT } from "@/lib/credits/rates";

const STANDARDS = [
  { title: "Every fact has a source", body: "Each company, competitor and email line links to the page or search it came from." },
  { title: "Licensed contact data only", body: "Decision-makers come from licensed providers with recorded source attribution." },
  { title: "You approve every send", body: "Outreach passes through approved campaigns, suppression, unsubscribe, verification and daily caps before sending." },
  { title: "An audit trail you can export", body: "Owners and administrators can export an append-only record of outbound actions: who, what, when and the outcome." },
];

export default function LandingPage() {
  const faqJsonLd = {
    "@context": "https://schema.org",
    "@type": "FAQPage",
    mainEntity: FAQ_ITEMS.map((item) => ({
      "@type": "Question",
      name: item.q,
      acceptedAnswer: { "@type": "Answer", text: item.a },
    })),
  };
  return (
    <div className="site flex min-h-screen flex-col">
      <Navbar />
      <main className="flex-grow">
        {/* Hero and live search */}
        <section className="relative">
          <ThreadLines mode="sides" target=".search-shell" className="hidden md:block" />
          <div className="relative mx-auto max-w-6xl px-6 pb-24 pt-40 text-center sm:pt-48">
            <p className="eyebrow">A private intelligence desk for B2B teams</p>
            <h1 className="mx-auto mt-6 max-w-4xl font-display text-5xl leading-[1.05] tracking-tight sm:text-7xl">
              Know your market.<br />
              <span className="text-[#5B3DF5]">Find your next customer.</span>
            </h1>
            <p className="mx-auto mt-6 max-w-2xl text-[17px] leading-relaxed text-[#6B6A72]">
              Threadly researches your market, discovers companies showing relevant buying signals, identifies decision-makers, and helps your team approach them with context.
            </p>
            <div className="mt-10">
              <LiveDemo bonus={{ percent: FIRST_PACK_BONUS_PERCENT, cap: FIRST_PACK_BONUS_CAP }} />
            </div>
          </div>
        </section>

        {/* Product */}
        <section id="product" className="scroll-mt-20">
          <div className="mx-auto max-w-6xl px-6 py-24">
            <Reveal>
              <p className="eyebrow">The product</p>
              <h2 className="mt-4 max-w-2xl font-display text-5xl leading-[1.08] tracking-tight">One desk for your whole market.</h2>
              <p className="mt-4 max-w-xl text-[#6B6A72]">From the first company you find to the first email you approve, every view shares the same sources.</p>
            </Reveal>
            <Reveal className="mt-12"><ProductShowcase /></Reveal>
          </div>
        </section>

        {/* How it works */}
        <section id="how-it-works" className="scroll-mt-20 bg-[#EFEEEA]">
          <div className="mx-auto max-w-6xl px-6 py-24"><HowItWorks /></div>
        </section>

        {/* AI visibility */}
        <section id="ai-visibility" className="relative scroll-mt-20 overflow-hidden">
          <div className="relative mx-auto max-w-6xl px-6 py-24">
            <Reveal>
              <p className="eyebrow">AI visibility</p>
              <h2 className="mt-4 max-w-2xl font-display text-5xl leading-[1.08] tracking-tight">Be visible where your buyers ask.</h2>
              <p className="mt-4 max-w-xl text-[#6B6A72]">Understand how AI assistants describe your brand, which sources they cite, and how your visibility compares with competitors.</p>
            </Reveal>
            <Reveal className="mt-12"><AIVisibility /></Reveal>
          </div>
        </section>

        {/* Standards */}
        <section className="bg-[#EFEEEA]">
          <div className="mx-auto max-w-6xl px-6 py-24">
            <Reveal>
              <p className="eyebrow">Standards</p>
              <h2 className="mt-4 font-display text-5xl leading-[1.08] tracking-tight">Intelligence you can account for.</h2>
            </Reveal>
            <div className="mt-12 grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
              {STANDARDS.map((item, index) => (
                <Reveal key={item.title} delay={index * 60}>
                  <div className="h-full rounded-2xl border border-black/[0.08] p-6 transition-colors duration-300 hover:border-[#5B3DF5]/30">
                    <h3 className="text-[17px] text-[#111114]">{item.title}</h3>
                    <p className="mt-3 text-sm leading-relaxed text-[#6B6A72]">{item.body}</p>
                  </div>
                </Reveal>
              ))}
            </div>
          </div>
        </section>

        {/* Developers */}
        <section id="developers" className="scroll-mt-20">
          <div className="mx-auto max-w-6xl px-6 py-24">
            <Reveal><Developers /></Reveal>
          </div>
        </section>

        {/* Pricing */}
        <section id="pricing" className="scroll-mt-20 bg-[#EFEEEA]">
          <div className="mx-auto max-w-6xl px-6 py-24">
            <Reveal>
              <h2 className="text-center font-display text-5xl tracking-tight">Pay as you go with no subscription</h2>
              <p className="mx-auto mt-4 max-w-xl text-center text-[#6B6A72]">Members buy credits and spend them on companies, leads, emails and scans. No seats and no subscription.</p>
            </Reveal>
            <div className="mt-12"><CreditCalculator /></div>
            <div className="mt-6"><Pricing /></div>
          </div>
        </section>

        <EarlyAccess />

        {/* FAQ */}
        <section id="faq" className="scroll-mt-20 bg-[#EFEEEA]">
          <script type="application/ld+json" dangerouslySetInnerHTML={{ __html: JSON.stringify(faqJsonLd) }} />
          <div className="mx-auto grid max-w-6xl gap-12 px-6 py-24 lg:grid-cols-[minmax(0,0.75fr)_minmax(0,1.25fr)]">
            <Reveal>
              <p className="eyebrow">Questions</p>
              <h2 className="mt-4 font-display text-5xl leading-[1.08] tracking-tight">Before you apply.</h2>
            </Reveal>
            <Faq />
          </div>
        </section>

        {/* Final CTA */}
        <section className="relative overflow-hidden">
          <ThreadLines mode="fan" target="#final-cta-actions" />
          <div className="relative mx-auto max-w-3xl px-6 pb-72 pt-28 text-center">
            <Reveal>
              <h2 className="font-display text-5xl leading-[1.06] tracking-tight sm:text-6xl">Your next opportunity is already out there.</h2>
              <p className="mx-auto mt-5 max-w-lg text-lg text-[#6B6A72]">Research your market, discover the right companies, and approach them with intelligence.</p>
              <div id="final-cta-actions" className="mt-9 flex flex-wrap items-center justify-center gap-3">
                <Link href="/#early-access" className="btn-primary rounded-xl px-7 py-3 text-sm font-medium">Request an invitation</Link>
                <Link href="/portal" className="rounded-xl border border-black/[0.14] bg-white px-7 py-3 text-sm text-[#111114] transition-colors hover:border-[#5B3DF5]/50">Member sign in</Link>
              </div>
            </Reveal>
          </div>
        </section>
      </main>
      <Footer />
    </div>
  );
}
