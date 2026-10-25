# Threadly — Enterprise Generative Engine Optimization (GEO) Intelligence Platform

[![License: MIT](https://img.shields.io/badge/License-MIT-yellow.svg)](https://opensource.org/licenses/MIT)

**One dedicated enterprise wedge:** Threadly monitors brand recommendations, citation share, and competitor displacement across **ChatGPT**, **Perplexity**, **Google Gemini**, and **Claude**.

When enterprise buyers ask conversational AI models for software recommendations, Threadly tracks whether your brand is cited, what sources influence the answer, and which competitors are winning share of voice.

---

## Architecture & Features

- **Multi-Model Generative Scanner**: Real-time evaluation across OpenAI GPT-4o, Perplexity Sonar Pro, Google Gemini 2.5 Flash, and Claude 3.5 Sonnet.
- **AI Share of Voice (SoV) & Ranking**: Percentage of buyer prompts where your brand is mentioned, position rank (#1 primary vs alternative), and net model sentiment.
- **Citation Attribution Graph**: Source-level audit of every domain cited by LLMs (e.g. G2, Gartner, TechCrunch, Reddit, GitHub, Docs).
- **Citation Gap Identification**: Highlights exact high-authority domains where competitors are cited, but your brand is absent, with actionable optimization guidance.
- **Enterprise Workspaces**: Built-in support for enterprise profiles (Stripe, Datadog, Snowflake, Threadly) and custom enterprise prompt matrixes.

---

## Routes

- `/` — Enterprise GEO Landing Page with real-time AI prompt simulator.
- `/demo` — Interactive Enterprise GEO Dashboard with pre-configured enterprise SaaS benchmarks.
- `/portal` — Full Enterprise GEO Command Center.
- `/api/geo/scan` — API route to execute live multi-model generative visibility scans.

---

## Local Setup

1. Install dependencies:
   ```bash
   npm install
   ```

2. Run development server:
   ```bash
   npm run dev
   ```

3. Build for production:
   ```bash
   npm run build
   ```

4. Open [http://localhost:3000](http://localhost:3000) to view the platform.
