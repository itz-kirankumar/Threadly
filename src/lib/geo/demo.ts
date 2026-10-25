import type {
  BrandProfile,
  MetricsSnapshot,
  ProviderResult,
  QueryResult,
  ScanRun,
  TrackedQuery,
  WorkspaceState,
} from "./types";
import { computeSnapshot } from "./engine";

// Sample workspace for the public /demo page. Fictional brand, plausible
// answers, real-world citation domains. Clearly labelled as sample data.
export const DEMO_BRAND: BrandProfile = {
  name: "Loomify",
  domain: "loomify.io",
  aliases: ["Loomify AI"],
  category: "async video messaging",
  competitors: [
    { name: "Loom", domain: "loom.com", aliases: [] },
    { name: "Vidyard", domain: "vidyard.com", aliases: [] },
    { name: "Vimeo", domain: "vimeo.com", aliases: [] },
  ],
  createdAt: "2026-10-01T09:00:00.000Z",
  updatedAt: "2026-10-22T09:00:00.000Z",
};

const DAY = 24 * 60 * 60 * 1000;
const BASE = Date.parse("2026-10-24T06:30:00.000Z");

export const DEMO_QUERIES: TrackedQuery[] = [
  { id: "demo-q1", text: "What are the best async video messaging tools in 2026?", intent: "commercial", createdAt: "2026-10-01T09:05:00.000Z" },
  { id: "demo-q2", text: "Loom vs Vidyard for a remote sales team", intent: "comparative", createdAt: "2026-10-01T09:06:00.000Z" },
  { id: "demo-q3", text: "Best screen recording software for product demos", intent: "commercial", createdAt: "2026-10-01T09:07:00.000Z" },
  { id: "demo-q4", text: "How do I reduce meetings with async video?", intent: "informational", createdAt: "2026-10-01T09:08:00.000Z" },
  { id: "demo-q5", text: "Affordable Loom alternatives for startups", intent: "commercial", createdAt: "2026-10-01T09:09:00.000Z" },
  { id: "demo-q6", text: "Best video messaging tool for customer support teams", intent: "commercial", createdAt: "2026-10-01T09:10:00.000Z" },
];

type Cell = Pick<ProviderResult, "brandMentioned" | "brandCited" | "brandPosition" | "competitorsMentioned"> & {
  citations: Array<[string, string]>; // [domain, title]
};

const ANSWERS: Record<string, string> = {
  "demo-q1":
    "For async video messaging in 2026, Loom remains the default pick for most teams thanks to its instant sharing and AI summaries. Vidyard is strong for sales outreach with viewer analytics, while Vimeo suits polished, hosted libraries. Loomify is a newer entrant focused on AI-generated chapters and multilingual captions, and is worth a look for distributed support teams. Zight (formerly CloudApp) covers quick annotated captures.",
  "demo-q2":
    "Loom and Vidyard overlap heavily for remote sales teams. Loom is faster to adopt and cheaper per seat, with strong engagement notifications. Vidyard goes deeper on CRM integrations and per-viewer analytics, which matters for outbound pipelines. If budget is tight, Loom's starter plan usually wins; for mature sales orgs, Vidyard's reporting edges it out.",
  "demo-q3":
    "For polished product demos, Vidyard and Loom both record screen and camera with instant links. Loomify stands out here: its AI chaptering turns a raw walkthrough into a labelled demo automatically, and reviewers on G2 rate its caption accuracy highly. Vimeo Record is another option if you already host on Vimeo.",
  "demo-q4":
    "Async video replaces status meetings with short recorded updates. Tools like Loom and Loomify let you record your screen and camera, then share a link your team watches at 1.5x. Teams report cutting recurring meetings by a third after moving standups async. Start with one recurring meeting and a two-minute video habit.",
  "demo-q5":
    "If Loom's pricing is steep for a small startup, look at Loomify, which undercuts Loom on per-seat pricing and includes AI chapters on its free tier. Zight and ScreenPal are also cheaper alternatives, though with weaker sharing analytics. Vimeo's free tier works if you mainly need hosting.",
  "demo-q6":
    "Support teams need fast recording, captions and searchable libraries. Loomify is purpose-built for this with AI captions in 30+ languages and a shared team library. Loom is the common choice and integrates with Intercom and Zendesk. Vidyard fits support teams that also run sales motions.",
};

