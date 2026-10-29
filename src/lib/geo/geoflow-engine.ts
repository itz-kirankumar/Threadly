import { classifyIntent } from "./engine";
import type { BrandProfile, QueryIntent, QueryResult, TrackedQuery } from "./types";

// Optimization helpers. Every output is either taken from the workspace's own
// records (brand profile, tracked questions, stored scan results) or is
// explicitly marked as needing the customer's input. Nothing here predicts
// model behaviour or scores content.

export type FactCategory = "core_entity" | "aliases" | "differentiator" | "pricing_model" | "integrations" | "compliance";

export interface GeoFlowFact {
  id: string;
  category: FactCategory;
  label: string;
  // Present only when derived from the brand profile.
  assertion: string | null;
  source: "brand_profile" | "needs_input";
  guidance: string;
}

export function generateBrandKnowledgeFacts(brand: BrandProfile): GeoFlowFact[] {
  const facts: GeoFlowFact[] = [];
  const domain = brand.domain.replace(/^https?:\/\//, "").replace(/\/.*$/, "");
  facts.push({
    id: "core_entity",
    category: "core_entity",
    label: "Who you are",
    assertion: brand.category ? `${brand.name} (${domain}) operates in ${brand.category}.` : `${brand.name} is at ${domain}.`,
    source: "brand_profile",
    guidance: "Taken from your brand profile. Publish the same sentence on your home or about page so the statement has a source.",
  });
  if (brand.aliases?.length) {
    facts.push({
      id: "aliases",
      category: "aliases",
      label: "Other names",
      assertion: `${brand.name} is also known as ${brand.aliases.join(", ")}.`,
      source: "brand_profile",
      guidance: "Taken from your brand profile aliases.",
    });
  }
  const needsInput: Array<[FactCategory, string, string]> = [
    ["differentiator", "Difference from competitors", "State one verifiable difference from the competitors you track, and link the page that supports it."],
    ["pricing_model", "Pricing", "State how pricing works and link your public pricing page."],
    ["integrations", "Integrations", "List the integrations you support and link their documentation."],
    ["compliance", "Security and compliance", "List only certifications and controls you can evidence, and link the page that documents them."],
  ];
  for (const [category, label, guidance] of needsInput) {
    facts.push({ id: category, category, label, assertion: null, source: "needs_input", guidance });
  }
  return facts;
}

export interface IntentEvidence {
  intent: QueryIntent;
  trackedQuestions: number;
  scannedAnswers: number;
  answersMentioningBrand: number;
  answersCitingBrand: number;
}

export interface PromptDiagnosticResult {
  originalPrompt: string;
  intent: QueryIntent;
  intentBasis: string;
  trackedMatch: { id: string; text: string } | null;
  evidence: IntentEvidence;
  suggestedQuestions: string[];
}

function answersFor(results: QueryResult[], queryIds: Set<string>) {
  return results
    .filter((r) => queryIds.has(r.queryId))
    .flatMap((r) => r.results.filter((p) => p.status === "scanned"));
}

export function diagnosePrompt(
  promptText: string,
  brand: BrandProfile | null,
  queries: TrackedQuery[],
  results: QueryResult[]
): PromptDiagnosticResult {
  const text = promptText.trim();
  const intent = classifyIntent(text);
  const normalized = text.toLowerCase().replace(/\s+/g, " ").replace(/[?.!]+$/, "");
  const match = queries.find((q) => q.text.toLowerCase().replace(/\s+/g, " ").replace(/[?.!]+$/, "") === normalized) ?? null;

  const sameIntent = new Set(queries.filter((q) => q.intent === intent).map((q) => q.id));
  const answers = answersFor(results, sameIntent);

  const name = brand?.name;
  const category = brand?.category;
  const competitor = brand?.competitors?.[0]?.name;
  const suggestions: string[] = [];
  if (category) {
    suggestions.push(`What are the leading ${category} options?`);
    suggestions.push(`Which ${category} tools do teams recommend, and why?`);
  }
  if (name && competitor) suggestions.push(`${name} vs ${competitor}: how do they compare?`);
  if (name && category) suggestions.push(`Is ${name} a good choice for ${category}?`);
  const tracked = new Set(queries.map((q) => q.text.toLowerCase()));

  return {
    originalPrompt: text,
    intent,
    intentBasis: "Keyword rules, the same ones used to label tracked questions: buying words mark commercial, comparison words mark comparative, anything else is informational.",
    trackedMatch: match ? { id: match.id, text: match.text } : null,
    evidence: {
      intent,
      trackedQuestions: sameIntent.size,
      scannedAnswers: answers.length,
      answersMentioningBrand: answers.filter((a) => a.brandMentioned).length,
      answersCitingBrand: answers.filter((a) => a.brandCited).length,
    },
    suggestedQuestions: suggestions.filter((s) => !tracked.has(s.toLowerCase())),
  };
}

export interface CitationSource {
  domain: string;
  relation: "yours" | "competitor" | "third_party";
  citations: number;
  answersCiting: number;
  sampleUrl: string;
}

export interface CitationSourceSummary {
  scannedAnswers: number;
  sources: CitationSource[];
}

function bareDomain(d: string): string {
  return d.trim().toLowerCase().replace(/^https?:\/\//, "").replace(/^www\./, "").replace(/\/.*$/, "");
}

// The domains AI answers actually cited in the latest stored scan, with
// counts and the number of scanned answers as the denominator.
export function summarizeCitationSources(brand: BrandProfile | null, results: QueryResult[], limit = 15): CitationSourceSummary {
  const own = brand?.domain ? bareDomain(brand.domain) : "";
  const competitorDomains = new Set((brand?.competitors ?? []).map((c) => bareDomain(c.domain || "")).filter(Boolean));
  const answers = results.flatMap((r) => r.results.filter((p) => p.status === "scanned"));
  const byDomain = new Map<string, CitationSource>();
  for (const answer of answers) {
    const seenInAnswer = new Set<string>();
    for (const c of answer.citations ?? []) {
      const domain = bareDomain(c.domain || "");
      if (!domain) continue;
      const relation: CitationSource["relation"] =
        own && (domain === own || domain.endsWith(`.${own}`)) ? "yours" : competitorDomains.has(domain) ? "competitor" : "third_party";
      const entry = byDomain.get(domain) ?? { domain, relation, citations: 0, answersCiting: 0, sampleUrl: c.url };
      entry.citations++;
      if (!seenInAnswer.has(domain)) {
        entry.answersCiting++;
        seenInAnswer.add(domain);
      }
      byDomain.set(domain, entry);
    }
  }
  const sources = [...byDomain.values()]
    .sort((a, b) => b.answersCiting - a.answersCiting || b.citations - a.citations || a.domain.localeCompare(b.domain))
    .slice(0, limit);
  return { scannedAnswers: answers.length, sources };
}
