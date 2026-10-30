import type { Metadata } from "next";
import Link from "next/link";
import Navbar from "@/components/Navbar";
import Footer from "@/components/Footer";
import Developers from "@/components/landing/Developers";

export const metadata: Metadata = {
  title: "Developers",
  description: "Threadly for developers: the REST API for AI visibility metrics, and threadly-geo, the open-source GEO scanner library and CLI on npm.",
};

const ENDPOINTS = [
  { method: "GET", path: "/api/v1/summary", body: "Brand, competitors, latest scan run and headline metrics: mention rate, citation share, share of voice, average position, per provider." },
];

const PACKAGE_API = [
  { name: "scanAll({ query, brand, providers?, keys? })", body: "Scan every provider and roll up the metrics." },
  { name: "scanQuery({ provider, query, brand, apiKey?, model? })", body: "One provider: chatgpt, claude or gemini." },
  { name: "analyzeAnswer(provider, { answer, citations }, brand)", body: "Mention, citation and position analysis of any answer text." },
];

export default function DevelopersPage() {
  return (
    <div className="premium flex min-h-screen flex-col">
      <Navbar tone="light" />
      <main className="flex-grow">
        <section className="relative overflow-hidden border-b border-zinc-200/80">
          <div className="pointer-events-none absolute -top-40 left-1/2 h-[420px] w-[760px] -translate-x-1/2 rounded-full bg-gradient-to-r from-violet-400/30 to-fuchsia-300/25 blur-[120px]" aria-hidden />
          <div className="relative mx-auto max-w-6xl px-6 py-20">
            <p className="premium-eyebrow">Developers</p>
            <h1 className="mt-4 max-w-3xl font-display text-6xl leading-tight tracking-tight">Your AI visibility data, in your own tools</h1>
            <div className="mt-10">
              <Developers heading={false} />
            </div>
          </div>
        </section>

        <section className="mx-auto grid max-w-6xl gap-6 px-6 py-16 lg:grid-cols-2">
          <div className="rounded-3xl border border-zinc-200 bg-white p-6">
            <h2 className="text-xl font-semibold">REST API</h2>
            <p className="mt-1 text-sm text-zinc-600">Create a key in Settings, API access. It opens after your first credit pack.</p>
            <ul className="mt-4 divide-y divide-zinc-100">
              {ENDPOINTS.map((e) => (
                <li key={e.path} className="py-3">
                  <p className="font-mono text-sm"><span className="mr-2 rounded bg-violet-100 px-1.5 py-0.5 text-xs font-semibold text-violet-800">{e.method}</span>{e.path}</p>
                  <p className="mt-1 text-sm text-zinc-600">{e.body}</p>
                </li>
              ))}
            </ul>
            <Link href="/docs/public-api" className="mt-4 inline-block text-sm font-semibold text-violet-700 hover:text-violet-600">Read the API reference →</Link>
          </div>
          <div className="rounded-3xl border border-zinc-200 bg-white p-6">
            <h2 className="text-xl font-semibold">threadly-geo package</h2>
            <p className="mt-1 text-sm text-zinc-600">Open source on npm. Node 18+, zero dependencies, bring your own AI keys.</p>
            <ul className="mt-4 divide-y divide-zinc-100">
              {PACKAGE_API.map((f) => (
                <li key={f.name} className="py-3">
                  <p className="font-mono text-[13px] text-zinc-900">{f.name}</p>
                  <p className="mt-1 text-sm text-zinc-600">{f.body}</p>
                </li>
              ))}
            </ul>
            <a href="https://www.npmjs.com/package/threadly-geo" target="_blank" rel="noopener noreferrer" className="mt-4 inline-block text-sm font-semibold text-violet-700 hover:text-violet-600">View on npm ↗</a>
          </div>
        </section>

        <section className="mx-auto max-w-6xl px-6 pb-20">
          <div className="grid gap-4 sm:grid-cols-3">
            {[
              ["Quickstart", "Set up a workspace and run your first scan.", "/docs/quickstart"],
              ["Bring your own AI keys", "Run scans on your own provider accounts.", "/docs/own-api-keys"],
              ["Custom providers", "Track any OpenAI-compatible endpoint.", "/docs/custom-providers"],
            ].map(([title, body, href]) => (
              <Link key={href} href={href} className="group rounded-2xl border border-zinc-200 bg-white p-5 transition hover:-translate-y-0.5 hover:border-violet-300 hover:shadow-[0_18px_40px_-24px_rgba(124,58,237,0.5)]">
                <p className="font-semibold group-hover:text-violet-700">{title} →</p>
                <p className="mt-1 text-sm text-zinc-600">{body}</p>
              </Link>
            ))}
          </div>
        </section>
      </main>
      <Footer tone="light" />
    </div>
  );
}
