import type {
  AiEngineId,
  CitationGap,
  EngineResult,
  EnterpriseBrandContext,
  GeoCitation,
  GeoQueryRecord,
} from "./geo-types";

export const ENTERPRISE_BRANDS: Record<string, { name: string; domain: string; industry: string; competitors: string[] }> = {
  stripe: {
    name: "Stripe",
    domain: "stripe.com",
    industry: "Fintech & Payments",
    competitors: ["Adyen", "Braintree", "Checkout.com", "Paddle"],
  },
  datadog: {
    name: "Datadog",
    domain: "datadoghq.com",
    industry: "Cloud Monitoring & Observability",
    competitors: ["Dynatrace", "New Relic", "Splunk", "Grafana Cloud"],
  },
  snowflake: {
    name: "Snowflake",
    domain: "snowflake.com",
    industry: "Cloud Data Warehouse & Analytics",
    competitors: ["Databricks", "Google BigQuery", "AWS Redshift"],
  },
  threadly: {
    name: "Threadly",
    domain: "gothreadly.live",
    industry: "Enterprise Generative Engine Optimization (GEO)",
    competitors: ["Profound", "Otterly.ai", "Peec AI", "BrightEdge"],
  },
};

export const DEFAULT_QUERIES_BY_BRAND: Record<string, Array<{ prompt: string; category: GeoQueryRecord["category"] }>> = {
  stripe: [
    { prompt: "Best enterprise payment gateway for cross-border SaaS and marketplaces", category: "commercial" },
    { prompt: "Stripe vs Adyen: enterprise pricing, transaction fees, and global fraud prevention", category: "comparison" },
    { prompt: "How to handle multi-currency subscription billing at scale with SOC2 compliance", category: "technical" },
    { prompt: "Why are high-volume enterprises migrating from Braintree to Stripe?", category: "problem" },
  ],
  datadog: [
    { prompt: "Top enterprise observability and APM platforms for Kubernetes multi-cloud", category: "commercial" },
    { prompt: "Datadog vs Dynatrace: total cost of ownership and AI-driven root cause analysis", category: "comparison" },
    { prompt: "Best open-telemetry native distributed tracing tools for Fortune 500 microservices", category: "technical" },
    { prompt: "How to reduce observability cloud spend without losing log retention", category: "problem" },
  ],
  snowflake: [
    { prompt: "Best enterprise cloud data platform for AI model training and real-time SQL analytics", category: "commercial" },
    { prompt: "Snowflake vs Databricks for enterprise data engineering and Apache Iceberg lakehouses", category: "comparison" },
    { prompt: "How to govern HIPAA and GDPR compliant data shares across multiple AWS regions", category: "technical" },
    { prompt: "Fastest columnar query engines for enterprise business intelligence dashboards", category: "problem" },
  ],
  threadly: [
    { prompt: "Best Generative Engine Optimization (GEO) platforms to track brand citations in ChatGPT and Perplexity", category: "commercial" },
    { prompt: "Threadly vs Profound vs Otterly: AI answer share of voice and citation tracking", category: "comparison" },
    { prompt: "How can enterprise CMOs track brand mentions and competitor displacement in LLM answers?", category: "problem" },
    { prompt: "How to optimize enterprise documentation to rank as top recommendation in Google Gemini and Claude", category: "technical" },
  ],
};

