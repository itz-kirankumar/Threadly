import { errorResponse } from "@/lib/api-request";
import { inWorkspace, resolveWorkspaceAccess } from "@/lib/geo/team";
import { loadBrand } from "@/lib/geo/store";
import { checkRateLimit } from "@/lib/rate-limit";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

// AI crawlers that decide whether AI assistants can read a brand's site.
// search bots gate live answers; training bots only affect future models.
const AI_BOTS: { bot: string; kind: "search" | "training" | "agent" }[] = [
  { bot: "OAI-SearchBot", kind: "search" },
  { bot: "ChatGPT-User", kind: "agent" },
  { bot: "GPTBot", kind: "training" },
  { bot: "ClaudeBot", kind: "search" },
  { bot: "Claude-User", kind: "agent" },
  { bot: "PerplexityBot", kind: "search" },
  { bot: "Perplexity-User", kind: "agent" },
  { bot: "Google-Extended", kind: "training" },
];

interface Botspection {
  bot: string;
  kind: "search" | "training" | "agent";
  blocked: boolean;
}

function parseRobots(text: string): Botspection[] {
  // Minimal robots.txt parser: UA groups -> disallow rules. Good enough for
  // whole-site blocking verdicts; ignores allow-rule fine structure.
  const lines = text.split(/\r?\n/);
  interface Group { agents: string[]; rules: { type: "allow" | "disallow"; path: string }[] }
  const groups: Group[] = [];
  let current: Group | null = null;
  let pendingAgents: string[] = [];
  for (const rawLine of lines) {
    const line = rawLine.replace(/#.*$/, "").trim();
    if (!line) { pendingAgents = []; continue; }
    const match = /^([A-Za-z-]+)\s*:\s*(.*)$/.exec(line);
    if (!match) continue;
    const field = match[1].toLowerCase();
    const value = match[2].trim();
    if (field === "user-agent") {
      const agent = value.toLowerCase();
      if (current && current.rules.length === 0) {
        current.agents.push(agent);
      } else {
        current = { agents: [agent], rules: [] };
        groups.push(current);
      }
      pendingAgents = [];
    } else if ((field === "disallow" || field === "allow") && current) {
      current.rules.push({ type: field as "allow" | "disallow", path: value });
    }
  }
  const blocksAll = (agent: string): boolean => {
    const group = groups.find((g) => g.agents.includes(agent));
    if (!group) return false;
    return group.rules.some((r) => r.type === "disallow" && r.path === "/");
  };
  return AI_BOTS.map(({ bot, kind }) => ({
    bot,
    kind,
    blocked: blocksAll(bot.toLowerCase()) || blocksAll("*"),
  }));
}

export async function POST(request: Request) {
  try {
    const access = await resolveWorkspaceAccess(request, "view");
    const user = access.identity;
    if (user.idToken !== "demo-token") {
      const limit = await checkRateLimit(`crawler-check:${user.uid}`, 6, 3600, user);
      if (limit && !limit.allowed) {
        return Response.json({ error: "Too many requests. Try again shortly." }, { status: 429, headers: { "Retry-After": String(limit.retryAfterSeconds) } });
      }
    }
    return await inWorkspace(access, async () => {
      const brand = await loadBrand();
      if (!brand?.domain) throw new Error("Set up your brand profile first.");
      const domain = brand.domain.replace(/^https?:\/\//, "").replace(/\/.*$/, "");
      const url = `https://${domain}/robots.txt`;
      let text: string;
      try {
        const response = await fetch(url, {
          headers: { "User-Agent": "Threadly-GEO-Check/1.0 (+https://www.gothreadly.live)" },
          signal: AbortSignal.timeout(8000),
          redirect: "follow",
        });
        if (!response.ok) throw new Error(`robots.txt returned ${response.status}`);
        text = (await response.text()).slice(0, 64 * 1024);
      } catch (caught) {
        return Response.json({
          domain,
          reachable: false,
          note: `Could not fetch robots.txt: ${caught instanceof Error ? caught.message : "fetch failed"}`,
          bots: [],
        });
      }
      const bots = parseRobots(text);
      const searchBlocked = bots.filter((b) => b.kind === "search" && b.blocked);
      return Response.json({
        domain,
        reachable: true,
        url,
        bots,
        verdict: searchBlocked.length
          ? `${searchBlocked.map((b) => b.bot).join(", ")} blocked - this limits live AI answers citing your site.`
          : "All major AI crawlers can read your site.",
      });
    });
  } catch (caught) {
    return errorResponse(caught, "crawler-check");
  }
}
