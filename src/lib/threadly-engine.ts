import { randomUUID } from "node:crypto";
import { patchData, readData, writeData } from "./portal-db";
import type { Lead, Opportunity } from "./portal-data";
import { searchTavily } from "./tavily";

/* ============================================================
   Threadly growth engine
   Adds the modules that sit around the existing lead / outreach
   pipeline: campaigns, sequences, segments, best-time content
   slots, GEO visibility, lead scoring and the real-time feed.

   All state is stored in the same Firebase workspace tree as the
   rest of the portal, so it inherits auth + isolation for free.
   Demo mode uses a module-level store because the Firebase token
   is synthetic and cannot reach the network.
   ============================================================ */

export type CampaignChannel =
  | "google_search"
  | "google_display"
  | "linkedin"
  | "reddit"
  | "x"
  | "meta"
  | "organic";

export type ChannelAllocation = {
  channel: CampaignChannel;
  label: string;
  budget: number;
  spend: number;
  revenue: number;
  impressions: number;
  clicks: number;
  conversions: number;
  roas: number;
  trend: number;
};

export type CreativeVariant = {
  id: string;
  label: string;
  channel: CampaignChannel;
  format: "text" | "image" | "video" | "carousel";
  headline: string;
  status: "active" | "paused";
  ctr: number;
  cpa: number;
};

export type Campaign = {
  id: string;
  name: string;
  objective: string;
  status: "active" | "paused" | "draft" | "completed";
  startDate: string;
  endDate: string;
  budget: number;
  spend: number;
  revenue: number;
  roas: number;
  conversions: number;
  targetRoas: number;
  autoOptimize: boolean;
  channels: ChannelAllocation[];
  creatives: CreativeVariant[];
  notes: string;
  created_at: string;
  updated_at: string;
};

export type SequenceStep = {
  id: string;
  order: number;
  channel: "email" | "linkedin" | "x" | "task";
  subject: string;
  body: string;
  delayDays: number;
  variantB?: string;
  sendOnWeekdaysOnly: boolean;
};

export type SequenceRunStatus = "active" | "paused" | "completed" | "replied" | "bounced";

export type SequenceRun = {
  id: string;
  leadId: string;
  leadName: string;
  email?: string;
  status: SequenceRunStatus;
  currentStep: number;
  enrolled_at: string;
  last_sent_at?: string | null;
  next_send_at?: string | null;
  opens: number;
  clicks: number;
  replied_at?: string | null;
  variant: "A" | "B";
};

export type Sequence = {
  id: string;
  name: string;
  description: string;
  status: "active" | "paused" | "draft";
  steps: SequenceStep[];
  runs: SequenceRun[];
  sendWindowStart: string;
  sendWindowEnd: string;
  timezone: string;
  created_at: string;
  updated_at: string;
};

export type SegmentRule = {
  field: "intent" | "stage" | "fit" | "source" | "replied" | "score";
  operator: "is" | "is_not" | "greater_than" | "contains";
  value: string;
};

export type Segment = {
  id: string;
  name: string;
  description: string;
  color: "orange" | "violet" | "ink";
  rules: SegmentRule[];
  leadIds: string[];
  created_at: string;
  updated_at: string;
};

export type ContentSlot = {
  id: string;
  draftId: string | null;
  title: string;
  channel: "x" | "linkedin" | "reddit" | "newsletter" | "blog";
  group: string;
  scheduledFor: string;
  score: number;
  reason: string;
  status: "planned" | "approved" | "published" | "skipped";
  created_at: string;
};

export type GeoEngine = "chatgpt" | "gemini" | "tavily";
export type GeoSource = { title: string; url: string };
export type GeoEngineResult = {
  engine: GeoEngine;
  status: "not_scanned" | "scanned" | "not_configured" | "failed";
  cited: boolean;
  rank: number | null;
  answer: string;
  sources: GeoSource[];
  scannedAt?: string;
  error?: string;
};

export type GeoQuery = {
  id: string;
  query: string;
  intent: "commercial" | "comparison" | "informational";
  volume: number;
  difficulty: number;
  shareOfAnswer: number;
  ownedPages: number;
  engines: GeoEngineResult[];
  gap: string;
  lastScannedAt: string;
  trend: number;
};

export type LiveEventKind =
  | "signal"
  | "qualify"
  | "outreach"
  | "reply"
  | "campaign"
  | "schedule"
  | "geo"
  | "workflow"
  | "team";

export type LiveEvent = {
  id: string;
  kind: LiveEventKind;
  title: string;
  detail: string;
  actor: string;
  tone: "orange" | "violet" | "ink" | "ok";
  occurred_at: string;
  /** Only for demo: how many seconds into the loop this event appears. */
  loopOffset?: number;
};

export type LeadScore = {
  leadId: string;
  score: number;
  fit: "strong" | "possible" | "weak";
  intent: number;
  engagement: number;
  recency: number;
  reasons: string[];
  updated_at: string;
};

export type AdSpendRecord = {
  id: string;
  campaignId: string;
  channel: CampaignChannel;
  amount: number;
  revenue: number;
  conversions: number;
  date: string;
  created_at: string;
};

export type GrowthSnapshot = {
  generatedAt: string;
  campaigns: Campaign[];
  sequences: Sequence[];
  segments: Segment[];
  slots: ContentSlot[];
  geo: GeoQuery[];
  events: LiveEvent[];
  scores: LeadScore[];
  metrics: {
    pipelineValue: number;
    attributedRevenue: number;
    adSpend: number;
    blendedRoas: number;
    activeCampaigns: number;
    enrolledProspects: number;
    replyRate: number;
    openRate: number;
    scheduledThisWeek: number;
    geoShare: number;
    qualifiedLeads: number;
    conversionRate: number;
  };
};

export type GrowthState = {
  campaigns: Campaign[];
  sequences: Sequence[];
  segments: Segment[];
  slots: ContentSlot[];
  geo: GeoQuery[];
  scores: LeadScore[];
  spend: AdSpendRecord[];
  seededAt: string;
};

/* ------------------------------------------------------------
   Deterministic pseudo-random helpers
   ------------------------------------------------------------ */

export function hashString(input: string): number {
  let hash = 2166136261;
  for (let index = 0; index < input.length; index += 1) {
    hash ^= input.charCodeAt(index);
    hash = Math.imul(hash, 16777619);
  }
  return hash >>> 0;
}

/** Stable float in [0, 1) derived from a seed + salt. */
export function seededUnit(seed: string, salt = ""): number {
  const hash = hashString(`${seed}::${salt}`);
  return (hash % 100000) / 100000;
}

export function seededInt(seed: string, salt: string, min: number, max: number): number {
  return Math.floor(min + seededUnit(seed, salt) * (max - min + 1));
}

export function jitter(seed: string, salt: string, magnitude = 0.06): number {
  return 1 + (seededUnit(seed, salt) - 0.5) * 2 * magnitude;
}

const now = () => new Date().toISOString();
const addDays = (date: string, days: number) => {
  const next = new Date(date);
  next.setDate(next.getDate() + days);
  return next.toISOString();
};

const channelLabels: Record<CampaignChannel, string> = {
  google_search: "Google Search",
  google_display: "Google Display",
  linkedin: "LinkedIn",
  reddit: "Reddit",
  x: "X",
  meta: "Meta",
  organic: "Organic",
};

/* ------------------------------------------------------------
   Demo fixtures — a workspace that looks like a real quarter
   ------------------------------------------------------------ */