function citationsFor(entries: Array<[string, string]>) {
  return entries.map(([domain, title]) => ({ url: `https://${domain}/`, domain, title }));
}

const CELLS: Record<string, Record<string, Cell>> = {
  "demo-q1": {
    chatgpt: { brandMentioned: true, brandCited: true, brandPosition: 4, competitorsMentioned: ["Loom", "Vidyard", "Vimeo"], citations: [["loom.com", "Loom"], ["vidyard.com", "Vidyard"], ["loomify.io", "Loomify"], ["g2.com", "G2"]] },
    claude: { brandMentioned: true, brandCited: false, brandPosition: 3, competitorsMentioned: ["Loom", "Vidyard"], citations: [["loom.com", "Loom"], ["vidyard.com", "Vidyard"], ["zapier.com", "Zapier blog"]] },
    gemini: { brandMentioned: false, brandCited: false, brandPosition: null, competitorsMentioned: ["Loom", "Vidyard", "Vimeo"], citations: [["loom.com", "Loom"], ["vimeo.com", "Vimeo"], ["pcmag.com", "PCMag"]] },
  },
  "demo-q2": {
    chatgpt: { brandMentioned: false, brandCited: false, brandPosition: null, competitorsMentioned: ["Loom", "Vidyard"], citations: [["loom.com", "Loom"], ["vidyard.com", "Vidyard"], ["g2.com", "G2 comparison"]] },
    claude: { brandMentioned: false, brandCited: false, brandPosition: null, competitorsMentioned: ["Loom", "Vidyard"], citations: [["vidyard.com", "Vidyard"], ["loom.com", "Loom"]] },
    gemini: { brandMentioned: false, brandCited: false, brandPosition: null, competitorsMentioned: ["Loom", "Vidyard"], citations: [["loom.com", "Loom"], ["g2.com", "G2"]] },
  },
  "demo-q3": {
    chatgpt: { brandMentioned: true, brandCited: true, brandPosition: 2, competitorsMentioned: ["Vidyard", "Vimeo"], citations: [["loomify.io", "Loomify"], ["vidyard.com", "Vidyard"], ["g2.com", "G2"]] },
    claude: { brandMentioned: true, brandCited: true, brandPosition: 3, competitorsMentioned: ["Vidyard", "Vimeo"], citations: [["vimeo.com", "Vimeo"], ["loomify.io", "Loomify"]] },
    gemini: { brandMentioned: true, brandCited: false, brandPosition: 2, competitorsMentioned: ["Vidyard"], citations: [["vidyard.com", "Vidyard"], ["techcrunch.com", "TechCrunch"]] },
  },
  "demo-q4": {
    chatgpt: { brandMentioned: true, brandCited: false, brandPosition: 2, competitorsMentioned: ["Loom"], citations: [["loom.com", "Loom"], ["hbr.org", "Harvard Business Review"]] },
    claude: { brandMentioned: false, brandCited: false, brandPosition: null, competitorsMentioned: ["Loom"], citations: [["loom.com", "Loom"], ["atlassian.com", "Atlassian blog"]] },
    gemini: { brandMentioned: true, brandCited: true, brandPosition: 2, competitorsMentioned: ["Loom"], citations: [["loomify.io", "Loomify"], ["loom.com", "Loom"]] },
  },
  "demo-q5": {
    chatgpt: { brandMentioned: true, brandCited: true, brandPosition: 1, competitorsMentioned: ["Loom", "Vimeo"], citations: [["loomify.io", "Loomify"], ["loom.com", "Loom"]] },
    claude: { brandMentioned: true, brandCited: true, brandPosition: 1, competitorsMentioned: ["Loom"], citations: [["loomify.io", "Loomify"], ["producthunt.com", "Product Hunt"]] },
    gemini: { brandMentioned: true, brandCited: true, brandPosition: 1, competitorsMentioned: ["Loom", "Vimeo"], citations: [["loomify.io", "Loomify"], ["vimeo.com", "Vimeo"], ["reddit.com", "Reddit thread"]] },
  },
  "demo-q6": {
    chatgpt: { brandMentioned: true, brandCited: true, brandPosition: 1, competitorsMentioned: ["Loom", "Vidyard"], citations: [["loomify.io", "Loomify"], ["zendesk.com", "Zendesk blog"]] },
    claude: { brandMentioned: true, brandCited: false, brandPosition: 2, competitorsMentioned: ["Loom", "Vidyard"], citations: [["loom.com", "Loom"], ["intercom.com", "Intercom"]] },
    gemini: { brandMentioned: true, brandCited: true, brandPosition: 1, competitorsMentioned: ["Loom"], citations: [["loomify.io", "Loomify"], ["loom.com", "Loom"]] },
  },
};

