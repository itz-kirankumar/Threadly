export const FAQ_ITEMS = [
  {
    q: "What counts as a tracked question?",
    a: "A buyer question Threadly asks every configured AI provider on each scan - for example \"best CRM for small teams\". Track up to 25 at once and swap them anytime; each scan across them costs 10 credits.",
  },
  {
    q: "Which AI assistants does Threadly track?",
    a: "ChatGPT, Claude and Gemini out of the box. You can also add any OpenAI-compatible endpoint - Groq, Together AI, Mistral, a self-hosted model - as a custom provider and track it alongside the built-ins.",
  },
  {
    q: "Can I use my own AI API keys?",
    a: "Yes. You can connect your own OpenAI, Anthropic or Gemini keys - scans then run on your accounts and quota. Keys are encrypted with AES-256-GCM and never shown again after saving.",
  },
  {
    q: "How does pricing work?",
    a: "You pay per result in credits: 1 credit per research run, matching company or AI-written email, 2 per social lead with a drafted reply, 5 per decision-maker contact found and 10 per AI visibility scan. Packs start at $49 for 1,000 credits. There are no seat fees, so invite your whole team.",
  },
  {
    q: "How often do scans run?",
    a: "Automatically every day, plus unlimited manual scans whenever you want a fresh read. Trends, deltas and history build up from every run.",
  },
  {
    q: "Is there an API or SDK?",
    a: "Yes. The REST API returns your latest visibility metrics (GET /api/v1/summary with a thly_ key), and the open-source threadly-geo package on npm runs GEO scans from Node or the command line with your own AI keys. API access opens after your first credit pack.",
  },
  {
    q: "How do I get access?",
    a: "Threadly is invite-only. Check your eligibility with your work email and company website: we read your homepage, audit its AI readiness and run a set of lead-generation checks. Teams that pass are onboarded on the spot with free credits. Existing customers keep their workspaces and history.",
  },
];

export default function Faq({ tone = "dark" }: { tone?: "dark" | "light" }) {
  if (tone === "light") {
    return (
      <div className="space-y-3">
        {FAQ_ITEMS.map((item, i) => (
          <details key={item.q} className="group rounded-2xl border border-zinc-200 bg-white px-5 py-4 shadow-sm transition open:border-violet-300 open:shadow-[0_18px_40px_-24px_rgba(124,58,237,0.5)]" open={i === 0}>
            <summary className="flex cursor-pointer list-none items-center justify-between gap-4 text-[15px] font-semibold text-zinc-900 marker:hidden [&::-webkit-details-marker]:hidden">
              {item.q}
              <span className="flex h-7 w-7 shrink-0 items-center justify-center rounded-full bg-violet-50 text-violet-700 transition-transform group-open:rotate-45">+</span>
            </summary>
            <p className="mt-3 text-sm leading-relaxed text-zinc-600">{item.a}</p>
          </details>
        ))}
      </div>
    );
  }
  return (
    <div className="divide-y divide-white/10 rounded-xl border border-white/10 bg-white/[0.02]">
      {FAQ_ITEMS.map((item) => (
        <details key={item.q} className="group px-5 py-4">
          <summary className="flex cursor-pointer list-none items-center justify-between gap-4 text-sm font-semibold text-white marker:hidden [&::-webkit-details-marker]:hidden">
            {item.q}
            <span className="shrink-0 text-zinc-500 transition-transform group-open:rotate-45">+</span>
          </summary>
          <p className="mt-2 text-sm leading-relaxed text-zinc-400">{item.a}</p>
        </details>
      ))}
    </div>
  );
}
