import { searchTopic, searchRecentX, type XPost } from "@/lib/x-discovery";
import { createHash } from "node:crypto";

type XProviderStatus = "connected" | "configured" | "unverified" | "not_configured";
type VerificationCache = { tokenHash: string; connected: boolean; expiresAt: number };
let verificationCache: VerificationCache | null = null;

export async function getXProviderStatus(): Promise<{ provider: string | null; status: XProviderStatus }> {
  const token = process.env.APIFY_TOKEN?.trim();
  if (token) {
    const tokenHash = createHash("sha256").update(token).digest("hex");
    const now = Date.now();
    if (verificationCache?.tokenHash === tokenHash && verificationCache.expiresAt > now) {
      return { provider: "Apify", status: verificationCache.connected ? "connected" : "unverified" };
    }

    let connected = false;
    try {
      const response = await fetch("https://api.apify.com/v2/users/me", {
        headers: { Authorization: `Bearer ${token}`, Accept: "application/json" },
        cache: "no-store",
        signal: AbortSignal.timeout(5000),
      });
      if (response.ok) {
        const account = await response.json() as { data?: { id?: unknown } };
        connected = typeof account.data?.id === "string" && account.data.id.length > 0;
      }
    } catch {
      connected = false;
    }

    verificationCache = { tokenHash, connected, expiresAt: now + (connected ? 5 * 60_000 : 15_000) };
    return { provider: "Apify", status: connected ? "connected" : "unverified" };
  }

  if (process.env.X_BEARER_TOKEN?.trim()) return { provider: "X API", status: "configured" };
  return { provider: null, status: "not_configured" };
}

export function xProvider() {
  return process.env.APIFY_TOKEN ? "Apify" : process.env.X_BEARER_TOKEN ? "X API" : null;
}

export async function searchApifyX(input: unknown, token: string | undefined, fetcher: typeof fetch = fetch) {
  if (!token) throw new Error("X search is not connected. Configure APIFY_TOKEN on the server.");
  const topic = searchTopic(input).replace(/[^\p{L}\p{N}\s'-]/gu, " ").replace(/\s+/g, " ").trim();
  if (topic.length < 3) throw new Error("Enter a customer problem to search for.");
  const since = new Date(Date.now() - 7 * 86400000).toISOString().slice(0, 10);
  const query = `"${topic}" lang:en -filter:retweets since:${since}`;

  let response: Response;
  try {
    response = await fetcher("https://api.apify.com/v2/acts/apidojo~twitter-scraper-lite/run-sync-get-dataset-items?timeout=60&maxTotalChargeUsd=0.10", {
      method: "POST",
      headers: { Authorization: `Bearer ${token}`, "Content-Type": "application/json" },
      body: JSON.stringify({ searchTerms: [query], maxItems: 10, sort: "Latest", tweetLanguage: "en" }),
      signal: AbortSignal.timeout(70000),
      cache: "no-store",
    });
  } catch {
    throw new Error("X search timed out or could not reach Apify. Check the run before retrying.");
  }

  if ([401, 403].includes(response.status)) throw new Error("Apify rejected access. Check the API token and actor access.");
  if (response.status === 402) throw new Error("Apify credits are required for this X search.");
  if (response.status === 429) throw new Error("Apify is busy or rate limited. Try again later.");
  if (!response.ok) throw new Error("Apify X search failed. Check the run before retrying.");

  let rows: unknown;
  try {
    rows = await response.json();
  } catch {
    throw new Error("Apify returned an unreadable response.");
  }
  if (!Array.isArray(rows)) throw new Error("Apify returned an unreadable response.");

  const posts: XPost[] = [];
  const seen = new Set<string>();
  for (const row of rows) {
    if (row?.noResults === true) continue;
    if (!row || row.error || typeof row.id !== "string" || !/^\d+$/.test(row.id) || typeof row.text !== "string") {
      throw new Error("Apify X search failed to return valid posts.");
    }
    if (seen.has(row.id)) continue;
    seen.add(row.id);
    const values = [row.likeCount, row.replyCount, row.retweetCount];
    posts.push({
      id: row.id,
      text: row.text,
      url: `https://x.com/i/web/status/${row.id}`,
      author: typeof row.author?.userName === "string" ? row.author.userName : undefined,
      createdAt: typeof row.createdAt === "string" && Number.isFinite(Date.parse(row.createdAt))
        ? new Date(row.createdAt).toISOString()
        : null,
      metrics: values.every((value) => typeof value === "number" && Number.isFinite(value) && value >= 0)
        ? { likes: values[0], replies: values[1], reposts: values[2] }
        : null,
    });
  }

  return { query, posts: posts.slice(0, 10), retrievedAt: new Date().toISOString(), provider: "Apify" };
}

export async function searchX(input: unknown) {
  if (process.env.APIFY_TOKEN) return searchApifyX(input, process.env.APIFY_TOKEN);
  if (process.env.X_BEARER_TOKEN) return searchRecentX(input, process.env.X_BEARER_TOKEN);
  throw new Error("X search is not connected. Add an Apify API token to enable real posts.");
}
