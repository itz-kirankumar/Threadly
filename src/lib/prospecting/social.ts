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
import { firstSentence, searchTopics, termsIn } from "./text.ts";
import { mapLimit, search, searchAvailable, type SearchHit } from "./web.ts";

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
  // The competitors and category words the post mentions: why it is here.
  matched: string[];
  relevance: number;
  query: string;
  postedAt: string | null;
  // For posts without a date (Reddit), the search window that found it:
  // the search engine filters by post date, so "month" means posted in the
  // last 30 days.
  window: "month" | "year" | null;
}

const PLATFORMS: Array<{ platform: Platform; domains: string[] }> = [
  { platform: "Reddit", domains: ["reddit.com"] },
  { platform: "X", domains: ["x.com", "twitter.com"] },
  { platform: "LinkedIn", domains: ["linkedin.com"] },
];

const INTENT: Array<[RegExp, SocialLead["intent"], number]> = [
  [/\b(alternatives?\s+(to|for)\b|alternatives?\s*\?|switch(ing|ed)?\s+(from|away|off)\b|replac(e|ing|ement)\s+(for\s+)?\w|instead of|moving (off|away from)|moved (off|away) from|migrat(e|ing)\s+(from|off)|better (fit|option|alternative) than|fed up with|frustrated with|cancel(l)?ing|any(one)? (moved|switched|migrated))/i, "looking for an alternative", 3],
  [/\b(recommend(ation|ations|ed)?s?|suggest(ion|ions)?s?|looking for|in search of|searching for|need(ing)? (a|an|some)\b|any(one)? (use|using|tried|recommend|know)|which (tool|platform|software|app|crm|service|one)|what('s| is| are)? (the )?(best|right|good)\b|what do (you|y'all|people|you guys) use|is there (a|an|any)\b|\bvs\.?\s|versus|worth it|thoughts on|opinions on|experience with)/i, "asking for a recommendation", 3],
  [/\b(how (do|can|should|would) (i|we|you)|help( me| with)?|struggling|stuck|problem|issue|advice)\b|\?\s*$/i, "asking for help", 1.5],
];

