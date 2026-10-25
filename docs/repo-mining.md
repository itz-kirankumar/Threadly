# Repo mining notes (Oct 25, 2026)

Source: 10 repos shared by the owner (ever-gauzy, marketingskills, crm, awesome-llm-apps, postiz-app, laya, google-maps-scraper, Agent-Reach, open-seo, GEOFlow). Mined so far: open-seo, GEOFlow.

## open-seo (TS/Next.js, Semrush/Ahrefs alternative)
Directly relevant. Takeaways:

1. **AI visibility audit methodology** (`.agents/skills/ai-visibility-audit/SKILL.md`) - adopt as Threadly's "Recommendations" engine:
   - Gap analysis: prompts where a competitor is named and the brand is not = the material for recommendations.
   - Citation source classification: recurring cited URLs classified as list/review article, forum/community, competitor page, owned page, reference/editorial. Recommendations target the class (get listed on the listicle, answer what the competitor page answers, etc.).
   - Owned-side checks: does an owned page answer the gap prompt directly near the top? Is it reachable without login/JS?
   - **AI-crawler robots.txt audit**: check the brand domain's robots.txt for GPTBot, OAI-SearchBot, ChatGPT-User, Google-Extended, PerplexityBot, ClaudeBot. Blocking OAI-SearchBot/whole-site blocks ChatGPT search; GPTBot/Google-Extended affect training only - report precisely, don't overstate. (Threadly's own robots.txt already whitelists these.)
   - Trend discipline: never compute trend from separate result calls; use stored comparable runs (Threadly's scan history already does this).
   - Rates count answered collections only; report failed/no-answer separately, not as absence.
2. **fanOutQueries idea**: ChatGPT's web searches before answering explain citations. Could surface "queries the AI ran" per answer when the provider exposes them.
3. BYOK pay-as-you-go pattern (DataForSEO) matches Threadly's BYOK plans.

## GEOFlow (PHP/Laravel, enterprise GEO content ops)
Content-operations angle: trusted knowledge base -> AI content production -> quality gates -> human review -> multi-site distribution. Threadly is monitoring-side; GEOFlow is production-side. Takeaway: enterprise roadmap item "content recommendations/briefs" - from gap analysis, generate a content brief per gap prompt (question, what cited pages cover, what the owned page should say). No code to port (PHP).

## marketingskills (Corey Haines' ~50 marketing skills for AI agents)
High value, two uses:
1. **Threadly's own marketing**: cro, launch, directory-submissions, programmatic-seo, pricing, onboarding skills = playbooks for gothreadly.live growth.
2. **Product methodology**: ai-seo, schema, seo-audit, site-architecture skills complement the open-seo audit (structured data, crawler access, page-level fixes) for the Recommendations engine.
Skills live under `skills/<name>/SKILL.md`; adopt selectively, not wholesale.

## postiz-app (social scheduling SaaS, NestJS+Next.js monorepo)
Patterns to study: multi-channel scheduling queue, per-provider integrations behind one UI (maps to Threadly's multi-provider scan engine), public API + API-key management for SaaS (Threadly enterprise roadmap: public API). AGPL - patterns only, no code copying.

## crm (trycompai/crm, Next.js)
Enterprise-feature patterns: contacts/pipeline UI, agent+api+app split. Reference for future Threadly "accounts/prospects" views if GEO monitoring expands to sales workflows.

## ever-gauzy (ERP, huge)
Only worth pattern-mining for: org/team role-permission matrix and audit-log design (Threadly Enterprise already has owner/admin/member; audit log is a roadmap item). AGPL - patterns only.

## awesome-llm-apps (list of 100+ LLM agent templates)
Idea source only. Relevant category: brand-monitoring/reputation agents and RAG-over-web patterns for citation analysis.

## laya (multilingual decision engine, research project)
Not directly applicable. Possible long-term: cheap non-LLM classification of citation-source types (the open-seo source classifier) if LLM classification costs matter.

## google-maps-scraper (Go)
Tangential. Could power a lead-gen experiment ("agencies/local businesses to sell GEO monitoring to") - growth project, not product code. Mind ToS.

## Agent-Reach (agent internet-access installer, zh)
Not applicable to product; concept (capability health checks for agent tooling) matches what Threadly already does per-provider (quota/model-liveness checks).
