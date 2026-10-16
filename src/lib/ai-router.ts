// Text generation is separate from Laya and AnyJev: both are typed-decision
// models and do not generate free-form summaries or email copy.
export type AiUseCase = "website-analysis" | "outreach-email" | "content-drafts";
type AiProvider = "openai" | "gemini";

function configured(provider: AiProvider) {
  return provider === "openai" ? Boolean(process.env.OPENAI_API_KEY) : Boolean(process.env.GEMINI_API_KEY);
}

export function getAiProvider(useCase: AiUseCase): AiProvider | null {
  const preferred = useCase === "outreach-email" ? "openai" : "gemini";
  const fallback = preferred === "gemini" ? "openai" : "gemini";
  if (configured(preferred)) return preferred;
  if (configured(fallback)) return fallback;
  return null;
}

export function getAiProviderLabel(useCase: AiUseCase) {
  const provider = getAiProvider(useCase);
  if (!provider) return null;
  return provider === "openai" ? "OpenAI" : "Gemini";
}

export async function generateJson(useCase: AiUseCase, system: string, prompt: string): Promise<unknown> {
  const provider = getAiProvider(useCase);
  if (!provider) throw new Error("Configure a text-generation API key to enable website summaries and email drafts.");

  if (provider === "openai") {
    const response = await fetch("https://api.openai.com/v1/chat/completions", {
      method: "POST",
      headers: { "Content-Type": "application/json", Authorization: `Bearer ${process.env.OPENAI_API_KEY}` },
      body: JSON.stringify({
        model: process.env.OPENAI_MODEL || "gpt-4.1-mini",
        response_format: { type: "json_object" },
        messages: [{ role: "system", content: system }, { role: "user", content: prompt }],
      }),
      signal: AbortSignal.timeout(30000),
    });
    if (!response.ok) throw new Error("OpenAI could not complete this text-generation task.");
    const payload = await response.json();
    const content = payload.choices?.[0]?.message?.content;
    if (typeof content !== "string") throw new Error("OpenAI returned an empty response.");
    return JSON.parse(content);
  }

  const model = process.env.GEMINI_MODEL || "gemini-3.8-flash";
  const response = await fetch(`https://generativelanguage.googleapis.com/v1beta/models/${encodeURIComponent(model)}:generateContent`, {
    method: "POST",
    headers: { "Content-Type": "application/json", "x-goog-api-key": process.env.GEMINI_API_KEY! },
    body: JSON.stringify({
      systemInstruction: { parts: [{ text: system }] },
      contents: [{ role: "user", parts: [{ text: prompt }] }],
      generationConfig: { responseMimeType: "application/json", temperature: 0.4 },
    }),
    signal: AbortSignal.timeout(30000),
  });
  if (!response.ok) throw new Error("Gemini could not complete this text-generation task.");
  const payload = await response.json();
  const content = payload.candidates?.[0]?.content?.parts?.map((part: { text?: unknown }) => typeof part.text === "string" ? part.text : "").join("");
  if (typeof content !== "string" || !content.trim()) throw new Error("Gemini returned an empty response.");
  return JSON.parse(content);
}
