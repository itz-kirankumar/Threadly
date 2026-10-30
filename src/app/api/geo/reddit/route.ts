import { inWorkspace, resolveWorkspaceAccess } from "@/lib/geo/team";
import { loadBrand } from "@/lib/geo/store";
import { loadPlan, socialGate, planBlockResponse } from "@/lib/geo/plan";
import { assertCanAfford, charge, InsufficientCredits } from "@/lib/credits/ledger";
import { checkRateLimit } from "@/lib/rate-limit";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

interface RedditPost {
  id: string;
  title: string;
  subreddit: string;
  score: number;
  comments: number;
  createdUtc: number;
  url: string;
  snippet: string;
}

interface Mention extends RedditPost {
  target: string;
  sentiment: "positive" | "neutral" | "negative";
}

interface Opportunity extends RedditPost {
  intentScore: number;
  intentReasons: string[];
}

const POSITIVE = ["love", "great", "best", "amazing", "excellent", "awesome", "recommend", "helpful", "perfect", "fantastic", "impressed", "solid", "happy", "glad", "works well", "game changer"];
const NEGATIVE = ["hate", "worst", "terrible", "awful", "bad", "broken", "useless", "disappointed", "frustrating", "scam", "avoid", "sucks", "poor", "annoying", "waste", "regret", "overpriced"];

const INTENT_PHRASES: { phrase: string; points: number; label: string }[] = [
  { phrase: "recommend", points: 3, label: "asking for recommendations" },
  { phrase: "best ", points: 3, label: "asking for the best option" },
  { phrase: "alternative", points: 3, label: "looking for alternatives" },
  { phrase: " vs ", points: 2, label: "comparing options" },
  { phrase: "versus", points: 2, label: "comparing options" },
  { phrase: "looking for", points: 2, label: "actively looking" },
  { phrase: "any good", points: 2, label: "open question" },
  { phrase: "suggestion", points: 2, label: "asking for suggestions" },
  { phrase: "which ", points: 1, label: "decision question" },
  { phrase: "should i", points: 2, label: "decision pending" },
  { phrase: "worth it", points: 2, label: "evaluating a purchase" },
  { phrase: "switch", points: 2, label: "considering switching" },
  { phrase: "cheaper", points: 1, label: "price sensitive" },
  { phrase: "how do i", points: 1, label: "problem to solve" },
];

function estimateSentiment(text: string): "positive" | "neutral" | "negative" {
  const lower = text.toLowerCase();
  const pos = POSITIVE.filter((w) => lower.includes(w)).length;
  const neg = NEGATIVE.filter((w) => lower.includes(w)).length;
  if (pos > neg) return "positive";
  if (neg > pos) return "negative";
  return "neutral";
}

// Reddit thread discovery runs over Tavily web search scoped to reddit.com:
// Reddit's own JSON API blocks datacenter traffic, and this backend is already
// provisioned per workspace. Engagement metadata (points/comments) is not
// available through search - those fields come back as -1 and the UI hides them.
async function searchReddit(query: string, limit = 15): Promise<RedditPost[]> {
  const apiKey = process.env.TAVILY_API_KEY;
  if (!apiKey) throw new Error("Search backend is not configured.");
  const res = await fetch("https://api.tavily.com/search", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      api_key: apiKey,
      query: `site:reddit.com ${query}`,
      max_results: Math.min(limit, 20),
      search_depth: "advanced",
      include_answer: false,
    }),
    signal: AbortSignal.timeout(20000),
  });
  if (!res.ok) throw new Error(`Search returned ${res.status} for "${query}".`);
  const payload = (await res.json()) as {
    results?: { url?: string; title?: string; content?: string; published_date?: string }[];
  };
  return (payload.results ?? [])
    .filter((r) => typeof r.url === "string" && r.url.includes("reddit.com/r/"))
    .map((r) => {
      const sub = /reddit\.com\/r\/([A-Za-z0-9_]+)/.exec(r.url ?? "");
      const published = r.published_date ? Date.parse(r.published_date) / 1000 : 0;
      return {
        id: (r.url ?? "").split("/").filter(Boolean).pop() ?? r.url ?? "",
        title: (r.title ?? "").replace(/\s*:\s*r\/[^:]*$|\s*-\s*Reddit$/, "").trim() || (r.url ?? ""),
        subreddit: sub?.[1] ?? "",
        score: -1,
        comments: -1,
        createdUtc: Number.isFinite(published) ? published : 0,
        url: r.url ?? "",
        snippet: (r.content ?? "").slice(0, 400),
      };
    })
    .filter((p) => p.id && p.url);
}

function containsName(post: RedditPost, name: string): boolean {
  const hay = `${post.title} ${post.snippet}`.toLowerCase();
  return name.toLowerCase().split(/\s+/).every((word) => hay.includes(word));
}

