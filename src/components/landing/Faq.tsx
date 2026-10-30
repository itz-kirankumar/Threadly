export const FAQ_ITEMS = [
  {
    q: "What counts as a tracked question?",
    a: "A buyer question Threadly asks every configured AI provider on each scan - for example \"best CRM for small teams\". Your plan's limit is the number of questions tracked at once, and you can swap them anytime.",
  },
  {
    q: "Which AI assistants does Threadly track?",
    a: "ChatGPT, Claude and Gemini out of the box. On paid plans you can add any OpenAI-compatible endpoint - Groq, Together AI, Mistral, a self-hosted model - as a custom provider and track it alongside the built-ins.",
  },
  {
    q: "Can I use my own AI API keys?",
    a: "Yes. On Pro and above you can connect your own OpenAI, Anthropic or Gemini keys - scans then run on your accounts and quota. Keys are encrypted with AES-256-GCM and never shown again after saving.",
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
    q: "How do I get access?",
    a: "Threadly is invite-only during the beta. Request access with your work email and company website; we score your lead-generation fit from your homepage and use case. Teams that qualify are invited immediately with 200 free credits, and everyone else joins the waitlist. Existing customers keep their workspaces and history.",
  },
];

export default function Faq() {
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
