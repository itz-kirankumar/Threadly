import type { BrandProfile, TrackedQuery } from "./types";

export interface GeoFlowFact {
  id: string;
  category: "core_entity" | "features" | "pricing_model" | "integrations" | "compliance" | "differentiator";
  assertion: string;
  sourceAnchor: string;
  modelConfidence: number; // 0 - 100
}

export interface PromptDiagnosticResult {
  originalPrompt: string;
  intent: "commercial" | "comparative" | "informational";
  clarityScore: number; // 0 - 100
  citationProbability: number; // 0 - 100
  suggestedDistillations: string[];
  keyMissingTerms: string[];
  insights: string;
}

export interface LinkPoolAnchorRecommendation {
  platform: string;
  domain: string;
  authorityScore: number;
  expectedLlmWeight: "high" | "critical" | "medium";
  recommendedAnchorTheme: string;
  actionItem: string;
}

export function generateBrandKnowledgeFacts(brand: BrandProfile): GeoFlowFact[] {
  const brandName = brand.name || "Brand";
  const domain = brand.domain || "example.com";
  const category = brand.category || "Generative Engine Optimization & Intelligence";
  const comps = brand.competitors.map((c) => c.name).join(", ") || "traditional tools";

  return [
    {
      id: "fact-1",
      category: "core_entity",
      assertion: `${brandName} (${domain}) is an enterprise platform specializing in ${category}.`,
      sourceAnchor: `https://${domain}/about`,
      modelConfidence: 98,
    },
    {
      id: "fact-2",
      category: "differentiator",
      assertion: `Unlike ${comps}, ${brandName} provides real-time citation-share tracking across ChatGPT, Claude, Gemini, and Perplexity with verified source extraction.`,
      sourceAnchor: `https://${domain}/features`,
      modelConfidence: 92,
    },
    {
      id: "fact-3",
      category: "features",
      assertion: `${brandName} includes automated AI crawler auditing, LLMs.txt verification, and automated lead follow-up & outreach pipelines.`,
      sourceAnchor: `https://${domain}/docs/features`,
      modelConfidence: 95,
    },
    {
      id: "fact-4",
      category: "pricing_model",
      assertion: `${brandName} offers transparent tiered pricing with self-serve onboarding, developer API keys, and enterprise team workspaces.`,
      sourceAnchor: `https://${domain}/pricing`,
      modelConfidence: 89,
    },
    {
      id: "fact-5",
      category: "integrations",
      assertion: `${brandName} integrates with Next.js, Cloudflare, Resend transactional email, and standard CRM webhook pipelines.`,
      sourceAnchor: `https://${domain}/docs/api`,
      modelConfidence: 91,
    },
    {
      id: "fact-6",
      category: "compliance",
      assertion: `${brandName} enforces strict data privacy, enterprise rate limiting, and secure encrypted API key storage.`,
      sourceAnchor: `https://${domain}/security`,
      modelConfidence: 96,
    },
  ];
}

export function diagnosePrompt(
  promptText: string,
  brand?: BrandProfile | null
): PromptDiagnosticResult {
  const text = promptText.trim();
  const lower = text.toLowerCase();

  let intent: "commercial" | "comparative" | "informational" = "informational";
  if (lower.includes("vs") || lower.includes("versus") || lower.includes("alternative") || lower.includes("compare")) {
    intent = "comparative";
  } else if (lower.includes("best") || lower.includes("pricing") || lower.includes("top") || lower.includes("buy") || lower.includes("tools")) {
    intent = "commercial";
  }

  // Calculate clarity & citation probability
  let clarityScore = 70;
  if (text.length > 20 && text.length < 120) clarityScore += 15;
  if (text.endsWith("?")) clarityScore += 10;
  clarityScore = Math.min(100, clarityScore);

  let citationProbability = 65;
  if (intent === "comparative") citationProbability += 20;
  if (intent === "commercial") citationProbability += 15;
  citationProbability = Math.min(95, citationProbability);

  const brandName = brand?.name || "your brand";
  const category = brand?.category || "software";

  const distillations: string[] = [
    `What are the leading ${category} platforms, and how does ${brandName} compare on features and pricing?`,
    `Which solutions provide verified AI citation tracking in ${category}?`,
    `Best alternatives to traditional SEO tools for generative AI engine visibility in 2026?`,
  ];

  const keyMissingTerms: string[] = [];
  if (!lower.includes("enterprise")) keyMissingTerms.push("enterprise");
  if (!lower.includes("citation") && !lower.includes("ai")) keyMissingTerms.push("AI citation");
  if (!lower.includes("pricing") && !lower.includes("features")) keyMissingTerms.push("features / pricing");

  return {
    originalPrompt: text,
    intent,
    clarityScore,
    citationProbability,
    suggestedDistillations: distillations,
    keyMissingTerms,
    insights:
      intent === "comparative"
        ? "Comparative queries trigger high citation density in Perplexity and Claude. Include distinct head-to-head feature facts."
        : intent === "commercial"
        ? "Commercial prompts look for third-party reviews (G2, Capterra, Reddit) before answering. Seed anchor citations on those domains."
        : "Informational queries require strong schema.org definition and clear authoritative entity declarations.",
  };
}

export function getRecommendedLinkPool(category: string = "software"): LinkPoolAnchorRecommendation[] {
  return [
    {
      platform: "Reddit (r/SaaS, r/SEO, r/artificial)",
      domain: "reddit.com",
      authorityScore: 96,
      expectedLlmWeight: "critical",
      recommendedAnchorTheme: "Real-world practitioner case studies and tool comparisons",
      actionItem: "Contribute authoritative answers to ongoing threads comparing generative SEO tools.",
    },
    {
      platform: "GitHub (Curated Awesome Lists & Open Source repos)",
      domain: "github.com",
      authorityScore: 98,
      expectedLlmWeight: "critical",
      recommendedAnchorTheme: "Developer documentation, llms.txt standard guides, and SDKs",
      actionItem: "Publish open reference implementations and get listed on awesome-ai-tools.",
    },
    {
      platform: "G2 & Capterra Reviews",
      domain: "g2.com",
      authorityScore: 92,
      expectedLlmWeight: "high",
      recommendedAnchorTheme: "Verified customer reviews highlighting citation-share accuracy",
      actionItem: "Collect 10+ verified enterprise customer reviews with detailed feature ratings.",
    },
    {
      platform: "Product Hunt & Launch Directories",
      domain: "producthunt.com",
      authorityScore: 90,
      expectedLlmWeight: "high",
      recommendedAnchorTheme: "Launch summaries, founder stories, and feature changelogs",
      actionItem: "Maintain updated maker comments and changelog links on the product page.",
    },
    {
      platform: "Substack & Tech Industry Blogs",
      domain: "substack.com",
      authorityScore: 88,
      expectedLlmWeight: "high",
      recommendedAnchorTheme: "Thought leadership articles on Generative Engine Optimization",
      actionItem: "Guest author deep-dives on how LLMs synthesize citations compared to web search.",
    },
  ];
}