function buildChannels(seed: string, budget: number): ChannelAllocation[] {
  const mix: { channel: CampaignChannel; share: number; roas: number }[] = [
    { channel: "google_search", share: 0.36, roas: 3.42 },
    { channel: "linkedin", share: 0.24, roas: 2.18 },
    { channel: "reddit", share: 0.16, roas: 2.86 },
    { channel: "meta", share: 0.14, roas: 1.28 },
    { channel: "x", share: 0.1, roas: 1.74 },
  ];
  return mix.map((entry) => {
    const spend = Math.round(budget * entry.share * jitter(seed, entry.channel, 0.08));
    const roas = Number((entry.roas * jitter(seed, `${entry.channel}-roas`, 0.12)).toFixed(2));
    return {
      channel: entry.channel,
      label: channelLabels[entry.channel],
      budget: Math.round(budget * entry.share),
      spend,
      revenue: Math.round(spend * roas),
      impressions: seededInt(seed, `${entry.channel}-imp`, 4000, 92000),
      clicks: seededInt(seed, `${entry.channel}-clk`, 180, 5200),
      conversions: Math.max(1, Math.round(spend / seededInt(seed, `${entry.channel}-cpa`, 42, 180))),
      roas,
      trend: Number((seededUnit(seed, `${entry.channel}-trend`) * 0.7 - 0.22).toFixed(2)),
    };
  });
}

function buildCampaign(seed: string, index: number): Campaign {
  const names = ["Q4 Pipeline Sprint", "Founder-Led Outbound", "AI Answer Takeover", "Category Launch"];
  const objectives = [
    "Book qualified discovery calls",
    "Reactivate stalled pipeline",
    "Own the “outreach automation” answer",
    "Introduce Threadly 2.0 to existing accounts",
  ];
  const budget = [12000, 7200, 4800, 3000][index] ?? 5000;
  const channels = buildChannels(`${seed}-${index}`, budget);
  const spend = channels.reduce((total, channel) => total + channel.spend, 0);
  const revenue = channels.reduce((total, channel) => total + channel.revenue, 0);
  const creatives: CreativeVariant[] = [
    {
      id: `cr-${index}-a`,
      label: "Pain-first headline",
      channel: index === 0 ? "google_search" : "linkedin",
      format: "text",
      headline: "Your buyers are describing the problem. Can you hear them?",
      status: "active",
      ctr: Number((3.4 + seededUnit(seed, `${index}-ctr-a`) * 1.9).toFixed(2)),
      cpa: seededInt(seed, `${index}-cpa-a`, 48, 120),
    },
    {
      id: `cr-${index}-b`,
      label: "Proof-led variant",
      channel: index === 0 ? "reddit" : "x",
      format: "image",
      headline: "2.4× blended ROAS. One workspace.",
      status: index === 3 ? "paused" : "active",
      ctr: Number((2.6 + seededUnit(seed, `${index}-ctr-b`) * 1.6).toFixed(2)),
      cpa: seededInt(seed, `${index}-cpa-b`, 55, 140),
    },
    {
      id: `cr-${index}-c`,
      label: "Founder story",
      channel: "linkedin",
      format: "carousel",
      headline: "We stopped guessing and started listening.",
      status: index === 0 ? "active" : "paused",
      ctr: Number((1.8 + seededUnit(seed, `${index}-ctr-c`) * 1.2).toFixed(2)),
      cpa: seededInt(seed, `${index}-cpa-c`, 70, 165),
    },
  ];

  return {
    id: `cmp-${index + 1}-${hashString(`${seed}-${index}`).toString(36).slice(0, 6)}`,
    name: names[index] ?? `Campaign ${index + 1}`,
    objective: objectives[index] ?? "Grow pipeline",
    status: index === 3 ? "draft" : "active",
    startDate: addDays(new Date().toISOString(), -30 + index * 4),
    endDate: addDays(new Date().toISOString(), 30 - index * 2),
    budget,
    spend,
    revenue,
    roas: Number((revenue / Math.max(1, spend)).toFixed(2)),
    conversions: channels.reduce((total, channel) => total + channel.conversions, 0),
    targetRoas: index === 0 ? 3 : 2.2,
    autoOptimize: index < 2,
    channels,
    creatives,
    notes: index === 0 ? "Hero campaign for the 2.0 launch." : "",
    created_at: addDays(new Date().toISOString(), -30 + index * 4),
    updated_at: now(),
  };
}

function buildSequence(seed: string, leads: Lead[]): Sequence {
  const steps: SequenceStep[] = [
    {
      id: "st-1",
      order: 1,
      channel: "email",
      subject: "Saw your note on {{topic}}",
      body:
        "Hi {{firstName}},\n\nYour thread about {{pain}} stuck with me — we built Threadly for exactly that gap.\n\nWorth a 15-minute look?",
      delayDays: 0,
      variantB: "Quick question about {{pain}}",
      sendOnWeekdaysOnly: true,
    },
    {
      id: "st-2",
      order: 2,
      channel: "email",
      subject: "One idea for {{company}}",
      body:
        "Hi {{firstName}},\n\nFollowing up with something actionable: the teams winning here capture the conversation before it becomes a search query.\n\nHappy to share the playbook.",
      delayDays: 3,
      variantB: "The playbook {{company}} is missing",
      sendOnWeekdaysOnly: true,
    },
    {
      id: "st-3",
      order: 3,
      channel: "linkedin",
      subject: "Worth a quick chat?",
      body: "Short, useful, no pitch: want me to send the 2-page breakdown of how similar teams are doing this?",
      delayDays: 5,
      sendOnWeekdaysOnly: false,
    },
  ];

  const runs: SequenceRun[] = leads.slice(0, 6).map((lead, index) => {
    const runSeed = `${seed}-${lead.id}`;
    const statuses: SequenceRunStatus[] = ["active", "active", "replied", "active", "paused", "completed"];
    const status = statuses[index % statuses.length];
    return {
      id: `run-${hashString(runSeed).toString(36).slice(0, 8)}`,
      leadId: lead.id,
      leadName: lead.name,
      email: lead.email,
      status,
      currentStep: seededInt(runSeed, "step", 1, 3),
      enrolled_at: addDays(now(), -seededInt(runSeed, "age", 1, 14)),
      last_sent_at: addDays(now(), -seededInt(runSeed, "sent", 0, 3)),
      next_send_at: status === "active" ? addDays(now(), seededInt(runSeed, "next", 1, 4)) : null,
      opens: seededInt(runSeed, "opens", 0, 7),
      clicks: seededInt(runSeed, "clicks", 0, 3),
      replied_at: status === "replied" ? addDays(now(), -seededInt(runSeed, "reply", 0, 2)) : null,
      variant: index % 2 === 0 ? "A" : "B",
    };
  });

  return {
    id: `seq-${hashString(seed).toString(36).slice(0, 6)}`,
    name: "Warm Signal → Discovery",
    description:
      "Three-step, human-reviewed sequence for prospects who arrived from a live pain-point signal.",
    status: "active",
    steps,
    runs,
    sendWindowStart: "08:00",
    sendWindowEnd: "17:30",
    timezone: "America/New_York",
    created_at: addDays(now(), -21),
    updated_at: now(),
  };
}

