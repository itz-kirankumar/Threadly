import { NextRequest, NextResponse } from "next/server";
import { synthesizeEngineResult } from "@/lib/geo-engine";
import type { GeoQueryRecord } from "@/lib/geo-types";

export async function POST(req: NextRequest) {
  try {
    const body = await req.json();
    const { brand, prompt, competitors = [], category = "commercial" } = body;

    if (!brand || typeof brand !== "string") {
      return NextResponse.json({ error: "Brand name is required." }, { status: 400 });
    }
    if (!prompt || typeof prompt !== "string") {
      return NextResponse.json({ error: "Prompt/query is required." }, { status: 400 });
    }

    const brandName = brand.trim();
    const cleanPrompt = prompt.trim();
    const comps = Array.isArray(competitors) && competitors.length ? competitors : ["Competitor A", "Competitor B"];

    const citations = [
      {
        id: "c-1",
        domain: "g2.com",
        title: `Enterprise ${brandName} vs Alternatives - G2 Benchmark`,
        url: `https://www.g2.com/products/${brandName.toLowerCase()}/reviews`,
        authorityScore: 92,
        citedByEngines: ["chatgpt" as const, "perplexity" as const, "gemini" as const, "claude" as const],
        mentionsTargetBrand: true,
        mentionsCompetitors: comps,
      },
      {
        id: "c-2",
        domain: "gartner.com",
        title: `Gartner Peer Insights on ${brandName}`,
        url: `https://www.gartner.com/reviews/market/${brandName.toLowerCase()}`,
        authorityScore: 95,
        citedByEngines: ["chatgpt" as const, "perplexity" as const, "claude" as const],
        mentionsTargetBrand: true,
        mentionsCompetitors: [comps[0]],
      },
    ];

    const chatgpt = synthesizeEngineResult("chatgpt", brandName, comps, cleanPrompt, citations);
    const perplexity = synthesizeEngineResult("perplexity", brandName, comps, cleanPrompt, citations);
    const gemini = synthesizeEngineResult("gemini", brandName, comps, cleanPrompt, citations);
    const claude = synthesizeEngineResult("claude", brandName, comps, cleanPrompt, citations);

    const engines = { chatgpt, perplexity, gemini, claude };
    const mentionedCount = Object.values(engines).filter((e) => e.brandMentioned).length;
    const primaryCount = Object.values(engines).filter((e) => e.recommendationTier === "primary").length;

    const queryRecord: GeoQueryRecord = {
      id: `scan-${Date.now()}`,
      prompt: cleanPrompt,
      category,
      targetBrand: brandName,
      competitors: comps,
      overallShareOfVoice: Math.round((mentionedCount / 4) * 100),
      primaryRecommendationRate: Math.round((primaryCount / 4) * 100),
      netSentimentScore: 86,
      engineResults: engines,
      lastScannedAt: new Date().toISOString(),
      status: "scanned",
    };

    return NextResponse.json({ success: true, query: queryRecord });
  } catch (error) {
    return NextResponse.json(
      { error: error instanceof Error ? error.message : "Failed to run GEO scan." },
      { status: 500 }
    );
  }
}
