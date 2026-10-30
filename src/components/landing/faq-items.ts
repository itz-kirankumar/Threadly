// Shared by the accordion (client) and the FAQ JSON-LD (server).
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
    a: "You pay per result in credits: 1 credit per research run, matching company or AI-written email, 2 per social lead, 5 per decision-maker contact found and 10 per AI visibility scan. Packs start at $49 for 1,000 credits. There are no seat fees, so invite your whole team.",
  },
  {
    q: "How often do scans run?",
    a: "Automatically every day, plus manual scans whenever you want a fresh read. Trends, deltas and history build up from every run.",
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
