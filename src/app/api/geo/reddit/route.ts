import { inWorkspace, resolveWorkspaceAccess } from "@/lib/geo/team";
import { loadBrand } from "@/lib/geo/store";
import { checkRateLimit } from "@/lib/rate-limit";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const UA = "Threadly/1.0 (https://www.gothreadly.live; brand monitoring)";

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

async function searchReddit(query: string, limit = 15): Promise<RedditPost[]> {
  const url = `https://www.reddit.com/search.json?q=${encodeURIComponent(query)}&sort=new&limit=${limit}&t=month&type=link`;
  const res = await fetch(url, { headers: { "User-Agent": UA }, signal: AbortSignal.timeout(12000) });
  if (!res.ok) throw new Error(`Reddit returned ${res.status} for "${query}".`);
  const json = (await res.json()) as {
    data?: { children?: { data: Record<string, unknown> }[] };
  };
  return (json.data?.children ?? []).map((child) => {
    const d = child.data;
    return {
      id: String(d.id ?? ""),
      title: String(d.title ?? ""),
      subreddit: String(d.subreddit ?? ""),
      score: Number(d.score ?? 0),
      comments: Number(d.num_comments ?? 0),
      createdUtc: Number(d.created_utc ?? 0),
      url: `https://www.reddit.com${String(d.permalink ?? "")}`,
      snippet: String(d.selftext ?? "").slice(0, 400),
    };
  }).filter((p) => p.id && p.title);
}

function containsName(post: RedditPost, name: string): boolean {
  const hay = `${post.title} ${post.snippet}`.toLowerCase();
  return name.toLowerCase().split(/\s+/).every((word) => hay.includes(word));
}

export async function POST(request: Request) {
  try {
    const access = await resolveWorkspaceAccess(request, "view");
    const user = access.identity;
    if (user.idToken !== "demo-token") {
      const limit = await checkRateLimit(`reddit:${user.uid}`, 6, 3600, user);
      if (limit && !limit.allowed) {
        return Response.json({ error: "Too many requests. Try again shortly." }, { status: 429, headers: { "Retry-After": String(limit.retryAfterSeconds) } });
      }
    }
    return await inWorkspace(access, async () => {
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
          const ageHours = (nowSec - post.createdUtc) / 3600;
          let score = reasons.reduce((sum, r) => sum + r.points, 0);
          if (ageHours < 48) score += 3;
          else if (ageHours < 168) score += 1;
          score += Math.min(4, Math.round(Math.log2(1 + post.score + post.comments)));
          if (score < 4) continue;
          opportunities.push({
            ...post,
            intentScore: score,
            intentReasons: reasons.map((r) => r.label).slice(0, 3),
          });
        }
      }
      opportunities.sort((a, b) => b.intentScore - a.intentScore);

      const subreddits: Record<string, number> = {};
      for (const post of [...mentions, ...opportunities]) {
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
        opportunities: opportunities.slice(0, 25),
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