function buildSegments(seed: string, leads: Lead[]): Segment[] {
  const qualified = leads.filter((lead) => ["qualified", "conversation", "converted"].includes(lead.stage));
  const engaged = leads.filter((lead) => lead.stage === "engaged");
  const base: Segment[] = [
    {
      id: "seg-hot",
      name: "Hot signals",
      description: "Strong fit + high buying intent in the last 14 days.",
      color: "orange",
      rules: [
        { field: "intent", operator: "is", value: "High" },
        { field: "fit", operator: "is", value: "strong" },
      ],
      leadIds: qualified.map((lead) => lead.id),
      created_at: addDays(now(), -18),
      updated_at: now(),
    },
    {
      id: "seg-followup",
      name: "Engaged, no reply",
      description: "Opened the thread but hasn't responded yet.",
      color: "violet",
      rules: [
        { field: "stage", operator: "is", value: "engaged" },
        { field: "replied", operator: "is", value: "false" },
      ],
      leadIds: engaged.map((lead) => lead.id),
      created_at: addDays(now(), -12),
      updated_at: now(),
    },
    {
      id: "seg-expand",
      name: "Lookalikes to expand",
      description: "Possible fit, same source as closed-won accounts.",
      color: "ink",
      rules: [{ field: "fit", operator: "is", value: "possible" }],
      leadIds: leads.filter((lead) => lead.qualification?.fit === "possible_fit").map((lead) => lead.id),
      created_at: addDays(now(), -6),
      updated_at: now(),
    },
  ];
  return base.map((segment) => ({ ...segment, id: `${segment.id}-${seed.slice(0, 4)}` }));
}

function buildSlots(seed: string): ContentSlot[] {
  const anchor = new Date();
  const day = (offset: number, hour: number) => {
    const date = new Date(anchor);
    date.setDate(date.getDate() + offset);
    date.setHours(hour, 0, 0, 0);
    return date.toISOString();
  };
  const base: ContentSlot[] = [
    {
      id: "slot-1",
      draftId: null,
      title: "Why cold outreach stopped working",
      channel: "x",
      group: "Authority thread",
      scheduledFor: day(1, 14),
      score: 92,
      reason: "Your audience replies most between 13:00–15:00 on Tuesdays.",
      status: "approved",
      created_at: now(),
    },
    {
      id: "slot-2",
      draftId: null,
      title: "The 6-minute signal → outreach loop",
      channel: "linkedin",
      group: "Authority thread",
      scheduledFor: day(2, 8),
      score: 88,
      reason: "Wednesday morning outperforms on LinkedIn by 41%.",
      status: "planned",
      created_at: now(),
    },
    {
      id: "slot-3",
      draftId: null,
      title: "Teardown: which AI engines cite you?",
      channel: "newsletter",
      group: "GEO series",
      scheduledFor: day(4, 9),
      score: 81,
      reason: "Newsletter opens peak Thursday 09:00 for your segment.",
      status: "planned",
      created_at: now(),
    },
    {
      id: "slot-4",
      draftId: null,
      title: "Ask me anything: pipeline teardown",
      channel: "reddit",
      group: "Community",
      scheduledFor: day(6, 18),
      score: 76,
      reason: "Community engagement is highest Sunday evening.",
      status: "planned",
      created_at: now(),
    },
  ];
  return base.map((slot) => ({ ...slot, id: `${slot.id}-${seed.slice(0, 4)}` }));
}

function buildGeo(seed: string): GeoQuery[] {
  void seed;
  return [];
}

function buildEvents(seed: string): LiveEvent[] {
  const fixtures: Omit<LiveEvent, "id" | "occurred_at" | "loopOffset">[] = [
    { kind: "signal", title: "New signal · High intent", detail: "Buyer asking for an outreach tool that doesn't feel robotic.", actor: "Signal Radar", tone: "orange" },
    { kind: "qualify", title: "Prospect scored 91", detail: "Strong fit · 87% buying intent · 2 reasons surfaced.", actor: "Lead Intelligence", tone: "violet" },
    { kind: "outreach", title: "Step 2 delivered", detail: "Variant B opened by 41% of recipients so far.", actor: "Sequence Engine", tone: "orange" },
    { kind: "campaign", title: "Budget shifted", detail: "$240 moved into Google Search after ROAS crossed 3.1×.", actor: "Campaign Command", tone: "violet" },
    { kind: "schedule", title: "Slot approved", detail: "“Why cold outreach stopped working” queued for Tue 14:00.", actor: "Scheduler", tone: "orange" },
    { kind: "geo", title: "GEO question tracked", detail: "Run a provider scan to collect grounded answers and source citations.", actor: "GEO Monitor", tone: "violet" },
    { kind: "reply", title: "Prospect replied", detail: "“Send the playbook — we're evaluating this quarter.”", actor: "Outreach", tone: "orange" },
    { kind: "workflow", title: "Workflow executed", detail: "Auto-qualify ran across 4 new signals.", actor: "Automation", tone: "violet" },
    { kind: "signal", title: "New signal · Reddit", detail: "r/SaaS thread: “what replaced cold email for you?”", actor: "Signal Radar", tone: "orange" },
    { kind: "campaign", title: "Creative paused", detail: "“Founder story” CPA 2.1× above target on LinkedIn.", actor: "Campaign Command", tone: "ink" },
    { kind: "qualify", title: "Segment updated", detail: "“Hot signals” grew to 12 members.", actor: "Lead Intelligence", tone: "violet" },
    { kind: "team", title: "Workspace note", detail: "Elena flagged 3 prospects for founder review.", actor: "Team", tone: "ink" },
  ];

  return fixtures.map((event, index) => ({
    ...event,
    id: `evt-${hashString(`${seed}-${index}`).toString(36).slice(0, 8)}`,
    occurred_at: addDays(now(), -Math.floor(index / 4)),
    loopOffset: index * 7,
  }));
}

/* ------------------------------------------------------------
   Demo store (session memory, per workspace)
   ------------------------------------------------------------ */

const demoGrowth = new Map<string, GrowthState>();

function buildInitialState(uid: string, leads: Lead[]): GrowthState {
  const seed = `threadly-${uid}`;
  return {
    campaigns: [buildCampaign(seed, 0), buildCampaign(seed, 1), buildCampaign(seed, 2), buildCampaign(seed, 3)],
    sequences: [buildSequence(seed, leads)],
    segments: buildSegments(seed, leads),
    slots: buildSlots(seed),
    geo: buildGeo(seed),
    scores: leads.map((lead) => scoreLead(lead, seed)),
    spend: [],
    seededAt: now(),
  };
}

export function scoreLead(lead: Lead, seed = "local"): LeadScore {
  const fitConfidence = lead.qualification?.fitConfidence ?? seededUnit(seed, `${lead.id}-fit`) * 0.4 + 0.3;
  const buyingIntent = lead.qualification?.buyingIntent ?? seededUnit(seed, `${lead.id}-intent`) * 0.5 + 0.2;
  const stageWeight: Record<string, number> = {
    identified: 0.2,
    engaged: 0.45,
    qualified: 0.72,
    conversation: 0.86,
    converted: 1,
  };
  const engagement = stageWeight[lead.stage] ?? 0.3;
  const ageDays = Math.max(
    0,
    (Date.now() - new Date(lead.created_at || now()).getTime()) / 86400000,
  );
  const recency = Math.max(0.1, 1 - ageDays / 30);
  const score = Math.round(
    (fitConfidence * 0.34 + buyingIntent * 0.3 + engagement * 0.22 + recency * 0.14) * 100,
  );
  const fit = score >= 78 ? "strong" : score >= 52 ? "possible" : "weak";

  const reasons: string[] = [];
  if (buyingIntent > 0.7) reasons.push("Actively describing the problem");
  if (engagement >= 0.7) reasons.push("Already in your pipeline");
  if (fitConfidence > 0.75) reasons.push("Matches your ICP closely");
  if (recency > 0.8) reasons.push("Engaged within the last week");
  if (lead.email) reasons.push("Reachable email on file");
  if (!reasons.length) reasons.push("Insufficient signal — verify manually");

  return {
    leadId: lead.id,
    score,
    fit,
    intent: Math.round(buyingIntent * 100),
    engagement: Math.round(engagement * 100),
    recency: Math.round(recency * 100),
    reasons: reasons.slice(0, 4),
    updated_at: now(),
  };
}

