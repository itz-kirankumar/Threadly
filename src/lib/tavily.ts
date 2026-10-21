export type TavilySearchResult = {
  title: string;
  url: string;
  content: string;
  score: number;
  publishedDate?: string;
};

export type TavilySearchOptions = {
  searchDepth?: "basic" | "advanced";
  topic?: "general" | "news";
  includeDomains?: string[];
  excludeDomains?: string[];
  maxResults?: number;
  includeAnswer?: boolean;
};

export type TavilyExtractResult = {
  url: string;
  rawContent: string;
};

export type DiscoveredDiscussion = {
  id: string;
  platform: string;
  community: string;
  author: string;
  title: string;
  body: string;
  url: string;
  publishedAt: string | null;
  relevanceScore: number;
};

function getApiKey(): string | null {
  return process.env.TAVILY_API_KEY?.trim() || null;
}

export function isTavilyConfigured(): boolean {
  return Boolean(getApiKey());
}

/**
 * Searches the web using Tavily's AI-optimized search API.
 */
export async function searchTavily(
  query: string,
  options: TavilySearchOptions = {},
  fetcher: typeof fetch = fetch,
): Promise<{ query: string; results: TavilySearchResult[]; answer?: string }> {
  const apiKey = getApiKey();
  if (!apiKey) throw new Error("Tavily is not connected. Configure TAVILY_API_KEY in the environment.");

  const trimmedQuery = query.trim();
  if (trimmedQuery.length < 2) throw new Error("Search query must be at least 2 characters.");

  const payload: Record<string, unknown> = {
    api_key: apiKey,
    query: trimmedQuery,
    search_depth: options.searchDepth || "basic",
    topic: options.topic || "general",
    max_results: Math.min(Math.max(options.maxResults || 10, 1), 20),
    include_answer: options.includeAnswer ?? false,
  };

  if (options.includeDomains && options.includeDomains.length > 0) {
    payload.include_domains = options.includeDomains;
  }
  if (options.excludeDomains && options.excludeDomains.length > 0) {
    payload.exclude_domains = options.excludeDomains;
  }

  let response: Response;
  try {
    response = await fetcher("https://api.tavily.com/search", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(payload),
      signal: AbortSignal.timeout(30000),
      cache: "no-store",
    });
  } catch {
    throw new Error("Tavily search timed out or could not reach the server.");
  }

  if (response.status === 401 || response.status === 403) {
    throw new Error("Tavily API key is invalid or unauthorized.");
  }
  if (response.status === 429) {
    throw new Error("Tavily API rate limit or credit limit reached.");
  }
  if (!response.ok) {
    throw new Error(`Tavily search failed with HTTP ${response.status}.`);
  }

  const data = await response.json() as {
    query?: string;
    answer?: string;
    results?: Array<{
      title?: unknown;
      url?: unknown;
      content?: unknown;
      score?: unknown;
      published_date?: unknown;
    }>;
  };

  const results: TavilySearchResult[] = (Array.isArray(data.results) ? data.results : []).flatMap((r) => {
    if (!r || typeof r.url !== "string" || typeof r.title !== "string") return [];
    return [{
      title: r.title,
      url: r.url,
      content: typeof r.content === "string" ? r.content : "",
      score: typeof r.score === "number" ? r.score : 0,
      publishedDate: typeof r.published_date === "string" ? r.published_date : undefined,
    }];
  });

  return {
    query: trimmedQuery,
    results,
    answer: typeof data.answer === "string" ? data.answer : undefined,
  };
}

/**
 * Extracts raw, rendered content and markdown from one or more public URLs using Tavily Extract.
 * Handles JavaScript rendering and anti-bot checks automatically.
 */
