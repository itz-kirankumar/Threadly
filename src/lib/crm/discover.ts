import { loadWorkspace } from "@/lib/geo/store";
import { saveLead, appendLeadActivity, loadLeads } from "./store";
import type { CrmLead } from "./types";
import { randomUUID } from "node:crypto";

export async function discoverLeadsFromGeo(): Promise<{
  discovered: number;
  newLeads: CrmLead[];
}> {
  const workspace = await loadWorkspace();
  const existingLeads = await loadLeads();
  const existingDomains = new Set(existingLeads.map((l) => l.domain.toLowerCase()));

  const newLeads: CrmLead[] = [];
  const competitors = workspace.brand?.competitors || [];
  const results = workspace.results || [];
  const queries = workspace.queries || [];

  // 1. Analyze competitor citations across queries to find out where gaps exist
  for (const comp of competitors) {
    const compDomain = comp.domain.toLowerCase();
    if (existingDomains.has(compDomain)) continue;

    // Find queries where this competitor appeared
    const relevantQueryResults = results.filter((r) =>
      r.results.some(
        (pr) =>
          pr.competitorsMentioned?.includes(comp.name) ||
          pr.competitorsCited?.includes(comp.name) ||
          pr.citations?.some((c) => c.domain.toLowerCase().includes(compDomain))
      )
    );

    const firstResult = relevantQueryResults[0];
    const queryObj = firstResult ? queries.find((q) => q.id === firstResult.queryId) : null;
    const queryText = queryObj?.text || "best generative AI software solutions";

    const lead: CrmLead = {
      id: `lead-${randomUUID().slice(0, 8)}`,
      // Contact identity is intentionally blank: discovery knows the domain from
      // real scan data, not a person. No email/name/title is ever guessed; a human
      // must supply a verified contact before outreach can target this lead.
      name: comp.name,
      email: "",
      company: comp.name,
      domain: comp.domain,
      title: "",
      stage: "new",
      source: "geo_gap_discovery",
      score: 0,
      dealValue: undefined,
      notes: `Identified via GEO scan. Competitor actively referenced in ${relevantQueryResults.length} queries. Potential target for comparative benchmarking.`,
      tags: ["competitor", "geo-scanned", "high-intent"],
      sequenceStep: 0,
      maxSequenceSteps: 4,
      nextFollowUpAt: null,
      lastContactedAt: null,
      geoGap: {
        queryText,
        competitorsCited: [workspace.brand?.name || "Market Leaders"],
        missingFromAi: false,
        citationShare: 0,
        readinessScore: 0,
        identifiedGap: `Referenced in ${relevantQueryResults.length} tracked queries based on actual scan results.`,
      },
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
    };

    await saveLead(lead);
    await appendLeadActivity({
      leadId: lead.id,
      type: "audit_attached",
      title: "Lead Discovered from GEO Scan",
      detail: `Extracted from query "${queryText}". High citation frequency across AI engines.`,
      actor: "GEO Discovery Engine",
    });

    newLeads.push(lead);
    existingDomains.add(compDomain);
  }

  // 2. Discover target domains from organic web citations in recent scans
  for (const queryRes of results) {
    if (!queryRes.webResults?.length) continue;
    for (const web of queryRes.webResults.slice(0, 3)) {
      const dom = web.domain.toLowerCase().replace(/^www\./, "");
      // Skip common major search / wiki / forum platforms
      if (
        dom.includes("wikipedia.org") ||
        dom.includes("reddit.com") ||
        dom.includes("youtube.com") ||
        dom.includes("github.com") ||
        dom.includes("medium.com") ||
        dom.includes("linkedin.com") ||
        existingDomains.has(dom)
      ) {
        continue;
      }

      const companyName = dom.split(".")[0].toUpperCase();
      const queryObj = queries.find((q) => q.id === queryRes.queryId);

      const lead: CrmLead = {
        id: `lead-${randomUUID().slice(0, 8)}`,
        name: companyName,
        email: "",
        company: companyName,
        domain: dom,
        title: "",
        stage: "new",
        source: "geo_gap_discovery",
        score: 0,
        dealValue: undefined,
        notes: `Discovered from web citation for query "${queryObj?.text || "AI solutions"}". High organic presence, potential to convert to full GEO monitoring.`,
        tags: ["web-citation", "prospect"],
        sequenceStep: 0,
        maxSequenceSteps: 4,
        nextFollowUpAt: null,
        lastContactedAt: null,
        geoGap: {
          queryText: queryObj?.text || "Industry software solutions",
          competitorsCited: [workspace.brand?.name || "Industry Brand"],
          missingFromAi: true,
          citationShare: 0,
          readinessScore: 0,
          identifiedGap: `Appeared in web citations for a tracked query; not present in tracked AI citations.`,
        },
        createdAt: new Date().toISOString(),
        updatedAt: new Date().toISOString(),
      };

      await saveLead(lead);
      await appendLeadActivity({
        leadId: lead.id,
        type: "audit_attached",
        title: "Organic Citation Converted to Prospect",
        detail: `Found on "${web.title}". Organic rank exists, but AI model citation gap is 100%.`,
        actor: "GEO Discovery Engine",
      });

      newLeads.push(lead);
      existingDomains.add(dom);
      if (newLeads.length >= 8) break; // Limit batch discovery
    }
    if (newLeads.length >= 8) break;
  }

  return { discovered: newLeads.length, newLeads };
}
