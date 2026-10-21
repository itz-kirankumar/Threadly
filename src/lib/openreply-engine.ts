/**
 * OpenReply Engine for Threadly
 * Adapted from OpenReply (https://github.com/diwenne/openreply)
 * Open-sourced ManyChat alternative for Instagram & Social Comment-to-DM automation.
 * Supports:
 * - Multi-keyword matching (whole word boundary with Unicode lookaround or partial match)
 * - Latin diacritics folding, Arabic script normalization, and numeric homoglyph handling
 * - Public comment replies (randomized from variations)
 * - Direct Message templates with {username} interpolation
 * - Up to two CTA link buttons with tracked CTR analytics
 * - Optional follow-gate before link delivery
 * - Automatic conversion into Threadly Qualified Leads
 */

export interface KeywordMatchResult {
  matched: boolean;
  matchedKeyword: string | null;
}

const ARABIC_SCRIPT_FOLDING: Array<[RegExp, string]> = [
  [/[يىے]/gu, "ی"],
  [/ك/gu, "ک"],
  [/ة/gu, "ه"],
  [/[آأإٱ]/gu, "ا"],
  [/[ً-ْٰ]/gu, ""],
  [/ـ/gu, ""],
  [/[‌‎‏]/gu, ""],
];

const EASTERN_DIGITS = /[۰-۹٠-٩]/gu;

export function normalizeArabicScript(text: string): string {
  let out = text;
  for (const [pattern, replacement] of ARABIC_SCRIPT_FOLDING) {
    out = out.replace(pattern, replacement);
  }
  return out.replace(EASTERN_DIGITS, (digit) => {
    const code = digit.codePointAt(0)!;
    const zero = code >= 0x06f0 ? 0x06f0 : 0x0660;
    return String(code - zero);
  });
}

function isNumericLikeKeyword(cleanedKeyword: string): boolean {
  return /^[0-9oO]+$/.test(cleanedKeyword);
}

function foldNumericHomoglyphs(value: string): string {
  return value.replace(/o/gi, "0");
}

export function stripSpecialCharacters(text: string): string {
  return text
    .replace(
      /[\u{1F600}-\u{1F64F}\u{1F300}-\u{1F5FF}\u{1F680}-\u{1F6FF}\u{1F1E0}-\u{1F1FF}\u{2600}-\u{26FF}\u{2700}-\u{27BF}\u{FE00}-\u{FE0F}\u{1F900}-\u{1F9FF}\u{1FA00}-\u{1FA6F}\u{1FA70}-\u{1FAFF}\u{200D}\u{20E3}]/gu,
      ""
    )
    .replace(/[^\p{L}\p{N}\p{M}\s]/gu, " ")
    .replace(/\s+/g, " ")
    .trim();
}

export function foldDiacritics(text: string): string {
  let out = "";
  let baseIsLatin = false;

  for (const char of text.normalize("NFD")) {
    if (/\p{M}/u.test(char)) {
      if (!baseIsLatin) out += char;
      continue;
    }
    baseIsLatin = /\p{Script=Latin}/u.test(char);
    out += char;
  }

  return out.normalize("NFC");
}

export function matchKeywords(
  commentText: string,
  keywords: string[],
  wholeWordMatch: boolean = true
): KeywordMatchResult {
  if (!commentText || keywords.length === 0) {
    return { matched: false, matchedKeyword: null };
  }

  const cleanedText = foldDiacritics(
    stripSpecialCharacters(normalizeArabicScript(commentText))
  ).toLowerCase();

  if (!cleanedText) {
    return { matched: false, matchedKeyword: null };
  }

  for (const keyword of keywords) {
    const cleanedKeyword = foldDiacritics(
      stripSpecialCharacters(normalizeArabicScript(keyword))
    ).toLowerCase();

    if (!cleanedKeyword) continue;

    const numericLike = isNumericLikeKeyword(cleanedKeyword);
    const compareText = numericLike
      ? foldNumericHomoglyphs(cleanedText)
      : cleanedText;
    const compareKeyword = numericLike
      ? foldNumericHomoglyphs(cleanedKeyword)
      : cleanedKeyword;

    if (wholeWordMatch) {
      const escapedKeyword = compareKeyword.replace(
        /[.*+?^${}()|[\]\\]/g,
        "\\$&"
      );
      const regex = new RegExp(
        `(?<![\\p{L}\\p{N}])${escapedKeyword}(?![\\p{L}\\p{N}])`,
        "iu"
      );
      if (regex.test(compareText)) {
        return { matched: true, matchedKeyword: keyword };
      }
    } else {
      if (compareText.includes(compareKeyword)) {
        return { matched: true, matchedKeyword: keyword };
      }
    }
  }

  return { matched: false, matchedKeyword: null };
}

