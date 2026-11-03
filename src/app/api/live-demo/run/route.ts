import { readJsonBody, RequestError } from "@/lib/api-request";
import { parseAuditDomain, runOpenSeoAudit } from "@/lib/geo/openseo-engine";
import type { BrandProfile } from "@/lib/geo/types";
import { reserveDemoRun } from "@/lib/live-demo/quota";
import type { DemoEvent, DemoStep } from "@/lib/live-demo/types";
import { contactProvider } from "@/lib/prospecting/contacts";
import { findDecisionMakers, withProfiles } from "@/lib/prospecting/people";
import { researchTerms, runCampaigns, runCompanies, runCompetitors, runResearch, StepBlocked } from "@/lib/prospecting/steps";
import { draftCompanyEmail, draftMessageSequence, draftPersonSequence, draftSocialReply, findSocialLeads, leadTopics, socialTopic, type Sender } from "@/lib/prospecting/social";
import type { ProspectingState } from "@/lib/prospecting/types";
import { fetchHomepageRaw, fetchPreview, fetchSiteIcon, mapLimit, search, searchAvailable } from "@/lib/prospecting/web";
import { auditSite, organizationFacts } from "@/lib/geo/site-audit";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const maxDuration = 300;

// When each step stops starting new searches and page reads, counted from
// the start of the run, so the whole run streams inside maxDuration.
const STEP_BUDGET_MS = { competitors: 60_000, companies: 135_000, social: 185_000, contacts: 215_000 };

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

  // No per-visitor or per-address limit. An owner-set site-wide daily
  // budget (PUBLIC_DEMO_DAILY_RUNS) is the only cap, and it is off unless set.
  const quota = await reserveDemoRun();
  if (!quota.allowed) {
    return Response.json({ error: "The live demo is busy right now. Try again in a little while.", code: "busy" }, { status: 503, headers: { "Cache-Control": "no-store" } });
  }

  const target = domain;
  const started = Date.now();
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
        const ctx: { brand: BrandProfile; senderName: string; log: (t: string) => void; deadline?: number } = { brand, senderName: "", log };
        let state: ProspectingState = { version: 1, updatedAt: "" };
        state = await runResearch(state, ctx);
        const r = state.research!;
        const phrases = r.categoryPhrases ?? [];
        send({ type: "result", step: "research", data: { name: r.name, domain: r.domain, summary: r.summary, category: r.category ?? null, keywords: [...new Set([...phrases.filter((p) => !/\s(and|&)\s/i.test(p)), ...r.keywords])].slice(0, 8), iconDataUrl: preview?.iconDataUrl ?? null, readHomepage: Boolean(r.page) } });
        if (stopped()) return;

        begin("crawler");
        log(`reading https://${target}/robots.txt`);
        log(`checking https://${target}/llms.txt`);
        const [audit, home] = await Promise.all([
          runOpenSeoAudit(target),
          fetchHomepageRaw(target).catch(() => ({ html: "", finalUrl: `https://${target}/`, status: 0, ms: 0 })),
        ]);
        for (const b of audit.crawlerStatuses) log(`${b.userAgent}: ${b.status === "blocked" ? "blocked" : "can crawl"}`);
        log(`reading homepage markup: title, description, schema.org, Open Graph (${home.ms} ms)`);
        const site = auditSite({
          hasRobotsTxt: audit.hasRobotsTxt,
          hasSitemap: audit.hasSitemap,
          hasLlmsTxt: audit.hasLlmsTxt,
          crawlersBlocked: audit.crawlerStatuses.filter((b) => !b.allowed).length,
          crawlersTotal: audit.crawlerStatuses.length,
          ...home,
        });
        log(`scored ${site.passed} of ${site.total} checks: ${site.score}/100`);
        send({
          type: "result",
          step: "crawler",
          data: {
            score: site.score,
            grade: site.grade,
            passed: site.passed,
            total: site.total,
            categories: site.categories.map((c) => ({ name: c.name, score: c.score, max: c.max, checks: c.checks.map((k) => ({ label: k.label, passed: k.passed, detail: k.detail, weight: k.weight })) })),
            bots: audit.crawlerStatuses.map((b) => ({ name: b.userAgent, engine: b.engine, status: b.status })),
            issues: audit.criticalIssues,
            facts: organizationFacts(home.html),
          },
        });
        if (stopped()) return;

        begin("competitors");
        ctx.deadline = started + STEP_BUDGET_MS.competitors;
        state = await runCompetitors(state, ctx);
        log("loading competitor logos");
        const competitorList = await mapLimit(state.competitors!.items, 6, async (c) => {
          const item = { domain: c.domain, name: c.name, description: c.description, sources: c.sources ?? c.appearances, iconDataUrl: await fetchSiteIcon(c.domain) };
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
            roles: state.campaigns!.items[0]?.roles ?? ["Founder", "CEO", "Head of Marketing", "Head of Growth"],
            source: "user",
            evidence: [{ kind: "user", quote: "Entered in the live demo", at }],
            selected: true,
          });
        }
        // The demo runs two campaigns: the first audience the site names (or
        // the visitor entered), and the competitors' customers.
        const firstAudience = state.campaigns!.items.findIndex((c) => c.source !== "competitors");
        const campaigns = state.campaigns!.items.map((c, i) => ({ ...c, selected: i === firstAudience || c.source === "competitors" }));
        state = { ...state, campaigns: { ...state.campaigns!, items: campaigns } };
        send({ type: "result", step: "campaigns", data: campaigns.slice(0, 4).map((c) => ({ name: c.name, description: c.description, searchQuery: c.searchQuery, roles: c.roles, selected: c.selected })) });
        if (stopped()) return;

        begin("companies");
        ctx.deadline = started + STEP_BUDGET_MS.companies;
        if (campaigns.some((c) => c.selected)) state = await runCompanies(state, ctx);
        else {
          log("no audience or competitor to start from; skipping company search");
          state = { ...state, companies: { items: [], queries: [], skipped: [], ranAt: new Date().toISOString() } };
        }
        // A narrow audience can find nothing. Widen once: the next campaign, or
        // companies that already buy from the top competitor.
        if (!state.companies!.items.length && campaigns.length) {
          const rival = state.competitors!.items[0]?.name;
          const next = campaigns.find((c, i) => !c.selected && i > firstAudience);
          if (next || rival) {
            log("no matches for that audience; widening the search");
            const items = campaigns.map((c) => (next ? { ...c, selected: c.id === next.id } : { ...c, searchQuery: `companies that use ${rival}` }));
            state = await runCompanies({ ...state, campaigns: { ...state.campaigns!, items } }, ctx);
          }
        }
        const companies = state.companies!.items;
        const companyList = await mapLimit(companies, 6, async (c) => {
          const item = { domain: c.domain, name: c.name, description: c.description, matchedTerms: c.matchedTerms, signal: c.signal ?? null, iconDataUrl: await fetchSiteIcon(c.domain) };
          send({ type: "item", step: "companies", data: item });
          return item;
        });
        send({ type: "result", step: "companies", data: companyList });
        if (stopped()) return;

        const sender: Sender = { name: r.name, domain: r.domain, summary: r.summary, category: r.category ?? brand.category, keywords: r.keywords };

        begin("social");
        const { primary, related } = researchTerms(r, brand.category);
        const [topic, ...also] = leadTopics(phrases, related, socialTopic(brand.category, r.keywords, brand.name), r.categoryAreas ?? []);
        const rivals = state.competitors!.items.slice(0, 8).map((c) => c.name);
        const toLead = (lead: Awaited<ReturnType<typeof findSocialLeads>>[number], reply: string | null, sequence: ReturnType<typeof draftMessageSequence> | null = null) => ({ platform: lead.platform, url: lead.url, title: lead.title, snippet: lead.snippet, author: lead.author, authorName: lead.authorName, profileUrl: lead.profileUrl, community: lead.community, intent: lead.intent, matched: lead.matched, reply, sequence, postedAt: lead.postedAt, window: lead.window });
        const leads = await findSocialLeads({ topic, also, competitors: rivals, primary, related, brand: r.name }, log, 60, (lead) => send({ type: "item", step: "social", data: toLead(lead, null) }));
        const asking = leads.filter((l) => l.intentScore > 0).length;
        log(`kept ${leads.length} posts about your market, ${asking} of them people asking; drafting replies to the top ${Math.min(5, asking)}`);
        // The top asks get a public reply and a direct message with two
        // follow-ups: drafts for a person to send, nothing is sent here.
        const withReplies = await Promise.all(leads.map(async (lead, i) => {
          const top = i < 5 && lead.intentScore > 0;
          return toLead(lead, top ? (await draftSocialReply(sender, lead)).body : null, top ? draftMessageSequence(sender, lead) : null);
        }));
        send({ type: "result", step: "social", data: { topic, leads: withReplies } });
        if (stopped()) return;

        begin("contacts");
        const roles = campaigns.find((c) => c.selected && c.source === "competitors")?.roles ?? campaigns.find((c) => c.selected)?.roles ?? [];
        // People each company names on its own team or leadership page, with
        // that page as the source. Emails are never guessed; a licensed
        // provider adds them in a workspace.
        log(`reading each company's own team or leadership page for ${roles.slice(0, 3).join(", ")}`);
        const contactsBy = started + STEP_BUDGET_MS.contacts;
        // Then each person's public profile from a profile search, kept only
        // when its headline names the company; a company with no team page
        // is searched by role.
        const found = await mapLimit(companies.slice(0, 12), 6, async (c) => {
          if (Date.now() > contactsBy) return null;
          const team = await findDecisionMakers(c, roles);
          const linked = Date.now() > contactsBy ? team : await withProfiles(team, roles, search);
          log(linked.people.length ? `  ${c.name}: ${linked.people.map((p) => `${p.name} (${p.title})${p.profileUrl ? " with profile" : ""}`).join(", ")}` : `  ${c.name}: no team page or matching public profile`);
          return linked;
        });
        const people = found.filter((f): f is NonNullable<typeof f> => f !== null).flatMap((f) => {
          const company = companies.find((c) => c.domain === f.domain);
          return f.people.map((p) => ({
            company: f.company,
            domain: f.domain,
            name: p.name,
            title: p.title,
            source: p.via === "public search" ? null : f.source,
            profileUrl: p.profileUrl ?? null,
            photoUrl: p.photoUrl ?? null,
            via: p.via ?? "team page",
            // A drafted first message and follow-ups; nothing is sent.
            sequence: draftPersonSequence(sender, p, { name: f.company, description: company?.description ?? null }),
          }));
        });
        const provider = contactProvider();
        log(provider
          ? `verified emails come from ${provider.label}, a licensed provider, inside a workspace`
          : "verified emails come only from a licensed contact provider inside a workspace; none are guessed here");
        send({ type: "result", step: "contacts", data: { roles, companies: companies.slice(0, 12).map((c) => ({ name: c.name, domain: c.domain })), people } });
        if (stopped()) return;

        begin("pitch");
        const drafts = [];
        for (const company of companies.slice(0, 5)) {
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