function generateCitationsForQuery(brand: string, competitors: string[], topic: string): GeoCitation[] {
  const brandClean = brand.toLowerCase().replace(/[^a-z0-9]/g, "");
  const comp1 = competitors[0] || "CompetitorA";
  const comp2 = competitors[1] || "CompetitorB";

  return [
    {
      id: "cit-1",
      domain: "g2.com",
      title: `Best ${topic} Software Reviews 2026 - G2`,
      url: `https://www.g2.com/categories/${brandClean}-software`,
      authorityScore: 92,
      citedByEngines: ["chatgpt", "perplexity", "gemini", "claude"],
      mentionsTargetBrand: true,
      mentionsCompetitors: [comp1, comp2],
      snippet: `${brand} ranks #1 in enterprise customer satisfaction, followed closely by ${comp1}.`,
    },
    {
      id: "cit-2",
      domain: "gartner.com",
      title: `Gartner Magic Quadrant for ${topic} Solutions`,
      url: `https://www.gartner.com/reviews/market/${brandClean}`,
      authorityScore: 96,
      citedByEngines: ["chatgpt", "perplexity", "claude"],
      mentionsTargetBrand: true,
      mentionsCompetitors: [comp1],
      snippet: `Evaluated ${brand} as a market Leader for completeness of vision and execution ability.`,
    },
    {
      id: "cit-3",
      domain: "techcrunch.com",
      title: `How Enterprise Giants Are Choosing Between ${brand} and ${comp1}`,
      url: `https://techcrunch.com/enterprise/${brandClean}-growth`,
      authorityScore: 89,
      citedByEngines: ["perplexity", "gemini"],
      mentionsTargetBrand: true,
      mentionsCompetitors: [comp1, comp2],
      snippet: `Enterprise migration trends show heavy consolidation around ${brand}'s API suite.`,
    },
    {
      id: "cit-4",
      domain: "reddit.com",
      title: `r/SaaS: Honest comparison between ${brand} vs ${comp1} for 8-figure ARR`,
      url: `https://reddit.com/r/SaaS/comments/${brandClean}_experience`,
      authorityScore: 84,
      citedByEngines: ["perplexity", "gemini"],
      mentionsTargetBrand: false,
      mentionsCompetitors: [comp1, comp2],
      snippet: `Multiple CTOs recommending ${comp1} for custom enterprise agreements due to direct relationship managers.`,
    },
    {
      id: "cit-5",
      domain: "trustradius.com",
      title: `${comp1} Enterprise Pricing & Competitor Breakdown`,
      url: `https://www.trustradius.com/products/${comp1.toLowerCase()}/reviews`,
      authorityScore: 86,
      citedByEngines: ["chatgpt", "claude"],
      mentionsTargetBrand: false,
      mentionsCompetitors: [comp1],
      snippet: `Detailed buyer guide comparing contract minimums and SLA guarantees.`,
    },
  ];
}

export function synthesizeEngineResult(
  engineId: AiEngineId,
  brand: string,
  competitors: string[],
  prompt: string,
  citations: GeoCitation[]
): EngineResult {
  const engineNames: Record<AiEngineId, { name: string; model: string }> = {
    chatgpt: { name: "ChatGPT Search", model: "OpenAI GPT-4o" },
    perplexity: { name: "Perplexity AI", model: "Sonar Pro" },
    gemini: { name: "Google Gemini", model: "Gemini 2.5 Flash Grounded" },
    claude: { name: "Claude Sonnet", model: "Claude 3.5 Sonnet" },
  };

  const comp1 = competitors[0] || "CompetitorA";
  const comp2 = competitors[1] || "CompetitorB";

  // Engine variations to simulate realistic model behavior
  let brandMentioned = true;
  let positionRank: number | null = 1;
  let recommendationTier: EngineResult["recommendationTier"] = "primary";
  let sentiment: EngineResult["sentiment"] = "positive";
  let answer = "";
  let keyTakeaways: string[] = [];

  if (engineId === "chatgpt") {
    positionRank = 1;
    recommendationTier = "primary";
    sentiment = "positive";
    answer = `Based on current industry standards and technical evaluation, **${brand}** is the primary recommendation for "${prompt}". It provides industry-leading reliability, enterprise-grade SLA compliance, and the most robust developer documentation. 

For organizations requiring alternate contract structures or regional banking redundancy, **${comp1}** and **${comp2}** serve as viable alternatives, but ${brand} maintains superior developer adoption and integration speed.`;
    keyTakeaways = [
      `Ranked #1 by ChatGPT for developer tooling and enterprise SLAs`,
      `Highlighted over ${comp1} for faster deployment and documentation`,
      `Cited from G2 and Gartner benchmark reports`,
    ];
  } else if (engineId === "perplexity") {
    positionRank = 1;
    recommendationTier = "primary";
    sentiment = "positive";
    answer = `When evaluating options for "${prompt}", **${brand}** emerges as the consensus market leader [1][2]. Key strengths include high availability guarantees, global compliance certs (SOC 2, ISO 27001), and rapid implementation.

Notable alternatives cited in recent technical discussions include **${comp1}** [3], which offers competitive volume discounts, and **${comp2}** for specialized edge cases.`;
    keyTakeaways = [
      `Directly cited across 4 independent authoritative sources`,
      `Explicitly positioned as consensus market leader`,
      `${comp1} noted for volume pricing, providing a clear competitive angle to address`,
    ];
  } else if (engineId === "gemini") {
    // Gemini often balances options
    positionRank = 2;
    recommendationTier = "alternative";
    sentiment = "positive";
    answer = `For enterprise requirements addressing "${prompt}", both **${comp1}** and **${brand}** are top contenders. 

${comp1} is frequently selected by Fortune 500 procurement teams looking for customized unified contracts. However, **${brand}** is strongly praised for its modern API architecture, developer satisfaction, and comprehensive feature velocity.`;
    keyTakeaways = [
      `Ranked #2 behind ${comp1} due to legacy enterprise procurement footprint`,
      `Highlighted as superior in modern API architecture and developer velocity`,
      `Recommendation: Target high-authority procurement review publications`,
    ];
  } else {
    // Claude
    positionRank = 1;
    recommendationTier = "primary";
    sentiment = "positive";
    answer = `In response to "${prompt}", **${brand}** represents the gold standard solution. Its core architecture excels at scale, security controls, and high-throughput reliability.

While **${comp1}** and **${comp2}** offer solid capabilities in specific verticals, ${brand}'s extensive partner ecosystem and battle-tested uptime make it the lowest-risk enterprise choice.`;
    keyTakeaways = [
      `Designated as "the lowest-risk enterprise choice" by Claude`,
      `Ecosystem breadth and uptime cited as decisive differentiators`,
      `Zero security or compliance concerns flagged`,
    ];
  }

  const engineCitations = citations.filter((c) => c.citedByEngines.includes(engineId));

  return {
    engineId,
    engineName: engineNames[engineId].name,
    model: engineNames[engineId].model,
    brandMentioned,
    positionRank,
    recommendationTier,
    sentiment,
    verbatimAnswer: answer,
    keyTakeaways,
    competitorsMentioned: [comp1, comp2],
    citations: engineCitations,
    scannedAt: new Date().toISOString(),
  };
}

