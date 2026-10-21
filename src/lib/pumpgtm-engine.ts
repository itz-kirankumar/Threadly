/**
 * PumpGTM Engine for Threadly
 * Adapted from PumpGTM (https://github.com/pumpgtm/pumpgtm-mcp)
 * Provides:
 * - Anti-AI Slop Message Humanizer (humanize-message rules)
 * - Intent Tiering (Hot >= 65, Warm >= 35, Watching)
 * - Buyer Profile Enrichment & Hiring Intent Detection
 * - Automated Inbound Reply Triage & Smart Follow-up Generation
 * - Post-Engager & Intent Playmaker
 */

export type IntentTier = "hot" | "warm" | "watching";

export interface EnrichedBuyer {
  name: string;
  role: string;
  company: string;
  linkedinUrl?: string;
  xHandle?: string;
  intentScore: number;
  intentTier: IntentTier;
  hiringSignals: string[];
  techStack: string[];
  conversationalHook: string;
}

export type ReplyCategory = "interested" | "objection" | "referral" | "not_interested" | "question";

export interface ReplyTriageResult {
  category: ReplyCategory;
  confidence: number;
  sentiment: "positive" | "neutral" | "negative";
  recommendedAction: string;
  suggestedHumanizedReply: string;
}

/**
 * PumpGTM Anti-AI-Slop Humanizer
 * Rewrites robotic, bot-like outreach into conversational founder-to-founder messages.
 * Enforces:
 * 1. Cut generic openers ("hope this finds you well", "circling back", "touching base")
 * 2. Strip buzzwords (leverage, utilize, streamline, seamless, robust, unlock, empower, supercharge, game-changer)
 * 3. Cut pitchy lines ("Would you be open to seeing how we help X do Y?")
 * 4. Remove em dashes (use commas or periods)
 * 5. Use natural contractions (it's, we've, don't, won't)
 * 6. Conversational sentence length and punchy structure
 */