export type OpenReplyDmStatus = "sent" | "delivered" | "queued" | "failed";

export type OpenReplyDmLog = {
  id: string;
  automationId: string;
  commenterUsername: string;
  commentText: string;
  matchedKeyword: string | null;
  status: OpenReplyDmStatus;
  dmSentAt: string;
  publicReplySentAt?: string;
  publicReplyText?: string;
  deliveryUnconfirmed?: boolean;
  clickedLink?: boolean;
};

export type OpenReplyCampaign = {
  id: string;
  name: string;
  platform: "Instagram" | "Threads" | "X" | "LinkedIn";
  accountHandle: string;
  postTitle?: string;
  postUrl?: string;
  matchAnyPost: boolean;
  keywords: string[];
  wholeWordMatch: boolean;
  dmTriggerEnabled: boolean;
  dmMessage: string;
  linkButtonLabel: string;
  trackedDestinationUrl: string;
  secondaryButtonLabel?: string;
  secondaryDestinationUrl?: string;
  requireFollow: boolean;
  followPromptMessage?: string;
  publicReplyEnabled: boolean;
  publicReplyMessages: string[];
  isActive: boolean;
  createdAt: string;
  stats: {
    comments: number;
    dmsSent: number;
    clicks: number;
    ctr: number;
    followersGained: number;
  };
};

export const INITIAL_OPENREPLY_CAMPAIGNS: OpenReplyCampaign[] = [
  {
    id: "or-camp-1",
    name: "Reel: 10x Signal Discovery · Comment LINK",
    platform: "Instagram",
    accountHandle: "@threadly_hq",
    postTitle: "How we replaced $5,000/mo cold email spam with intent signal listening (Reel #108)",
    postUrl: "https://instagram.com/reel/C7x9A120K",
    matchAnyPost: false,
    keywords: ["LINK", "GROWTH", "PLAYBOOK", "DEMO"],
    wholeWordMatch: true,
    dmTriggerEnabled: true,
    dmMessage: "Hey @{username}! Thrilled you're scaling signal outreach. Here is the link to our full blueprint + workspace template 👇",
    linkButtonLabel: "Unlock Playbook 🚀",
    trackedDestinationUrl: "https://threadly.app/playbook",
    secondaryButtonLabel: "Book 1-on-1 Walkthrough 📅",
    secondaryDestinationUrl: "https://cal.com/threadly/intro",
    requireFollow: true,
    followPromptMessage: "Quick favor @{username}: make sure you're following @threadly_hq, then tap the button below to unlock instant access!",
    publicReplyEnabled: true,
    publicReplyMessages: [
      "Sent you a DM! Check your inbox 📬",
      "Just sent the link to your DMs! Check message requests 🚀",
      "Sent! Let me know if you got it 🔥"
    ],
    isActive: true,
    createdAt: new Date(Date.now() - 3600000 * 48).toISOString(),
    stats: {
      comments: 312,
      dmsSent: 304,
      clicks: 218,
      ctr: 71.7,
      followersGained: 142,
    },
  },
  {
    id: "or-camp-2",
    name: "Story & Carousel: B2B Playbook · Comment SEND",
    platform: "Instagram",
    accountHandle: "@threadly_hq",
    postTitle: "Carousel: 5 AI models for buying intent detection",
    postUrl: "https://instagram.com/p/D98v1KlM",
    matchAnyPost: true,
    keywords: ["SEND", "YES", "AI", "TRY"],
    wholeWordMatch: false,
    dmTriggerEnabled: true,
    dmMessage: "Hey @{username}, here is your instant pass to try the Threadly AI Radar engine!",
    linkButtonLabel: "Start Free Trial ✨",
    trackedDestinationUrl: "https://threadly.app/portal",
    requireFollow: false,
    publicReplyEnabled: true,
    publicReplyMessages: [
      "Check your DMs! Sent you the invite link 📬",
      "Sent! Dive right into the radar 🎯"
    ],
    isActive: true,
    createdAt: new Date(Date.now() - 3600000 * 24).toISOString(),
    stats: {
      comments: 184,
      dmsSent: 181,
      clicks: 122,
      ctr: 67.4,
      followersGained: 79,
    },
  },
];

