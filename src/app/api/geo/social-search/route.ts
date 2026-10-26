import { inWorkspace, resolveWorkspaceAccess } from "@/lib/geo/team";
import { checkRateLimit } from "@/lib/rate-limit";
import { loadPlan, socialGate, planBlockResponse } from "@/lib/geo/plan";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

// Social search: ad-hoc keyword search across public, search-indexed sources
// (Reddit, X, LinkedIn) plus a general web option, all via Tavily. Coverage is
// what the search index exposes publicly - not native/complete platform data
// and not private-account content. The "web" source is a general web search
// and is never labeled as Google.

type SourceId = "reddit" | "x" | "linkedin" | "web";

const SOURCES: Record<SourceId, { label: string; domains: string[] | null; note: string }> = {
  reddit: { label: "Reddit", domains: ["reddit.com"], note: "Public Reddit threads indexed by search." },
  x: { label: "X", domains: ["x.com", "twitter.com"], note: "Public X posts indexed by search - not complete or real-time X data." },
  linkedin: { label: "LinkedIn", domains: ["linkedin.com"], note: "Public LinkedIn posts indexed by search - no private or logged-in content." },
  web: { label: "Web", domains: null, note: "General web results across sources (not a Google-specific search)." },
};
const ORDER: SourceId[] = ["reddit", "x", "linkedin", "web"];

interface SocialResult {
  source: SourceId;
  url: string;
  title: string;
  snippet: string;
  published: string | null;
}

async function searchSource(source: SourceId, query: string, apiKey: string): Promise<SocialResult[]> {
  const config = SOURCES[source];
  const body: Record<string, unknown> = {
    api_key: apiKey,
    query,
    max_results: 8,
    search_depth: "basic",
    include_answer: false,
  };
  if (config.domains) body.include_domains = config.domains;
  const res = await fetch("https://api.tavily.com/search", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body),
    signal: AbortSignal.timeout(20000),
  });
  if (!res.ok) throw new Error(`${config.label} search returned ${res.status}.`);
  const payload = (await res.json()) as {
    results?: { url?: string; title?: string; content?: string; published_date?: string }[];
  };
  return (payload.results ?? [])
    .filter((r) => typeof r.url === "string")
    .map((r) => ({
      source,
      url: r.url as string,
      title: (r.title ?? "").trim() || (r.url as string),
      snippet: (r.content ?? "").slice(0, 400),
      published: r.published_date ?? null,
    }));
}

export async function POST(request: Request) {
  try {
    const access = await resolveWorkspaceAccess(request, "view");
    const user = access.identity;
    const body = (await request.json().catch(() => ({}))) as { query?: string; sources?: string[] };
    const query = (body.query ?? "").trim();
    if (!query) return Response.json({ error: "Enter a search query." }, { status: 400 });
    const selected = ORDER.filter((id) => (body.sources ?? []).includes(id));
    if (!selected.length) return Response.json({ error: "Pick at least one source." }, { status: 400 });

    const apiKey = process.env.TAVILY_API_KEY;
    if (!apiKey) return Response.json({ error: "Search backend is not configured." }, { status: 503 });

    return await inWorkspace(access, async () => {
      // Plan reads need the workspace context, so gating happens inside it.
      if (user.idToken !== "demo-token") {
        const plan = await loadPlan(user.email);
        const gate = socialGate(plan);
        if (gate.kind === "blocked") {
          return planBlockResponse("Social search is part of the paid plans - start the 7-day trial for $7 to use it.", plan);
        }
        // null cap = unlimited per PLAN_LIMITS; only finite caps rate-check.
        if (gate.kind === "capped") {
          const limit = await checkRateLimit(`social:${user.uid}`, gate.hourly, 3600, user);
          if (limit && !limit.allowed) {
            return Response.json({ error: "Too many searches. Try again shortly." }, { status: 429, headers: { "Retry-After": String(limit.retryAfterSeconds) } });
          }
        }
      }
      const settled = await Promise.allSettled(selected.map((source) => searchSource(source, query, apiKey)));
      const results: SocialResult[] = [];
      const sourceStatus: Record<SourceId, { count: number; error?: string }> = {} as never;
      settled.forEach((outcome, index) => {
        const source = selected[index];
        if (outcome.status === "fulfilled") {
          sourceStatus[source] = { count: outcome.value.length };
          results.push(...outcome.value);
        } else {
          sourceStatus[source] = { count: 0, error: outcome.reason instanceof Error ? outcome.reason.message : "Search failed." };
        }
      });
      return Response.json({
        query,
        searchedAt: new Date().toISOString(),
        results,
        sourceStatus,
        sources: ORDER.filter((id) => selected.includes(id)).map((id) => ({ id, label: SOURCES[id].label, note: SOURCES[id].note })),
      });
    });
  } catch (caught) {
    const message = caught instanceof Error ? caught.message : "Social search failed.";
    const status = /unauthorized|sign in/i.test(message) ? 401 : 500;
    return Response.json({ error: message }, { status });
  }
}
