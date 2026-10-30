import { readJsonBody, RequestError } from "@/lib/api-request";
import { parseAuditDomain, runOpenSeoAudit } from "@/lib/geo/openseo-engine";
import type { BrandProfile } from "@/lib/geo/types";
import { reserveDemoRun, visitorKey } from "@/lib/live-demo/quota";
import type { DemoEvent, DemoStep } from "@/lib/live-demo/types";
import { contactProvider } from "@/lib/prospecting/contacts";
import { runCampaigns, runCompanies, runCompetitors, runResearch, StepBlocked } from "@/lib/prospecting/steps";
import { draftCompanyEmail, draftSocialReply, findSocialLeads, socialTopic, type Sender } from "@/lib/prospecting/social";
import type { ProspectingState } from "@/lib/prospecting/types";
import { fetchPreview, fetchSiteIcon, mapLimit, searchAvailable } from "@/lib/prospecting/web";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const maxDuration = 120;


// The landing-page live demo: runs the prospecting pipeline for one website
// and streams each step as it happens (newline-delimited JSON). Nothing is
// stored, no contact provider is called and no email is sent.
export async function POST(request: Request) {
  let domain: string | null = null;
  let audience = "";
  try {
    const body = (await readJsonBody(request, 2 * 1024)) as { domain?: unknown; audience?: unknown };
    domain = typeof body.domain === "string" ? parseAuditDomain(body.domain) : null;
    audience = typeof body.audience === "string" ? body.audience.replace(/[^\p{L}\p{N} &+,./-]/gu, " ").replace(/\s+/g, " ").trim().slice(0, 60) : "";
  } catch (error) {
    const status = error instanceof RequestError ? error.status : 400;
    return Response.json({ error: "Enter a website, like example.com." }, { status });
  }
  if (!domain) return Response.json({ error: "Enter a website, like example.com." }, { status: 400 });
  if (!searchAvailable()) return Response.json({ error: "The live demo is not available right now." }, { status: 503 });

  const quota = await reserveDemoRun(visitorKey(request));
  if (!quota.allowed) {
    const message = quota.reason === "visitor"
      ? "This network has run the live demo many times today. Try again tomorrow, or request early access below."
      : "The live demo is at capacity for today. Try again tomorrow, or request early access below.";
    return Response.json({ error: message, code: `quota_${quota.reason}` }, { status: 429, headers: { "Cache-Control": "no-store" } });
  }

  const target = domain;
  const encoder = new TextEncoder();
  const stream = new ReadableStream<Uint8Array>({
    async start(controller) {
      let closed = false;
      const send = (event: DemoEvent) => {
        if (closed) return;
        try {
          controller.enqueue(encoder.encode(`${JSON.stringify(event)}\n`));
        } catch {
          closed = true;
        }
      };
      const stopped = () => closed || request.signal.aborted;
      let current: DemoStep = "research";
      const begin = (step: DemoStep) => {
        current = step;
        send({ type: "step", step });
      };
      const log = (text: string) => send({ type: "log", step: current, text });

      try {
        begin("research");
        log(`reading https://${target}/`);
        const preview = await fetchPreview(target).catch(() => null);
        const brand: BrandProfile = {
          name: preview?.name ?? target.split(".")[0],
          domain: preview?.domain ?? target,
          aliases: [],
          category: preview?.category ?? "",
          competitors: [],
          createdAt: "",
          updatedAt: "",
        };
        const ctx = { brand, senderName: "", log };
        let state: ProspectingState = { version: 1, updatedAt: "" };
        state = await runResearch(state, ctx);
        const r = state.research!;
        send({ type: "result", step: "research", data: { name: r.name, domain: r.domain, summary: r.summary, keywords: r.keywords, iconDataUrl: preview?.iconDataUrl ?? null, readHomepage: Boolean(r.page) } });
        if (stopped()) return;

        begin("crawler");
        log(`reading https://${target}/robots.txt`);
        log(`checking https://${target}/llms.txt`);
        const audit = await runOpenSeoAudit(target);
        for (const b of audit.crawlerStatuses) log(`${b.userAgent}: ${b.status === "blocked" ? "blocked" : "can crawl"}`);
        send({
          type: "result",
          step: "crawler",
          data: {
            score: Math.round((audit.checksPassed / audit.checksTotal) * 100),
            checksPassed: audit.checksPassed,
            checksTotal: audit.checksTotal,
            checks: audit.checks.map((c) => ({ label: c.label, passed: c.passed, detail: c.detail })),
            bots: audit.crawlerStatuses.map((b) => ({ name: b.userAgent, engine: b.engine, status: b.status })),
            issues: audit.criticalIssues,
          },
        });
        if (stopped()) return;

        begin("competitors");
        state = await runCompetitors(state, ctx);
        log("loading competitor logos");
        const competitorList = await mapLimit(state.competitors!.items.slice(0, 12), 6, async (c) => {
          const item = { domain: c.domain, name: c.name, description: c.description, iconDataUrl: await fetchSiteIcon(c.domain) };
          send({ type: "item", step: "competitors", data: item });
          return item;
        });
        send({ type: "result", step: "competitors", data: competitorList });
        if (stopped()) return;

        begin("campaigns");
        state = await runCampaigns(state, ctx);
        if (audience) {
          log(`using the audience you entered: "${audience}"`);
          const at = new Date().toISOString();
          state.campaigns!.items.unshift({
            id: "cmp_visitor",
            name: audience.charAt(0).toUpperCase() + audience.slice(1),
            description: "The audience you entered.",
            searchQuery: /compan|startup|firm|agenc|business|brand/i.test(audience) ? audience : `${audience} companies`,
            roles: ["Founder", "CEO", "Head of Marketing", "Head of Growth"],
            source: "user",
            evidence: [{ kind: "user", quote: "Entered in the live demo", at }],
            selected: true,
          });
        }
        // One campaign in the demo bounds the searches a visitor can trigger.
        const campaigns = state.campaigns!.items.map((c, i) => ({ ...c, selected: i === 0 }));
        state = { ...state, campaigns: { ...state.campaigns!, items: campaigns } };
        send({ type: "result", step: "campaigns", data: campaigns.slice(0, 3).map((c) => ({ name: c.name, description: c.description, searchQuery: c.searchQuery, roles: c.roles, selected: c.selected })) });
        if (stopped()) return;

        begin("companies");
        state = await runCompanies(state, ctx);
        const companies = state.companies!.items.slice(0, 8);
        const companyList = await mapLimit(companies, 6, async (c) => {
          const item = { domain: c.domain, name: c.name, description: c.description, matchedTerms: c.matchedTerms, iconDataUrl: await fetchSiteIcon(c.domain) };
          send({ type: "item", step: "companies", data: item });
          return item;
        });
        send({ type: "result", step: "companies", data: companyList });
        if (stopped()) return;

        const sender: Sender = { name: r.name, domain: r.domain, summary: r.summary, category: brand.category, keywords: r.keywords };

        begin("social");
        const topic = socialTopic(brand.category, r.keywords, brand.name);
        const competitorNames = state.competitors!.items.slice(0, 2).map((c) => c.name);
        const leads = await findSocialLeads(topic, competitorNames, log, 9, (lead) =>
          send({ type: "item", step: "social", data: { platform: lead.platform, url: lead.url, title: lead.title, snippet: lead.snippet, author: lead.author, community: lead.community, intent: lead.intent, reply: null } }),
        );
        log(`ranked ${leads.length} posts by buying intent; drafting replies to the top ${Math.min(3, leads.length)}`);
        const withReplies = await Promise.all(leads.map(async (lead, i) => ({
          platform: lead.platform,
          url: lead.url,
          title: lead.title,
          snippet: lead.snippet,
          author: lead.author,
          community: lead.community,
          intent: lead.intent,
          reply: i < 3 ? (await draftSocialReply(sender, lead)).body : null,
        })));
        send({ type: "result", step: "social", data: { topic, leads: withReplies } });
        if (stopped()) return;

        begin("contacts");
        const roles = campaigns.find((c) => c.selected)?.roles ?? [];
        const provider = contactProvider();
        log(provider
          ? `decision makers come from ${provider.label}, a licensed provider; the public demo does not look them up`
          : "decision makers come only from a licensed contact provider; none is looked up in the public demo");
        send({ type: "result", step: "contacts", data: { roles, companies: companies.slice(0, 4).map((c) => c.name) } });
        if (stopped()) return;

        begin("pitch");
        const drafts = [];
        for (const company of companies.slice(0, 3)) {
          log(`writing a first email to ${company.name} from what its homepage says`);
          const d = await draftCompanyEmail(sender, company);
          drafts.push({ company: company.name, domain: company.domain, subject: d.subject, body: d.body, sources: d.sources, engine: d.engine });
        }
        send({ type: "result", step: "pitch", data: drafts });
        send({ type: "end" });
      } catch (error) {
        const message = error instanceof StepBlocked
          ? error.message
          : "This step could not finish. Try another website, or create a workspace to run it with your own settings.";
        if (!(error instanceof StepBlocked)) console.error("live demo step failed", current, error);
        send({ type: "error", step: current, message });
      } finally {
        closed = true;
        try {
          controller.close();
        } catch {
          // already closed by the client
        }
      }
    },
  });
  return new Response(stream, { headers: { "Content-Type": "application/x-ndjson; charset=utf-8", "Cache-Control": "no-store", "X-Accel-Buffering": "no" } });
}
