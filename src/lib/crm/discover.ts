import { loadWorkspace } from "@/lib/geo/store";
import type { ProviderResult, QueryResult } from "@/lib/geo/types";
import { saveLead, appendLeadActivity, loadLeads } from "./store";
import type { CrmLead } from "./types";
import { randomUUID } from "node:crypto";

const MAX_NEW_LEADS = 8;
// Platforms that are publishers or communities, not prospect companies.
const NON_PROSPECT_DOMAINS = ["wikipedia.org", "reddit.com", "youtube.com", "github.com", "medium.com", "linkedin.com", "x.com", "twitter.com", "quora.com"];

function normalizeDomain(domain: string): string {
  return domain.trim().toLowerCase().replace(/^https?:\/\//, "").replace(/^www\./, "").replace(/\/.*$/, "");
}

function isNonProspect(domain: string): boolean {
  return NON_PROSPECT_DOMAINS.some((d) => domain === d || domain.endsWith(`.${d}`));
}

function scannedAnswers(results: QueryResult[]): Array<{ queryId: string; answer: ProviderResult }> {
  return results.flatMap((r) => r.results.filter((p) => p.status === "scanned").map((answer) => ({ queryId: r.queryId, answer })));
}

function newLead(fields: Pick<CrmLead, "name" | "company" | "domain" | "notes" | "tags" | "geoGap">): CrmLead {
  const now = new Date().toISOString();
  return {
    id: `lead-${randomUUID().slice(0, 8)}`,
    // Contact identity is intentionally blank: discovery knows a domain from
    // scan data, not a person. A verified contact must be added by a person.
    email: "",
    title: "",
    stage: "new",
    source: "geo_gap_discovery",
    score: 0,
    dealValue: undefined,
    sequenceStep: 0,
    maxSequenceSteps: 3,
    nextFollowUpAt: null,
    lastContactedAt: null,
    createdAt: now,
    updatedAt: now,
    ...fields,
  };
}

// Creates leads only from domains observed in stored scan results. Every
// note states the observation and its denominator; nothing is inferred.
export async function discoverLeadsFromGeo(): Promise<{
  discovered: number;
  newLeads: CrmLead[];
}> {
  const workspace = await loadWorkspace();
  const existingLeads = await loadLeads();
  const known = new Set(existingLeads.map((l) => normalizeDomain(l.domain)));
  const ownDomain = workspace.brand?.domain ? normalizeDomain(workspace.brand.domain) : "";
  if (ownDomain) known.add(ownDomain);

  const results = workspace.results || [];
  const queries = workspace.queries || [];
  const answers = scannedAnswers(results);
  const questionText = (queryId: string) => queries.find((q) => q.id === queryId)?.text;
  const newLeads: CrmLead[] = [];

  // 1. Competitors observed in scanned AI answers.
  for (const comp of workspace.brand?.competitors || []) {
    if (newLeads.length >= MAX_NEW_LEADS) break;
    const domain = normalizeDomain(comp.domain || "");
    if (!domain || known.has(domain)) continue;
    const mentioned = answers.filter(({ answer }) =>
      answer.competitorsMentioned?.includes(comp.name) ||
      answer.competitorsCited?.includes(comp.name) ||
      answer.citations?.some((c) => normalizeDomain(c.domain) === domain)
    );
    if (mentioned.length === 0) continue;
    const cited = mentioned.filter(({ answer }) =>
      answer.competitorsCited?.includes(comp.name) || answer.citations?.some((c) => normalizeDomain(c.domain) === domain)
    );
    const questionIds = new Set(mentioned.map((m) => m.queryId));
    const firstQuestion = questionText(mentioned[0].queryId);
    const observation = `Mentioned in ${mentioned.length} of ${answers.length} scanned AI answers across ${questionIds.size} tracked question${questionIds.size === 1 ? "" : "s"}; cited in ${cited.length}.`;

    const lead = newLead({
      name: comp.name,
      company: comp.name,
      domain,
      notes: `Tracked competitor. ${observation}`,
      tags: ["competitor"],
      geoGap: {
        queryText: firstQuestion,
        competitorsCited: [],
        missingFromAi: false,
        citationShare: answers.length ? Math.round((cited.length / answers.length) * 100) : undefined,
        identifiedGap: observation,
      },
    });
    await saveLead(lead);
    await appendLeadActivity({ leadId: lead.id, type: "audit_attached", title: "Added from scan results", detail: observation, actor: "Discovery" });
    newLeads.push(lead);
    known.add(domain);
  }

  // 2. Domains that ranked in organic web results for a tracked question.
  for (const queryRes of results) {
    if (newLeads.length >= MAX_NEW_LEADS) break;
    if (!queryRes.webResults?.length) continue;
    const aiCitedDomains = new Set(
      queryRes.results.filter((p) => p.status === "scanned").flatMap((p) => (p.citations || []).map((c) => normalizeDomain(c.domain)))
    );
    const scannedForQuestion = queryRes.results.filter((p) => p.status === "scanned").length;
    for (const web of queryRes.webResults.slice(0, 3)) {
      if (newLeads.length >= MAX_NEW_LEADS) break;
      const domain = normalizeDomain(web.domain);
      if (!domain || known.has(domain) || isNonProspect(domain)) continue;
      const question = questionText(queryRes.queryId);
      const citedByAi = aiCitedDomains.has(domain);
      const observation = scannedForQuestion
        ? `Ranked in web results for "${question ?? "a tracked question"}"; ${citedByAi ? "also" : "not"} cited in the ${scannedForQuestion} scanned AI answer${scannedForQuestion === 1 ? "" : "s"} for that question.`
        : `Ranked in web results for "${question ?? "a tracked question"}". No AI answers were scanned for that question.`;

      const lead = newLead({
        name: domain,
        company: domain,
        domain,
        notes: observation,
        tags: ["web-result"],
        geoGap: {
          queryText: question,
          competitorsCited: [],
          missingFromAi: scannedForQuestion ? !citedByAi : undefined,
          identifiedGap: observation,
        },
      });
      await saveLead(lead);
      await appendLeadActivity({ leadId: lead.id, type: "audit_attached", title: "Added from scan results", detail: `${observation} Source page: ${web.title || web.url}`, actor: "Discovery" });
      newLeads.push(lead);
      known.add(domain);
    }
  }

  return { discovered: newLeads.length, newLeads };
}
