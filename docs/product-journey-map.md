# Threadly product map and customer journey

This map describes the current product surfaces and the intended path through them. It distinguishes live user actions from saved configuration so the interface does not imply work is happening in the background when it is not.

## Product map

| Journey stage | Workspace area | What users do | Main dependencies |
| --- | --- | --- | --- |
| Set up | Dashboard → Company profile | Review website-derived suggestions; save company name, product summary, ICP, and search phrases | Public HTTPS website; configured AI provider is optional |
| Find buyers | Discover | Run searches for customer problems across available web and X sources; inspect results before saving | Tavily or web-search provider; connected X provider for X search |
| Triage | Radar | Filter saved conversations, inspect source evidence, save or dismiss signals, and create a prospect | Discovery results |
| Build pipeline | Leads, Segments | Maintain prospect records, qualify fit and intent, and group leads by rules | Laya and/or AnyJev for AI qualification |
| Engage | Outreach, Sequences, Scheduler | Create and review outreach, enroll prospects, plan follow-ups, and schedule meetings | AI provider; Amazon SES for direct email; Google Calendar for calendar invites |
| Create | Content Studio, Calendar, Campaigns | Draft and review content, plan publishing, and manage channel budget and campaign performance | AI provider; publishing integrations where configured |
| Improve visibility | SEO + GEO | Audit public-page SEO and AI crawl signals; track buyer questions and inspect answer-provider citations | Public HTTPS website; OpenAI, Gemini, and/or Tavily keys for GEO scans |
| Measure | Analytics, Revenue | Review pipeline, engagement, campaign, and revenue views | Saved workspace and campaign data |
| Coordinate | Workflows, Team, Workspace, Settings | Manage rule definitions, collaborators, company context, and connected services | Workspace identity and configured integrations |

## Recommended end-to-end path

1. Save a verified company profile and customer search phrases.
2. Run a targeted search from Discover using those phrases.
3. Review source links in Radar; dismiss noise and save relevant conversations.
4. Create a prospect from a useful signal, confirm contact details, and qualify fit when a decision model is configured.
5. Draft outreach from the conversation, review the message and recipient, then send only after approval.
6. Plan any follow-up in Sequences or Scheduler; keep each outbound step visible to the workspace owner.
7. Review performance in Analytics and Revenue. Use SEO + GEO to improve discoverability and check whether answer providers cite the site.

## Product behavior and current boundaries

- Website analysis and company setup are separate actions. Analysis suggests values for review; saving the profile preserves existing leads, conversations, and drafts.
- Discovery runs when a user starts a search. The current product does not continuously crawl communities in the background.
- Qualification, generated copy, and provider scan results depend on configured services. Missing keys should be shown as unavailable rather than represented as a successful run.
- Email sending requires a reviewed draft and a connected sender. Setup never sends email.
- Workflow rules can be configured and enabled, but automatic trigger execution is not connected. The UI routes users to the real action pages, and the legacy run endpoint now returns a clear unavailable response instead of recording a false run.
- SEO audit scores summarize on-page checks from a fetch at the time of the audit; they are not search rankings or a promise of AI citations.

## Navigation model

- **Home:** Dashboard
- **Find customers:** Discover, Radar, Maps Scraper, Segments
- **Engage:** Leads, Outreach, Sequences, Scheduler
- **Create & optimize:** Content Studio, Calendar, Campaigns
- **Measure:** Analytics, Revenue, SEO + GEO
- **Manage:** Workflows and Team; Settings stays pinned in the sidebar footer.

The dashboard's next-step card advances from profile setup to discovery, signal review, outreach review, and performance review based on actual workspace records.
