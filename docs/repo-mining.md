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

## Remaining to mine
ever-gauzy (ERP - enterprise features: teams/roles/audit log patterns), marketingskills, crm, awesome-llm-apps (lists), postiz-app (social scheduling - queue/schedule UX), laya, google-maps-scraper (scraping infra), Agent-Reach.