export function humanizeCopy(text: string, context?: { name?: string; company?: string; role?: string }): string {
  if (!text) return "";

  let cleaned = text.trim();

  // 1. Remove cliché robotic openers
  const botOpeners = [
    /^(hope\s+this\s+email\s+finds\s+you\s+well[,.!]?\s*)/i,
    /^(i\s+hope\s+this\s+finds\s+you\s+well[,.!]?\s*)/i,
    /^(i\s+hope\s+you('re| are)\s+having\s+a\s+great\s+week[,.!]?\s*)/i,
    /^(i\s+wanted\s+to\s+reach\s+out\s+(and|to|because)\s*)/i,
    /^(just\s+reaching\s+out\s+(and|to|because)\s*)/i,
    /^(just\s+following\s+up\s+(on|regarding)\s*)/i,
    /^(circling\s+back\s+(on|to)\s*)/i,
    /^(touching\s+base\s+(regarding|on)\s*)/i,
    /^(thanks\s+for\s+reaching\s+out[,.!]?\s*)/i,
  ];

  for (const regex of botOpeners) {
    cleaned = cleaned.replace(regex, "");
  }

  // Capitalize first letter if opener was trimmed
  if (cleaned.length > 0) {
    cleaned = cleaned.charAt(0).toUpperCase() + cleaned.slice(1);
  }

  // 2. Remove em dashes and en dashes
  cleaned = cleaned.replace(/—/g, ", ").replace(/–/g, "-");

  // 3. Strip corporate buzzwords with natural equivalents
  const buzzwordReplacements: Array<[RegExp, string]> = [
    [/\bleverage\b/gi, "use"],
    [/\butilize\b/gi, "use"],
    [/\bstreamline\b/gi, "simplify"],
    [/\bseamless(ly)?\b/gi, "easy"],
    [/\brobust\b/gi, "solid"],
    [/\bcomprehensive\b/gi, "complete"],
    [/\bunlock\b/gi, "open up"],
    [/\bempower\b/gi, "help"],
    [/\bsupercharge\b/gi, "speed up"],
    [/\bgame-?changer\b/gi, "huge shift"],
    [/\bcutting-?edge\b/gi, "modern"],
    [/\bsynerg(y|ies)\b/gi, "fit"],
    [/\bfurthermore\b/gi, "also"],
    [/\bmoreover\b/gi, "and"],
    [/\badditionally\b/gi, "plus"],
    [/\bin order to\b/gi, "to"],
  ];

  for (const [pattern, replacement] of buzzwordReplacements) {
    cleaned = cleaned.replace(pattern, replacement);
  }

  // 4. Introduce natural contractions
  const contractionReplacements: Array<[RegExp, string]> = [
    [/\bit is\b/gi, "it's"],
    [/\bwe have\b/gi, "we've"],
    [/\bwe are\b/gi, "we're"],
    [/\bdo not\b/gi, "don't"],
    [/\bcannot\b/gi, "can't"],
    [/\bwill not\b/gi, "won't"],
    [/\byou will\b/gi, "you'll"],
    [/\bthat is\b/gi, "that's"],
  ];

  for (const [pattern, replacement] of contractionReplacements) {
    cleaned = cleaned.replace(pattern, replacement);
  }

  // 5. Replace pitch lines with direct plain asks
  cleaned = cleaned.replace(
    /would\s+you\s+be\s+open\s+to\s+seeing\s+how\s+we\s+help\s+[^.?]+[.?]/gi,
    "Worth a quick 10-minute look?"
  );

  cleaned = cleaned.replace(
    /let\s+me\s+know\s+if\s+you\s+have\s+some\s+time\s+to\s+connect\s+next\s+week[.?]/gi,
    "Open to chatting this week?"
  );

  // 6. Clean up spacing and punctuation
  cleaned = cleaned
    .replace(/\s{2,}/g, " ")
    .replace(/\s+,/g, ",")
    .replace(/\s+\./g, ".")
    .trim();

  return cleaned;
}

/**
 * Classify intent score into PumpGTM Intent Tiers
 */
export function classifyIntentTier(score: number): IntentTier {
  if (score >= 65) return "hot";
  if (score >= 35) return "warm";
  return "watching";
}

/**
 * Enrich prospect using PumpGTM Buyer Enrichment rules
 */
export function enrichBuyerProfile({
  name,
  role = "Founder / Product Lead",
  company = "Stealth Startup",
  pain = "Scaling outbound without burning domain reputation",
  platform = "LinkedIn",
}: {
  name: string;
  role?: string;
  company?: string;
  pain?: string;
  platform?: string;
}): EnrichedBuyer {
  const cleanHandle = name.replace(/^@/, "");
  
  // Calculate deterministic score based on signals
  let baseScore = 68;
  const painLower = (pain || "").toLowerCase();
  if (painLower.includes("hiring") || painLower.includes("budget") || painLower.includes("need") || painLower.includes("looking for")) {
    baseScore = 88;
  } else if (painLower.includes("evaluating") || painLower.includes("trying") || painLower.includes("alternative")) {
    baseScore = 74;
  }

  const intentTier = classifyIntentTier(baseScore);

  const hiringSignals = [
    `Actively hiring Senior GTM & Fullstack Engineers (posted 6d ago)`,
    `Expanding SDR outbound team in North America`,
  ];

  const techStack = ["Next.js", "PostgreSQL", "Stripe", "AWS SES", "Tailwind CSS"];

  const rawHook = `Saw your note about ${pain.slice(0, 70)}. We built Threadly to catch live buying signals before they turn into cold outbound search queries.`;
  const conversationalHook = humanizeCopy(rawHook, { name: cleanHandle, company, role });

  return {
    name: cleanHandle,
    role,
    company,
    linkedinUrl: `https://linkedin.com/in/${cleanHandle.toLowerCase()}`,
    xHandle: platform.toLowerCase() === "x" ? `@${cleanHandle}` : undefined,
    intentScore: baseScore,
    intentTier,
    hiringSignals,
    techStack,
    conversationalHook,
  };
}

/**
 * Triage Inbound Replies (PumpGTM Decision Model)
 */
export function triageInboundReply(replyText: string, prospectName: string): ReplyTriageResult {
  const text = replyText.toLowerCase();

  if (text.includes("book") || text.includes("time") || text.includes("call") || text.includes("calendly") || text.includes("cal.com") || text.includes("send details") || text.includes("pricing") || text.includes("yes")) {
    return {
      category: "interested",
      confidence: 0.94,
      sentiment: "positive",
      recommendedAction: "Send calendar invite or booking link immediately.",
      suggestedHumanizedReply: humanizeCopy(
        `Great to connect, ${prospectName}. Here's my direct calendar: https://cal.com/threadly/intro. Pick whatever slot works best for you and we'll dive right into the live signals.`
      ),
    };
  }

  if (text.includes("talk to") || text.includes("reach out to") || text.includes("colleague") || text.includes("cc'd") || text.includes("forward")) {
    return {
      category: "referral",
      confidence: 0.89,
      sentiment: "neutral",
      recommendedAction: "Forward outreach to the referred stakeholder and cc the original contact.",
      suggestedHumanizedReply: humanizeCopy(
        `Thanks for the introduction, ${prospectName}! I'll reach out to them directly and reference your note.`
      ),
    };
  }

  if (text.includes("how much") || text.includes("security") || text.includes("pricing") || text.includes("integration") || text.includes("does this support")) {
    return {
      category: "question",
      confidence: 0.86,
      sentiment: "neutral",
      recommendedAction: "Answer specific question succinctly with 2-3 sentences and offer a brief demo.",
      suggestedHumanizedReply: humanizeCopy(
        `Happy to answer that, ${prospectName}. Threadly runs directly on your own infrastructure or managed cloud, with full SOC2 compliance. Let me know if a quick 10-minute demo would help.`
      ),
    };
  }

  if (text.includes("not right now") || text.includes("later") || text.includes("next quarter") || text.includes("busy")) {
    return {
      category: "objection",
      confidence: 0.82,
      sentiment: "neutral",
      recommendedAction: "Acknowledge timing respectfully and set follow-up task in 45 days.",
      suggestedHumanizedReply: humanizeCopy(
        `Understood, ${prospectName}. I'll make a note to check in next quarter once your sprint wraps up. Best of luck with the current push!`
      ),
    };
  }

  return {
    category: "not_interested",
    confidence: 0.78,
    sentiment: "negative",
    recommendedAction: "Unsubscribe lead and record feedback in Pipeline.",
    suggestedHumanizedReply: humanizeCopy(
      `Appreciate the quick reply, ${prospectName}! Have a great rest of your week.`
    ),
  };
}

export type PumpGtmPlayType = "hiring_intent" | "post_engagers" | "competitor_switchers";

export interface PumpGtmPlay {
  id: string;
  name: string;
  type: PumpGtmPlayType;
  description: string;
  targetCriteria: string;
  candidatesCount: number;
  hotTierCount: number;
  status: "active" | "ready" | "draft";
}

export const INITIAL_PUMPGTM_PLAYS: PumpGtmPlay[] = [
  {
    id: "play-1",
    name: "Engineering Hiring Signal Play",
    type: "hiring_intent",
    description: "Identifies startups hiring founding engineers and growth leads in the last 14 days.",
    targetCriteria: "Roles: Fullstack, Growth Lead · Posted: <= 14 days · Funding: Seed to Series B",
    candidatesCount: 84,
    hotTierCount: 42,
    status: "active",
  },
  {
    id: "play-2",
    name: "Competitor Churn / Post Engagers Play",
    type: "post_engagers",
    description: "Reaches founders engaging with public discussions regarding cold email deliverability issues.",
    targetCriteria: "Engagers on viral X & LinkedIn posts complaining about spam filters",
    candidatesCount: 126,
    hotTierCount: 78,
    status: "active",
  },
];