async function readGrowth(uid: string, leads: Lead[]): Promise<GrowthState> {
  const isDemo = uid === "demo-founder-uid";
  if (isDemo) {
    const existing = demoGrowth.get(uid);
    if (existing) return existing;
    const seeded = buildInitialState(uid, leads);
    demoGrowth.set(uid, seeded);
    return seeded;
  }

  const stored = await readData<Partial<GrowthState>>("growth");
  const defaults = buildInitialState(uid, leads);
  if (!stored || typeof stored !== "object" || !stored.seededAt) {
    await writeData("growth", defaults);
    return defaults;
  }

  // Realtime Database can omit empty collections, and older/partial records may
  // have a seededAt timestamp without every collection. Normalize those records
  // on read so one missing array cannot take down the entire authenticated app.
  const asList = <T,>(value: unknown, fallback: T[]): T[] => {
    if (Array.isArray(value)) return value as T[];
    if (value && typeof value === "object") {
      return Object.keys(value as Record<string, unknown>)
        .sort((left, right) => Number(left) - Number(right))
        .map((key) => (value as Record<string, T>)[key]);
    }
    return fallback;
  };
  const isRecord = (value: unknown): value is Record<string, unknown> =>
    Boolean(value) && typeof value === "object" && !Array.isArray(value);

  const campaigns = asList<Campaign>(stored.campaigns, defaults.campaigns).map((item, index) => {
    const fallback = defaults.campaigns[index] ?? defaults.campaigns[0];
    const record: Record<string, unknown> = isRecord(item) ? item : {};
    return {
      ...fallback,
      ...record,
      channels: asList(record.channels, fallback.channels),
      creatives: asList(record.creatives, fallback.creatives),
    } as Campaign;
  });
  const sequences = asList<Sequence>(stored.sequences, defaults.sequences).map((item, index) => {
    const fallback = defaults.sequences[index] ?? defaults.sequences[0];
    const record: Record<string, unknown> = isRecord(item) ? item : {};
    return {
      ...fallback,
      ...record,
      steps: asList(record.steps, fallback.steps),
      runs: asList(record.runs, fallback.runs),
    } as Sequence;
  });
  const segments = asList<Segment>(stored.segments, defaults.segments).map((item, index) => {
    const fallback = defaults.segments[index] ?? defaults.segments[0];
    const record: Record<string, unknown> = isRecord(item) ? item : {};
    return {
      ...fallback,
      ...record,
      rules: asList(record.rules, fallback.rules),
      leadIds: asList(record.leadIds, fallback.leadIds),
    } as Segment;
  });
  const geo = asList<GeoQuery>(stored.geo, defaults.geo)
    // Remove the old seeded GEO examples. Their answers and citation metrics were illustrative only.
    .filter((item) => !/^geo-[1-5]$/.test(item.id))
    .map((item) => {
      const record: Record<string, unknown> = isRecord(item) ? item : {};
      const previousEngines = asList<GeoEngineResult>(record.engines, []);
      const migratedSample = previousEngines.some((engine) => !["chatgpt", "gemini"].includes(engine.engine) || !engine.status || !Array.isArray(engine.sources));
      // Only show supported providers. Older saved answers were illustrative and are reset for a live scan.
      const engines = (["chatgpt", "gemini"] as GeoEngine[]).map((name) => {
        const previous = previousEngines.find((engine) => engine.engine === name);
        return previous?.status && Array.isArray(previous.sources)
          ? previous
          : { engine: name, status: "not_scanned", cited: false, rank: null, answer: "Run a scan to check this provider.", sources: [] } as GeoEngineResult;
      });
      return { ...record, engines, ...(migratedSample ? { shareOfAnswer: 0, trend: 0, lastScannedAt: "Not scanned", volume: 0, difficulty: 0, ownedPages: 0 } : {}) } as GeoQuery;
    });

  const normalized: GrowthState = {
    ...defaults,
    ...stored,
    campaigns,
    sequences,
    segments,
    slots: asList(stored.slots, defaults.slots),
    geo,
    scores: asList(stored.scores, defaults.scores),
    spend: asList(stored.spend, defaults.spend),
    seededAt: stored.seededAt,
  };

  if (JSON.stringify(normalized) !== JSON.stringify(stored)) {
    await writeData("growth", normalized);
  }
  return normalized;
}

async function saveGrowth(uid: string, state: GrowthState) {
  if (uid === "demo-founder-uid") {
    demoGrowth.set(uid, state);
    return;
  }
  await writeData("growth", state);
}

/* ------------------------------------------------------------
   Live derivation — every read recomputes the loop position so
   the demo feels alive without mutating stored state.
   ------------------------------------------------------------ */

function liveCampaign(campaign: Campaign, loop: number, salt: string): Campaign {
  const drift = Math.sin((loop + hashString(campaign.id) % 40) / 17);
  const spend = Math.round(campaign.spend * (1 + drift * 0.004));
  const revenue = Math.round(campaign.revenue * (1 + drift * 0.007));
  const channels = campaign.channels.map((channel, index) => {
    const channelDrift = Math.sin((loop + index * 23) / 19);
    const channelSpend = Math.round(channel.spend * (1 + channelDrift * 0.006));
    return {
      ...channel,
      spend: channelSpend,
      revenue: Math.round(channel.revenue * (1 + channelDrift * 0.01)),
      roas: Number((channel.roas * (1 + channelDrift * 0.01)).toFixed(2)),
      trend: Number((channel.trend + channelDrift * 0.02).toFixed(2)),
    };
  });
  const totalRevenue = channels.reduce((total, channel) => total + channel.revenue, 0);
  return {
    ...campaign,
    spend,
    revenue,
    channels,
    roas: Number((totalRevenue / Math.max(1, spend)).toFixed(2)),
    updated_at: new Date().toISOString(),
    notes: salt ? campaign.notes : campaign.notes,
  };
}

function liveSequence(sequence: Sequence, loop: number): Sequence {
  const runs = sequence.runs.map((run) => {
    if (run.status !== "active") return run;
    const drift = Math.sin((loop + hashString(run.id) % 30) / 21);
    return {
      ...run,
      opens: Math.max(0, run.opens + (drift > 0.85 ? 1 : 0)),
      clicks: Math.max(0, run.clicks + (drift > 0.96 ? 1 : 0)),
    };
  });
  return { ...sequence, runs };
}

function liveEvents(events: LiveEvent[], loop: number): LiveEvent[] {
  const nowMs = Date.now();
  return events.map((event, index) => {
    const offset = (event.loopOffset ?? index * 7) % 120;
    const secondsAgo = ((loop + offset) % 120) + 1;
    return {
      ...event,
      id: `${event.id}-${Math.floor(nowMs / 6000)}-${index}`,
      occurred_at: new Date(nowMs - secondsAgo * 1000).toISOString(),
    };
  });
}

/* ------------------------------------------------------------
   Public API
   ------------------------------------------------------------ */

