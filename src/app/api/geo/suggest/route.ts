import { errorResponse, readJsonBody } from "@/lib/api-request";
import { getFirebaseIdentity, withWorkspace } from "@/lib/portal-db";
import { loadBrand, loadQueries } from "@/lib/geo/store";
import { classifyIntent, starterQueries } from "@/lib/geo/engine";
import { checkRateLimit } from "@/lib/rate-limit";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

// Suggest buyer questions worth tracking. Uses the cheapest configured
// provider; falls back to category templates when no provider is set up.
export async function POST(request: Request) {
  try {
    const user = await getFirebaseIdentity(request);
    await readJsonBody(request, 2 * 1024).catch(() => ({}));
    // Suggest can call a paid provider, so keep a per-user hourly quota.
    if (user!.idToken !== "demo-token") {
      const limit = await checkRateLimit(`suggest:${user!.uid}`, 10, 3600, user!);
      if (limit && !limit.allowed) {
        return Response.json({ error: "Too many requests. Try again shortly." }, { status: 429, headers: { "Retry-After": String(limit.retryAfterSeconds) } });
      }
    }
    return await withWorkspace(user!.uid, user!.idToken, async () => {
      const [brand, existing] = await Promise.all([loadBrand(), loadQueries()]);
      if (!brand) throw new Error("Set up your brand profile first.");
      const existingTexts = new Set(existing.map((q) => q.text.toLowerCase()));
      const fallback = starterQueries(brand).filter((text) => !existingTexts.has(text.toLowerCase()));

      if (!process.env.GEMINI_API_KEY && !process.env.OPENAI_API_KEY) {
        return Response.json({ suggestions: fallback, source: "template" });
      }

      const prompt = `List 8 short buyer-research questions someone comparing ${brand.category || "software"} products would ask an AI assistant. Mix "best X" commercial questions, "X vs Y" comparisons and one how-to question. One question per line, no numbering, no quotes, no commentary.`;
      let text = "";
      try {
        if (process.env.GEMINI_API_KEY) {
          const model = process.env.GEO_GEMINI_MODEL || process.env.GEMINI_MODEL || "gemini-3.8-flash";
          const response = await fetch(
            `https://generativelanguage.googleapis.com/v1beta/models/${encodeURIComponent(model)}:generateContent`,
            {
              method: "POST",
              headers: { "Content-Type": "application/json", "x-goog-api-key": process.env.GEMINI_API_KEY },
              body: JSON.stringify({ contents: [{ role: "user", parts: [{ text: prompt }] }] }),
              signal: AbortSignal.timeout(30_000),
            },
          );
          if (response.ok) {
            const payload = await response.json();
            text = (payload.candidates?.[0]?.content?.parts ?? [])
              .map((part: { text?: unknown }) => (typeof part.text === "string" ? part.text : ""))
              .join("\n");
          }
        } else {
          const response = await fetch("https://api.openai.com/v1/responses", {
            method: "POST",
            headers: { "Content-Type": "application/json", Authorization: `Bearer ${process.env.OPENAI_API_KEY}` },
            body: JSON.stringify({ model: process.env.OPENAI_MODEL || "gpt-4.1-mini", store: false, input: prompt }),
            signal: AbortSignal.timeout(30_000),
          });
          if (response.ok) {
            const payload = await response.json();
            text = (Array.isArray(payload.output) ? payload.output : [])
              .flatMap((item: { type?: string; content?: Array<{ type?: string; text?: string }> }) =>
                item.type === "message" && Array.isArray(item.content)
                  ? item.content.filter((part) => part.type === "output_text").map((part) => part.text ?? "")
                  : [],
              )
              .join("\n");
          }
        }
      } catch {
        text = "";
      }

      const suggestions = text
        .split("\n")
        .map((line) => line.replace(/^\s*(?:\d+[.)]|[-*])\s*/, "").trim())
        .filter((line) => line.length >= 12 && line.length <= 160 && !existingTexts.has(line.toLowerCase()))
        .slice(0, 8)
        .map((line) => (line.endsWith("?") ? line : `${line}?`));

      return Response.json({
        suggestions: suggestions.length ? suggestions : fallback,
        source: suggestions.length ? "ai" : "template",
        intents: Object.fromEntries((suggestions.length ? suggestions : fallback).map((s) => [s, classifyIntent(s)])),
      });
    });
  } catch (error) {
    return errorResponse(error, "Suggest queries");
  }
}
