export type XPost = {
  id: string;
  author?: string;
  text: string;
  url: string;
  createdAt: string | null;
  metrics: { likes: number; replies: number; reposts: number } | null;
};

type XSearchResponse = {
  meta?: { result_count?: number };
  errors?: unknown[];
  data?: Array<{
    id?: unknown;
    text?: unknown;
    created_at?: unknown;
    public_metrics?: { like_count?: unknown; reply_count?: unknown; retweet_count?: unknown };
  }>;
};

export function searchTopic(input: unknown): string {
  if (typeof input !== "string") throw new Error("Enter a customer problem or topic to search for.");
  const topic = input.replace(/[\r\n\t]+/g, " ").replace(/\s+/g, " ").trim();
  if (topic.length < 3 || topic.length > 100) throw new Error("Use a search topic between 3 and 100 characters.");
  if (!/[\p{L}\p{N}]/u.test(topic)) throw new Error("Enter a customer problem or topic to search for.");
  return topic;
}

export function buildXQuery(input: unknown): string {
  const topic = searchTopic(input).replace(/["\\()]/g, " ").replace(/\s+/g, " ").trim();
  if (topic.length < 3) throw new Error("Enter a customer problem or topic to search for.");
  return `"${topic}" lang:en -is:retweet`;
}

function count(value: unknown): number {
  return typeof value === "number" && Number.isFinite(value) && value >= 0 ? Math.floor(value) : 0;
}

export async function searchRecentX(
  input: unknown,
  token: string | undefined,
  fetcher: typeof fetch = fetch,
): Promise<{ query: string; posts: XPost[]; retrievedAt: string; provider: string }> {
  if (!token) throw new Error("X search is not connected. Add X_BEARER_TOKEN to the server environment.");
  const query = buildXQuery(input);
  const url = new URL("https://api.x.com/2/tweets/search/recent");
  url.searchParams.set("query", query);
  url.searchParams.set("max_results", "10");
  url.searchParams.set("tweet.fields", "created_at,public_metrics,author_id");

  let response: Response;
  try {
    response = await fetcher(url, {
      headers: { Authorization: `Bearer ${token}`, Accept: "application/json" },
      cache: "no-store",
      signal: AbortSignal.timeout(10000),
    });
  } catch {
    throw new Error("X search is temporarily unavailable. Try again later.");
  }
  if (response.status === 401 || response.status === 403) throw new Error("X API access was rejected. Check the app token and API access.");
  if (response.status === 402) throw new Error("X API credits are required before searching posts.");
  if (response.status === 429) throw new Error("X API rate limit reached. Try again later.");
  if (!response.ok) throw new Error("X search failed. Try again later.");

  let payload: XSearchResponse;
  try {
    payload = await response.json() as XSearchResponse;
  } catch {
    throw new Error("X returned an unreadable search response.");
  }
  if (!payload || typeof payload !== "object" || payload.errors?.length || (!Array.isArray(payload.data) && payload.meta?.result_count !== 0)) {
    throw new Error("X returned an incomplete search response. Try again later.");
  }

  const posts = (Array.isArray(payload.data) ? payload.data : []).flatMap((post) => {
    if (!post || typeof post.id !== "string" || !/^\d+$/.test(post.id) || typeof post.text !== "string") return [];
    const metrics = post.public_metrics;
    return [{
      id: post.id,
      text: post.text,
      url: `https://x.com/i/web/status/${post.id}`,
      createdAt: typeof post.created_at === "string" ? post.created_at : null,
      metrics: metrics ? {
        likes: count(metrics.like_count),
        replies: count(metrics.reply_count),
        reposts: count(metrics.retweet_count),
      } : null,
    }];
  });

  return { query, posts, retrievedAt: new Date().toISOString(), provider: "X API" };
}