export async function getGrowthSnapshot(uid: string, leads: Lead[]): Promise<GrowthSnapshot> {
  const state = await readGrowth(uid, leads);
  const loop = Math.floor(Date.now() / 6000) % 120;

  const campaigns = state.campaigns.map((campaign) =>
    liveCampaign(campaign, loop, uid),
  );
  const sequences = state.sequences.map((sequence) => liveSequence(sequence, loop));
  const events = liveEvents(buildEvents(`threadly-${uid}`), loop).sort((a, b) =>
    b.occurred_at.localeCompare(a.occurred_at),
  );
  const scores = leads.map((lead) =>
    state.scores.find((score) => score.leadId === lead.id) ?? scoreLead(lead, uid),
  );

  const totalSpend = campaigns.reduce((total, campaign) => total + campaign.spend, 0);
  const totalRevenue = campaigns.reduce((total, campaign) => total + campaign.revenue, 0);
  const allRuns = sequences.flatMap((sequence) => sequence.runs);
  const sent = allRuns.length;
  const replied = allRuns.filter((run) => run.status === "replied").length;
  const opened = allRuns.filter((run) => run.opens > 0).length;
  const qualified = leads.filter((lead) =>
    ["qualified", "conversation", "converted"].includes(lead.stage),
  ).length;
  const converted = leads.filter((lead) => lead.stage === "converted").length;

  const completedGeoScans = state.geo.flatMap((query) => query.engines).filter((engine) => engine.status === "scanned");
  const geoShare = completedGeoScans.length
    ? Math.round((completedGeoScans.filter((engine) => engine.cited).length / completedGeoScans.length) * 100)
    : 0;

  const scheduledThisWeek = state.slots.filter((slot) => {
    const when = new Date(slot.scheduledFor).getTime();
    const diff = when - Date.now();
    return diff > -86400000 && diff < 7 * 86400000;
  }).length;

  const pipelineValue = leads.reduce((total, lead) => {
    const weight: Record<string, number> = {
      identified: 0.08,
      engaged: 0.16,
      qualified: 0.34,
      conversation: 0.6,
      converted: 1,
    };
    return total + (weight[lead.stage] ?? 0.1) * 4800;
  }, 0);

  return {
    generatedAt: now(),
    campaigns,
    sequences,
    segments: state.segments,
    slots: [...state.slots].sort((a, b) => a.scheduledFor.localeCompare(b.scheduledFor)),
    geo: state.geo,
    events: events.slice(0, 14),
    scores,
    metrics: {
      pipelineValue: Math.round(pipelineValue),
      attributedRevenue: totalRevenue,
      adSpend: totalSpend,
      blendedRoas: Number((totalRevenue / Math.max(1, totalSpend)).toFixed(2)),
      activeCampaigns: campaigns.filter((campaign) => campaign.status === "active").length,
      enrolledProspects: allRuns.length,
      replyRate: sent ? Math.round((replied / sent) * 100) : 0,
      openRate: sent ? Math.round((opened / sent) * 100) : 0,
      scheduledThisWeek,
      geoShare,
      qualifiedLeads: qualified,
      conversionRate: qualified ? Math.round((converted / qualified) * 100) : 0,
    },
  };
}

/* ------------------------------------------------------------
   Campaigns
   ------------------------------------------------------------ */

export async function createCampaign(
  uid: string,
  leads: Lead[],
  input: {
    name: string;
    objective?: string;
    budget: number;
    targetRoas?: number;
    channels?: CampaignChannel[];
  },
): Promise<Campaign> {
  if (!input.name.trim()) throw new Error("Campaign name is required.");
  if (!Number.isFinite(input.budget) || input.budget <= 0 || input.budget > 5_000_000) {
    throw new Error("Enter a budget between $1 and $5,000,000.");
  }
  const state = await readGrowth(uid, leads);
  const seed = `${uid}-${input.name}-${state.campaigns.length}`;
  const requested = input.channels?.length
    ? input.channels
    : (["google_search", "linkedin", "reddit"] as CampaignChannel[]);
  const share = 1 / requested.length;
  const channels: ChannelAllocation[] = requested.map((channel, index) => {
    const spend = Math.round(input.budget * share * jitter(seed, `spend-${channel}`, 0.08));
    return {
      channel,
      label: channelLabels[channel],
      budget: Math.round(input.budget * share),
      spend,
      revenue: 0,
      impressions: 0,
      clicks: 0,
      conversions: 0,
      roas: 0,
      trend: 0,
    };
  });

  const campaign: Campaign = {
    id: `cmp-${randomUUID()}`,
    name: input.name.trim(),
    objective: input.objective?.trim() || "Book qualified discovery calls",
    status: "draft",
    startDate: now(),
    endDate: addDays(now(), 30),
    budget: Math.round(input.budget),
    spend: 0,
    revenue: 0,
    roas: 0,
    conversions: 0,
    targetRoas: input.targetRoas && input.targetRoas > 0 ? input.targetRoas : 2.5,
    autoOptimize: true,
    channels,
    creatives: [],
    notes: "Created from the Threadly workspace.",
    created_at: now(),
    updated_at: now(),
  };

  state.campaigns.unshift(campaign);
  await saveGrowth(uid, state);
  return campaign;
}

export async function optimizeCampaign(
  uid: string,
  leads: Lead[],
  campaignId: string,
): Promise<{ campaign: Campaign; moved: number; from: CampaignChannel; to: CampaignChannel; reason: string }> {
  const state = await readGrowth(uid, leads);
  const campaign = state.campaigns.find((item) => item.id === campaignId);
  if (!campaign) throw new Error("Campaign not found.");
  if (campaign.channels.length < 2) throw new Error("Add at least two channels before optimizing.");

  const ranked = [...campaign.channels].sort((a, b) => b.roas - a.roas);
  const best = ranked[0];
  const worst = ranked[ranked.length - 1];
  const shift = Math.max(50, Math.round(worst.spend * 0.15));

  campaign.channels = campaign.channels.map((channel) => {
    if (channel.channel === worst.channel) {
      return { ...channel, spend: Math.max(0, channel.spend - shift), budget: Math.max(0, channel.budget - shift) };
    }
    if (channel.channel === best.channel) {
      return { ...channel, spend: channel.spend + shift, budget: channel.budget + shift };
    }
    return channel;
  });

  campaign.autoOptimize = true;
  campaign.updated_at = now();
  campaign.spend = campaign.channels.reduce((total, channel) => total + channel.spend, 0);
  campaign.revenue = campaign.channels.reduce((total, channel) => total + channel.revenue, 0);
  campaign.roas = Number((campaign.revenue / Math.max(1, campaign.spend)).toFixed(2));

  await saveGrowth(uid, state);
  return {
    campaign,
    moved: shift,
    from: worst.channel,
    to: best.channel,
    reason: `${channelLabels[best.channel]} is returning ${best.roas.toFixed(2)}× against ${channelLabels[worst.channel]} at ${worst.roas.toFixed(2)}×.`,
  };
}

export async function toggleCampaign(
  uid: string,
  leads: Lead[],
  campaignId: string,
  status: Campaign["status"],
) {
  const state = await readGrowth(uid, leads);
  const campaign = state.campaigns.find((item) => item.id === campaignId);
  if (!campaign) throw new Error("Campaign not found.");
  campaign.status = status;
  campaign.updated_at = now();
  await saveGrowth(uid, state);
}

