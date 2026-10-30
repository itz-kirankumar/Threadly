"use client";

import Link from "next/link";
import { useState } from "react";

// What a developer can build on today: the REST API and the open-source
// threadly-geo package (library and CLI). Snippets match the published docs.
const TABS = [
  {
    id: "api",
    label: "REST API",
    note: "Your workspace's latest visibility metrics, for dashboards and reports.",
    file: "terminal",
    code: `curl https://www.gothreadly.live/api/v1/summary \\
  -H "Authorization: Bearer thly_your_key"

{
  "brand": { "name": "Acme", "domain": "acme.io", "competitors": [...] },
  "latestRun": { "id": "run_...", "queryCount": 25, "providerStatus": {...} },
  "metrics": {
    "mentionRate": 48, "citationShare": 22,
    "shareOfVoice": 31, "avgPosition": 2.4, "perProvider": {...}
  }
}`,
  },
  {
    id: "npm",
    label: "npm library",
    note: "Run GEO scans from Node with your own AI keys. Zero dependencies.",
    file: "scan.mjs",
    code: `// npm install threadly-geo
import { scanAll } from "threadly-geo";

const { results, metrics } = await scanAll({
  query: "best revenue forecasting tools",
  brand: {
    name: "Acme",
    domain: "acme.io",
    competitors: [{ name: "Clari", domain: "clari.com" }],
  },
});

console.log(metrics.visibilityScore);`,
  },
  {
    id: "cli",
    label: "CLI",
    note: "The same scanner from your terminal or CI, with --json output.",
    file: "terminal",
    code: `export OPENAI_API_KEY=... ANTHROPIC_API_KEY=... GEMINI_API_KEY=...

npx threadly-geo scan \\
  --query "best revenue forecasting tools" \\
  --brand Acme --domain acme.io \\
  --competitor "Clari:clari.com" --json`,
  },
] as const;

// Light syntax colouring: strings, comments, flags and keywords.
function highlight(code: string) {
  const parts = code.split(/("(?:[^"\\]|\\.)*"|\/\/.*|#.*|\s--?[a-zA-Z-]+|\b(?:import|from|const|await|export|curl|npx)\b)/g);
  return parts.map((part, i) => {
    if (!part) return null;
    const cls = part.startsWith('"') ? "text-[#B7A8FF]" : part.startsWith("//") || part.startsWith("#") ? "text-[#8F8E96]" : /^\s--?/.test(part) ? "text-[#CFC7FF]" : /^(import|from|const|await|export|curl|npx)$/.test(part) ? "text-[#CFC7FF]" : "";
    return cls ? <span key={i} className={cls}>{part}</span> : part;
  });
}

export default function Developers({ heading = true }: { heading?: boolean }) {
  const [tab, setTab] = useState<(typeof TABS)[number]["id"]>("api");
  const active = TABS.find((t) => t.id === tab)!;
  const [copied, setCopied] = useState(false);
  const copy = async () => {
    try {
      await navigator.clipboard.writeText(active.code);
      setCopied(true);
      setTimeout(() => setCopied(false), 1600);
    } catch {
      setCopied(false);
    }
  };
  return (
    <div className="grid items-center gap-10 lg:grid-cols-[minmax(0,0.85fr)_minmax(0,1.15fr)]">
      <div>
        {heading && (
          <>
            <p className="eyebrow">For developers</p>
            <h2 className="mt-4 font-display text-5xl leading-tight tracking-tight">Build on Threadly</h2>
          </>
        )}
        <p className="mt-4 text-zinc-600">
          Pull your AI visibility metrics into any dashboard with the REST API, or run the same GEO scanner in your own code with the open-source <span className="font-mono text-[0.95em] text-zinc-900">threadly-geo</span> package.
        </p>
        <ul className="mt-6 grid gap-3 sm:grid-cols-2">
          {[
            ["Bearer-key auth", "Keys start with thly_, are hashed at rest and revocable anytime."],
            ["120 requests an hour", "Per workspace, with Retry-After on limits."],
            ["Open source on npm", "threadly-geo: library and CLI, Node 18+, MIT."],
            ["Your own AI keys", "Scans run on your OpenAI, Anthropic and Gemini accounts."],
          ].map(([title, body]) => (
            <li key={title} className="rounded-2xl border border-zinc-200 bg-white p-4">
              <p className="text-sm font-semibold">{title}</p>
              <p className="mt-1 text-xs leading-relaxed text-zinc-600">{body}</p>
            </li>
          ))}
        </ul>
        <div className="mt-6 flex flex-wrap gap-3 text-sm">
          <Link href="/docs/public-api" className="btn-primary rounded-xl px-4 py-2 font-medium">API reference</Link>
          <a href="https://www.npmjs.com/package/threadly-geo" target="_blank" rel="noopener noreferrer" className="rounded-xl border border-zinc-300 bg-white px-4 py-2 font-medium text-[#111114] hover:border-[#5B3DF5]">SDK documentation ↗</a>
          <a href="https://github.com/itz-kirankumar/Threadly" target="_blank" rel="noopener noreferrer" className="rounded-xl border border-zinc-300 bg-white px-4 py-2 font-medium text-[#111114] hover:border-[#5B3DF5]">GitHub ↗</a>
        </div>
      </div>

      <div className="overflow-hidden rounded-3xl border border-white/[0.08] code-panel bg-[#15141A]">
        <div className="flex items-center gap-1 border-b border-white/10 px-3 pt-3" role="tablist" aria-label="Code examples">
          {TABS.map((t) => (
            <button
              key={t.id}
              type="button"
              role="tab"
              aria-selected={tab === t.id}
              onClick={() => setTab(t.id)}
              className={`rounded-t-lg px-3.5 py-2 text-xs font-semibold transition ${tab === t.id ? "bg-white/[0.08] text-white" : "text-zinc-400 hover:text-zinc-200"}`}
            >
              {t.label}
            </button>
          ))}
          <button type="button" onClick={copy} className="ml-auto mb-2 mr-1 rounded-md border border-white/20 px-2.5 py-1 text-[11px] text-[#B4B3BA] transition-colors hover:text-white">{copied ? "Copied" : "Copy"}</button>
        </div>
        <pre key={tab} className="demo-story-in overflow-x-auto p-5 font-mono text-[12.5px] leading-relaxed text-[#E9E8EC]"><code>{highlight(active.code)}</code></pre>
        <p className="border-t border-white/10 px-5 py-3 text-xs text-zinc-400">{active.note}</p>
      </div>
    </div>
  );
}
