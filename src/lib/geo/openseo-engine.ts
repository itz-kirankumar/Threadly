export interface AiCrawlerStatus {
  botName: string;
  userAgent: string;
  engine: string;
  allowed: boolean;
  status: "allowed" | "blocked" | "not_specified";
  recommendation: string;
}

export interface AuditCheck {
  id: "robots_txt" | "sitemap_declared" | "llms_txt" | "ai_crawlers_permitted";
  label: string;
  passed: boolean;
  detail: string;
}

export interface OpenSeoAuditResult {
  domain: string;
  // Plain pass/fail checks with their count as the denominator. No composite
  // score: the checks are not weighted evidence of citation or ranking.
  checks: AuditCheck[];
  checksPassed: number;
  checksTotal: number;
  crawlerStatuses: AiCrawlerStatus[];
  hasLlmsTxt: boolean;
  hasRobotsTxt: boolean;
  hasSitemap: boolean;
  // Set when robots.txt could not be fetched at all (network or TLS failure),
  // as opposed to a site that answered without one.
  robotsFetchError: string | null;
  criticalIssues: string[];
  recommendations: string[];
  auditedAt: string;
}

// Accepts a public DNS hostname only: no scheme-relative tricks, userinfo,
// ports, IP literals or internal names, so the server-side fetch cannot be
// pointed at private infrastructure by a typed value.
export function parseAuditDomain(input: string): string | null {
  const host = input.trim().toLowerCase().replace(/^https?:\/\//, "").replace(/[/?#].*$/, "").replace(/\.$/, "");
  if (!host || host.length > 253) return null;
  if (/[@:[\]\s]/.test(host)) return null;
  if (/^\d+(\.\d+){3}$/.test(host)) return null;
  if (!/^(?=.{1,253}$)([a-z0-9](?:[a-z0-9-]{0,61}[a-z0-9])?\.)+[a-z]{2,63}$/.test(host)) return null;
  if (/(^|\.)(localhost|local|internal|intranet|lan|home|corp|localdomain|test|invalid|example)$/.test(host)) return null;
  return host;
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
  const cleanDomain = parseAuditDomain(targetDomain);
  if (!cleanDomain) throw new Error("invalid_audit_domain");

  let robotsContent = "";
  let hasRobotsTxt = false;
  let hasLlmsTxt = false;
  let hasSitemap = false;
  let robotsFetchError: string | null = null;

  try {
    const robotsRes = await fetch(`https://${cleanDomain}/robots.txt`, {
      method: "GET",
      headers: { "User-Agent": "ThreadlyGeoAuditor/1.0 (+https://www.gothreadly.live)" },
      signal: AbortSignal.timeout(4000),
      redirect: "follow",
    });
    if (robotsRes.ok) {
      hasRobotsTxt = true;
      robotsContent = (await robotsRes.text()).slice(0, 512 * 1024);
      hasSitemap = /^\s*sitemap\s*:/im.test(robotsContent);
    }
  } catch (caught) {
    robotsFetchError = caught instanceof Error && caught.name === "TimeoutError" ? "timed out" : "could not connect";
  }

  try {
    const llmsRes = await fetch(`https://${cleanDomain}/llms.txt`, {
      method: "GET",
      headers: { "User-Agent": "ThreadlyGeoAuditor/1.0 (+https://www.gothreadly.live)" },
      signal: AbortSignal.timeout(3000),
      redirect: "follow",
    });
    if (llmsRes.ok && (await llmsRes.text()).trim().length > 20) {
      hasLlmsTxt = true;
    }
  } catch {
    hasLlmsTxt = false;
  }

  const groups = hasRobotsTxt && robotsContent ? parseRobotsGroups(robotsContent) : [];
  const crawlerStatuses: AiCrawlerStatus[] = AI_BOTS.map((bot) => {
    let allowed = true;
    let status: "allowed" | "blocked" | "not_specified" = "not_specified";

    if (groups.length) {
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
            : hasRobotsTxt
              ? `No specific rule for ${bot.userAgent}; the wildcard policy permits crawling ${cleanDomain}.`
              : `No robots.txt was found, so no rule restricts ${bot.userAgent}.`,
    };
  });

  const criticalIssues: string[] = [];
  const recommendations: string[] = [];

  const blockedBots = crawlerStatuses.filter((b) => !b.allowed);
  if (blockedBots.length > 0) {
    criticalIssues.push(
      `${blockedBots.length} of ${crawlerStatuses.length} AI user agents (${blockedBots.map((b) => b.botName).join(", ")}) are disallowed in robots.txt.`
    );
    recommendations.push("If you want these agents to read your pages, allow them in robots.txt. Crawl access does not guarantee citation.");
  }
  if (robotsFetchError) {
    criticalIssues.push(`robots.txt could not be fetched (${robotsFetchError}). The results below assume no rules apply.`);
  }
  if (!hasLlmsTxt) {
    recommendations.push("Consider publishing /llms.txt (a proposed convention, not an adopted standard) with canonical product and pricing facts.");
  }
  if (hasRobotsTxt && !hasSitemap) {
    recommendations.push("Declare your sitemap in robots.txt with a Sitemap: line so crawlers can find new pages.");
  }

  const checks: AuditCheck[] = [
    { id: "robots_txt", label: "robots.txt is published", passed: hasRobotsTxt, detail: hasRobotsTxt ? `Found at https://${cleanDomain}/robots.txt.` : robotsFetchError ? `Not reachable (${robotsFetchError}).` : "The site answered without a robots.txt." },
    { id: "sitemap_declared", label: "Sitemap declared in robots.txt", passed: hasSitemap, detail: hasSitemap ? "A Sitemap: line is present." : "No Sitemap: line found." },
    { id: "llms_txt", label: "llms.txt is published", passed: hasLlmsTxt, detail: hasLlmsTxt ? `Found at https://${cleanDomain}/llms.txt.` : "Not found, or shorter than 20 characters." },
    { id: "ai_crawlers_permitted", label: "AI user agents permitted", passed: blockedBots.length === 0, detail: `${crawlerStatuses.length - blockedBots.length} of ${crawlerStatuses.length} permitted.` },
  ];

  return {
    domain: cleanDomain,
    checks,
    checksPassed: checks.filter((c) => c.passed).length,
    checksTotal: checks.length,
    crawlerStatuses,
    hasLlmsTxt,
    hasRobotsTxt,
    hasSitemap,
    robotsFetchError,
    criticalIssues,
    recommendations,
    auditedAt: new Date().toISOString(),
  };
}
