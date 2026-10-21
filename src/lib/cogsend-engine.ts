/**
 * CogSend Social Publishing & Thread Scheduling Engine
 * Adapted from cogsend (https://github.com/cogsend/cogsend) for Threadly Outreach.
 * Provides multi-destination publishing (X, Threads, Bluesky, LinkedIn, Mastodon),
 * grapheme-safe auto-split thread engine, platform character counters, link preview extraction,
 * and isolated destination retry handling.
 */

export const THREAD_DELIMITER = "\n---\n";
export const SPLIT_MARKER = "---";

export const PLATFORM_LIMITS = {
  x: 280,
  bluesky: 300,
  threads: 500,
  linkedin: 3000,
  mastodon: 500,
} as const;

export type SocialPlatform = keyof typeof PLATFORM_LIMITS;

export const SOCIAL_PLATFORMS: Array<{ id: SocialPlatform; name: string; limit: number; handle: string; color: string }> = [
  { id: "x", name: "X (Twitter)", limit: PLATFORM_LIMITS.x, handle: "@threadly_hq", color: "#000000" },
  { id: "bluesky", name: "Bluesky", limit: PLATFORM_LIMITS.bluesky, handle: "threadly.bsky.social", color: "#1185fe" },
  { id: "threads", name: "Threads", limit: PLATFORM_LIMITS.threads, handle: "@threadly_app", color: "#101010" },
  { id: "linkedin", name: "LinkedIn", limit: PLATFORM_LIMITS.linkedin, handle: "Threadly Technologies", color: "#0a66c2" },
  { id: "mastodon", name: "Mastodon", limit: PLATFORM_LIMITS.mastodon, handle: "@threadly@mastodon.social", color: "#6364ff" },
];

export const MAX_AUTO_SEGMENTS = 30;

/**
 * Grapheme iterator using Intl.Segmenter, with code point fallback.
 */
export function graphemes(text: string): string[] {
  try {
    return [...new Intl.Segmenter(undefined, { granularity: "grapheme" }).segment(text)].map((s) => s.segment);
  } catch {
    return [...text];
  }
}

export function countGraphemes(text: string): number {
  return graphemes(text).length;
}

function hardSliceByCount(text: string, maxChars: number, count: (s: string) => number): string[] {
  const parts: string[] = [];
  let current = "";
  for (const g of graphemes(text)) {
    if (current && count(current + g) > maxChars) {
      parts.push(current);
      current = g;
    } else {
      current += g;
    }
  }
  if (current) parts.push(current);
  return parts;
}

/**
 * Split long text into thread segments fitting a per-post character cap.
 * Follows Cogsend priority: explicit `---` delimiter, blank-line paragraphs,
 * sentence boundaries, then word wraps. Unbreakable runs are hard-sliced at grapheme boundaries.
 */