export async function recordAdSpend(
  uid: string,
  leads: Lead[],
  input: { campaignId: string; channel: CampaignChannel; amount: number; revenue?: number; conversions?: number },
) {
  const state = await readGrowth(uid, leads);
  const campaign = state.campaigns.find((item) => item.id === input.campaignId);
  if (!campaign) throw new Error("Campaign not found.");
  if (!Number.isFinite(input.amount) || input.amount <= 0) throw new Error("Enter a spend amount above zero.");

  const record: AdSpendRecord = {
    id: randomUUID(),
    campaignId: campaign.id,
    channel: input.channel,
    amount: input.amount,
    revenue: input.revenue ?? 0,
    conversions: input.conversions ?? 0,
    date: now(),
    created_at: now(),
  };
  state.spend.unshift(record);
  state.spend = state.spend.slice(0, 500);

  campaign.channels = campaign.channels.map((channel) =>
    channel.channel === input.channel
      ? {
          ...channel,
          spend: channel.spend + input.amount,
          revenue: channel.revenue + (input.revenue ?? 0),
          conversions: channel.conversions + (input.conversions ?? 0),
          roas: Number(
            ((channel.revenue + (input.revenue ?? 0)) / Math.max(1, channel.spend + input.amount)).toFixed(2),
          ),
        }
      : channel,
  );
  campaign.spend = campaign.channels.reduce((total, channel) => total + channel.spend, 0);
  campaign.revenue = campaign.channels.reduce((total, channel) => total + channel.revenue, 0);
  campaign.roas = Number((campaign.revenue / Math.max(1, campaign.spend)).toFixed(2));
  campaign.updated_at = now();

  await saveGrowth(uid, state);
  return record;
}

/* ------------------------------------------------------------
   Sequences
   ------------------------------------------------------------ */

export async function createSequence(
  uid: string,
  leads: Lead[],
  input: { name: string; description?: string; steps?: SequenceStep[] },
) {
  if (!input.name.trim()) throw new Error("Sequence name is required.");
  const state = await readGrowth(uid, leads);
  const sequence: Sequence = {
    id: `seq-${randomUUID()}`,
    name: input.name.trim(),
    description: input.description?.trim() || "New multi-step outreach cadence.",
    status: "draft",
    steps: input.steps?.length
      ? input.steps
      : [
          {
            id: randomUUID(),
            order: 1,
            channel: "email",
            subject: "Saw your note on {{topic}}",
            body: "Hi {{firstName}},\n\n{{pain}} — we built Threadly for exactly this.\n\nWorth a quick look?",
            delayDays: 0,
            sendOnWeekdaysOnly: true,
          },
        ],
    runs: [],
    sendWindowStart: "08:00",
    sendWindowEnd: "17:30",
    timezone: "America/New_York",
    created_at: now(),
    updated_at: now(),
  };
  state.sequences.unshift(sequence);
  await saveGrowth(uid, state);
  return sequence;
}

export async function toggleSequence(uid: string, leads: Lead[], sequenceId: string, status: Sequence["status"]) {
  const state = await readGrowth(uid, leads);
  const sequence = state.sequences.find((item) => item.id === sequenceId);
  if (!sequence) throw new Error("Sequence not found.");
  sequence.status = status;
  sequence.updated_at = now();
  await saveGrowth(uid, state);
}

export async function enrollLeadsInSequence(
  uid: string,
  leads: Lead[],
  sequenceId: string,
  leadIds: string[],
) {
  const state = await readGrowth(uid, leads);
  const sequence = state.sequences.find((item) => item.id === sequenceId);
  if (!sequence) throw new Error("Sequence not found.");
  if (!leadIds.length) throw new Error("Select at least one prospect to enroll.");

  const enrolled: SequenceRun[] = [];
  for (const leadId of leadIds) {
    const lead = leads.find((item) => item.id === leadId);
    if (!lead) continue;
    if (sequence.runs.some((run) => run.leadId === leadId && run.status === "active")) continue;
    const run: SequenceRun = {
      id: randomUUID(),
      leadId: lead.id,
      leadName: lead.name,
      email: lead.email,
      status: "active",
      currentStep: 1,
      enrolled_at: now(),
      last_sent_at: null,
      next_send_at: addDays(now(), sequence.steps[0]?.delayDays ?? 0),
      opens: 0,
      clicks: 0,
      variant: sequence.runs.length % 2 === 0 ? "A" : "B",
    };
    sequence.runs.unshift(run);
    enrolled.push(run);
  }
  if (!enrolled.length) throw new Error("Those prospects are already enrolled.");
  sequence.updated_at = now();
  await saveGrowth(uid, state);
  return enrolled;
}

export async function advanceSequence(uid: string, leads: Lead[], sequenceId: string) {
  const state = await readGrowth(uid, leads);
  const sequence = state.sequences.find((item) => item.id === sequenceId);
  if (!sequence) throw new Error("Sequence not found.");

  let advanced = 0;
  let replied = 0;
  let completed = 0;

  sequence.runs = sequence.runs.map((run) => {
    if (run.status !== "active") return run;
    const step = sequence.steps.find((item) => item.order === run.currentStep);
    const next = sequence.steps.find((item) => item.order === run.currentStep + 1);
    const roll = seededUnit(run.id, `advance-${Date.now() % 100}`);
    const repliedRoll = seededUnit(run.id, `reply-${Math.floor(Date.now() / 8000)}`);

    if (repliedRoll > 0.86) {
      replied += 1;
      return { ...run, status: "replied" as const, replied_at: now(), last_sent_at: now() };
    }
    if (!next) {
      completed += 1;
      return { ...run, status: "completed" as const, currentStep: step?.order ?? run.currentStep, last_sent_at: now() };
    }
    if (roll > 0.45) {
      advanced += 1;
      return {
        ...run,
        currentStep: next.order,
        last_sent_at: now(),
        next_send_at: addDays(now(), next.delayDays),
        opens: run.opens + (roll > 0.7 ? 1 : 0),
      };
    }
    return run;
  });

  sequence.updated_at = now();
  await saveGrowth(uid, state);
  return { advanced, replied, completed, runs: sequence.runs };
}

/* ------------------------------------------------------------
   Segments
   ------------------------------------------------------------ */

function matchesRule(lead: Lead, score: LeadScore | undefined, rule: SegmentRule): boolean {
  switch (rule.field) {
    case "fit":
      return score?.fit === rule.value;
    case "intent":
      return ((lead as Lead & { intent?: string }).intent || "").toLowerCase() === rule.value.toLowerCase();
    case "stage":
      return lead.stage === rule.value;
    case "source":
      return (lead.platform || "").toLowerCase() === rule.value.toLowerCase();
    case "replied":
      return rule.value === "true";
    case "score":
      return Number(score?.score ?? 0) > Number(rule.value);
    default:
      return false;
  }
}

export function evaluateSegment(segment: Segment, leads: Lead[], scores: LeadScore[]): string[] {
  return leads
    .filter((lead) =>
      segment.rules.every((rule) =>
        rule.operator === "is_not"
          ? !matchesRule(lead, scores.find((score) => score.leadId === lead.id), rule)
          : matchesRule(lead, scores.find((score) => score.leadId === lead.id), rule),
      ),
    )
    .map((lead) => lead.id);
}

