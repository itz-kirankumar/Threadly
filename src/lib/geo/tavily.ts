// Tavily web search: organic results per tracked question, shown alongside AI
// answers. Clearly separate from AI citation metrics - this measures classic
// web search presence, powered by the workspace's TAVILY_API_KEY.

export interface WebResult {
  url: string;
  domain: string;
  title: string;
}

export function tavilyConfigured(): boolean {
  return Boolean(process.env.TAVILY_API_KEY);
}

export async function searchWeb(query: string, maxResults = 5): Promise<WebResult[]> {
  const apiKey = process.env.TAVILY_API_KEY;
  if (!apiKey) return [];
  try {
    const response = await fetch("https://api.tavily.com/search", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        api_key: apiKey,
        query,
        max_results: maxResults,
        search_depth: "basic",
        include_answer: false,
      }),
      signal: AbortSignal.timeout(15_000),
    });
    if (!response.ok) return [];
    const payload = await response.json();
    const results = Array.isArray(payload?.results) ? payload.results : [];
    return results
      .filter((r: { url?: unknown }) => typeof r?.url === "string")
      .slice(0, maxResults)
      .map((r: { url: string; title?: unknown }) => {
        let domain = "";
        try {
          domain = new URL(r.url).hostname.replace(/^www\./, "");
        } catch {
          domain = "";
        }
        return { url: r.url, domain, title: typeof r.title === "string" ? r.title : domain };
      })
      .filter((r: WebResult) => r.domain);
  } catch {
    return [];
  }
}