export function splitLongText(
  text: string,
  maxChars = 280,
  count: (s: string) => number = countGraphemes
): string[] {
  const trimmed = (text || "").replace(/\r\n/g, "\n").trim();
  if (!trimmed) return [""];
  if (count(trimmed) <= maxChars && !trimmed.includes(SPLIT_MARKER)) return [trimmed];

  // 1) Explicit delimiter is explicit user intent
  let blocks = trimmed.includes(SPLIT_MARKER)
    ? trimmed.split(new RegExp(`\\n?\\s*${SPLIT_MARKER}\\s*\\n?`, "g"))
    : [trimmed];

  // 2) Paragraph breaks
  blocks = blocks.flatMap((b) => b.split(/\n{2,}/));

  const out: string[] = [];
  let current = "";
  const flush = () => {
    const t = current.trim();
    if (t) out.push(t);
    current = "";
  };

  for (const block of blocks) {
    const t = block.trim();
    if (!t) continue;
    const merged = current ? `${current}\n\n${t}` : t;
    if (count(merged) <= maxChars) {
      current = merged;
      continue;
    }
    flush();

    // Sentence boundaries
    const sentences = t.match(/[^.!?\n]+[.!?]+["')\]]*\s*|[^.!?\n]+/g) ?? [t];
    for (const raw of sentences) {
      const sentence = raw.trim();
      if (!sentence) continue;
      const candidate = current ? `${current} ${sentence}` : sentence;
      if (count(candidate) <= maxChars) {
        current = candidate;
        continue;
      }
      flush();
      if (count(sentence) <= maxChars) {
        current = sentence;
        continue;
      }

      // Sentence alone exceeds cap: wrap on words
      for (const word of sentence.split(/\s+/)) {
        const withWord = current ? `${current} ${word}` : word;
        if (count(withWord) <= maxChars) {
          current = withWord;
          continue;
        }
        flush();
        if (count(word) <= maxChars) {
          current = word;
        } else {
          // One run longer than post (e.g. URL): hard slice
          const pieces = hardSliceByCount(word, maxChars, count);
          for (let i = 0; i < pieces.length; i++) {
            if (i < pieces.length - 1) out.push(pieces[i]);
            else current = pieces[i];
          }
        }
      }
    }
    flush();
  }
  flush();

  if (!out.length) return [trimmed];
  if (out.length > MAX_AUTO_SEGMENTS) {
    const head = out.slice(0, MAX_AUTO_SEGMENTS - 1);
    head.push(out.slice(MAX_AUTO_SEGMENTS - 1).join("\n\n"));
    return head;
  }
  return out;
}

export function splitThreadSegments(body: string): string[] {
  if (!body) return [""];
  const normalized = body.replace(/\r\n/g, "\n");
  if (!normalized.includes(THREAD_DELIMITER)) {
    if (normalized.includes("\n---\n") || normalized.startsWith("---\n") || normalized.endsWith("\n---")) {
      return normalized.split(/\n?---\n?/).map((s) => s.trim()).filter(Boolean);
    }
    return [normalized];
  }
  return normalized.split(THREAD_DELIMITER);
}

export function joinThreadSegments(segments: string[]): string {
  if (!segments.length) return "";
  if (segments.length === 1) return segments[0] ?? "";
  return segments.join(THREAD_DELIMITER);
}

/**
 * Extract first URL in text to simulate CogSend rich link preview card
 */
export function extractLinkPreview(text: string): { url: string; title: string; domain: string } | null {
  const match = text.match(/https?:\/\/[^\s$.?#].[^\s]*/i);
  if (!match) return null;
  const url = match[0];
  try {
    const parsed = new URL(url);
    const domain = parsed.hostname.replace(/^www\./, "");
    let title = domain;
    if (domain.includes("github.com")) title = "GitHub: Where the world builds software";
    else if (domain.includes("producthunt.com")) title = "Product Hunt – The best new products in tech";
    else if (domain.includes("cal.com") || domain.includes("calendly.com")) title = "Book a conversation · Calendar";
    else title = `${domain.charAt(0).toUpperCase() + domain.slice(1)} | Official Link`;
    return { url, title, domain };
  } catch {
    return null;
  }
}

export type DestinationStatus = "published" | "scheduled" | "failed" | "queued";

export type SocialDispatchItem = {
  id: string;
  leadId?: string | null;
  leadName?: string | null;
  baseBody: string;
  platforms: SocialPlatform[];
  platformOverrides: Partial<Record<SocialPlatform, string>>;
  segments: string[];
  scheduledAt: string | null;
  status: "draft" | "scheduled" | "published" | "partially_failed";
  createdAt: string;
  destinations: Record<SocialPlatform, {
    status: DestinationStatus;
    remoteId?: string;
    error?: string;
    publishedAt?: string;
  }>;
};

export const INITIAL_SAMPLE_DISPATCHES: SocialDispatchItem[] = [
  {
    id: "cs-post-1",
    leadName: "@growth_founder",
    baseBody: "Excited to share how we scaled customer acquisition by listening to live intent conversations across social channels. 🚀\n---\nBy switching to multi-channel outreach, response rates jumped from 4% to 22%. Here is the breakdown: https://threadly.app/playbook",
    platforms: ["x", "linkedin", "bluesky"],
    platformOverrides: {
      linkedin: "Excited to share how B2B teams are transforming outreach by monitoring public signals on social channels.\n\nTraditional cold outreach is yielding declining response rates. Modern teams achieve over 22% reply rates through contextual problem alignment.",
    },
    segments: [
      "Excited to share how we scaled customer acquisition by listening to live intent conversations across social channels. 🚀",
      "By switching to multi-channel outreach, response rates jumped from 4% to 22%. Here is the breakdown: https://threadly.app/playbook"
    ],
    scheduledAt: null,
    status: "published",
    createdAt: new Date(Date.now() - 3600000 * 2).toISOString(),
    destinations: {
      x: { status: "published", remoteId: "x-189283749", publishedAt: new Date(Date.now() - 3600000 * 2).toISOString() },
      linkedin: { status: "published", remoteId: "li-urn:activity:9827361", publishedAt: new Date(Date.now() - 3600000 * 2).toISOString() },
      bluesky: { status: "published", remoteId: "at://did:plc:threadly/app.bsky.feed.post/3kjs7d", publishedAt: new Date(Date.now() - 3600000 * 2).toISOString() },
      threads: { status: "queued" },
      mastodon: { status: "queued" },
    },
  },
  {
    id: "cs-post-2",
    leadName: "@techlead_dan",
    baseBody: "Why manual cold emailing is dying in 2026: founders want real-time solutions to existing problems, not canned templates.\n---\nCheck out our automated signal discovery pipeline at https://threadly.app",
    platforms: ["x", "threads"],
    platformOverrides: {},
    segments: [
      "Why manual cold emailing is dying in 2026: founders want real-time solutions to existing problems, not canned templates.",
      "Check out our automated signal discovery pipeline at https://threadly.app"
    ],
    scheduledAt: new Date(Date.now() + 3600000 * 24).toISOString(),
    status: "scheduled",
    createdAt: new Date().toISOString(),
    destinations: {
      x: { status: "scheduled" },
      threads: { status: "scheduled" },
      bluesky: { status: "queued" },
      linkedin: { status: "queued" },
      mastodon: { status: "queued" },
    },
  },
];
