export interface AiCrawlerStatus {
  botName: string;
  userAgent: string;
  engine: string;
  allowed: boolean;
  status: "allowed" | "blocked" | "not_specified";
  recommendation: string;
}

export interface OpenSeoAuditResult {
  domain: string;
  overallScore: number; // 0 - 100
  aiReadinessScore: number; // 0 - 100
  traditionalSeoScore: number; // 0 - 100
  crawlerStatuses: AiCrawlerStatus[];
  hasLlmsTxt: boolean;
  hasRobotsTxt: boolean;
  hasSitemap: boolean;
  criticalIssues: string[];
  recommendations: string[];
  auditedAt: string;
}

const AI_BOTS = [
  { botName: "GPTBot", userAgent: "GPTBot", engine: "ChatGPT / OpenAI Search" },
  { botName: "ClaudeBot", userAgent: "ClaudeBot", engine: "Claude / Anthropic" },
  { botName: "PerplexityBot", userAgent: "PerplexityBot", engine: "Perplexity Search" },
  { botName: "Google-Extended", userAgent: "Google-Extended", engine: "Gemini / Google AI Overview" },
  { botName: "Bytespider", userAgent: "Bytespider", engine: "ByteDance / Doubao" },
  { botName: "CCBot", userAgent: "CCBot", engine: "Common Crawl / Open Training" },
  { botName: "Applebot-Extended", userAgent: "Applebot-Extended", engine: "Apple Intelligence" },
];

export async function runOpenSeoAudit(targetDomain: string): Promise<OpenSeoAuditResult> {
  const cleanDomain = targetDomain.trim().toLowerCase().replace(/^https?:\/\//, "").replace(/\/.*$/, "");

  let robotsContent = "";
  let hasRobotsTxt = false;
  let hasLlmsTxt = false;
  let hasSitemap = false;

  // Attempt to check robots.txt
  try {
    const robotsRes = await fetch(`https://${cleanDomain}/robots.txt`, {
      method: "GET",
      headers: { "User-Agent": "ThreadlyGeoAuditor/1.0" },
      signal: AbortSignal.timeout(4000),
    });
    if (robotsRes.ok) {
      hasRobotsTxt = true;
      robotsContent = await robotsRes.text();
      hasSitemap = robotsContent.toLowerCase().includes("sitemap:");
    }
  } catch {
    // If domain isn't reachable via HTTPS directly, default to sensible heuristics
    hasRobotsTxt = false;
  }

  // Attempt to check llms.txt
  try {
    const llmsRes = await fetch(`https://${cleanDomain}/llms.txt`, {
      method: "GET",
      headers: { "User-Agent": "ThreadlyGeoAuditor/1.0" },
      signal: AbortSignal.timeout(3000),
    });
    if (llmsRes.ok && (await llmsRes.text()).length > 20) {
      hasLlmsTxt = true;
    }
  } catch {
    hasLlmsTxt = false;
  }

  const crawlerStatuses: AiCrawlerStatus[] = AI_BOTS.map((bot) => {
    let allowed = true;
    let status: "allowed" | "blocked" | "not_specified" = "not_specified";

    if (hasRobotsTxt && robotsContent) {
      const lower = robotsContent.toLowerCase();
      const botMatches = lower.includes(`user-agent: ${bot.userAgent.toLowerCase()}`);
      if (botMatches) {
        // Simple check if disallow appears in block
        const regex = new RegExp(`user-agent:\\s*${bot.userAgent.toLowerCase()}[\\s\\S]*?disallow:\\s*\\/`, "i");
        if (regex.test(robotsContent)) {
          allowed = false;
          status = "blocked";
        } else {
          allowed = true;
          status = "allowed";
        }
      } else {
        // check wildcard
        const wildcardBlock = /user-agent:\s*\*[\s\S]*?disallow:\s*\/\s*$/m.test(robotsContent);
        if (wildcardBlock) {
          allowed = false;
          status = "blocked";
        } else {
          allowed = true;
          status = "not_specified";
        }
      }
    }

    return {
      botName: bot.botName,
      userAgent: bot.userAgent,
      engine: bot.engine,
      allowed,
      status,
      recommendation: allowed
        ? `Bot is permitted to crawl ${cleanDomain} for ${bot.engine}.`
        : `Bot is blocked from indexing ${cleanDomain}. Add "User-agent: ${bot.userAgent} Allow: /" in robots.txt.`,
    };
  });

  const criticalIssues: string[] = [];
  const recommendations: string[] = [];

  const blockedBots = crawlerStatuses.filter((b) => !b.allowed);
  if (blockedBots.length > 0) {
    criticalIssues.push(
      `${blockedBots.length} AI bot(s) (${blockedBots.map((b) => b.botName).join(", ")}) are blocked from crawling your website.`
    );
    recommendations.push("Explicitly allow GPTBot and PerplexityBot in robots.txt to ensure citation presence.");
  }

  if (!hasLlmsTxt) {
    criticalIssues.push("Missing /llms.txt standard file. AI models cannot parse your canonical product and pricing facts directly.");
    recommendations.push("Deploy /llms.txt at your domain root with markdown brand facts and API endpoints.");
  }

  if (!hasSitemap) {
    recommendations.push("Include a sitemap directive in robots.txt so AI crawlers discover fresh content daily.");
  }

  let aiReadinessScore = 85;
  if (!hasLlmsTxt) aiReadinessScore -= 25;
  if (blockedBots.length > 0) aiReadinessScore -= blockedBots.length * 15;
  aiReadinessScore = Math.max(15, Math.min(100, aiReadinessScore));

  const traditionalSeoScore = hasRobotsTxt && hasSitemap ? 88 : hasRobotsTxt ? 72 : 55;
  const overallScore = Math.round((aiReadinessScore * 0.6) + (traditionalSeoScore * 0.4));

  return {
    domain: cleanDomain,
    overallScore,
    aiReadinessScore,
    traditionalSeoScore,
    crawlerStatuses,
    hasLlmsTxt,
    hasRobotsTxt,
    hasSitemap,
    criticalIssues,
    recommendations,
    auditedAt: new Date().toISOString(),
  };
}
