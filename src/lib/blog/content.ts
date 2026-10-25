// Threadly blog: content model + posts.
// Rendered by src/app/blog/[slug]/page.tsx. Posts stay unpublished (published: true)
// until reviewed, then ship by flipping the flag.

import type { DocBlock } from "@/lib/docs/content";

export interface BlogPost {
  slug: string;
  title: string;
  description: string;
  date: string; // ISO date
  readingTime: string;
  published: boolean;
  blocks: DocBlock[];
}

export const BLOG_POSTS: BlogPost[] = [
  {
    slug: "what-is-geo",
    title: "What is generative engine optimization (GEO)?",
    description:
      "Buyers increasingly ask ChatGPT, Claude and Gemini what to buy instead of searching. GEO is the practice of measuring and improving how those AI answers talk about your brand.",
    date: "2026-10-25",
    readingTime: "7 min read",
    published: true,
    blocks: [
      {
        type: "p",
        text: "For twenty years, the first page of Google decided which brands buyers discovered. That habit is changing. A growing share of buying research now starts with a question typed into an AI assistant: \"What are the best async video tools for a remote sales team?\" or \"Which CRM should a ten-person agency use?\" The assistant answers directly, names a handful of brands, and often cites its sources. There is no page two.",
      },
      {
        type: "p",
        text: "Generative engine optimization - GEO - is the practice of measuring and improving how AI answers talk about your brand. Where SEO asks \"where do we rank on the results page?\", GEO asks three different questions: are we mentioned at all, is our website cited as a source, and how do we compare to the competitors named alongside us?",
      },
      { type: "h2", text: "Why the answer box changed the game" },
      {
        type: "p",
        text: "A search results page offers ten links and lets the buyer choose. An AI answer makes the choice for them: it synthesizes whatever the model knows and whatever it can retrieve, then presents two to five brands as the shortlist. If your brand is not in that shortlist, you are not losing a click - you are absent from the consideration set entirely.",
      },
      {
        type: "p",
        text: "The mechanics are also different. Rankings on a results page are comparatively stable and observable. AI answers vary by provider, by phrasing, and over time as models are updated and their retrieval sources change. ChatGPT, Claude and Gemini can give three different shortlists to the same question on the same day. That variability is exactly why measurement has to come first.",
      },
      { type: "h2", text: "The four numbers that define AI visibility" },
      {
        type: "list",
        items: [
          "Mention rate: the share of buyer questions where the AI answer names your brand. This is the GEO equivalent of ranking at all.",
          "Citation share: how often the answer cites your domain as a source. Citations are the closest thing AI answers have to backlinks - they signal that the model treats your content as evidence.",
          "Average position: when several brands are named, where yours appears in the answer. Being the first brand named is very different from being the fourth.",
          "Share of voice: your mentions compared to every competitor named across the same set of questions. This is the number that tells you whether you are winning the category conversation.",
        ],
      },
      {
        type: "p",
        text: "Threadly computes all four from real answers. You track the questions your buyers actually ask, and each scan sends them to ChatGPT, Claude and Gemini, reads every answer, and records which brands were mentioned, which domains were cited, and in what order.",
      },
      { type: "h2", text: "GEO does not replace SEO" },
      {
        type: "p",
        text: "The two disciplines feed each other. AI assistants lean heavily on the open web: comparison articles, documentation, community threads, review sites. A brand with thin, outdated content gives the models nothing to work with. But classic SEO tools will not tell you whether ChatGPT recommends you, because they were built to watch a results page, not to read an answer. That gap is what GEO tooling exists to close.",
      },
      { type: "h2", text: "Where to start" },
      {
        type: "list",
        items: [
          "Write down the ten to twenty questions a buyer would ask an AI assistant before choosing a product like yours. Be honest and category-level: \"best X for Y\", \"X vs Y\", \"affordable X alternatives\".",
          "Run those questions through the major AI providers and record the answers. Note every brand named and every source cited.",
          "Compare against your competitors question by question. The questions where they appear and you do not are your content roadmap.",
          "Repeat on a schedule. AI answers drift as models and sources change, so a one-off check goes stale quickly.",
        ],
      },
      {
        type: "p",
        text: "You can do all of this by hand, and many teams start that way. Threadly exists to make the loop automatic: track the questions once, scan on a schedule, and watch mention rate, citation share, position and share of voice move over time - across all three providers in one place.",
      },
    ],
  },
  {
    slug: "track-brand-in-ai-answers",
    title: "How to track your brand in ChatGPT, Claude and Gemini",
    description:
      "A practical workflow for measuring how AI assistants talk about your brand: pick the right buyer questions, scan across providers, and read mention rate, citation share and share of voice.",
    date: "2026-10-25",
    readingTime: "6 min read",
    published: true,
    blocks: [
      {
        type: "p",
        text: "Most teams find out how AI assistants describe them by accident - a prospect mentions it on a call, or someone tries a search in ChatGPT at lunch. This post lays out the deliberate version: a repeatable workflow for measuring your brand's AI visibility, using Threadly's actual workflow as the example.",
      },
      { type: "h2", text: "Step 1: Track questions, not keywords" },
      {
        type: "p",
        text: "AI assistants are conversational, so the unit that matters is the full buyer question. Good tracking questions sound like a real person asking for advice: \"What are the best async video messaging tools?\", \"Loom vs Vidyard for a remote sales team\", \"Affordable Loom alternatives for startups\". Aim for a mix of category questions, head-to-head comparisons, alternatives queries and problem questions.",
      },
      {
        type: "p",
        text: "In Threadly you add these as tracked questions on your brand profile, along with your domain and your competitors. If you are not sure which questions your buyers ask, the app can suggest a starting set from your brand description - then you edit it down to the ones that matter.",
      },
      { type: "h2", text: "Step 2: Scan across all three providers" },
      {
        type: "p",
        text: "A scan sends every tracked question to each configured provider - ChatGPT, Claude and Gemini - and reads the full answer text. Scanning one provider alone is misleading, because the three assistants build their answers from different model knowledge and different retrieval sources. A brand can lead in one assistant's answers and be invisible in another's.",
      },
      {
        type: "p",
        text: "For every question and provider, Threadly records whether your brand was mentioned, whether your domain was cited as a source, and your position among the brands named. The full answer text and citation list are kept, so you can always read exactly what the AI said rather than trusting a score.",
      },
      { type: "h2", text: "Step 3: Read the four headline metrics" },
      {
        type: "list",
        items: [
          "Mention rate tells you how often you appear at all. If this is low, the problem is awareness in the model's sources, not wording.",
          "Citation share tells you how often your own site is the evidence. Low citation share with decent mentions means the models know you but rely on third parties to describe you.",
          "Average position tells you whether you lead the shortlist or trail it.",
          "Share of voice compares your mentions to your competitors' across the whole question set - the single best summary of who owns the category conversation.",
        ],
      },
      { type: "h2", text: "Step 4: Compare competitors question by question" },
      {
        type: "p",
        text: "The aggregate numbers tell you where you stand; the per-question table tells you what to do. Sort for questions where a competitor is mentioned and you are not. Each one is a concrete gap - usually a missing comparison page, an unanswered question on your site, or a third-party conversation you are absent from.",
      },
      { type: "h2", text: "Step 5: Watch the trend, not the day" },
      {
        type: "p",
        text: "AI answers drift. Models are updated, retrieval indexes refresh, and new content appears. A single scan is a snapshot; the value is in the trend line. Threadly keeps every scan in your history, so mention rate, citation share and share of voice become curves you can act on - and so you can see whether the content you shipped last month actually moved the answers.",
      },
      {
        type: "p",
        text: "The whole loop - questions, scan, metrics, gaps, trend - takes minutes to set up. Try it on the live demo first if you want to see the output before connecting anything.",
      },
    ],
  },
  {
    slug: "buyers-stopped-searching",
    title: "Your buyers stopped searching. They started asking.",
    description:
      "Buying research is moving from ten blue links to a single synthesized answer. Here is what that shift means for how brands get discovered - and why citations are the new backlinks.",
    date: "2026-10-25",
    readingTime: "5 min read",
    published: true,
    blocks: [
      {
        type: "p",
        text: "Watch how someone researches a purchase today and a pattern emerges. Instead of opening five tabs and skimming review sites, they ask an AI assistant one question - \"what should a ten-person agency use for project management?\" - and act on the shortlist it returns. The research phase did not disappear. It collapsed into a single answer.",
      },
      { type: "h2", text: "The shortlist is the new first page" },
      {
        type: "p",
        text: "A results page always contained your brand somewhere if you ranked. An AI answer is binary: you are in the shortlist or you are not. There is no position 11 to climb from, because there is no page two. For the brands named, the assistant becomes a referral channel. For everyone else, the buyer never finds out they exist.",
      },
      {
        type: "p",
        text: "This cuts across every category - software, services, consumer products. Anywhere a buyer can ask \"what is the best X for Y\", an AI assistant is now part of the path to purchase.",
      },
      { type: "h2", text: "Citations are the new backlinks" },
      {
        type: "p",
        text: "When an AI answer cites a source, it is telling you what the model considers evidence. Those citations cluster around a predictable set: comparison articles, original documentation, active community threads, and independent reviews. Brands whose content fits those patterns get cited; brands with thin marketing pages get described by other people's content instead.",
      },
      {
        type: "p",
        text: "That distinction matters more than it looks. When the assistant cites your own site, your framing of the product shapes the answer. When it cites a third party, theirs does. Measuring citation share - how often your domain is the evidence - tells you whose story the AI is repeating.",
      },
      { type: "h2", text: "You cannot improve what you do not measure" },
      {
        type: "p",
        text: "The uncomfortable part of this shift is that most analytics stacks are blind to it. Search Console watches a results page. Your referral logs catch only the clicks. Nothing tells you that ChatGPT recommended two competitors and left you out, or that Claude started citing a review site that misstates your pricing.",
      },
      {
        type: "p",
        text: "That blind spot is why we built Threadly. You track the questions your buyers ask, and every scan reads the actual answers from ChatGPT, Claude and Gemini: who was mentioned, who was cited, and in what order. Over time those snapshots become a trend line - and the gap list between you and your competitors becomes a content roadmap instead of a guess.",
      },
      {
        type: "p",
        text: "The buyers who used to search are asking instead. The brands that learn to measure the answers will be the ones in them.",
      },
    ],
  },
];

export function getBlogPost(slug: string): BlogPost | undefined {
  return BLOG_POSTS.find((post) => post.slug === slug && post.published);
}

export function publishedPosts(): BlogPost[] {
  return BLOG_POSTS.filter((post) => post.published);
}
