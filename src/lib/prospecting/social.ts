// Social leads and custom drafts.
//
// Social leads are public posts on Reddit, X and LinkedIn, as indexed by web
// search, where someone asks for a recommendation, an alternative or help in
// the company's category. Only what search returns is used: no login, no
// profile collection. Authors are shown as the public handle in the post URL.
//
// Drafts (first emails and post replies) are written for the specific
// prospect: by the model when it is enabled, otherwise assembled from the
// prospect's own words, the matching topic and the sender's own description.

import { modelEnabled, modelJson } from "./model.ts";
import { firstSentence } from "./text.ts";
import { search, searchAvailable, type SearchHit } from "./web.ts";

export type Platform = "Reddit" | "X" | "LinkedIn";

export interface SocialLead {
  platform: Platform;
  url: string;
  title: string;
  snippet: string;
  author: string | null;
  community: string | null;
  intent: "asking for a recommendation" | "looking for an alternative" | "asking for help" | "discussing the topic";
  intentScore: number;
  query: string;
}

const PLATFORMS: Array<{ platform: Platform; domains: string[] }> = [
  { platform: "Reddit", domains: ["reddit.com"] },
  { platform: "X", domains: ["x.com", "twitter.com"] },
  { platform: "LinkedIn", domains: ["linkedin.com"] },
];

const INTENT: Array<[RegExp, SocialLead["intent"], number]> = [
  [/\b(alternative(s)? to|switch(ing)? (from|away)|replace|instead of|moving off)\b/i, "looking for an alternative", 3],
  [/\b(recommend(ation)?s?|suggest(ion)?s?|looking for|any(one)? (use|using|tried)|which (tool|platform|software)|best (tool|platform|software|way)|what do you use)\b/i, "asking for a recommendation", 3],
  [/\b(how (do|can|to)|help|struggling|problem|issue|advice)\b|\?/i, "asking for help", 1],
];

// Guides, listicles and vendor announcements are content, not a buyer asking.
const CONTENT = /\b(guide|launch(ed|es|ing)?|announc\w*|introducing|webinar|\d+\s+(best|top)|top\s+\d+|best\s+\w+(\s+\w+)?\s+tools\s+\d{4}|complete|ultimate|playbook|case study|report)\b/i;

export function classifyIntent(text: string, title = text): { intent: SocialLead["intent"]; score: number } {
  if (CONTENT.test(title)) return { intent: "discussing the topic", score: 0 };
  let best: { intent: SocialLead["intent"]; score: number } = { intent: "discussing the topic", score: 0 };
  for (const [re, intent, weight] of INTENT) {
    if (re.test(text) && weight > best.score) best = { intent, score: weight };
  }
  return best;
}

// Public author and community, from the post URL only.
export function postAuthor(url: string): { author: string | null; community: string | null } {
  try {
    const u = new URL(url);
    const p = u.pathname.split("/").filter(Boolean);
    if (/reddit\.com$/.test(u.hostname)) {
      const sub = p[0] === "r" && p[1] ? `r/${p[1]}` : null;
      const user = p[0] === "user" || p[0] === "u" ? `u/${p[1]}` : null;
      return { author: user, community: sub };
    }
    if (/(^|\.)(x|twitter)\.com$/.test(u.hostname)) {
      return { author: p[0] && !["i", "search", "hashtag", "home"].includes(p[0]) ? `@${p[0]}` : null, community: null };
    }
    if (/linkedin\.com$/.test(u.hostname)) {
      // /posts/jane-doe_slug-activity-123 -> jane-doe ; company pages -> name
      if (p[0] === "posts" && p[1]) return { author: p[1].split("_")[0], community: null };
      if (p[0] === "company" && p[1]) return { author: null, community: p[1] };
      if (p[0] === "pulse") return { author: null, community: "LinkedIn article" };
    }
  } catch {
    // ignore malformed URLs
  }
  return { author: null, community: null };
}

export function socialQueries(topic: string, competitors: string[]): string[] {
  const qs = [`looking for ${topic} recommendations`, `best ${topic} tool`];
  if (competitors[0]) qs.push(`alternative to ${competitors[0]}`);
  return qs;
}

// Public posts with buying intent around the topic, best first.
export async function findSocialLeads(topic: string, competitors: string[], log: (t: string) => void, limit = 9): Promise<SocialLead[]> {
  if (!searchAvailable() || !topic.trim()) return [];
  const queries = socialQueries(topic, competitors);
  const seen = new Set<string>();
  const leads: SocialLead[] = [];
  for (const { platform, domains } of PLATFORMS) {
    for (const q of queries) {
      log(`searching public ${platform} posts: "${q}"`);
      let hits: SearchHit[] = [];
      try {
        hits = await search(q, 6, { includeDomains: domains });
      } catch {
        log("  search failed; continuing");
        continue;
      }
      let kept = 0;
      for (const h of hits) {
        if (!domains.some((d) => h.domain === d || h.domain.endsWith(`.${d}`))) continue;
        const path = new URL(h.url).pathname;
        // Only individual posts: Reddit threads, X statuses, LinkedIn posts.
        // Profile and company pages are skipped; Threadly does not collect
        // profiles.
        const isPost = platform === "Reddit" ? /\/comments\//.test(path)
          : platform === "X" ? /\/status\/\d+/.test(path)
          : /^\/(posts|feed\/update|pulse)\//.test(path);
        if (!isPost || seen.has(h.url)) continue;
        seen.add(h.url);
        const textForIntent = `${h.title} ${h.content}`;
        const { intent, score } = classifyIntent(textForIntent, h.title);
        const { author, community } = postAuthor(h.url);
        leads.push({
          platform,
          url: h.url,
          title: h.title.replace(/\s*[:|-]\s*(r\/\w+|Reddit|LinkedIn|X)\s*$/i, "").slice(0, 160),
          snippet: h.content.replace(/\s+/g, " ").trim().slice(0, 280),
          author,
          community,
          intent,
          intentScore: score + (author ? 0.5 : 0),
          query: q,
        });
        kept++;
      }
      log(`  ${kept} public posts`);
    }
  }
  const ranked = leads.sort((a, b) => b.intentScore - a.intentScore);
  // Keep the mix across platforms, best first.
  const out: SocialLead[] = [];
  for (const platform of ["Reddit", "X", "LinkedIn"] as Platform[]) out.push(...ranked.filter((l) => l.platform === platform).slice(0, Math.ceil(limit / 3)));
  return out.sort((a, b) => b.intentScore - a.intentScore).slice(0, limit);
}

