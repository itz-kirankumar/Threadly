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
    q: "How does team pricing work?",
    a: "Seats are included per plan (1 on Starter, 5 on Pro, 25 on Growth, unlimited on Enterprise). Invite your whole company with one link and manage roles - owner, admin and member - from Settings.",
  },
  {
    q: "How often do scans run?",
    a: "Automatically every day, plus unlimited manual scans whenever you want a fresh read. Trends, deltas and history build up from every run.",
  },
  {
    q: "When does billing start?",
    a: "Not yet. Threadly is in early access and paid plans are free until billing launches - we will announce it before it switches on. The free trial (10 questions, 1 full scan) always stays free, and early users keep their workspaces and history.",
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