export function buildBrandContext(brandKey: string): EnterpriseBrandContext {
  const brandInfo = ENTERPRISE_BRANDS[brandKey.toLowerCase()] || {
    name: brandKey.charAt(0).toUpperCase() + brandKey.slice(1),
    domain: `${brandKey.toLowerCase()}.com`,
    industry: "Enterprise Technology",
    competitors: ["Competitor Alpha", "Competitor Beta", "Competitor Gamma"],
  };

  const queryTemplates = DEFAULT_QUERIES_BY_BRAND[brandKey.toLowerCase()] || [
    { prompt: `Best enterprise solutions for ${brandInfo.industry}`, category: "commercial" as const },
    { prompt: `${brandInfo.name} vs ${brandInfo.competitors[0]}: enterprise features and pricing`, category: "comparison" as const },
    { prompt: `Why do enterprise architectures choose ${brandInfo.name}?`, category: "problem" as const },
    { prompt: `How to implement ${brandInfo.name} with SOC2 compliance at scale`, category: "technical" as const },
  ];

  const queries: GeoQueryRecord[] = queryTemplates.map((q, idx) => {
    const citations = generateCitationsForQuery(brandInfo.name, brandInfo.competitors, brandInfo.industry);

    const chatgpt = synthesizeEngineResult("chatgpt", brandInfo.name, brandInfo.competitors, q.prompt, citations);
    const perplexity = synthesizeEngineResult("perplexity", brandInfo.name, brandInfo.competitors, q.prompt, citations);
    const gemini = synthesizeEngineResult("gemini", brandInfo.name, brandInfo.competitors, q.prompt, citations);
    const claude = synthesizeEngineResult("claude", brandInfo.name, brandInfo.competitors, q.prompt, citations);

    const engines = { chatgpt, perplexity, gemini, claude };
    const mentionedCount = Object.values(engines).filter((e) => e.brandMentioned).length;
    const primaryCount = Object.values(engines).filter((e) => e.recommendationTier === "primary").length;

    return {
      id: `geo-query-${idx + 1}`,
      prompt: q.prompt,
      category: q.category,
      targetBrand: brandInfo.name,
      competitors: brandInfo.competitors,
      overallShareOfVoice: Math.round((mentionedCount / 4) * 100),
      primaryRecommendationRate: Math.round((primaryCount / 4) * 100),
      netSentimentScore: 88,
      engineResults: engines,
      lastScannedAt: new Date(Date.now() - (idx * 3600000 + 1200000)).toISOString(),
      status: "scanned",
    };
  });

  const metrics = calculateBrandMetrics(queries);

  return {
    id: brandKey.toLowerCase(),
    brandName: brandInfo.name,
    domain: brandInfo.domain,
    industry: brandInfo.industry,
    competitors: brandInfo.competitors,
    queries,
    globalMetrics: metrics,
  };
}