export async function extractTavily(
  urls: string[],
  fetcher: typeof fetch = fetch,
): Promise<TavilyExtractResult[]> {
  const apiKey = getApiKey();
  if (!apiKey) throw new Error("Tavily is not connected. Configure TAVILY_API_KEY in the environment.");

  const validUrls = urls.filter(u => typeof u === "string" && (u.startsWith("http://") || u.startsWith("https://")));
  if (!validUrls.length) throw new Error("Provide at least one valid HTTP or HTTPS URL to extract.");

  let response: Response;
  try {
    response = await fetcher("https://api.tavily.com/extract", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        api_key: apiKey,
        urls: validUrls,
      }),
      signal: AbortSignal.timeout(40000),
      cache: "no-store",
    });
  } catch {
    throw new Error("Tavily extraction timed out or could not reach the server.");
  }

  if (response.status === 401 || response.status === 403) {
    throw new Error("Tavily API key is invalid or unauthorized.");
  }
  if (!response.ok) {
    throw new Error(`Tavily extract failed with HTTP ${response.status}.`);
  }

  const data = await response.json() as {
    results?: Array<{ url?: unknown; raw_content?: unknown }>;
  };

  return (Array.isArray(data.results) ? data.results : []).flatMap((r) => {
    if (!r || typeof r.url !== "string" || typeof r.raw_content !== "string") return [];
    return [{ url: r.url, rawContent: r.raw_content }];
  });
}

function parseCommunityMetadata(url: string): { platform: string; community: string; author: string } {
  try {
    const parsed = new URL(url);
    const host = parsed.hostname.toLowerCase().replace(/^www\./, "");
    if (host.includes("reddit.com")) {
      const match = parsed.pathname.match(/\/r\/([^/]+)/i);
      const sub = match ? `r/${match[1]}` : "Reddit Community";
      return { platform: "Reddit", community: sub, author: "Reddit user" };
    }
    if (host.includes("news.ycombinator.com")) {
      return { platform: "Hacker News", community: "Y Combinator", author: "HN user" };
    }
    if (host.includes("indiehackers.com")) {
      return { platform: "Indie Hackers", community: "Indie Hackers", author: "Founder" };
    }
    if (host.includes("quora.com")) {
      return { platform: "Quora", community: "Quora Discussions", author: "Quora contributor" };
    }
    if (host.includes("github.com")) {
      const parts = parsed.pathname.split("/").filter(Boolean);
      const repo = parts.length >= 2 ? `${parts[0]}/${parts[1]}` : "GitHub";
      return { platform: "GitHub", community: repo, author: parts[0] || "Contributor" };
    }
    return { platform: "Web", community: host, author: host };
  } catch {
    return { platform: "Web", community: "Online discussion", author: "Unknown" };
  }
}

/**
 * High-intent multi-platform discussion search across Reddit, Hacker News, Indie Hackers, etc.
 */
export async function searchCommunityDiscussions(
  topic: string,
  options: { maxResults?: number; targetDomains?: string[] } = {},
): Promise<DiscoveredDiscussion[]> {
  const domains = options.targetDomains && options.targetDomains.length > 0
    ? options.targetDomains
    : ["reddit.com", "news.ycombinator.com", "indiehackers.com", "quora.com", "github.com"];

  // Search for problem/intent keywords
  const query = `"${topic}" (problem OR issue OR looking for OR recommend OR alternative OR frustrated)`;
  const { results } = await searchTavily(query, {
    includeDomains: domains,
    searchDepth: "advanced",
    maxResults: options.maxResults || 10,
  });

  return results.map((item, index) => {
    const meta = parseCommunityMetadata(item.url);
    // Create stable pseudo-id from url or hash
    const cleanId = `tavily-${Buffer.from(item.url).toString("base64url").slice(0, 32)}-${index}`;
    return {
      id: cleanId,
      platform: meta.platform,
      community: meta.community,
      author: meta.author,
      title: item.title,
      body: item.content,
      url: item.url,
      publishedAt: item.publishedDate || null,
      relevanceScore: Math.round(item.score * 100),
    };
  });
}

/**
 * Searches for real-time background intelligence on a target company before sending outreach.
 */
export async function researchCompanyForOutreach(company: string): Promise<string> {
  if (!isTavilyConfigured() || !company.trim()) return "";
  try {
    const query = `"${company.trim()}" company product launch funding milestone`;
    const search = await searchTavily(query, { maxResults: 3, searchDepth: "basic" });
    if (!search.results.length) return "";
    return search.results
      .map(r => `${r.title}: ${r.content.slice(0, 300)}`)
      .join("\n---\n")
      .slice(0, 1200);
  } catch {
    return "";
  }
}
