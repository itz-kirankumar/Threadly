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

// Engine labels distinguish what each token actually does (official vendor
// docs): training crawlers, search-indexing crawlers, and control tokens
// that are not crawlers at all. Crawl permission never guarantees indexing,
// citation, or ranking.
const AI_BOTS = [
  { botName: "GPTBot", userAgent: "GPTBot", engine: "OpenAI model training crawler" },
  { botName: "ClaudeBot", userAgent: "ClaudeBot", engine: "Anthropic model training crawler" },
  { botName: "PerplexityBot", userAgent: "PerplexityBot", engine: "Perplexity search indexing crawler" },
  // Google-Extended has NO crawler: it is a control token over training/
  // grounding use of already-crawled content and does not affect Google
  // Search inclusion or ranking (Google's crawlers documentation).
  { botName: "Google-Extended", userAgent: "Google-Extended", engine: "Gemini training/grounding control (not a crawler)" },
  { botName: "Bytespider", userAgent: "Bytespider", engine: "ByteDance crawler (Doubao / training)" },
  { botName: "CCBot", userAgent: "CCBot", engine: "Common Crawl dataset crawler" },
  { botName: "Applebot-Extended", userAgent: "Applebot-Extended", engine: "Apple Intelligence training control (not a crawler)" },
];

// --- robots.txt parsing (RFC 9309 group semantics) ---
// A group is one or more consecutive User-agent lines followed by Allow /
// Disallow rules. Multi-agent groups share their rules. Evaluation uses the
// longest matching rule path; Allow wins ties (most specific match governs,
// least restrictive on ties), matching Google's documented behavior.
export interface RobotsGroup {
  agents: string[];
  rules: { allow: boolean; path: string }[];
}

export function parseRobotsGroups(content: string): RobotsGroup[] {
  const groups: RobotsGroup[] = [];
  let pendingAgents: string[] = [];
  let current: RobotsGroup | null = null;
  for (const rawLine of content.split(/\r?\n/)) {
    const line = rawLine.replace(/#.*$/, "").trim();
    if (!line) continue;
    const m = line.match(/^([A-Za-z][A-Za-z-]*):\s*(.*)$/);
    if (!m) continue;
    const field = m[1].toLowerCase();
    const value = m[2].trim();
    if (field === "user-agent") {
      if (current && current.rules.length > 0) {
        groups.push(current);
        current = null;
        pendingAgents = [];
      }
      pendingAgents.push(value.toLowerCase());
      continue;
    }
    if (field === "allow" || field === "disallow") {
      if (pendingAgents.length > 0) {
        current = { agents: pendingAgents, rules: [] };
        pendingAgents = [];
      }
      if (current) current.rules.push({ allow: field === "allow", path: value });
      continue;
    }
    // sitemap, crawl-delay and other fields are not crawl rules; ignore.
  }
  if (current) groups.push(current);
  else if (pendingAgents.length > 0) groups.push({ agents: pendingAgents, rules: [] });
  return groups;
}

// Whether `ua` may crawl `path`. Specific groups for the token take
// precedence over wildcard ("*") groups. Prefix matching; "*" and "$"
// pattern extensions are not evaluated. Returns null when no group matches
// at all (no specific and no wildcard group).
export function robotsAllowsPath(groups: RobotsGroup[], ua: string, path: string): "allowed" | "blocked" | null {
  const token = ua.toLowerCase();
  const specific = groups.filter((g) => g.agents.includes(token));
  const pool = specific.length > 0 ? specific : groups.filter((g) => g.agents.includes("*"));
  if (pool.length === 0) return null;
  let best: { allow: boolean; len: number } | null = null;
  for (const g of pool) {
    for (const r of g.rules) {
      if (r.path === "") {
        // "Disallow:" with an empty path means "nothing disallowed".
        if (!r.allow && !best) best = { allow: true, len: 0 };
        continue;
      }
      if (!path.startsWith(r.path)) continue;
      const len = r.path.length;
      if (!best || len > best.len || (len === best.len && r.allow)) best = { allow: r.allow, len };
    }
  }
  if (!best) return "allowed";
  return best.allow ? "allowed" : "blocked";
}

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
      const groups = parseRobotsGroups(robotsContent);
      const hasSpecificGroup = groups.some((g) => g.agents.includes(bot.userAgent.toLowerCase()));
      const verdict = robotsAllowsPath(groups, bot.userAgent, "/");
      allowed = verdict !== "blocked";
      status = verdict === "blocked" ? "blocked" : hasSpecificGroup ? "allowed" : "not_specified";
    }

    return {
      botName: bot.botName,
      userAgent: bot.userAgent,
      engine: bot.engine,
      allowed,
      status,
      recommendation:
        status === "blocked"
          ? `robots.txt disallows ${bot.userAgent} from crawling ${cleanDomain}. Crawl directives do not control indexing or citation by themselves. To permit crawling, add a group "User-agent: ${bot.userAgent}" with "Allow: /".`
          : status === "allowed"
            ? `robots.txt explicitly permits ${bot.userAgent} to crawl ${cleanDomain}.`
            : `No specific rule for ${bot.userAgent}; the wildcard policy permits crawling ${cleanDomain}.`,
    };
  });

  const criticalIssues: string[] = [];
  const recommendations: string[] = [];

  const blockedBots = crawlerStatuses.filter((b) => !b.allowed);
  if (blockedBots.length > 0) {
    criticalIssues.push(
      `${blockedBots.length} AI bot(s) (${blockedBots.map((b) => b.botName).join(", ")}) are blocked from crawling your website.`
    );
    recommendations.push("Explicitly allow GPTBot and PerplexityBot in robots.txt so their crawlers can access your pages. Crawl access does not guarantee citation.");
  }

  if (!hasLlmsTxt) {
    criticalIssues.push("Missing /llms.txt (a proposed convention, not an adopted standard): a markdown file of canonical product and pricing facts that LLM tools can read directly.");
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