// ---- Drafts ------------------------------------------------------------------

export interface Sender {
  name: string;
  domain: string;
  summary: string;
  category: string;
  keywords: string[];
}

export interface Draft {
  subject: string;
  body: string;
  engine: "model" | "composed";
  sources: string[];
}

function sentenceCase(s: string): string {
  return s.charAt(0).toLowerCase() + s.slice(1);
}

function whatWeDo(sender: Sender): string {
  const line = firstSentence(sender.summary, 200) ?? sender.category;
  if (!line) return `${sender.name} may be relevant here.`;
  if (line.toLowerCase().includes(sender.name.toLowerCase())) return line;
  return /^(the|a|an)\s/i.test(line) ? `${sender.name} is ${sentenceCase(line)}` : `At ${sender.name}, we build ${sentenceCase(line.replace(/\.$/, ""))}.`;
}

function overlap(text: string, terms: string[]): string | null {
  const hay = text.toLowerCase();
  return terms.find((t) => t.length > 3 && hay.includes(t.toLowerCase())) ?? null;
}

// A first email to one company, written from what its homepage says.
export async function draftCompanyEmail(sender: Sender, company: { name: string; domain: string; description: string | null; matchedTerms?: string[] }): Promise<Draft> {
  const sources = [`https://${company.domain}/`, `https://${sender.domain}/`];
  if (modelEnabled() && company.description) {
    const out = await modelJson<{ subject?: string; body?: string }>(
      `Write a short first cold email (70 to 110 words) from ${sender.name} to a decision maker at ${company.name}. Open with one specific observation about ${company.name} taken from THEIRS. Connect it to one concrete way ${sender.name} helps, taken from OURS. No flattery, no invented facts, numbers or customers, no "I hope this finds you well". End with one low-pressure question. Sign off as "[Your name]". Shape: {"subject": string (under 7 words), "body": string}`,
      { THEIRS: `${company.name} (${company.domain}): ${company.description}`, OURS: `${sender.name}: ${sender.summary} Category: ${sender.category}` },
      400,
    );
    if (out?.subject && out.body) return { subject: out.subject.slice(0, 90), body: out.body.slice(0, 1500), engine: "model", sources };
  }
  const theirs = firstSentence(company.description, 170);
  const shared = overlap(company.description ?? "", [...(company.matchedTerms ?? []), ...sender.keywords, sender.category]);
  const opener = theirs
    ? `I was reading how ${company.name} describes itself: "${theirs.replace(/\.$/, "")}."`
    : `I came across ${company.name} at ${company.domain}.`;
  const bridge = shared
    ? `Since ${shared} sits close to what you do, this may be relevant: ${whatWeDo(sender)}`
    : whatWeDo(sender);
  const ask = `Would a two-line note on how this could apply to ${company.name} be useful?`;
  const subject = shared ? `${company.name} and ${shared}` : `A question for ${company.name}`;
  return { subject: subject.slice(0, 90), body: ["Hi,", "", opener, "", bridge, "", ask, "", "[Your name]"].join("\n"), engine: "composed", sources };
}

// A reply to one public post, answering what the author asked.
export async function draftSocialReply(sender: Sender, lead: SocialLead): Promise<Draft> {
  if (modelEnabled()) {
    const out = await modelJson<{ body?: string }>(
      `Write a helpful public reply (under 70 words) to this ${lead.platform} post. Answer the question first in plain terms; mention ${sender.name} once, honestly, as one option, using only facts from OURS, and say you work there. No hype, no links other than ${sender.domain}. Shape: {"body": string}`,
      { POST: `${lead.title}\n${lead.snippet}`, OURS: `${sender.name} (${sender.domain}): ${sender.summary}` },
      250,
    );
    if (out?.body) return { subject: "", body: out.body.slice(0, 700), engine: "model", sources: [lead.url, `https://${sender.domain}/`] };
  }
  const greeting = lead.author && lead.platform !== "LinkedIn" ? `${lead.author.replace(/^u\//, "u/")} ` : "";
  const ask =
    lead.intent === "looking for an alternative"
      ? "If you are comparing options, it is worth listing what pushed you off the current tool first: that usually narrows the shortlist fast."
      : lead.intent === "asking for a recommendation"
        ? "It depends most on team size and how you will measure success, so it helps to shortlist two or three and trial them on one real use case."
        : "Happy to share what has worked for teams with the same question.";
  const body = [
    `${greeting}${ask}`.trim(),
    "",
    `Disclosure, I work at ${sender.name}. ${whatWeDo(sender)} If it fits, ${sender.domain} has the details.`,
  ].join("\n");
  return { subject: "", body, engine: "composed", sources: [lead.url, `https://${sender.domain}/`] };
}