export const INITIAL_OPENREPLY_LOGS: OpenReplyDmLog[] = [
  {
    id: "log-1",
    automationId: "or-camp-1",
    commenterUsername: "alex_growth",
    commentText: "This looks insane, please send me the LINK!!",
    matchedKeyword: "LINK",
    status: "delivered",
    dmSentAt: new Date(Date.now() - 1000 * 60 * 12).toISOString(),
    publicReplySentAt: new Date(Date.now() - 1000 * 60 * 12).toISOString(),
    publicReplyText: "Sent you a DM! Check your inbox 📬",
    clickedLink: true,
  },
  {
    id: "log-2",
    automationId: "or-camp-1",
    commenterUsername: "sara_saas",
    commentText: "GROWTH please! Need this for Q4 pipeline.",
    matchedKeyword: "GROWTH",
    status: "delivered",
    dmSentAt: new Date(Date.now() - 1000 * 60 * 45).toISOString(),
    publicReplySentAt: new Date(Date.now() - 1000 * 60 * 45).toISOString(),
    publicReplyText: "Just sent the link to your DMs! Check message requests 🚀",
    clickedLink: true,
  },
  {
    id: "log-3",
    automationId: "or-camp-2",
    commenterUsername: "dev_marcus",
    commentText: "AI radar looks so clean, send details",
    matchedKeyword: "AI",
    status: "delivered",
    dmSentAt: new Date(Date.now() - 1000 * 60 * 85).toISOString(),
    publicReplySentAt: new Date(Date.now() - 1000 * 60 * 85).toISOString(),
    publicReplyText: "Check your DMs! Sent you the invite link 📬",
    clickedLink: false,
  },
];

/**
 * Execute or simulate an OpenReply Comment-to-DM trigger
 */
export function executeOpenReplyTrigger({
  campaign,
  commenterUsername,
  commentText,
  isFollower = true,
}: {
  campaign: OpenReplyCampaign;
  commenterUsername: string;
  commentText: string;
  isFollower?: boolean;
}): {
  matched: boolean;
  matchedKeyword: string | null;
  publicReplyText?: string;
  dmDeliveredText?: string;
  buttons: Array<{ label: string; url: string }>;
  followGated: boolean;
  logItem: OpenReplyDmLog;
} {
  const matchResult = matchKeywords(
    commentText,
    campaign.keywords,
    campaign.wholeWordMatch
  );

  const cleanUsername = commenterUsername.replace(/^@/, "");

  if (!matchResult.matched) {
    return {
      matched: false,
      matchedKeyword: null,
      buttons: [],
      followGated: false,
      logItem: {
        id: `log-${Date.now()}`,
        automationId: campaign.id,
        commenterUsername: cleanUsername,
        commentText,
        matchedKeyword: null,
        status: "failed",
        dmSentAt: new Date().toISOString(),
      },
    };
  }

  // Pick random public reply
  const publicReplyText =
    campaign.publicReplyEnabled && campaign.publicReplyMessages.length > 0
      ? campaign.publicReplyMessages[
          Math.floor(Math.random() * campaign.publicReplyMessages.length)
        ]
      : undefined;

  // Determine if follow gate applies
  const followGated = campaign.requireFollow && !isFollower;

  const rawMessage = followGated
    ? campaign.followPromptMessage ||
      `Hey @{username}! Follow ${campaign.accountHandle} and tap below to unlock the link.`
    : campaign.dmMessage;

  const dmDeliveredText = rawMessage.replace(/\{username\}/g, cleanUsername);

  const buttons: Array<{ label: string; url: string }> = [];
  if (!followGated) {
    buttons.push({
      label: campaign.linkButtonLabel || "Open Link 🚀",
      url: campaign.trackedDestinationUrl,
    });
    if (campaign.secondaryButtonLabel && campaign.secondaryDestinationUrl) {
      buttons.push({
        label: campaign.secondaryButtonLabel,
        url: campaign.secondaryDestinationUrl,
      });
    }
  } else {
    buttons.push({
      label: "I Followed — Unlock Link ✅",
      url: campaign.trackedDestinationUrl,
    });
  }

  const logItem: OpenReplyDmLog = {
    id: `log-${Date.now()}`,
    automationId: campaign.id,
    commenterUsername: cleanUsername,
    commentText,
    matchedKeyword: matchResult.matchedKeyword,
    status: "delivered",
    dmSentAt: new Date().toISOString(),
    publicReplySentAt: publicReplyText ? new Date().toISOString() : undefined,
    publicReplyText,
    clickedLink: false,
  };

  return {
    matched: true,
    matchedKeyword: matchResult.matchedKeyword,
    publicReplyText,
    dmDeliveredText,
    buttons,
    followGated,
    logItem,
  };
}