export async function POST(request: Request) {
  try {
    const access = await resolveWorkspaceAccess(request, "view");
    const user = access.identity;
    return await inWorkspace(access, async () => {
      // Plan reads need the workspace context, so gating happens inside it.
      // Without a plan that includes social, each buyer-intent thread costs
      // credits; brand mentions stay free.
      let payPerLead = false;
      if (user.idToken !== "demo-token") {
        const plan = await loadPlan(user.email);
        const gate = socialGate(plan);
        if (gate.kind === "blocked") {
          try {
            await assertCanAfford(access.workspaceUid, "socialLead");
          } catch (error) {
            if (error instanceof InsufficientCredits) return planBlockResponse(error.message, plan);
            throw error;
          }
          payPerLead = true;
        }
        // null cap = unlimited per PLAN_LIMITS; only finite caps rate-check.
        if (gate.kind === "capped") {
          const limit = await checkRateLimit(`reddit:${user.uid}`, gate.hourly, 3600, user);
          if (limit && !limit.allowed) {
            return Response.json({ error: "Too many requests. Try again shortly." }, { status: 429, headers: { "Retry-After": String(limit.retryAfterSeconds) } });
          }
        }
      }
      const brand = await loadBrand();
      if (!brand?.name) return Response.json({ error: "Set up your brand profile first." }, { status: 400 });

      const competitorNames = (brand.competitors ?? []).map((c) => c.name).filter(Boolean).slice(0, 4);
      const category = (brand.category ?? "").trim();

      // One request per target; stay well inside Reddit's anonymous budget.
      const queries: { kind: "brand" | "competitor" | "opportunity"; label: string; q: string }[] = [
        { kind: "brand", label: brand.name, q: `"${brand.name}"` },
        ...competitorNames.map((name) => ({ kind: "competitor" as const, label: name, q: `"${name}"` })),
      ];
      if (category) {
        queries.push({ kind: "opportunity", label: "buyers asking", q: `${category} (recommend OR best OR alternative OR "looking for")` });
        if (competitorNames[0]) {
          queries.push({ kind: "opportunity", label: "switchers", q: `"alternative to" ${competitorNames[0]} OR (${competitorNames[0]} vs)` });
        }
      }

      const results: { kind: string; label: string; posts: RedditPost[] }[] = [];
      for (const query of queries.slice(0, 7)) {
        try {
          const posts = await searchReddit(query.q);
          results.push({ kind: query.kind, label: query.label, posts });
        } catch {
          results.push({ kind: query.kind, label: query.label, posts: [] });
        }
      }

      // Mentions: posts that actually name the brand or a competitor.
      const seen = new Set<string>();
      const mentions: Mention[] = [];
      for (const result of results) {
        if (result.kind === "opportunity") continue;
        for (const post of result.posts) {
          if (seen.has(post.id) || !containsName(post, result.label)) continue;
          seen.add(post.id);
          mentions.push({ ...post, target: result.label, sentiment: estimateSentiment(`${post.title} ${post.snippet}`) });
        }
      }
      mentions.sort((a, b) => b.createdUtc - a.createdUtc);

      // Opportunities: buyer-intent threads, scored transparently.
      const nowSec = Date.now() / 1000;
      const oppSeen = new Set<string>();
      const opportunities: Opportunity[] = [];
      for (const result of results) {
        if (result.kind !== "opportunity") continue;
        for (const post of result.posts) {
          if (oppSeen.has(post.id)) continue;
          oppSeen.add(post.id);
          const text = ` ${post.title.toLowerCase()} `;
          const reasons = INTENT_PHRASES.filter((p) => text.includes(p.phrase));
          const ageHours = post.createdUtc > 0 ? (nowSec - post.createdUtc) / 3600 : Infinity;
          let score = reasons.reduce((sum, r) => sum + r.points, 0);
          if (ageHours < 48) score += 3;
          else if (ageHours < 168) score += 1;
          if (score < 4) continue;
          opportunities.push({
            ...post,
            intentScore: score,
            intentReasons: reasons.map((r) => r.label).slice(0, 3),
          });
        }
      }
      opportunities.sort((a, b) => b.intentScore - a.intentScore);
      let shown = opportunities.slice(0, 25);
      let credits: { charged: number; balance: number } | undefined;
      if (payPerLead && shown.length) {
        const paid = await charge(access.workspaceUid, "socialLead", shown.length, "Reddit buyer-intent threads");
        shown = shown.slice(0, paid.units);
        credits = { charged: paid.credits, balance: paid.balance };
      }

      const subreddits: Record<string, number> = {};
      for (const post of [...mentions, ...shown]) {
        subreddits[post.subreddit] = (subreddits[post.subreddit] ?? 0) + 1;
      }
      const topSubreddits = Object.entries(subreddits)
        .sort((a, b) => b[1] - a[1])
        .slice(0, 8)
        .map(([name, count]) => ({ name, count }));

      return Response.json({
        scannedAt: new Date().toISOString(),
        windowDays: 30,
        brand: brand.name,
        competitors: competitorNames,
        category,
        mentions: mentions.slice(0, 40),
        opportunities: shown,
        credits,
        topSubreddits,
        queriesRun: results.filter((r) => r.posts.length > 0).length,
        queriesTotal: Math.min(queries.length, 7),
      });
    });
  } catch (caught) {
    const message = caught instanceof Error ? caught.message : "Reddit scan failed.";
    const status = /unauthorized|sign in/i.test(message) ? 401 : 500;
    return Response.json({ error: message }, { status });
  }
}