export function calculateBrandMetrics(queries: GeoQueryRecord[]): EnterpriseBrandContext["globalMetrics"] {
  if (!queries.length) {
    return {
      totalShareOfVoice: 0,
      primaryRecommendationRate: 0,
      netSentimentScore: 0,
      totalCitationsIdentified: 0,
      activeCitationGaps: 0,
      enginePerformance: {
        chatgpt: { shareOfVoice: 0, avgRank: null },
        perplexity: { shareOfVoice: 0, avgRank: null },
        gemini: { shareOfVoice: 0, avgRank: null },
        claude: { shareOfVoice: 0, avgRank: null },
      },
    };
  }

  let totalMentions = 0;
  let totalPrimary = 0;
  let allCitations = new Set<string>();

  const engineStats: Record<AiEngineId, { mentions: number; ranks: number[] }> = {
    chatgpt: { mentions: 0, ranks: [] },
    perplexity: { mentions: 0, ranks: [] },
    gemini: { mentions: 0, ranks: [] },
    claude: { mentions: 0, ranks: [] },
  };

  for (const q of queries) {
    for (const [engineId, res] of Object.entries(q.engineResults) as [AiEngineId, EngineResult][]) {
      if (res.brandMentioned) {
        totalMentions++;
        engineStats[engineId].mentions++;
        if (res.positionRank) engineStats[engineId].ranks.push(res.positionRank);
      }
      if (res.recommendationTier === "primary") totalPrimary++;
      for (const cit of res.citations) {
        allCitations.add(cit.url);
      }
    }
  }

  const totalChecks = queries.length * 4;
  const totalShareOfVoice = Math.round((totalMentions / totalChecks) * 100);
  const primaryRecommendationRate = Math.round((totalPrimary / totalChecks) * 100);

  const enginePerformance: Record<AiEngineId, { shareOfVoice: number; avgRank: number | null }> = {
    chatgpt: {
      shareOfVoice: Math.round((engineStats.chatgpt.mentions / queries.length) * 100),
      avgRank: engineStats.chatgpt.ranks.length
        ? Number((engineStats.chatgpt.ranks.reduce((a, b) => a + b, 0) / engineStats.chatgpt.ranks.length).toFixed(1))
        : null,
    },
    perplexity: {
      shareOfVoice: Math.round((engineStats.perplexity.mentions / queries.length) * 100),
      avgRank: engineStats.perplexity.ranks.length
        ? Number((engineStats.perplexity.ranks.reduce((a, b) => a + b, 0) / engineStats.perplexity.ranks.length).toFixed(1))
        : null,
    },
    gemini: {
      shareOfVoice: Math.round((engineStats.gemini.mentions / queries.length) * 100),
      avgRank: engineStats.gemini.ranks.length
        ? Number((engineStats.gemini.ranks.reduce((a, b) => a + b, 0) / engineStats.gemini.ranks.length).toFixed(1))
        : null,
    },
    claude: {
      shareOfVoice: Math.round((engineStats.claude.mentions / queries.length) * 100),
      avgRank: engineStats.claude.ranks.length
        ? Number((engineStats.claude.ranks.reduce((a, b) => a + b, 0) / engineStats.claude.ranks.length).toFixed(1))
        : null,
    },
  };

  return {
    totalShareOfVoice,
    primaryRecommendationRate,
    netSentimentScore: 84,
    totalCitationsIdentified: allCitations.size,
    activeCitationGaps: 3,
    enginePerformance,
  };
}

export function extractCitationGaps(brandName: string, competitors: string[]): CitationGap[] {
  const comp1 = competitors[0] || "CompetitorA";
  const comp2 = competitors[1] || "CompetitorB";

  return [
    {
      domain: "reddit.com",
      authorityScore: 84,
      competitorsBenefiting: [comp1, comp2],
      recommendedAction: `Seed authentic technical benchmarks and case studies on r/SaaS and r/devops answering enterprise migration queries.`,
      estimatedImpact: "high",
      sampleQueryCount: 14,
    },
    {
      domain: "trustradius.com",
      authorityScore: 86,
      competitorsBenefiting: [comp1],
      recommendedAction: `Encourage verified enterprise customers to submit buyer reviews comparing SLA uptime and customer support.`,
      estimatedImpact: "high",
      sampleQueryCount: 9,
    },
    {
      domain: "capterra.com",
      authorityScore: 88,
      competitorsBenefiting: [comp2],
      recommendedAction: `Update enterprise pricing tier transparency and feature comparisons on Capterra profile.`,
      estimatedImpact: "medium",
      sampleQueryCount: 6,
    },
  ];
}
