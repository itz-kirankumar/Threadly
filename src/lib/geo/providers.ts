import type { Citation, GeoProviderId } from "./types";

export interface ProviderAnswer {
  answer: string;
  citations: Citation[];
}

// Per-call credential overrides: a user's own key/model wins over platform env.
export interface ProviderCredentials {
  apiKey?: string;
  model?: string;
  baseUrl?: string;
}

const TIMEOUT_MS = 45_000;

function toCitation(url: string, title?: string): Citation | null {
  try {
    const parsed = new URL(url);
    if (parsed.protocol !== "http:" && parsed.protocol !== "https:") return null;
    const domain = parsed.hostname.replace(/^www\./, "").toLowerCase();
    return { url, domain, title: title?.trim() || domain };
  } catch {
    return null;
  }
}

export function uniqueCitations(citations: Array<Citation | null>, limit = 12): Citation[] {
  const seen = new Map<string, Citation>();
  for (const citation of citations) {
    if (!citation || seen.has(citation.url)) continue;
    seen.set(citation.url, citation);
    if (seen.size >= limit) break;
  }
  return [...seen.values()];
}

const BUYER_FRAMING =
  "Answer the following buyer question directly and helpfully, as you would for someone researching a purchase. Recommend specific products or brands where relevant.\n\nQuestion: ";

async function scanChatGPT(query: string, creds?: ProviderCredentials): Promise<ProviderAnswer> {
  const response = await fetch("https://api.openai.com/v1/responses", {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Authorization: `Bearer ${creds?.apiKey ?? process.env.OPENAI_API_KEY}`,
    },
    body: JSON.stringify({
      model: creds?.model || process.env.GEO_OPENAI_MODEL || "gpt-4.1-mini",
      tools: [{ type: "web_search" }],
      tool_choice: "required",
      store: false,
      input: BUYER_FRAMING + `"${query}"`,
    }),
    signal: AbortSignal.timeout(TIMEOUT_MS),
  });
  if (!response.ok) throw new Error(`OpenAI returned HTTP ${response.status}.`);
  const payload = await response.json();
  const blocks = Array.isArray(payload.output) ? payload.output : [];
  const answer = blocks
    .flatMap((item: { type?: string; content?: Array<{ type?: string; text?: string }> }) =>
      item.type === "message" && Array.isArray(item.content)
        ? item.content.filter((part) => part.type === "output_text").map((part) => part.text ?? "")
        : [],
    )
    .join("\n")
    .trim();
  const citations = blocks.flatMap(
    (item: { type?: string; content?: Array<{ annotations?: Array<{ type?: string; url?: string; title?: string }> }> }) =>
      item.type === "message" && Array.isArray(item.content)
        ? item.content.flatMap((part) =>
            Array.isArray(part.annotations)
              ? part.annotations
                  .filter((a) => a.type === "url_citation" && typeof a.url === "string")
                  .map((a) => toCitation(a.url!, a.title))
              : [],
          )
        : [],
  );
  if (!answer) throw new Error("ChatGPT returned no answer.");
  return { answer, citations: uniqueCitations(citations) };
}

async function scanClaude(query: string, creds?: ProviderCredentials): Promise<ProviderAnswer> {
  const response = await fetch("https://api.anthropic.com/v1/messages", {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      "x-api-key": (creds?.apiKey ?? process.env.ANTHROPIC_API_KEY)!,
      "anthropic-version": "2023-06-01",
    },
    body: JSON.stringify({
      model: creds?.model || process.env.GEO_ANTHROPIC_MODEL || "claude-sonnet-4-5",
      max_tokens: 1500,
      tools: [{ type: "web_search_20250305", name: "web_search" }],
      messages: [{ role: "user", content: BUYER_FRAMING + `"${query}"` }],
    }),
    signal: AbortSignal.timeout(TIMEOUT_MS),
  });
  if (!response.ok) throw new Error(`Claude returned HTTP ${response.status}.`);
  const payload = await response.json();
  const blocks = Array.isArray(payload.content) ? payload.content : [];
  const answer = blocks
    .filter((block: { type?: string }) => block.type === "text")
    .map((block: { text?: string }) => block.text ?? "")
    .join("\n")
    .trim();
  const citations = blocks.flatMap(
    (block: { type?: string; citations?: Array<{ type?: string; url?: string; title?: string }> }) =>
      block.type === "text" && Array.isArray(block.citations)
        ? block.citations
            .filter((c) => typeof c.url === "string")
            .map((c) => toCitation(c.url!, c.title))
        : [],
  );
  if (!answer) throw new Error("Claude returned no answer.");
  return { answer, citations: uniqueCitations(citations) };
}

