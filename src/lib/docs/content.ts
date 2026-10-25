// Threadly platform docs: content model + all pages.
// Rendered by src/app/docs/[slug]/page.tsx; searched by src/components/docs/DocsSearch.tsx.

export type DocBlock =
  | { type: "p"; text: string }
  | { type: "h2"; text: string }
  | { type: "h3"; text: string }
  | { type: "list"; items: string[] }
  | { type: "code"; title?: string; text: string }
  | { type: "note"; text: string };

export interface DocPage {
  slug: string;
  section: string;
  title: string;
  description: string;
  blocks: DocBlock[];
}

export const DOC_SECTIONS = ["First steps", "Using Threadly", "Providers and keys", "Reference"] as const;

export const DOC_PAGES: DocPage[] = [
  {
    slug: "intro",
    section: "First steps",
    title: "Intro to Threadly",
    description: "What Threadly measures and how it works.",
    blocks: [
      { type: "p", text: "Threadly is an enterprise GEO (Generative Engine Optimization) intelligence platform. It measures how AI assistants talk about your brand: whether they mention you, whether they cite your website, and how you compare to competitors - question by question, scan after scan." },
      { type: "p", text: "Buyers increasingly ask an AI assistant before they open a browser. Threadly asks ChatGPT, Claude and Gemini the questions your buyers ask, then extracts the signals that decide whether you show up in the answer." },
      { type: "h2", text: "What you get" },
      { type: "list", items: [
        "Mention rate - how often AI answers name your brand for the questions you track.",
        "Citation share - how often answers link your domain versus every other source.",
        "Share of voice - your mentions versus your competitors' mentions.",
        "Average position - where your brand appears when answers name several brands.",
        "Citation leaderboard - the exact domains AI cites in your category, including competitor and third-party sources.",
      ] },
      { type: "h2", text: "How a scan works" },
      { type: "p", text: "Each scan takes your tracked questions and asks every configured AI provider all of them, with live web search enabled where the provider supports it. Threadly parses each answer for brand mentions, competitor mentions, citation URLs and brand ordering, then stores the raw answers so you can read exactly what buyers see." },
      { type: "note", text: "Every number in your workspace comes from your own scans. Threadly never shows illustrative or synthetic metrics in a real workspace." },
    ],
  },
  {
    slug: "quickstart",
    section: "First steps",
    title: "Quickstart",
    description: "From sign-up to your first scan in about five minutes.",
    blocks: [
      { type: "p", text: "You can go from a new account to a completed scan in five minutes. All you need is a Google account." },
      { type: "h2", text: "1. Sign in" },
      { type: "p", text: "Open your workspace and choose Continue with Google. Your workspace is private to your account - there are no passwords to manage." },
      { type: "h2", text: "2. Set up your brand" },
      { type: "p", text: "Onboarding asks for your brand name, website domain, optional aliases, a one-line description of what you sell, and your competitors (up to 8). You can also upload a company logo here - it appears across your workspace." },
      { type: "h2", text: "3. Track buyer questions" },
      { type: "p", text: "Add the questions your buyers ask AI assistants, or press Suggest and Threadly drafts relevant questions from your category using AI. Three to ten questions is a good starting set." },
      { type: "h2", text: "4. Run your first scan" },
      { type: "p", text: "Press Run scan now. A scan asks every configured provider every tracked question and usually completes within a couple of minutes. Click any question row afterwards to read the full answers and citations." },
      { type: "h2", text: "5. Take the tour" },
      { type: "p", text: "On your first visit a guided tour spotlights each part of the workspace - metrics, providers, scanning, citations, history and settings. It plays once and stays out of your way after that." },
      { type: "note", text: "After the first scan, a daily automatic scan runs at 03:00 UTC so your trend charts fill in without manual work." },
    ],
  },
  {
    slug: "scans-and-metrics",
    section: "Using Threadly",
    title: "Scans and metrics explained",
    description: "Exactly how each metric is computed from scan data.",
    blocks: [
      { type: "h2", text: "What a scan contains" },
      { type: "p", text: "A scan run records the timestamp, the questions asked, and per-provider status: scanned, failed, or not configured. Failures are isolated - one provider failing (for example a quota error) never discards the other providers' results." },
      { type: "h2", text: "Mention rate" },
      { type: "p", text: "The percentage of scanned answers that name your brand or any of your aliases. An answer counts as a mention whether or not it links to you." },
      { type: "h2", text: "Citation share" },
      { type: "p", text: "Your domain's share of all citations across scanned answers: citations of your domain divided by citations of every domain, including competitor and third-party sources." },
      { type: "h2", text: "Share of voice" },
      { type: "p", text: "Your brand mentions divided by all brand mentions (you plus every tracked competitor) across scanned answers." },
      { type: "h2", text: "Average position" },
      { type: "p", text: "When an answer names several brands, Threadly records the order. Average position is the mean rank of your brand across answers that mention it. Lower is better." },
      { type: "h2", text: "Reading the question matrix" },
      { type: "p", text: "The Questions tab shows one row per tracked question and one column per provider. A filled dot means your brand was mentioned, a hexagon means your domain was cited, and #n is your position among named brands. Click a row to read the full answer and its citations." },
      { type: "h2", text: "The citations leaderboard" },
      { type: "p", text: "The Citations tab ranks every domain AI assistants cited in your category, labelled as You, Competitor, or Source. These are the pages that shape what AI says about you - and the strongest candidates for where to publish, list, or earn coverage." },
    ],
  },
  {
    slug: "daily-scans-and-history",
    section: "Using Threadly",
    title: "Daily scans and history",
    description: "Automatic scanning and how trends build over time.",
    blocks: [
      { type: "p", text: "After your first scan, Threadly runs an automatic scan every day at 03:00 UTC across every workspace. Automatic scans use the same provider and key resolution as manual ones - if you connected your own keys, the daily scan uses them too." },
      { type: "h2", text: "Scan history" },
      { type: "p", text: "The Scans tab lists every run with its question count and per-provider status. Trends are computed from this history, so metrics become meaningful from the second scan onwards - deltas on the overview cards always compare against the previous scan." },
      { type: "h2", text: "Good scanning habits" },
      { type: "list", items: [
        "Keep your question set stable for trend lines you can trust; add new questions rather than constantly replacing them.",
        "AI answers vary run to run. Read trends over weeks, not single scans.",
        "After shipping a content or positioning change, run a manual scan to start measuring its effect.",
      ] },
    ],
  },
  {
    slug: "own-api-keys",
    section: "Providers and keys",
    title: "Connecting your own AI keys",
    description: "Run scans on your own OpenAI, Anthropic or Gemini accounts.",
    blocks: [
      { type: "p", text: "By default, scans run on Threadly's platform keys. You can connect your own key for any built-in provider - scans for that provider then run on your account, against your quota, with the model you choose." },
      { type: "h2", text: "Connect a key" },
      { type: "list", items: [
        "Open Settings, then AI provider keys.",
        "Find the provider row and choose Connect key.",
        "Paste your API key and optionally a model name (for example gpt-4.1-mini or claude-sonnet-4-5). Leave the model blank to use the platform default.",
        "Save. The provider now shows Connected with your key's masked last four characters.",
      ] },
      { type: "h2", text: "Where to get keys" },
      { type: "list", items: [
        "OpenAI: platform.openai.com/api-keys",
        "Anthropic (Claude): console.anthropic.com/settings/keys",
        "Google (Gemini): aistudio.google.com/apikey",
      ] },
      { type: "h2", text: "How your key is stored" },
      { type: "p", text: "Keys are encrypted with AES-256-GCM before they are stored, never returned by the API after saving, and never logged. The workspace only ever displays a masked last-four. Choose Disconnect on a provider row to delete your key and fall back to the platform default." },
      { type: "note", text: "If a scan with your key fails (for example an exhausted quota), the provider shows Last scan failed and the rest of the scan completes normally. Fix or remove the key and scan again." },
    ],
  },
  {
    slug: "custom-providers",
    section: "Providers and keys",
    title: "Custom providers",
    description: "Track any OpenAI-compatible endpoint alongside the built-ins.",
    blocks: [
      { type: "p", text: "Beyond ChatGPT, Claude and Gemini, you can track any provider that speaks the OpenAI chat-completions protocol: Groq, Together AI, Mistral, a self-hosted model, or your own gateway." },
      { type: "h2", text: "Add a custom provider" },
      { type: "list", items: [
        "Open Settings, then AI provider keys, then Custom providers.",
        "Choose Add provider.",
        "Enter a display name, the base URL (https, for example https://api.groq.com/openai/v1), the exact model name, and your API key.",
        "Save. The provider joins every future scan - manual and daily - alongside the built-ins.",
      ] },
      { type: "h2", text: "What to expect" },
      { type: "p", text: "Most OpenAI-compatible endpoints have no live web search, so their answers reflect the model's training data rather than the current web. Threadly still extracts mentions, positions and any links the model writes into its answer, and marks them as citations. Treat these providers as a measure of model knowledge rather than live AI search." },
      { type: "p", text: "Custom providers appear everywhere the built-ins do: overview cards, the question matrix, answer drawer, and scan history." },
    ],
  },
  {
    slug: "workspace-tour",
    section: "Using Threadly",
    title: "Workspace tour",
    description: "A map of every tab in your workspace.",
    blocks: [
      { type: "h2", text: "Overview" },
      { type: "p", text: "Headline metrics with deltas versus the previous scan, one status card per provider, and the trend chart across scans." },
      { type: "h2", text: "Questions" },
      { type: "p", text: "The buyer questions you track. Add your own, or press Suggest for AI-drafted questions based on your category. Click any row to read full answers and citations." },
      { type: "h2", text: "Citations" },
      { type: "p", text: "The citation leaderboard: which domains AI cites in your category, labelled You, Competitor, or Source." },
      { type: "h2", text: "Scans" },
      { type: "p", text: "Every scan run with per-provider status chips." },
      { type: "h2", text: "Settings" },
      { type: "list", items: [
        "Profile - your display name; your email is managed by Google sign-in.",
        "Brand profile - name, domain, aliases, logo, and competitors.",
        "AI provider keys - connect your own keys and add custom providers.",
      ] },
      { type: "h2", text: "The account menu" },
      { type: "p", text: "Your avatar in the top right opens the account menu: profile settings, brand profile, provider keys, and sign out." },
    ],
  },
  {
    slug: "faq",
    section: "Reference",
    title: "FAQ and troubleshooting",
    description: "Common questions and fixes.",
    blocks: [
      { type: "h3", text: "A provider says \"API key not configured\"" },
      { type: "p", text: "That provider has no key - neither yours nor a platform key. Connect your own under Settings, AI provider keys. The rest of the scan is unaffected." },
      { type: "h3", text: "A provider says \"Last scan failed\"" },
      { type: "p", text: "The provider's API returned an error for that run - most often an exhausted quota or a rejected key. Check the key and quota on the provider's console, then run a new scan. Failed providers retry on the next scan automatically." },
      { type: "h3", text: "My mention rate is 0%" },
      { type: "p", text: "For a new brand or domain this is normal - AI assistants can only mention what the web says about you. Your first scan is a baseline. Use the citations leaderboard to find the sources AI does trust in your category, publish or earn presence there, and watch the trend." },
      { type: "h3", text: "Do answers vary between scans?" },
      { type: "p", text: "Yes. AI answers are non-deterministic, so treat single scans as samples and trends over multiple scans as signal." },
      { type: "h3", text: "Is my data private?" },
      { type: "p", text: "Your workspace - brand, questions, scan history and keys - is visible only to your Google account. Keys you add are encrypted at rest and never shown again after saving." },
      { type: "h3", text: "What does the demo show?" },
      { type: "p", text: "The public demo uses clearly labelled sample data for a fictional brand. It never calls paid AI APIs." },
    ],
  },
  {
    slug: "security",
    section: "Reference",
    title: "Security and privacy",
    description: "How Threadly handles your data and keys.",
    blocks: [
      { type: "h2", text: "Authentication" },
      { type: "p", text: "Sign-in is Google-only via Firebase Authentication. There are no passwords stored by Threadly." },
      { type: "h2", text: "API keys" },
      { type: "p", text: "Platform keys exist only as server environment variables. Keys you connect yourself are encrypted with AES-256-GCM before storage, decrypted only at scan time on the server, and never returned by the API beyond a masked last-four. Keys are never logged and never appear in scan results." },
      { type: "h2", text: "Workspace data" },
      { type: "p", text: "Brand profiles, tracked questions, scan runs and results are stored per user in Firebase Realtime Database and served only to the owning account over authenticated requests." },
      { type: "h2", text: "The demo" },
      { type: "p", text: "The public demo renders static, labelled sample data for a fictional brand and never calls paid AI APIs." },
    ],
  },
];

export function getDocPage(slug: string): DocPage | undefined {
  return DOC_PAGES.find((page) => page.slug === slug);
}
