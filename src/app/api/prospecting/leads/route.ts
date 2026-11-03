import { randomUUID } from "node:crypto";
import { errorResponse, RequestError } from "@/lib/api-request";
import { inWorkspace, resolveWorkspaceAccess } from "@/lib/geo/team";
import { syncLeadToAccounts } from "@/lib/crm/accounts-store";
import { appendLeadActivity, loadLeads, saveLead } from "@/lib/crm/store";
import type { CrmLead } from "@/lib/crm/types";
import { loadState } from "@/lib/prospecting/store";
import { combineScore, companyFitIntent, priorityOf, rightRole } from "@/lib/leads/score";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

// Saves the selected companies (and any contact found for them) as Leads.
// Idempotent by domain: a company already in Leads is not duplicated.
export async function POST(request: Request) {
  try {
    const access = await resolveWorkspaceAccess(request, "runScans");
    const actor = access.identity.email || access.identity.name || access.identity.uid;
    const result = await inWorkspace(access, async () => {
      const state = await loadState();
      const companies = (state.companies?.items ?? []).filter((c) => c.selected);
      if (!companies.length) throw new RequestError("Find and select companies first.", 400);
      const existing = new Set((await loadLeads()).map((l) => l.domain.toLowerCase()));
      let created = 0;
      let skipped = 0;
      for (const company of companies) {
        if (existing.has(company.domain)) {
          skipped++;
          continue;
        }
        // Every decision maker found for the company; the best-placed one
        // is the lead's contact, the rest become CRM contacts too.
        const contacts = state.contacts?.items.filter((c) => c.companyDomain === company.domain) ?? [];
        const contact = contacts[0] ?? null;
        const campaign = state.campaigns?.items.find((c) => c.id === company.campaignId);
        const sources = company.evidence.map((e) => e.url).filter(Boolean).join(", ");
        const at = new Date().toISOString();
        // The same score the live demo shows: fit and intent from why the
        // company was found, reach from how to get to its decision maker.
        const base = companyFitIntent(company.signal, company.matchedTerms);
        const right = rightRole(contact?.title, campaign?.roles ?? []);
        const reach = contact?.email ? 95 : contact?.linkedinUrl ? 85 : contact ? 60 : 30;
        const score = combineScore(base.fit, base.intent + (right ? 10 : 0), reach);
        const people = contacts.map((c) => `${c.name}${c.title ? `, ${c.title}` : ""}${c.linkedinUrl ? ` (${c.linkedinUrl})` : ""}${c.evidence[0]?.url ? ` - from ${c.evidence[0].url}` : ""}`);
        const lead: CrmLead = {
          id: `lead-${randomUUID().slice(0, 8)}`,
          name: contact?.name ?? "",
          email: contact?.email ?? "",
          company: company.name,
          domain: company.domain,
          title: contact?.title ?? undefined,
          stage: "new",
          source: "prospecting",
          score,
          notes: [
            company.description,
            company.signal ? `Why: ${company.signal}` : null,
            campaign ? `Campaign: ${campaign.name}` : null,
            people.length ? `Decision makers:\n${people.join("\n")}` : null,
            sources ? `Sources: ${sources}` : null,
          ].filter(Boolean).join("\n"),
          tags: [priorityOf(score), ...(company.signal ? [company.signal] : []), ...company.matchedTerms].slice(0, 6),
          sequenceStep: 0,
          maxSequenceSteps: 3,
          nextFollowUpAt: null,
          lastContactedAt: null,
          createdAt: at,
          updatedAt: at,
        };
        await saveLead(lead);
        await syncLeadToAccounts(lead, actor);
        // The other decision makers join the same account as CRM contacts.
        for (const other of contacts.slice(1)) {
          await syncLeadToAccounts({ ...lead, name: other.name, email: other.email ?? "", title: other.title ?? undefined }, actor);
        }
        await appendLeadActivity({ leadId: lead.id, type: "audit_attached", title: "Added from prospecting", detail: campaign ? `Found for campaign "${campaign.name}".` : "Found by prospecting.", actor });
        existing.add(company.domain);
        created++;
      }
      return { created, skipped };
    });
    return Response.json(result, { headers: { "Cache-Control": "no-store" } });
  } catch (error) {
    return errorResponse(error, "POST /api/prospecting/leads");
  }
}