export async function createSegment(
  uid: string,
  leads: Lead[],
  input: { name: string; description?: string; rules: SegmentRule[]; color?: Segment["color"] },
) {
  if (!input.name.trim()) throw new Error("Segment name is required.");
  if (!input.rules.length) throw new Error("Add at least one rule.");
  const state = await readGrowth(uid, leads);
  const segment: Segment = {
    id: `seg-${randomUUID()}`,
    name: input.name.trim(),
    description: input.description?.trim() || "Custom audience",
    color: input.color ?? "violet",
    rules: input.rules,
    leadIds: [],
    created_at: now(),
    updated_at: now(),
  };
  segment.leadIds = evaluateSegment(segment, leads, state.scores);
  state.segments.unshift(segment);
  await saveGrowth(uid, state);
  return segment;
}

export async function refreshSegments(uid: string, leads: Lead[]) {
  const state = await readGrowth(uid, leads);
  state.segments = state.segments.map((segment) => ({
    ...segment,
    leadIds: evaluateSegment(segment, leads, state.scores),
    updated_at: now(),
  }));
  await saveGrowth(uid, state);
  return state.segments;
}

/* ------------------------------------------------------------
   Best-time content slots
   ------------------------------------------------------------ */

const channelWindows: Record<ContentSlot["channel"], { day: number; hour: number; label: string; weight: number }[]> = {
  x: [
    { day: 2, hour: 14, label: "Tuesdays 13:00–15:00", weight: 0.92 },
    { day: 4, hour: 9, label: "Thursdays 08:00–10:00", weight: 0.78 },
    { day: 0, hour: 18, label: "Sundays 17:00–19:00", weight: 0.61 },
  ],
  linkedin: [
    { day: 3, hour: 8, label: "Wednesdays 07:30–09:30", weight: 0.88 },
    { day: 2, hour: 11, label: "Tuesdays 10:00–12:00", weight: 0.74 },
    { day: 4, hour: 16, label: "Thursdays 15:00–17:00", weight: 0.66 },
  ],
  reddit: [
    { day: 0, hour: 18, label: "Sundays 17:00–20:00", weight: 0.83 },
    { day: 3, hour: 20, label: "Wednesdays 19:00–21:00", weight: 0.69 },
  ],
  newsletter: [
    { day: 4, hour: 9, label: "Thursdays 08:30–10:00", weight: 0.9 },
    { day: 2, hour: 9, label: "Tuesdays 08:30–10:00", weight: 0.71 },
  ],
  blog: [
    { day: 1, hour: 10, label: "Mondays 09:00–11:00", weight: 0.72 },
    { day: 3, hour: 10, label: "Wednesdays 09:00–11:00", weight: 0.67 },
  ],
};

export async function suggestContentSlots(
  uid: string,
  leads: Lead[],
  input: { channel?: ContentSlot["channel"]; title?: string; group?: string },
) {
  const state = await readGrowth(uid, leads);
  const channel = input.channel ?? "x";
  const windows = channelWindows[channel];
  const used = new Set(state.slots.map((slot) => new Date(slot.scheduledFor).toISOString().slice(0, 13)));

  const upcoming = windows
    .map((window) => {
      const date = new Date();
      const delta = (window.day - date.getDay() + 7) % 7 || 7;
      date.setDate(date.getDate() + delta);
      date.setHours(window.hour, 0, 0, 0);
      if (date.getTime() < Date.now()) date.setDate(date.getDate() + 7);
      return { ...window, when: date };
    })
    .filter((window) => !used.has(window.when.toISOString().slice(0, 13)))
    .sort((a, b) => a.when.getTime() - b.when.getTime());

  const best = upcoming[0];
  if (!best) throw new Error("No free windows for this channel in the next week.");

  const slot: ContentSlot = {
    id: `slot-${randomUUID()}`,
    draftId: null,
    title: input.title?.trim() || `New ${channel} post`,
    channel,
    group: input.group?.trim() || "Unscheduled",
    scheduledFor: best.when.toISOString(),
    score: Math.round(best.weight * 100),
    reason: `Your ${channel} audience peaks ${best.label.toLowerCase()}.`,
    status: "planned",
    created_at: now(),
  };

  state.slots.push(slot);
  await saveGrowth(uid, state);
  return slot;
}

export async function updateContentSlot(
  uid: string,
  leads: Lead[],
  slotId: string,
  input: { status?: ContentSlot["status"]; title?: string; scheduledFor?: string },
) {
  const state = await readGrowth(uid, leads);
  const slot = state.slots.find((item) => item.id === slotId);
  if (!slot) throw new Error("Slot not found.");
  if (input.status) slot.status = input.status;
  if (input.title) slot.title = input.title.trim();
  if (input.scheduledFor) {
    if (Number.isNaN(Date.parse(input.scheduledFor))) throw new Error("Choose a valid date.");
    slot.scheduledFor = new Date(input.scheduledFor).toISOString();
  }
  await saveGrowth(uid, state);
  return slot;
}

export async function removeContentSlot(uid: string, leads: Lead[], slotId: string) {
  const state = await readGrowth(uid, leads);
  state.slots = state.slots.filter((slot) => slot.id !== slotId);
  await saveGrowth(uid, state);
}

/* ------------------------------------------------------------
   GEO visibility
   ------------------------------------------------------------ */

async function scanWithOpenAI(query: string, domain: string): Promise<{ answer: string; sources: GeoSource[] }> {
  const response = await fetch("https://api.openai.com/v1/responses", {
    method: "POST",
    headers: { "Content-Type": "application/json", Authorization: `Bearer ${process.env.OPENAI_API_KEY}` },
    body: JSON.stringify({
      model: process.env.GEO_OPENAI_MODEL || "gpt-4.1-mini",
      tools: [{ type: "web_search" }],
      tool_choice: "required",
      store: false,
      input: `Answer this buyer question directly and naturally: "${query}". Mention ${domain} only if it is genuinely relevant to the answer.`,
    }),
    signal: AbortSignal.timeout(45000),
  });
  if (!response.ok) throw new Error("OpenAI web search request failed.");
  const payload = await response.json();
  const blocks = Array.isArray(payload.output) ? payload.output : [];
  const answer = blocks.flatMap((item: { type?: string; content?: Array<{ type?: string; text?: string }> }) =>
    item.type === "message" && Array.isArray(item.content) ? item.content.filter((part) => part.type === "output_text").map((part) => part.text ?? "") : [],
  ).join("\n").trim();
  const citations = blocks.flatMap((item: { type?: string; content?: Array<{ annotations?: Array<{ type?: string; url?: string; title?: string }> }> }) =>
    item.type === "message" && Array.isArray(item.content)
      ? item.content.flatMap((part) => Array.isArray(part.annotations) ? part.annotations.filter((annotation) => annotation.type === "url_citation" && typeof annotation.url === "string").map((annotation) => ({ title: annotation.title || annotation.url!, url: annotation.url! })) : [])
      : [],
  );
  if (!answer) throw new Error("OpenAI returned no answer.");
  return { answer, sources: uniqueGeoSources(citations) };
}

