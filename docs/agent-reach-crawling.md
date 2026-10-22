# Agent-Reach Real-Time Crawling Engine

Threadly integrates the [Agent-Reach](https://github.com/itz-kirankumar/Agent-Reach) open-source multi-channel internet crawling architecture.

Agent-Reach gives Threadly real-time web crawling, market listening, and deep content extraction without requiring expensive or rate-limited paid APIs.

---

## Capabilities

1. **Deep URL & Webpage Crawler**
   - Extracts clean, high-fidelity Markdown from any public URL via Jina Reader (`https://r.jina.ai/<url>`).
   - Anti-bot / Cloudflare challenge detection with automatic fallback to native HTTP fetch.
   - Extracts page metadata, hierarchical headings (`H1`, `H2`, `H3`), contact emails (`mailto:` detection), and platform social profiles (Twitter/X, LinkedIn, GitHub, YouTube, Reddit).
   - Auto-saves extracted pages directly into Threadly's **Conversation Radar** and pipeline.

2. **Multi-Platform Real-Time Discussion Crawling**
   - **Hacker News**: Live stories, comments, points, and founder discussions via Algolia search.
   - **GitHub**: Real-time open issues, PRs, and repository feedback via the GitHub search API.
   - **Web News RSS**: Real-time 7-day Google News RSS feeds for industry and competitor trends.
   - **V2EX**: Tech community node discussions and developer sentiment via public JSON endpoints.
   - **Reddit**: Community discussion and subreddit pain-point indexation.

3. **16-Platform Health Diagnostics ("Doctor")**
   - Self-diagnostic engine that tests which upstream crawling backends and platform tools are active.
   - Seamlessly interfaces with the local `agent-reach doctor --json` CLI when Python is available.
   - Zero-config runtime fallback that keeps core web and community crawling operational anywhere.

4. **Prospect Website Intelligence**
   - Powers the **Outreach** website analyzer (`src/lib/outreach-website.ts`). When analyzing a company URL, Agent-Reach retrieves structured Markdown with headings, tables, and product copy, enabling accurate ICP extraction and personalized outreach generation.

---

## API Endpoints

### 1. `GET /api/discovery/agent-reach`
Returns a health diagnostic report of all crawling channels:
```json
{
  "generatedAt": "2026-10-22T10:00:57.000Z",
  "cliAvailable": true,
  "totalChannels": 10,
  "activeChannels": 7,
  "channels": {
    "web": {
      "name": "Any Public Webpage",
      "platform": "Web",
      "status": "ok",
      "activeBackend": "Jina Reader"
    }
  }
}
```

### 2. `POST /api/discovery/agent-reach`
- **Crawl a single URL:**
  ```json
  {
    "action": "crawl_url",
    "url": "https://news.ycombinator.com/item?id=50190363",
    "saveToRadar": true
  }
  ```
- **Crawl market signals for a topic:**
  ```json
  {
    "action": "search",
    "topic": "developer onboarding software",
    "threshold": 60,
    "autoOutreach": true
  }
  ```

---

## Using in the Founder Portal

1. Open **Discover** in the portal sidebar.
2. Select the **Agent-Reach Real-Time Crawler** tab.
3. Switch between:
   - **Multi-Platform Market Signals**: Live search across Hacker News, GitHub, News RSS, and V2EX.
   - **Deep URL & Website Crawler**: Paste any URL, extract clean markdown, found emails, and save to Radar with 1 click.
   - **16-Platform Health Doctor**: Live view of all channel backends and connectivity.