function buildResults(runId: string): QueryResult[] {
  return DEMO_QUERIES.map((query) => ({
    queryId: query.id,
    results: (["chatgpt", "claude", "gemini"] as const).map((provider) => {
      const cell = CELLS[query.id][provider];
      const brandCitationCount = cell.citations.filter(([domain]) => domain === "loomify.io").length;
      const result: ProviderResult = {
        provider,
        status: "scanned",
        answer: ANSWERS[query.id],
        citations: citationsFor(cell.citations),
        brandMentioned: cell.brandMentioned,
        brandCited: cell.brandCited,
        brandCitationCount,
        brandPosition: cell.brandPosition,
        competitorsMentioned: cell.competitorsMentioned,
        competitorsCited: cell.citations
          .filter(([domain]) => ["loom.com", "vidyard.com", "vimeo.com"].includes(domain))
          .map(([domain]) => domain.split(".")[0][0].toUpperCase() + domain.split(".")[0].slice(1)),
        scannedAt: new Date(BASE).toISOString(),
      };
      return result;
    }),
  }));
}

export function buildDemoWorkspace(): WorkspaceState {
  const run: ScanRun = {
    id: "demo-run-6",
    startedAt: new Date(BASE).toISOString(),
    finishedAt: new Date(BASE + 42_000).toISOString(),
    queryCount: DEMO_QUERIES.length,
    providerStatus: { chatgpt: "scanned", claude: "scanned", gemini: "scanned" },
  };
  const results = buildResults(run.id);
  const latest = computeSnapshot(run.id, results, run.providerStatus);

  // Earlier snapshots: plausible ramp toward the current numbers.
  const history: Array<[number, number, number, number]> = [
    [38, 9, 18, 3.8],
    [42, 11, 21, 3.5],
    [50, 14, 26, 3.1],
    [54, 15, 29, 2.8],
    [58, 17, 31, 2.6],
  ];
  const snapshots: MetricsSnapshot[] = history.map(([mentionRate, citationShare, shareOfVoice, avgPosition], i) => ({
    runId: `demo-run-${i + 1}`,
    date: new Date(BASE - (history.length - i) * 7 * DAY).toISOString(),
    mentionRate,
    citationShare,
    shareOfVoice,
    avgPosition,
    perProvider: latest.perProvider,
  }));
  snapshots.push(latest);

  const runs: ScanRun[] = [run, ...history.map((_, i) => ({
    id: `demo-run-${i + 1}`,
    startedAt: new Date(BASE - (history.length - i) * 7 * DAY).toISOString(),
    finishedAt: new Date(BASE - (history.length - i) * 7 * DAY + 40_000).toISOString(),
    queryCount: DEMO_QUERIES.length,
    providerStatus: run.providerStatus,
  }))];

  return {
    brand: DEMO_BRAND,
    queries: DEMO_QUERIES,
    latestRun: run,
    results,
    snapshots,
    runs,
    providers: [
      { id: "chatgpt", label: "ChatGPT", kind: "builtin" as const, source: "platform" as const },
      { id: "claude", label: "Claude", kind: "builtin" as const, source: "platform" as const },
      { id: "gemini", label: "Gemini", kind: "builtin" as const, source: "platform" as const },
    ],
  };
}