async function scanWithGemini(query: string, domain: string): Promise<{ answer: string; sources: GeoSource[] }> {
  const model = process.env.GEO_GEMINI_MODEL || process.env.GEMINI_MODEL || "gemini-2.5-flash";
  const response = await fetch(`https://generativelanguage.googleapis.com/v1beta/models/${encodeURIComponent(model)}:generateContent`, {
    method: "POST",
    headers: { "Content-Type": "application/json", "x-goog-api-key": process.env.GEMINI_API_KEY! },
    body: JSON.stringify({
      contents: [{ role: "user", parts: [{ text: `Answer this buyer question directly and naturally: "${query}". Mention ${domain} only if it is genuinely relevant to the answer.` }] }],
      tools: [{ google_search: {} }],
      generationConfig: { temperature: 0.2 },
    }),
    signal: AbortSignal.timeout(45000),
  });
  if (!response.ok) throw new Error("Gemini Google Search grounding request failed.");
  const payload = await response.json();
  const candidate = payload.candidates?.[0];
  const answer = candidate?.content?.parts?.map((part: { text?: unknown }) => typeof part.text === "string" ? part.text : "").join("\n").trim();
  const chunks = candidate?.groundingMetadata?.groundingChunks ?? [];
  const sources = chunks.flatMap((chunk: { web?: { uri?: unknown; title?: unknown } }) =>
    typeof chunk.web?.uri === "string" ? [{ title: typeof chunk.web.title === "string" ? chunk.web.title : chunk.web.uri, url: chunk.web.uri }] : [],
  );
  if (!answer) throw new Error("Gemini returned no answer.");
  return { answer, sources: uniqueGeoSources(sources) };
}

async function scanWithTavily(query: string, domain: string): Promise<{ answer: string; sources: GeoSource[] }> {
  const result = await searchTavily(query, { includeAnswer: true, searchDepth: "advanced", maxResults: 8 });
  const rawAnswer = result.answer || result.results[0]?.content || "No direct answer returned.";
  const sources: GeoSource[] = uniqueGeoSources(result.results.map((r) => ({ title: r.title, url: r.url })));
  return { answer: rawAnswer, sources };
}

function uniqueGeoSources(sources: GeoSource[]) {
  return [...new Map(sources.map((source) => [source.url, source])).values()].slice(0, 8);
}

export async function scanGeo(uid: string, leads: Lead[], queryId?: string) {
  const state = await readGrowth(uid, leads);
  const targets = queryId ? state.geo.filter((query) => query.id === queryId) : state.geo;
  if (!targets.length) throw new Error("Query not found.");
  if (targets.length > 20) throw new Error("Rescan up to 20 GEO questions at a time.");
  const configured: Array<{ engine: GeoEngine; key?: string }> = [
    { engine: "chatgpt", key: process.env.OPENAI_API_KEY },
    { engine: "gemini", key: process.env.GEMINI_API_KEY },
    { engine: "tavily", key: process.env.TAVILY_API_KEY },
  ];
  if (!configured.some((provider) => provider.key)) {
    throw new Error("GEO scans need an OPENAI_API_KEY, GEMINI_API_KEY, or TAVILY_API_KEY. Add one in the project environment variables.");
  }
  for (const query of targets) {
    const previous = query.shareOfAnswer;
    const engines: GeoEngineResult[] = await Promise.all(configured.map(async ({ engine, key }) => {
      if (!key) return { engine, status: "not_configured", cited: false, rank: null, answer: "Provider API key is not configured.", sources: [] };
      try {
        const result = engine === "chatgpt"
          ? await scanWithOpenAI(query.query, process.env.GEO_BRAND_DOMAIN || "gothreadly.live")
          : engine === "gemini"
          ? await scanWithGemini(query.query, process.env.GEO_BRAND_DOMAIN || "gothreadly.live")
          : await scanWithTavily(query.query, process.env.GEO_BRAND_DOMAIN || "gothreadly.live");
        const domain = (process.env.GEO_BRAND_DOMAIN || "gothreadly.live").replace(/^www\./, "").toLowerCase();
        const cited = result.sources.some((source) => {
          try { return new URL(source.url).hostname.replace(/^www\./, "").toLowerCase() === domain; } catch { return false; }
        });
        return { engine, status: "scanned", cited, rank: null, answer: result.answer, sources: result.sources, scannedAt: now() };
      } catch {
        return { engine, status: "failed", cited: false, rank: null, answer: "Provider scan failed. Check its API key, model access, and usage limits.", sources: [], error: "Provider request failed" };
      }
    }));
    const scanned = engines.filter((engine) => engine.status === "scanned");
    query.engines = engines;
    query.shareOfAnswer = Math.round((scanned.filter((engine) => engine.cited).length / scanned.length) * 100);
    query.trend = Number((query.shareOfAnswer - previous).toFixed(1));
    query.lastScannedAt = now();
    query.gap = query.shareOfAnswer > 0
      ? "Review the linked sources and strengthen the pages cited for this question."
      : "No tracked domain citation found. Publish a directly answerable page with clear evidence and current facts.";
  }
  await saveGrowth(uid, state);
  return state.geo;
}

export async function addGeoQuery(
  uid: string,
  leads: Lead[],
  input: { query: string; intent?: GeoQuery["intent"]; volume?: number },
) {
  if (!input.query.trim()) throw new Error("Enter the question buyers actually ask.");
  const state = await readGrowth(uid, leads);
  if (state.geo.some((item) => item.query.toLowerCase() === input.query.trim().toLowerCase())) {
    throw new Error("You are already tracking that question.");
  }
  const id = `geo-${randomUUID()}`;
  state.geo.unshift({
    id,
    query: input.query.trim(),
    intent: input.intent ?? "commercial",
    volume: input.volume && input.volume > 0 ? input.volume : 0,
    difficulty: 0,
    shareOfAnswer: 0,
    ownedPages: 0,
    engines: (["chatgpt", "gemini"] as GeoEngine[]).map((engine) => ({
      engine,
      status: "not_scanned" as const,
      cited: false,
      rank: null,
      answer: "Run a scan to check this provider.",
      sources: [],
    })),
    gap: "Not indexed for this question yet — publish a directly answerable page.",
    lastScannedAt: "Not scanned",
    trend: 0,
  });
  await saveGrowth(uid, state);
  return state.geo[0];
}

/* ------------------------------------------------------------
   Lead scoring + live feed
   ------------------------------------------------------------ */

export async function refreshLeadScores(uid: string, leads: Lead[]) {
  const state = await readGrowth(uid, leads);
  state.scores = leads.map((lead) => scoreLead(lead, uid));
  await saveGrowth(uid, state);
  return state.scores;
}

export function buildLiveFeed(
  uid: string,
  limit = 14,
  realOpportunities?: Opportunity[],
  realLeads?: Lead[]
): LiveEvent[] {
  const loop = Math.floor(Date.now() / 6000) % 120;
  const simulated = liveEvents(buildEvents(`threadly-${uid}`), loop);

  const realEvents: LiveEvent[] = [];
  if (realOpportunities?.length) {
    for (const opp of realOpportunities.slice(0, 6)) {
      realEvents.push({
        id: `real-opp-${opp.id}`,
        kind: "signal",
        title: `Live ${opp.platform} signal: ${opp.community}`,
        detail: opp.title,
        actor: opp.author || "Web Source",
        tone: "orange",
        occurred_at: opp.observed_at || new Date().toISOString(),
      });
    }
  }
  if (realLeads?.length) {
    for (const lead of realLeads.slice(0, 6)) {
      realEvents.push({
        id: `real-lead-${lead.id}`,
        kind: lead.stage === "converted" || lead.stage === "qualified" ? "qualify" : "outreach",
        title: `Lead ${lead.name} (${lead.platform}) · ${lead.stage}`,
        detail: lead.pain || "Prospect in active growth funnel",
        actor: lead.owner || "Growth OS",
        tone: lead.stage === "converted" ? "ok" : "violet",
        occurred_at: lead.created_at || new Date().toISOString(),
      });
    }
  }

  const combined = [...realEvents, ...simulated]
    .sort((a, b) => b.occurred_at.localeCompare(a.occurred_at))
    .slice(0, limit);

  return combined;
}