async function scanGemini(query: string, creds?: ProviderCredentials): Promise<ProviderAnswer> {
  const model = creds?.model || process.env.GEO_GEMINI_MODEL || process.env.GEMINI_MODEL || "gemini-3.8-flash";
  const request = () =>
    fetch(`https://generativelanguage.googleapis.com/v1beta/models/${encodeURIComponent(model)}:generateContent`, {
      method: "POST",
      headers: { "Content-Type": "application/json", "x-goog-api-key": (creds?.apiKey ?? process.env.GEMINI_API_KEY)! },
      body: JSON.stringify({
        contents: [{ role: "user", parts: [{ text: BUYER_FRAMING + `"${query}"` }] }],
        tools: [{ google_search: {} }],
        generationConfig: { temperature: 0.2 },
      }),
      signal: AbortSignal.timeout(TIMEOUT_MS),
    });
  let response = await request();
  // One short retry for transient quota/demand errors on shared tiers.
  if (response.status === 429 || response.status === 503) {
    await new Promise((resolve) => setTimeout(resolve, 4000));
    response = await request();
  }
  if (!response.ok) throw new Error(`Gemini returned HTTP ${response.status}.`);
  const payload = await response.json();
  const candidate = payload.candidates?.[0];
  const answer = (candidate?.content?.parts ?? [])
    .map((part: { text?: unknown }) => (typeof part.text === "string" ? part.text : ""))
    .join("\n")
    .trim();
  const chunks = candidate?.groundingMetadata?.groundingChunks ?? [];
  const citations = (Array.isArray(chunks) ? chunks : []).map(
    (chunk: { web?: { uri?: unknown; title?: unknown } }) =>
      typeof chunk.web?.uri === "string"
        ? toCitation(chunk.web.uri, typeof chunk.web.title === "string" ? chunk.web.title : undefined)
        : null,
  );
  if (!answer) throw new Error("Gemini returned no answer.");
  return { answer, citations: uniqueCitations(citations) };
}

export const PROVIDER_SCANNERS: Record<string, (query: string, creds?: ProviderCredentials) => Promise<ProviderAnswer>> = {
  chatgpt: scanChatGPT,
  claude: scanClaude,
  gemini: scanGemini,
};

// Custom user-added providers speak the OpenAI chat-completions protocol.
// Most such endpoints have no live web search, so answers are ungrounded;
// citations are harvested from links in the answer text itself.
const LINK_PATTERN = /\[([^\]]+)\]\((https?:\/\/[^\s)]+)\)|(https?:\/\/[^\s)]+)/g;

export async function scanCustomProvider(query: string, creds: Required<Pick<ProviderCredentials, "apiKey" | "model" | "baseUrl">>): Promise<ProviderAnswer> {
  const base = creds.baseUrl.replace(/\/+$/, "");
  const response = await fetch(`${base}/chat/completions`, {
    method: "POST",
    headers: { "Content-Type": "application/json", Authorization: `Bearer ${creds.apiKey}` },
    body: JSON.stringify({
      model: creds.model,
      messages: [
        { role: "system", content: "You answer buyer research questions directly, recommending specific products or brands where relevant." },
        { role: "user", content: query },
      ],
    }),
    signal: AbortSignal.timeout(TIMEOUT_MS),
  });
  if (!response.ok) throw new Error(`Custom provider returned HTTP ${response.status}.`);
  const payload = await response.json();
  const answer = (payload.choices?.[0]?.message?.content ?? "").trim();
  if (!answer) throw new Error("Custom provider returned no answer.");
  const citations: Array<Citation | null> = [];
  for (const match of answer.matchAll(LINK_PATTERN)) {
    citations.push(toCitation(match[2] ?? match[3], match[1]));
  }
  return { answer, citations: uniqueCitations(citations) };
}