// Guides, listicles, launches, self-promotion, hiring and careers are
// content, not a buyer asking.
const CONTENT = /\b(guide|launch(ed|es|ing)?|announc\w*|introducing|webinar|podcast|episode|newsletter|press release|hiring|job opening|career|internship|graduat\w*|resume|salary|\d+\s+(best|top)|top\s+\d+|best\s+\w+(\s+\w+)?\s+tools\s+\d{4}|complete|ultimate|playbook|case study|report|cheat ?sheet|template|review 20\d\d|feature (request|suggestion)|(i'?m|we'?re|i am|we are) building|looking for (startups|beta|testers|early users|feedback)|my (own )?(tool|app|product|startup|saas|extension|plugin)|just (dropped|launched|released|shipped)|(i|we)('ve)? (made|built|created|launched|released|shipped|open[- ]sourced|built out))\b|^(how to|here'?s|why\b|what is\b|meet\s|built\s|building\s|\d+\s+(ways|tips|reasons|lessons|things|steps|tools|mistakes|platforms))/i;
// On LinkedIn and X a title like "Affine: Open Source Alternative to Notion"
// is a product announcing itself.
const ANNOUNCEMENT = /^[\p{Lu}][\p{L}\p{N} .&-]{1,30}:\s+\S/u;

export function classifyIntent(text: string, title = text, platform: Platform = "Reddit"): { intent: SocialLead["intent"]; score: number } {
  const head = title.trim();
  if (CONTENT.test(head)) return { intent: "discussing the topic", score: 0 };
  // "Twenty: The open alternative to Salesforce" announces a product
  // wherever it is posted.
  if (ANNOUNCEMENT.test(head) && /\balternative\b/i.test(head) && !/\?/.test(head)) return { intent: "discussing the topic", score: 0 };
  // LinkedIn and X are mostly publishing; a post there counts as an ask
  // only when it is phrased as one.
  if (platform !== "Reddit" && (ANNOUNCEMENT.test(head) || !/\?|\b(looking for|recommend|suggestions?|any(one)? (use|using|tried|know|moved|switched)|need (a|an|some)|which (tool|one|platform)|what do you use)\b/i.test(head))) {
    return { intent: "discussing the topic", score: 0 };
  }
  let best: { intent: SocialLead["intent"]; score: number } = { intent: "discussing the topic", score: 0 };
  for (const [re, intent, weight] of INTENT) {
    if (re.test(text) && weight > best.score) best = { intent, score: weight };
  }
  return best;
}

// Brand names that are also ordinary words only count next to a category
// word ("Clay" in a pottery thread is not the company).
const COMMON_WORD_NAMES = new Set(["notion", "slack", "clay", "dust", "coda", "square", "monday", "pipeline", "glean", "cursor", "apollo", "mercury", "linear", "loom", "front", "close", "bolt", "wave", "craft", "bear", "things", "basecamp", "asana", "copper", "folk", "capsule", "nimble", "streak", "instantly", "reply", "outreach", "gong", "profound", "hunter", "kaspr", "affine", "obsidian"]);

function nameRegex(name: string): RegExp {
  const core = name.replace(/\.(com|io|ai|co|app|so)$/i, "").trim();
  return new RegExp(`(^|[^a-z0-9])${core.toLowerCase().replace(/[.*+?^${}()|[\]\\]/g, "\\$&").replace(/\s+/g, "[\\s-]?")}(\\.(com|io|ai|co|app|so))?([^a-z0-9]|$)`, "i");
}

// Why a post is about this market: the competitors and category words it
// mentions, scored. A competitor named counts most, then the company's own
// category words, then the synonyms buyers use.
export function leadRelevance(text: string, input: Pick<LeadSearch, "competitors" | "primary" | "related" | "brand">): { score: number; matched: string[]; strong: boolean } {
  const lower = ` ${text.toLowerCase().replace(/\s+/g, " ")} `;
  const own = termsIn(text, input.primary);
  const near = termsIn(text, input.related);
  const category = own.length + near.length > 0;
  const rivals = input.competitors.filter((c) => {
    if (!nameRegex(c).test(lower)) return false;
    return !COMMON_WORD_NAMES.has(c.toLowerCase().replace(/\.(com|io|ai|co|app|so)$/, "")) || category;
  });
  const brandNamed = input.brand ? nameRegex(input.brand).test(lower) && (!COMMON_WORD_NAMES.has(input.brand.toLowerCase()) || category) : false;
  // Single broad words ("marketing", "finance") only add to a match; a
  // competitor, the company's own category words or a multi-word synonym
  // ("cold email") make one.
  const nearPhrases = near.filter((t) => t.includes(" "));
  const strong = rivals.length > 0 || own.length > 0 || nearPhrases.length > 0 || brandNamed;
  const score = strong ? Math.min(4, rivals.length * 2) + Math.min(3, own.length * 1.5) + Math.min(2, nearPhrases.length * 1.5 + (near.length - nearPhrases.length) * 0.5) + (brandNamed ? 1 : 0) : 0;
  return { score, matched: [...rivals, ...own, ...near].slice(0, 4), strong };
}

// Whether a post belongs in the results, and how strongly: its title must
// carry the match, or its text must name a competitor.
export function postRelevance(title: string, snippet: string, input: Pick<LeadSearch, "competitors" | "primary" | "related" | "brand">): { score: number; matched: string[] } | null {
  const t = leadRelevance(title, input);
  const all = leadRelevance(`${title} ${snippet}`, input);
  const rivalInText = all.matched.some((m) => input.competitors.includes(m));
  // A competitor named only in the body counts when the title is about
  // choosing a product ("Which tool should I pick?"), not any question.
  const aboutChoosing = /\b(tool|tools|software|app|apps|platform|platforms|crm|service|provider|vendor|solution|options?|alternatives?|recommend\w*|suggest\w*|stack|setup|switch\w*)\b/i.test(title);
  if ((t.strong && t.score >= 1.5) || (rivalInText && aboutChoosing && all.score >= 2)) return { score: Math.max(t.score, all.score), matched: all.matched };
  return null;
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

// The phrase searched on Reddit, X and LinkedIn: a short category when the
// site states one, else its first multi-word keyword without numbers. Page
// copy that reads as a sentence ("what our customers got") is skipped.
export function socialTopic(category: string, keywords: string[], name: string): string {
  const sentence = /\b(our|we|you|your|i|my|got|get)\b/i;
  if (category && category.split(/\s+/).length <= 4 && !sentence.test(category)) return category;
  return keywords.find((k) => k.includes(" ") && !/\d/.test(k) && !sentence.test(k)) ?? keywords[0] ?? name;
}

const MAX_POST_AGE_DAYS = 365;

// When a post was made. X and LinkedIn ids embed their creation time (the top
// bits are milliseconds), which is exact; otherwise the search's published
// date. Null when neither says.
export function postDate(url: string, published: string | null = null): string | null {
  const x = url.match(/\/status\/(\d{15,})/);
  if (x) return new Date(Number(BigInt(x[1]) >> 22n) + 1288834974657).toISOString();
  const li = url.match(/activity[-:](\d{15,})/);
  if (li) return new Date(Number(BigInt(li[1]) >> 22n)).toISOString();
  const parsed = published ? Date.parse(published) : NaN;
  return Number.isNaN(parsed) ? null : new Date(parsed).toISOString();
}

export function isRecentPost(postedAt: string | null, now = Date.now()): boolean {
  return !postedAt || now - Date.parse(postedAt) <= MAX_POST_AGE_DAYS * 86_400_000;
}

// The phrase people use when they ask for this kind of product: the
// category with "platform" or "software" said as "tool" ("prospecting
// platform" -> "prospecting tool"), or the buyers' own synonym when the
// category word is too broad ("financial services" -> "payment processing").
export function leadTopic(phrases: string[], related: string[], fallback: string, areas: string[] = []): string {
  const BROAD = new Set(["financial", "business", "digital", "online", "cloud", "data", "intelligence", "enterprise", "modern", "software", "services", "integrated"]);
  for (const p of searchTopics(phrases)) {
    const words = p.split(/\s+/);
    const head = words[words.length - 1].toLowerCase();
    const body = words.slice(0, -1);
    if (/^(platform|software|solution|suite|system|service|app|tool)s?$/.test(head)) {
      if (!body.length || body.every((w) => BROAD.has(w.toLowerCase()) || /^(services?)$/i.test(w))) continue;
      return `${body.join(" ")} tool`;
    }
    // "financial infrastructure" says nothing a buyer would type.
    if (body.every((w) => BROAD.has(w.toLowerCase())) && /^(infrastructure|cloud|api|apis|layer|stack|engine)$/.test(head)) continue;
    return p;
  }
  // A suite: the product kinds it lists ("CRM"), said as people ask.
  const kind = areas.find((a) => /^(crm|erp|hris|ats|help ?desk|accounting|payroll|invoicing|project management|email marketing)$/.test(a));
  if (kind) return /^[a-z]{2,4}$/.test(kind) ? kind.toUpperCase() : kind;
  return related.find((r) => r.includes(" ")) ?? fallback;
}

// Every topic worth asking about: a company that is two things ("prospecting
// and AI visibility platform") is searched as both.
export function leadTopics(phrases: string[], related: string[], fallback: string, areas: string[] = []): string[] {
  const first = leadTopic(phrases, related, fallback, areas);
  const rest = searchTopics(phrases).slice(1).map((p) => leadTopic([p], [], "", [])).filter((t) => t && t !== first);
  return [first, ...rest].slice(0, 2);
}

export function socialQueries(topic: string, competitors: string[], related: string[] = [], also: string[] = []): string[] {
  const qs: string[] = [];
  if (competitors[0]) qs.push(`alternative to ${competitors[0]}`);
  qs.push(`looking for ${topic} recommendations`, `best ${topic}`);
  for (const t of also) qs.push(`looking for ${t} recommendations`);
  if (competitors[1]) qs.push(`${competitors[1]} alternative`);
  if (competitors[2]) qs.push(`switching from ${competitors[2]}`);
  const syn = related.find((r) => r.includes(" ") && !topic.toLowerCase().includes(r));
  if (syn) qs.push(`${syn} recommendation`);
  return [...new Set(qs)].slice(0, 7);
}

export interface LeadSearch {
  topic: string;
  // Further topics searched alongside the first.
  also?: string[];
  competitors: string[];
  // The company's own category words and the synonyms buyers use; a post
  // must mention one of them, or a competitor, to count.
  primary: string[];
  related: string[];
  brand: string;
}

const TITLE_NOISE = /\s*(?:\|\s*[^|]*posted on the topic.*|[:|-]\s*(?:r\/\w+|Reddit|LinkedIn|X)\s*)$/i;

// The text to show as a post's title. X titles from search are often just
// the author's name ("Giri Kunche", "Post"); the post text is in the snippet.
export function postTitle(platform: Platform, rawTitle: string, snippet: string): string {
  let title = rawTitle.replace(TITLE_NOISE, "").replace(TITLE_NOISE, "").trim();
  if (platform === "X") {
    const quoted = title.match(/on X:\s*["“](.+?)["”]?\s*(?:\/\s*X)?$/);
    if (quoted) title = quoted[1];
    // No quoted text: the title is only a name ("Giri Kunche", "Post").
    else if (!/[:"“]/.test(title) && title.split(/\s+/).length <= 4) title = snippet.replace(/^.{0,60}? on X:\s*/, "").slice(0, 160) || title;
  }
  return title.replace(/\s*\/\s*X$/, "").slice(0, 160);
}

// Public posts with buying intent in the company's market, best first: each
// one names a competitor or the category, and asks, recently.
export async function findSocialLeads(
  input: LeadSearch,
  log: (t: string) => void,
  limit = 60,
  onLead?: (lead: SocialLead) => void,
): Promise<SocialLead[]> {
  if (!searchAvailable() || !input.topic.trim()) return [];
  const queries = socialQueries(input.topic, input.competitors, input.related, input.also ?? []);
  // Every query in the last month first; the strongest also over the year.
  const tasks = PLATFORMS.flatMap(({ platform, domains }) => [
    ...queries.map((q) => ({ platform, domains, q, window: "month" as const })),
    ...queries.slice(0, 2).map((q) => ({ platform, domains, q, window: "year" as const })),
  ]);
  const seen = new Set<string>();
  const leads: SocialLead[] = [];
  let offTopic = 0;
  await mapLimit(tasks, 6, async ({ platform, domains, q, window }) => {
    log(`searching public ${platform} posts from the last ${window}: "${q}"`);
    let hits: SearchHit[] = [];
    try {
      hits = await search(q, 20, { includeDomains: domains, timeRange: window });
    } catch {
      log(`  ${platform} "${q}": search failed; continuing`);
      return;
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
      const postedAt = postDate(h.url, h.published);
      if (!isRecentPost(postedAt)) continue;
      const snippet = h.content.replace(/\s+/g, " ").trim().slice(0, 280);
      const title = postTitle(platform, h.title, snippet);
      const rel = postRelevance(title, snippet, input);
      if (!rel) {
        offTopic++;
        continue;
      }
      // The post's own headline: snippets carry page text that is not the ask.
      const { intent, score } = classifyIntent(title, title, platform);
      const { author, community } = postAuthor(h.url);
      const onTitle = leadRelevance(title, input);
      // Conversation that is not an ask stays only when its own title is
      // about the market.
      if (score === 0 && !(onTitle.strong && onTitle.score >= 2)) {
        offTopic++;
        continue;
      }
      const lead: SocialLead = { platform, url: h.url, title, snippet, author, community, intent, intentScore: score, matched: rel.matched, relevance: rel.score, query: q, postedAt, window: postedAt ? null : window };
      leads.push(lead);
      onLead?.(lead);
      kept++;
    }
    log(`  ${platform} "${q}" (${window}): ${kept} relevant posts`);
  });
  if (offTopic) log(`skipped ${offTopic} posts that name neither a competitor nor your category`);
  const fresh = (l: SocialLead) => {
    if (!l.postedAt) return l.window === "month" ? 1.5 : 0.5;
    const days = (Date.now() - Date.parse(l.postedAt)) / 86_400_000;
    return days <= 30 ? 1.5 : days <= 90 ? 1 : 0.5;
  };
  const rank = (l: SocialLead) => l.intentScore * 2 + l.relevance + fresh(l);
  const asking = leads.filter((l) => l.intentScore > 0).sort((a, b) => rank(b) - rank(a));
  // The wider conversation is kept only when it is squarely on topic.
  const talk = leads.filter((l) => l.intentScore === 0 && l.relevance >= 3).sort((a, b) => rank(b) - rank(a)).slice(0, 12);
  return [...asking, ...talk].slice(0, limit);
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

const IMPERATIVE = /^(enter|get|find|build|turn|let|automate|grow|start|create|make|send|reach|book|close|scale|track|launch|write|run|connect|discover|generate|stop|boost|win|meet|ship|sell|hire|manage|plan|see|know|use|try)\b/i;

function whatWeDo(sender: Sender): string {
  const line = firstSentence(sender.summary, 200) ?? sender.category;
  if (!line) return `${sender.name} may be relevant here.`;
  if (line.toLowerCase().includes(sender.name.toLowerCase())) return line;
  // Homepage taglines are often instructions ("Enter your domain and...").
  if (IMPERATIVE.test(line)) return `With ${sender.name}, you can ${sentenceCase(line.replace(/\.$/, ""))}.`;
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
      `Write a short first cold email (70 to 110 words) from ${sender.name} to a decision maker at ${company.name}. Open with one specific observation about ${company.name} taken from THEIRS. Connect it to one concrete way ${sender.name} helps, taken from OURS. No flattery, no invented facts, numbers or customers, no "I hope this finds you well". End with one low-pressure question. Sign off as "The ${sender.name} team". Shape: {"subject": string (under 7 words), "body": string}`,
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
  return { subject: subject.slice(0, 90), body: ["Hi,", "", opener, "", bridge, "", ask, "", `The ${sender.name} team`].join("\n"), engine: "composed", sources };
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
