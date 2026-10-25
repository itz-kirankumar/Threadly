export type AiEngineId = "chatgpt" | "perplexity" | "gemini" | "claude";

export interface GeoCitation {
  id: string;
  domain: string;
  title: string;
  url: string;
  authorityScore: number; // 0 - 100
  citedByEngines: AiEngineId[];
  mentionsTargetBrand: boolean;
  mentionsCompetitors: string[];
  snippet?: string;
}

export interface EngineResult {
  engineId: AiEngineId;
  engineName: string;
  model: string;
  brandMentioned: boolean;
  positionRank: number | null; // 1 = #1 recommended, 2 = 2nd, null = not mentioned
  recommendationTier: "primary" | "alternative" | "cautioned" | "omitted";
  sentiment: "positive" | "neutral" | "negative" | "not_mentioned";
  verbatimAnswer: string;
  keyTakeaways: string[];
  competitorsMentioned: string[];
  citations: GeoCitation[];
  scannedAt: string;
}

export interface GeoQueryRecord {
  id: string;
  prompt: string;
  category: "commercial" | "comparison" | "problem" | "technical";
  targetBrand: string;
  competitors: string[];
  overallShareOfVoice: number; // 0 - 100%
  primaryRecommendationRate: number; // 0 - 100%
  netSentimentScore: number; // -100 to +100
  engineResults: Record<AiEngineId, EngineResult>;
  lastScannedAt: string;
  status: "scanned" | "scanning" | "error";
}

export interface CitationGap {
  domain: string;
  authorityScore: number;
  competitorsBenefiting: string[];
  recommendedAction: string;
  estimatedImpact: "high" | "medium" | "low";
  sampleQueryCount: number;
}

export interface EnterpriseBrandContext {
  id: string;
  brandName: string;
  domain: string;
  industry: string;
  competitors: string[];
  queries: GeoQueryRecord[];
  globalMetrics: {
    totalShareOfVoice: number;
    primaryRecommendationRate: number;
    netSentimentScore: number;
    totalCitationsIdentified: number;
    activeCitationGaps: number;
    enginePerformance: Record<AiEngineId, { shareOfVoice: number; avgRank: number | null }>;
  };
}
