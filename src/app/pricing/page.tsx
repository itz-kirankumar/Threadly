import type { Metadata } from "next";
import Navbar from "@/components/Navbar";
import Footer from "@/components/Footer";
import Pricing from "@/components/landing/Pricing";

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

        <div className="mx-auto mt-16 max-w-3xl">
          <h2 className="text-center text-xl font-semibold text-white">Questions</h2>
          <div className="mt-6 space-y-4">
            {[
              {
                q: "What counts as a tracked question?",
                a: "A buyer question Threadly asks every configured AI provider on each scan - for example \"best CRM for small teams\". Your plan's limit is the number of questions tracked at once, and you can swap them anytime.",
              },
              {
                q: "Can I use my own AI API keys?",
                a: "Yes. On Pro and above you can connect your own OpenAI, Anthropic or Gemini keys - scans then run on your accounts and quota. You can also add any OpenAI-compatible endpoint as a custom provider.",
              },
              {
                q: "How does team pricing work?",
                a: "Seats are included per plan (1 on Starter, 5 on Pro, 25 on Growth, unlimited on Enterprise). Invite your whole company with one link and manage roles - owner, admin and member - from Settings.",
              },
              {
                q: "When does billing start?",
                a: "Not yet. Threadly is in early access and every plan is free. We will announce billing before it switches on, and early users keep their workspaces and history.",
              },
            ].map((item) => (
              <div key={item.q} className="rounded-xl border border-white/10 bg-white/[0.02] px-5 py-4">
                <p className="text-sm font-semibold text-white">{item.q}</p>
                <p className="mt-1.5 text-sm leading-relaxed text-zinc-400">{item.a}</p>
              </div>
            ))}
          </div>
        </div>
      </main>
      <Footer />
    </div>
  );
}
