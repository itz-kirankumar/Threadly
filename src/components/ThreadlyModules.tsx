"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import {
  Activity, ArrowRight, ArrowUpRight, BarChart3, CalendarClock, Check, ChevronDown,
  CircleDollarSign, Clock3, Flame, Globe2, Layers, Link2, Mail, Pause, Play, Plus,
  RefreshCw, Rocket, Send, Sparkles, Target, Trash2, TrendingDown, TrendingUp,
  Users, Workflow, X, Zap, Search,
} from "lucide-react";
import type { SeoAuditCheck, SeoAuditReport } from "@/lib/seo-audit";
import type {
  Campaign,
  CampaignChannel,
  ContentSlot,
  GeoQuery,
  LeadScore,
  LiveEvent,
  Segment,
  Sequence,
  SequenceRun,
} from "@/lib/threadly-engine";

type Growth = {
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

type LeadLite = {
  id: string;
  name: string;
  email?: string;
  company?: string;
  stage: string;
  intent?: string;
};

type Act = (
  action: string,
  payload: Record<string, unknown>,
  success?: string,
) => Promise<Record<string, unknown> | null>;

/* ------------------------------------------------------------------ */
/* Small primitives                                                    */
/* ------------------------------------------------------------------ */

function money(value: number) {
  return `$${Math.round(value).toLocaleString("en-US")}`;
}

function pct(value: number) {
  return `${Math.round(value)}%`;
}

const channelTone: Record<string, string> = {
  google_search: "bg-brand-orange text-white",
  google_display: "bg-brand-orangeLight text-brand-orangeDark",
  linkedin: "bg-brand-violet text-white",
  reddit: "bg-brand-orangeDark text-white",
  x: "bg-brand-black text-white",
  meta: "bg-brand-violetPastel text-brand-violetDeep",
  organic: "bg-brand-line text-brand-black",
};

const channelLabel: Record<string, string> = {
  google_search: "Google Search",
  google_display: "Google Display",
  linkedin: "LinkedIn",
  reddit: "Reddit",
  x: "X",
  meta: "Meta",
  organic: "Organic",
};

export function Kicker({ children }: { children: React.ReactNode }) {
  return (
    <div className="font-mono text-[10px] font-bold uppercase tracking-[0.13em] text-brand-quiet">
      {children}
    </div>
  );
}

export function MetricTile({
  label,
  value,
  delta,
  tone = "orange",
  icon: Icon,
}: {
  label: string;
  value: string;
  delta?: string;
  tone?: "orange" | "violet" | "ink";
  icon?: typeof TrendingUp;
}) {
  const toneClass =
    tone === "violet"
      ? "border-brand-violet bg-brand-violetLight"
      : tone === "ink"
        ? "border-brand-black bg-brand-black text-white"
        : "border-brand-black bg-white";
  return (
    <div className={`rounded-2xl border-2 p-4 ${toneClass}`}>
      <div className="flex items-center justify-between">
        <span
          className={`font-mono text-[9px] font-bold uppercase tracking-[0.12em] ${
            tone === "ink" ? "text-white/50" : "text-brand-quiet"
          }`}
        >
          {label}
        </span>
        {Icon && (
          <Icon
            className={`h-3.5 w-3.5 ${
              tone === "ink" ? "text-brand-orange" : tone === "violet" ? "text-brand-violet" : "text-brand-orange"
            }`}
          />
        )}
      </div>
      <div className="mt-2 text-[26px] font-black leading-none tracking-[-0.05em]">{value}</div>
      {delta && (
        <div
          className={`mt-1.5 font-mono text-[9px] font-bold uppercase tracking-[0.08em] ${
            tone === "ink" ? "text-brand-orange" : "text-brand-orangeDark"
          }`}
        >
          {delta}
        </div>
      )}
    </div>
  );
}

function EmptyState({
  icon: Icon,
  title,
  copy,
  action,
}: {
  icon: typeof Target;
  title: string;
  copy: string;
  action?: React.ReactNode;
}) {
  return (
    <div className="thread-empty">
      <Icon className="mx-auto h-6 w-6 text-brand-quiet" />
      <div className="mt-3 text-[13px] font-black text-brand-black">{title}</div>
      <p className="mx-auto mt-1 max-w-sm text-[11px] leading-relaxed text-brand-muted">{copy}</p>
      {action && <div className="mt-4 flex justify-center">{action}</div>}
    </div>
  );
}

/* ------------------------------------------------------------------ */
/* Live feed (dashboard + header pill)                                 */
/* ------------------------------------------------------------------ */

const toneFor: Record<string, string> = {
  orange: "bg-brand-orangeLight text-brand-orangeDark",
  violet: "bg-brand-violetLight text-brand-violetDark",
  ink: "bg-brand-line text-brand-black",
  ok: "bg-emerald-50 text-emerald-700",
};

function timeAgo(iso: string) {
  const diff = Math.max(0, Date.now() - new Date(iso).getTime());
  const seconds = Math.floor(diff / 1000);
  if (seconds < 60) return `${seconds}s`;
  const minutes = Math.floor(seconds / 60);
  if (minutes < 60) return `${minutes}m`;
  const hours = Math.floor(minutes / 60);
  if (hours < 24) return `${hours}h`;
  return `${Math.floor(hours / 24)}d`;
}

export function LiveFeed({
  events,
  connected,
  compact = false,
}: {
  events: LiveEvent[];
  connected: boolean;
  compact?: boolean;
}) {
  return (
    <section className="thread-panel">
      <div className="flex items-center justify-between">
        <div>
          <Kicker>Activity stream</Kicker>
          <h3 className="mt-1 text-[17px] font-black tracking-[-0.04em]">Live workspace</h3>
        </div>
        <span className={`thread-live ${connected ? "" : "opacity-50"}`}>
          <i /> {connected ? "streaming" : "reconnecting"}
        </span>
      </div>

      <div className={`mt-4 space-y-2 ${compact ? "max-h-[280px]" : ""} overflow-y-auto thin-scroll`}>
        {events.length ? (
          events.map((event) => (
            <div
              key={event.id}
              className="flex items-start gap-2.5 rounded-xl border border-brand-line bg-brand-paper px-3 py-2.5"
            >
              <span
                className={`mt-0.5 grid h-6 w-6 shrink-0 place-items-center rounded-md ${
                  toneFor[event.tone] ?? toneFor.ink
                }`}
              >
                <Zap className="h-3 w-3" />
              </span>
              <div className="min-w-0 flex-1">
                <div className="truncate text-[11px] font-bold">{event.title}</div>
                <div className="truncate text-[10px] leading-snug text-brand-muted">{event.detail}</div>
              </div>
              <div className="shrink-0 text-right">
                <div className="font-mono text-[8px] uppercase tracking-[0.08em] text-brand-quiet">
                  {event.actor}
                </div>
                <div className="font-mono text-[8px] text-brand-quiet">{timeAgo(event.occurred_at)}</div>
              </div>
            </div>
          ))
        ) : (
          <p className="text-[11px] text-brand-muted">Waiting for the next event…</p>
        )}
      </div>
    </section>
  );
}

/* ------------------------------------------------------------------ */
/* Campaigns                                                           */
/* ------------------------------------------------------------------ */

export function CampaignsPage({
  growth,
  act,
  busy,
}: {
  growth: Growth;
  act: Act;
  busy: boolean;
}) {
  const [selectedId, setSelectedId] = useState<string | null>(growth.campaigns[0]?.id ?? null);
  const [creating, setCreating] = useState(false);
  const [form, setForm] = useState({ name: "", objective: "", budget: "5000", targetRoas: "2.5" });
  const [notice, setNotice] = useState("");

  useEffect(() => {
    if (!selectedId && growth.campaigns[0]) setSelectedId(growth.campaigns[0].id);
  }, [growth.campaigns, selectedId]);

  const selected = growth.campaigns.find((campaign) => campaign.id === selectedId) ?? growth.campaigns[0];

  async function create() {
    if (!form.name.trim()) return;
    const result = await act(
      "campaignCreate",
      {
        name: form.name,
        objective: form.objective,
        budget: Number(form.budget),
        targetRoas: Number(form.targetRoas),
      },
      "Campaign created",
    );
    if (result) {
      const campaign = result.campaign as Campaign | undefined;
      if (campaign) setSelectedId(campaign.id);
      setCreating(false);
      setForm({ name: "", objective: "", budget: "5000", targetRoas: "2.5" });
    }
  }

  async function optimize() {
    if (!selected) return;
    const result = await act("campaignOptimize", { campaignId: selected.id }, "Budget reallocated");
    if (result) {
      setNotice(
        `${money(Number(result.moved ?? 0))} moved from ${channelLabel[String(result.from)] ?? result.from} → ${
          channelLabel[String(result.to)] ?? result.to
        }.`,
      );
      window.setTimeout(() => setNotice(""), 6000);
    }
  }

  return (
    <>
      <div className="page-head">
        <div>
          <div className="eyebrow">
            <span className="pulse-dot" /> PAID + ORGANIC IN ONE COMMAND
          </div>
          <h1>
            Campaign Command<span className="accent-period">.</span>
          </h1>
          <p>Every channel, every dollar, reallocated toward whatever is actually returning.</p>
        </div>
        <div className="page-actions">
          <button className="btn btn-outline" onClick={() => setCreating((value) => !value)}>
            <Plus size={16} /> New campaign
          </button>
          <button className="btn btn-dark" disabled={busy || !selected} onClick={optimize}>
            <Sparkles size={16} /> Optimize allocation
          </button>
        </div>
      </div>

      <div className="thread-grid cols-4" style={{ marginBottom: 18 }}>
        <MetricTile label="Attributed revenue" value={money(growth.metrics.attributedRevenue)} delta="Tracked across channels" tone="ink" icon={CircleDollarSign} />
        <MetricTile label="Ad spend" value={money(growth.metrics.adSpend)} delta="This quarter" icon={CircleDollarSign} />
        <MetricTile label="Blended ROAS" value={`${growth.metrics.blendedRoas.toFixed(2)}×`} delta="Target 2.5×" tone="violet" icon={TrendingUp} />
        <MetricTile label="Active campaigns" value={String(growth.metrics.activeCampaigns)} delta={`${growth.campaigns.length} total`} icon={Rocket} />
      </div>

      {notice && (
        <div className="mb-4 flex items-center gap-2 rounded-xl border-2 border-brand-violet bg-brand-violetLight px-4 py-3 text-[12px] font-bold text-brand-violetDark">
          <Sparkles className="h-4 w-4" /> {notice}
        </div>
      )}

      {creating && (
        <div className="thread-panel mb-4">
          <div className="flex items-center justify-between">
            <div>
              <Kicker>New campaign</Kicker>
              <h3 className="mt-1 text-[17px] font-black tracking-[-0.04em]">Set the objective and budget</h3>
            </div>
            <button className="icon-button" onClick={() => setCreating(false)} aria-label="Close">
              <X className="h-4 w-4" />
            </button>
          </div>
          <div className="mt-4 grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
            <label className="block">
              <Kicker>Name</Kicker>
              <input
                value={form.name}
                onChange={(event) => setForm({ ...form, name: event.target.value })}
                placeholder="Q1 Expansion"
                className="mt-1.5 w-full rounded-xl border-2 border-brand-black bg-white px-3 py-2.5 text-[12px] font-semibold outline-none focus:border-brand-orange"
              />
            </label>
            <label className="block">
              <Kicker>Objective</Kicker>
              <input
                value={form.objective}
                onChange={(event) => setForm({ ...form, objective: event.target.value })}
                placeholder="Book discovery calls"
                className="mt-1.5 w-full rounded-xl border-2 border-brand-black bg-white px-3 py-2.5 text-[12px] font-semibold outline-none focus:border-brand-orange"
              />
            </label>
            <label className="block">
              <Kicker>Budget ($)</Kicker>
              <input
                type="number"
                min={1}
                value={form.budget}
                onChange={(event) => setForm({ ...form, budget: event.target.value })}
                className="mt-1.5 w-full rounded-xl border-2 border-brand-black bg-white px-3 py-2.5 text-[12px] font-semibold outline-none focus:border-brand-orange"
              />
            </label>
            <label className="block">
              <Kicker>Target ROAS</Kicker>
              <input
                type="number"
                step="0.1"
                min={0.1}
                value={form.targetRoas}
                onChange={(event) => setForm({ ...form, targetRoas: event.target.value })}
                className="mt-1.5 w-full rounded-xl border-2 border-brand-black bg-white px-3 py-2.5 text-[12px] font-semibold outline-none focus:border-brand-orange"
              />
            </label>
          </div>
          <button
            className="btn btn-dark mt-4"
            disabled={busy || !form.name.trim()}
            onClick={create}
          >
            <Plus size={15} /> Create campaign
          </button>
        </div>
      )}

      {!growth.campaigns.length ? (
        <EmptyState
          icon={Rocket}
          title="No campaigns yet"
          copy="Create your first campaign to start tracking spend, revenue and ROAS by channel across Google, LinkedIn, Reddit, and X."
          action={
            <button
              className="btn btn-primary"
              onClick={() => setCreating(true)}
            >
              <Plus size={15} /> Create your first campaign
            </button>
          }
        />
      ) : (
        <div className="thread-split-layout thread-split-campaign grid gap-4">
          <div className="space-y-2.5">
            {growth.campaigns.map((campaign) => {
              const active = campaign.id === selected?.id;
              const targetHit = campaign.roas >= campaign.targetRoas;
              return (
                <button
                  key={campaign.id}
                  type="button"
                  onClick={() => setSelectedId(campaign.id)}
                  className={`w-full rounded-2xl border-2 p-4 text-left transition-all ${
                    active
                      ? "border-brand-black bg-brand-black text-white shadow-[5px_5px_0_#ff4500]"
                      : "border-brand-line bg-white hover:border-brand-black"
                  }`}
                >
                  <div className="flex items-start justify-between gap-2">
                    <div className="min-w-0">
                      <div className={`font-mono text-[8.5px] font-bold uppercase tracking-[0.11em] ${active ? "text-white/50" : "text-brand-quiet"}`}>
                        {campaign.status}
                      </div>
                      <div className="mt-1 truncate text-[14px] font-black tracking-[-0.03em]">{campaign.name}</div>
                    </div>
                    <span
                      className={`shrink-0 rounded-full px-2 py-1 font-mono text-[8.5px] font-bold uppercase tracking-[0.06em] ${
                        active
                          ? "bg-white/10 text-white"
                          : targetHit
                            ? "bg-brand-orangeLight text-brand-orangeDark"
                            : "bg-brand-line text-brand-muted"
                      }`}
                    >
                      {campaign.roas.toFixed(2)}× ROAS
                    </span>
                  </div>
                  <div className="mt-3 flex items-center gap-3 text-[10px]">
                    <span className={active ? "text-white/60" : "text-brand-muted"}>
                      {money(campaign.spend)} spend
                    </span>
                    <span className={active ? "text-white/60" : "text-brand-muted"}>
                      {money(campaign.revenue)} rev
                    </span>
                    <span className={`ml-auto flex items-center gap-1 font-bold ${targetHit ? "text-brand-orange" : "text-brand-muted"}`}>
                      {campaign.roas >= campaign.targetRoas ? <TrendingUp className="h-3 w-3" /> : <TrendingDown className="h-3 w-3" />}
                      {campaign.channels.length} channels
                    </span>
                  </div>
                  <div className={`mt-2.5 h-1.5 rounded-full ${active ? "bg-white/15" : "bg-brand-line"}`}>
                    <div
                      className="h-1.5 rounded-full bg-gradient-to-r from-brand-orange to-brand-violet"
                      style={{ width: `${Math.min(100, (campaign.revenue / Math.max(1, campaign.budget * 3)) * 100)}%` }}
                    />
                  </div>
                </button>
              );
            })}
          </div>

          {selected && (
            <div className="space-y-4">
              <div className="thread-panel">
                <div className="flex flex-wrap items-start justify-between gap-3">
                  <div>
                    <Kicker>{selected.objective}</Kicker>
                    <h3 className="mt-1 text-[22px] font-black tracking-[-0.045em]">{selected.name}</h3>
                    <p className="mt-1 text-[11px] text-brand-muted">
                      {new Date(selected.startDate).toLocaleDateString("en-US", { month: "short", day: "numeric" })} →{" "}
                      {new Date(selected.endDate).toLocaleDateString("en-US", { month: "short", day: "numeric" })} · target{" "}
                      {selected.targetRoas.toFixed(1)}× ROAS
                    </p>
                  </div>
                  <div className="flex gap-2">
                    <button
                      className="btn btn-outline"
                      disabled={busy}
                      onClick={() =>
                        act(
                          "campaignToggle",
                          {
                            campaignId: selected.id,
                            status: selected.status === "active" ? "paused" : "active",
                          },
                          selected.status === "active" ? "Campaign paused" : "Campaign activated",
                        )
                      }
                    >
                      {selected.status === "active" ? <Pause size={14} /> : <Play size={14} />}
                      {selected.status === "active" ? "Pause" : "Activate"}
                    </button>
                    <button className="btn btn-dark" disabled={busy} onClick={optimize}>
                      <Zap size={14} /> Reallocate
                    </button>
                  </div>
                </div>

                <div className="mt-4 grid grid-cols-3 gap-2">
                  {[
                    ["Spend", money(selected.spend)],
                    ["Revenue", money(selected.revenue)],
                    ["Conversions", String(selected.conversions)],
                  ].map(([label, value]) => (
                    <div key={label} className="rounded-xl border border-brand-line bg-brand-paper px-3 py-2">
                      <Kicker>{label}</Kicker>
                      <div className="mt-1 text-[16px] font-black tracking-[-0.04em]">{value}</div>
                    </div>
                  ))}
                </div>

                <div className="mt-5">
                  <div className="mb-2 flex items-center justify-between">
                    <Kicker>Channel allocation</Kicker>
                    {selected.autoOptimize && (
                      <span className="thread-chip violet">
                        <Sparkles className="h-3 w-3" /> auto-optimize on
                      </span>
                    )}
                  </div>
                  <div className="space-y-2.5">
                    {[...selected.channels]
                      .sort((a, b) => b.roas - a.roas)
                      .map((channel) => (
                        <div key={channel.channel}>
                          <div className="flex items-center justify-between text-[10.5px]">
                            <span className="flex items-center gap-2 font-bold">
                              <span
                                className={`h-2.5 w-2.5 rounded-sm ${channelTone[channel.channel] ?? "bg-brand-line"}`}
                              />
                              {channel.label}
                            </span>
                            <span className="font-mono text-[9.5px] text-brand-muted">
                              {money(channel.spend)} · {channel.roas.toFixed(2)}×
                              <span className={channel.trend >= 0 ? "text-brand-orange" : "text-brand-quiet"}>
                                {" "}
                                {channel.trend >= 0 ? "↑" : "↓"}
                                {Math.abs(channel.trend * 100).toFixed(0)}%
                              </span>
                            </span>
                          </div>
                          <div className="mt-1 h-2 rounded-full bg-brand-line">
                            <div
                              className={`h-2 rounded-full ${
                                channel.channel === "google_search"
                                  ? "bg-brand-orange"
                                  : channel.channel === "linkedin"
                                    ? "bg-brand-violet"
                                    : channel.channel === "reddit"
                                      ? "bg-brand-orangeDark"
                                      : "bg-brand-black"
                              }`}
                              style={{ width: `${Math.min(100, (channel.spend / Math.max(1, selected.spend)) * 100)}%` }}
                            />
                          </div>
                        </div>
                      ))}
                  </div>
                </div>
              </div>

              <div className="grid gap-4 sm:grid-cols-2">
                <div className="thread-panel">
                  <Kicker>Creative variants</Kicker>
                  <div className="mt-3 space-y-2">
                    {selected.creatives.length ? (
                      selected.creatives.map((creative) => (
                        <div
                          key={creative.id}
                          className="rounded-xl border border-brand-line bg-brand-paper p-3"
                        >
                          <div className="flex items-center justify-between gap-2">
                            <span className="text-[11px] font-black">{creative.label}</span>
                            <span
                              className={`thread-chip ${
                                creative.status === "active" ? "ok" : "orange"
                              }`}
                            >
                              {creative.status}
                            </span>
                          </div>
                          <p className="mt-1.5 text-[10px] leading-snug text-brand-muted">
                            “{creative.headline}”
                          </p>
                          <div className="mt-2 flex gap-3 font-mono text-[9px] text-brand-quiet">
                            <span>CTR {creative.ctr.toFixed(2)}%</span>
                            <span>CPA ${creative.cpa}</span>
                            <span>{creative.format}</span>
                          </div>
                        </div>
                      ))
                    ) : (
                      <p className="text-[11px] text-brand-muted">
                        No creatives yet. Launch the campaign to generate variants.
                      </p>
                    )}
                  </div>
                </div>

                <div className="thread-panel ink">
                  <Kicker>Optimizer</Kicker>
                  <h3 className="relative z-10 mt-2 text-[19px] font-black leading-tight tracking-[-0.04em] text-white">
                    Let the winners compound.
                  </h3>
                  <p className="relative z-10 mt-2 text-[11px] leading-relaxed text-white/60">
                    Threadly ranks every channel by return and shifts budget from the laggards each
                    cycle — with guardrails so no channel is cut to zero.
                  </p>
                  <div className="relative z-10 mt-4 space-y-2">
                    {[
                      ["Guardrail", "Min 10% per channel"],
                      ["Cadence", "Every 6 hours"],
                      ["Last action", "Reallocated this quarter"],
                    ].map(([label, value]) => (
                      <div key={label} className="flex items-center justify-between border-b border-white/10 pb-1.5 text-[10px] last:border-0">
                        <span className="text-white/45">{label}</span>
                        <span className="font-bold text-white">{value}</span>
                      </div>
                    ))}
                  </div>
                  <div className="relative z-10 mt-4 rounded-xl bg-brand-orange px-3 py-2 text-[10px] font-bold text-white">
                    {selected.roas >= selected.targetRoas
                      ? `On target — ${selected.roas.toFixed(2)}× against ${selected.targetRoas.toFixed(1)}×.`
                      : `Below target — ${selected.roas.toFixed(2)}× against ${selected.targetRoas.toFixed(1)}×. Reallocate to recover.`}
                  </div>
                </div>
              </div>
            </div>
          )}
        </div>
      )}
    </>
  );
}

/* ------------------------------------------------------------------ */
/* Sequences                                                           */
/* ------------------------------------------------------------------ */

const runTone: Record<string, string> = {
  active: "ok",
  replied: "violet",
  completed: "orange",
  paused: "orange",
  bounced: "orange",
};

export function SequencesPage({
  growth,
  leads,
  act,
  busy,
}: {
  growth: Growth;
  leads: LeadLite[];
  act: Act;
  busy: boolean;
}) {
  const [selectedId, setSelectedId] = useState<string | null>(growth.sequences[0]?.id ?? null);
  const [enrolling, setEnrolling] = useState(false);
  const [selectedLeads, setSelectedLeads] = useState<string[]>([]);
  const [creating, setCreating] = useState(false);
  const [name, setName] = useState("");

  useEffect(() => {
    if (!selectedId && growth.sequences[0]) setSelectedId(growth.sequences[0].id);
  }, [growth.sequences, selectedId]);

  const sequence = growth.sequences.find((item) => item.id === selectedId) ?? growth.sequences[0];
  const runs = sequence?.runs ?? [];
  const activeRuns = runs.filter((run) => run.status === "active");
  const repliedRuns = runs.filter((run) => run.status === "replied");
  const openRate = runs.length
    ? Math.round((runs.filter((run) => run.opens > 0).length / runs.length) * 100)
    : 0;
  const replyRate = runs.length ? Math.round((repliedRuns.length / runs.length) * 100) : 0;

  async function enroll() {
    if (!sequence || !selectedLeads.length) return;
    const result = await act(
      "sequenceEnroll",
      { sequenceId: sequence.id, leadIds: selectedLeads },
      "Prospects enrolled",
    );
    if (result) {
      setEnrolling(false);
      setSelectedLeads([]);
    }
  }

  async function createSequence() {
    if (!name.trim()) return;
    const result = await act("sequenceCreate", { name }, "Sequence created");
    if (result) {
      const created = result.sequence as Sequence | undefined;
      if (created) setSelectedId(created.id);
      setCreating(false);
      setName("");
    }
  }

  return (
    <>
      <div className="page-head">
        <div>
          <div className="eyebrow">
            <span className="pulse-dot" /> MULTI-STEP, HUMAN-REVIEWED OUTREACH
          </div>
          <h1>
            Sequences<span className="accent-period">.</span>
          </h1>
          <p>Cadences with conditional steps, A/B variants and reply-aware stopping.</p>
        </div>
        <div className="page-actions">
          <button className="btn btn-outline" onClick={() => setCreating((value) => !value)}>
            <Plus size={16} /> New sequence
          </button>
          <button className="btn btn-dark" disabled={busy || !sequence} onClick={() => sequence && act("sequenceAdvance", { sequenceId: sequence.id }, "Sequence stepped")}>
            <RefreshCw size={16} /> Run next step
          </button>
        </div>
      </div>

      <div className="thread-grid cols-4" style={{ marginBottom: 18 }}>
        <MetricTile label="Active runs" value={String(activeRuns.length)} delta={`${runs.length} enrolled`} icon={Send} />
        <MetricTile label="Open rate" value={pct(openRate)} delta="Across all steps" tone="violet" icon={Mail} />
        <MetricTile label="Reply rate" value={pct(replyRate)} delta={`${repliedRuns.length} replies`} tone="ink" icon={Mail} />
        <MetricTile label="Avg. steps" value={sequence ? String(sequence.steps.length) : "0"} delta="Per cadence" icon={Layers} />
      </div>

      {creating && (
        <div className="thread-panel mb-4">
          <Kicker>New sequence</Kicker>
          <div className="mt-3 flex flex-wrap gap-2">
            <input
              value={name}
              onChange={(event) => setName(event.target.value)}
              placeholder="Enterprise follow-up"
              className="min-w-[240px] flex-1 rounded-xl border-2 border-brand-black bg-white px-3 py-2.5 text-[12px] font-semibold outline-none focus:border-brand-orange"
            />
            <button className="btn btn-dark" disabled={busy || !name.trim()} onClick={createSequence}>
              <Plus size={15} /> Create
            </button>
          </div>
        </div>
      )}

      <div className="thread-split-layout thread-split-sequence grid gap-4">
        <div className="space-y-4">
          {growth.sequences.map((item) => {
            const active = item.id === sequence?.id;
            return (
              <button
                key={item.id}
                type="button"
                onClick={() => setSelectedId(item.id)}
                className={`w-full rounded-2xl border-2 p-4 text-left transition-all ${
                  active ? "border-brand-black bg-white shadow-[5px_5px_0_#7c3aed]" : "border-brand-line bg-white hover:border-brand-black"
                }`}
              >
                <div className="flex items-start justify-between">
                  <div>
                    <div className="flex items-center gap-2">
                      <span className={`thread-chip ${item.status === "active" ? "ok" : "orange"}`}>
                        {item.status}
                      </span>
                      <span className="font-mono text-[9px] uppercase tracking-[0.09em] text-brand-quiet">
                        {item.steps.length} steps
                      </span>
                    </div>
                    <div className="mt-2 text-[15px] font-black tracking-[-0.03em]">{item.name}</div>
                    <p className="mt-1 text-[10.5px] leading-snug text-brand-muted">{item.description}</p>
                  </div>
                  <span className="thread-chip violet">{item.runs.length} runs</span>
                </div>
              </button>
            );
          })}

          {sequence && (
            <div className="thread-panel">
              <Kicker>Cadence</Kicker>
              <div className="mt-4 thread-rail space-y-4">
                {sequence.steps.map((step) => (
                  <div key={step.id} className="relative">
                    <span className="absolute -left-[22px] top-1 grid h-4 w-4 place-items-center rounded-full border-2 border-brand-orange bg-white text-[8px] font-black">
                      {step.order}
                    </span>
                    <div className="flex items-center gap-2">
                      <span className="font-mono text-[9px] font-bold uppercase tracking-[0.09em] text-brand-quiet">
                        {step.channel}
                      </span>
                      <span className="font-mono text-[9px] text-brand-quiet">
                        +{step.delayDays}d
                      </span>
                    </div>
                    <div className="mt-1 text-[12px] font-bold">{step.subject}</div>
                    <p className="mt-1 whitespace-pre-line text-[10px] leading-relaxed text-brand-muted">
                      {step.body.slice(0, 150)}
                      {step.body.length > 150 ? "…" : ""}
                    </p>
                    {step.variantB && (
                      <span className="mt-1.5 inline-flex thread-chip">A/B · {step.variantB}</span>
                    )}
                  </div>
                ))}
              </div>
            </div>
          )}
        </div>

        <div className="space-y-4">
          <div className="thread-panel">
            <div className="flex items-center justify-between">
              <div>
                <Kicker>Enrolled prospects</Kicker>
                <h3 className="mt-1 text-[17px] font-black tracking-[-0.04em]">Run board</h3>
              </div>
              <button
                className="btn btn-outline"
                onClick={() => setEnrolling((value) => !value)}
                disabled={!sequence}
              >
                <Users size={14} /> Enroll
              </button>
            </div>

            {enrolling && sequence && (
              <div className="mt-3 rounded-xl border-2 border-brand-black bg-brand-paper p-3">
                <Kicker>Select prospects</Kicker>
                <div className="mt-2 max-h-52 space-y-1 overflow-y-auto thin-scroll">
                  {leads.length ? (
                    leads.map((lead) => {
                      const checked = selectedLeads.includes(lead.id);
                      return (
                        <label
                          key={lead.id}
                          className="flex cursor-pointer items-center gap-2.5 rounded-lg px-2 py-1.5 hover:bg-white"
                        >
                          <input
                            type="checkbox"
                            checked={checked}
                            onChange={() =>
                              setSelectedLeads((current) =>
                                checked ? current.filter((id) => id !== lead.id) : [...current, lead.id],
                              )
                            }
                            className="h-3.5 w-3.5 accent-brand-orange"
                          />
                          <span className="text-[11px] font-bold">{lead.name}</span>
                          <span className="ml-auto text-[9.5px] text-brand-quiet">
                            {lead.email || "no email"} · {lead.stage}
                          </span>
                        </label>
                      );
                    })
                  ) : (
                    <p className="text-[11px] text-brand-muted">Add prospects from Radar first.</p>
                  )}
                </div>
                <button
                  className="btn btn-dark mt-2 w-full"
                  disabled={busy || !selectedLeads.length}
                  onClick={enroll}
                >
                  <Send size={14} /> Enroll {selectedLeads.length || ""} prospect
                  {selectedLeads.length === 1 ? "" : "s"}
                </button>
              </div>
            )}

            <div className="mt-4 overflow-x-auto">
              <table className="w-full border-collapse text-[10.5px]">
                <thead>
                  <tr className="border-b border-brand-line text-left font-mono text-[8.5px] uppercase tracking-[0.09em] text-brand-quiet">
                    <th className="py-2 pr-2">Prospect</th>
                    <th className="px-2 py-2">Step</th>
                    <th className="px-2 py-2">Status</th>
                    <th className="px-2 py-2">Opens</th>
                    <th className="px-2 py-2 text-right">Next</th>
                  </tr>
                </thead>
                <tbody>
                  {runs.map((run) => (
                    <tr key={run.id} className="border-b border-brand-line/70 last:border-0">
                      <td className="py-2 pr-2">
                        <div className="font-bold">{run.leadName}</div>
                        <div className="font-mono text-[8.5px] text-brand-quiet">
                          variant {run.variant}
                        </div>
                      </td>
                      <td className="px-2 py-2 font-mono">{run.currentStep}</td>
                      <td className="px-2 py-2">
                        <span className={`thread-chip ${runTone[run.status] ?? ""}`}>{run.status}</span>
                      </td>
                      <td className="px-2 py-2 font-mono">{run.opens}</td>
                      <td className="px-2 py-2 text-right font-mono text-brand-quiet">
                        {run.next_send_at
                          ? new Date(run.next_send_at).toLocaleDateString("en-US", {
                              month: "short",
                              day: "numeric",
                            })
                          : "—"}
                      </td>
                    </tr>
                  ))}
                  {!runs.length && (
                    <tr>
                      <td colSpan={5} className="py-6 text-center text-brand-muted">
                        No prospects enrolled yet.
                      </td>
                    </tr>
                  )}
                </tbody>
              </table>
            </div>
          </div>

          <div className="grid gap-4 sm:grid-cols-2">
            <div className="thread-panel">
              <Kicker>Send window</Kicker>
              <div className="mt-2 text-[24px] font-black tracking-[-0.05em]">
                {sequence?.sendWindowStart}–{sequence?.sendWindowEnd}
              </div>
              <p className="mt-1 text-[10.5px] text-brand-muted">
                {sequence?.timezone} · weekdays preferred
              </p>
              <div className="mt-3 flex items-center gap-2 rounded-lg bg-brand-violetLight px-2.5 py-2 text-[10px] font-bold text-brand-violetDark">
                <Clock3 className="h-3.5 w-3.5" /> Sends only inside the window
              </div>
            </div>
            <div className="thread-panel">
              <Kicker>Variant performance</Kicker>
              <div className="mt-3 space-y-2">
                {(["A", "B"] as const).map((variant) => {
                  const variantRuns = runs.filter((run) => run.variant === variant);
                  const variantReplies = variantRuns.filter((run) => run.status === "replied").length;
                  const width = variantRuns.length
                    ? Math.round((variantReplies / variantRuns.length) * 100)
                    : 0;
                  return (
                    <div key={variant}>
                      <div className="flex justify-between text-[10px] font-bold">
                        <span>Variant {variant}</span>
                        <span className="font-mono text-brand-muted">{width}% reply</span>
                      </div>
                      <div className="mt-1 h-2 rounded-full bg-brand-line">
                        <div
                          className={`h-2 rounded-full ${variant === "A" ? "bg-brand-orange" : "bg-brand-violet"}`}
                          style={{ width: `${Math.max(3, width)}%` }}
                        />
                      </div>
                    </div>
                  );
                })}
              </div>
            </div>
          </div>
        </div>
      </div>
    </>
  );
}

/* ------------------------------------------------------------------ */
/* Segments                                                            */
/* ------------------------------------------------------------------ */

export function SegmentsPage({
  growth,
  leads,
  act,
  busy,
}: {
  growth: Growth;
  leads: LeadLite[];
  act: Act;
  busy: boolean;
}) {
  const [creating, setCreating] = useState(false);
  const [form, setForm] = useState({
    name: "",
    field: "stage" as "stage" | "fit" | "intent",
    value: "qualified",
  });

  const scoresById = useMemo(
    () => Object.fromEntries(growth.scores.map((score) => [score.leadId, score])),
    [growth.scores],
  );

  async function create() {
    if (!form.name.trim()) return;
    const result = await act(
      "segmentCreate",
      {
        name: form.name,
        rules: [{ field: form.field, operator: "is", value: form.value }],
      },
      "Segment created",
    );
    if (result) {
      setCreating(false);
      setForm({ name: "", field: "stage", value: "qualified" });
    }
  }

  return (
    <>
      <div className="page-head">
        <div>
          <div className="eyebrow">
            <span className="pulse-dot" /> AUDIENCES THAT BUILD THEMSELVES
          </div>
          <h1>
            Segments<span className="accent-period">.</span>
          </h1>
          <p>Rules instead of spreadsheets. Every prospect is scored and re-sorted continuously.</p>
        </div>
        <div className="page-actions">
          <button className="btn btn-outline" onClick={() => act("segmentRefresh", {}, "Segments refreshed")} disabled={busy}>
            <RefreshCw size={15} /> Refresh
          </button>
          <button className="btn btn-dark" onClick={() => setCreating((value) => !value)}>
            <Plus size={16} /> New segment
          </button>
        </div>
      </div>

      <div className="thread-grid cols-4" style={{ marginBottom: 18 }}>
        <MetricTile label="Scored prospects" value={String(growth.scores.length)} delta="Live scoring" tone="ink" icon={Target} />
        <MetricTile label="Strong fit" value={String(growth.scores.filter((score) => score.fit === "strong").length)} delta="Score ≥ 78" tone="violet" icon={Flame} />
        <MetricTile label="Segments" value={String(growth.segments.length)} delta="Dynamic rules" icon={Layers} />
        <MetricTile label="Qualified" value={String(leads.filter((lead) => ["qualified", "conversation", "converted"].includes(lead.stage)).length)} delta="In pipeline" icon={Users} />
      </div>

      {creating && (
        <div className="thread-panel mb-4">
          <Kicker>New segment</Kicker>
          <div className="mt-3 grid gap-3 sm:grid-cols-4">
            <input
              value={form.name}
              onChange={(event) => setForm({ ...form, name: event.target.value })}
              placeholder="Name"
              className="rounded-xl border-2 border-brand-black bg-white px-3 py-2.5 text-[12px] font-semibold outline-none focus:border-brand-orange"
            />
            <select
              value={form.field}
              onChange={(event) =>
                setForm({ ...form, field: event.target.value as typeof form.field, value: event.target.value === "stage" ? "qualified" : event.target.value === "fit" ? "strong" : "High" })
              }
              className="rounded-xl border-2 border-brand-black bg-white px-3 py-2.5 text-[12px] font-semibold outline-none focus:border-brand-orange"
            >
              <option value="stage">Stage</option>
              <option value="fit">Fit</option>
              <option value="intent">Intent</option>
            </select>
            <select
              value={form.value}
              onChange={(event) => setForm({ ...form, value: event.target.value })}
              className="rounded-xl border-2 border-brand-black bg-white px-3 py-2.5 text-[12px] font-semibold outline-none focus:border-brand-orange"
            >
              {form.field === "stage" && ["identified", "engaged", "qualified", "conversation", "converted"].map((option) => <option key={option}>{option}</option>)}
              {form.field === "fit" && ["strong", "possible", "weak"].map((option) => <option key={option}>{option}</option>)}
              {form.field === "intent" && ["High", "Medium", "Low"].map((option) => <option key={option}>{option}</option>)}
            </select>
            <button className="btn btn-dark" disabled={busy || !form.name.trim()} onClick={create}>
              <Plus size={15} /> Create
            </button>
          </div>
        </div>
      )}

      <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-3">
        {growth.segments.map((segment) => {
          const members = leads.filter((lead) => segment.leadIds.includes(lead.id));
          const tone =
            segment.color === "orange"
              ? "border-brand-orange shadow-[5px_5px_0_#ff4500]"
              : segment.color === "violet"
                ? "border-brand-violet shadow-[5px_5px_0_#7c3aed]"
                : "border-brand-black shadow-[5px_5px_0_#0a0a0a]";
          return (
            <div key={segment.id} className={`rounded-2xl border-2 bg-white p-5 ${tone}`}>
              <div className="flex items-start justify-between">
                <div>
                  <Kicker>Dynamic segment</Kicker>
                  <h3 className="mt-1 text-[17px] font-black tracking-[-0.04em]">{segment.name}</h3>
                </div>
                <span className="thread-chip">{members.length} members</span>
              </div>
              <p className="mt-1.5 text-[11px] leading-relaxed text-brand-muted">{segment.description}</p>

              <div className="mt-3 flex flex-wrap gap-1.5">
                {segment.rules.map((rule, index) => (
                  <span key={index} className="thread-chip">
                    {rule.field} {rule.operator.replace("_", " ")} {rule.value}
                  </span>
                ))}
              </div>

              <div className="mt-4 space-y-1.5">
                {members.slice(0, 4).map((lead) => {
                  const score = scoresById[lead.id];
                  return (
                    <div key={lead.id} className="flex items-center gap-2 rounded-lg bg-brand-paper px-2.5 py-1.5">
                      <span className="grid h-5 w-5 place-items-center rounded-md bg-brand-black text-[8px] font-black text-white">
                        {(lead.name || "P").replace("@", "").charAt(0).toUpperCase()}
                      </span>
                      <span className="truncate text-[10.5px] font-bold">{lead.name}</span>
                      <span className="ml-auto font-mono text-[9px] text-brand-muted">
                        {score ? `${score.score} · ${score.fit}` : lead.stage}
                      </span>
                    </div>
                  );
                })}
                {members.length > 4 && (
                  <div className="text-center font-mono text-[9px] text-brand-quiet">
                    +{members.length - 4} more
                  </div>
                )}
                {!members.length && (
                  <p className="rounded-lg bg-brand-paper px-2.5 py-3 text-center text-[10px] text-brand-muted">
                    No prospects match these rules yet.
                  </p>
                )}
              </div>
            </div>
          );
        })}
      </div>

      <div className="thread-panel mt-4">
        <div className="flex items-center justify-between">
          <div>
            <Kicker>Lead scores</Kicker>
            <h3 className="mt-1 text-[17px] font-black tracking-[-0.04em]">Who to talk to next</h3>
          </div>
          <button className="text-link" onClick={() => act("scoreRefresh", {}, "Scores refreshed")} disabled={busy}>
            Recalculate <ArrowRight size={14} />
          </button>
        </div>
        <div className="mt-3 grid gap-2 md:grid-cols-2">
          {[...growth.scores]
            .sort((a, b) => b.score - a.score)
            .slice(0, 6)
            .map((score) => {
              const lead = leads.find((item) => item.id === score.leadId);
              if (!lead) return null;
              return (
                <div key={score.leadId} className="rounded-xl border border-brand-line bg-brand-paper p-3">
                  <div className="flex items-center justify-between">
                    <span className="text-[11.5px] font-black">{lead.name}</span>
                    <span
                      className={`rounded-full px-2 py-0.5 font-mono text-[9px] font-bold ${
                        score.fit === "strong"
                          ? "bg-brand-orange text-white"
                          : score.fit === "possible"
                            ? "bg-brand-violetPastel text-brand-violetDeep"
                            : "bg-brand-line text-brand-muted"
                      }`}
                    >
                      {score.score}
                    </span>
                  </div>
                  <div className="mt-2 flex gap-2 font-mono text-[8.5px] text-brand-quiet">
                    <span>intent {score.intent}</span>
                    <span>engage {score.engagement}</span>
                    <span>recency {score.recency}</span>
                  </div>
                  <p className="mt-1.5 truncate text-[9.5px] text-brand-muted">{score.reasons[0]}</p>
                </div>
              );
            })}
        </div>
      </div>
    </>
  );
}

/* ------------------------------------------------------------------ */
/* Best-time scheduler                                                 */
/* ------------------------------------------------------------------ */

const slotTone: Record<string, string> = {
  planned: "orange",
  approved: "violet",
  published: "ok",
  skipped: "",
};

export function SchedulerPage({
  growth,
  act,
  busy,
}: {
  growth: Growth;
  act: Act;
  busy: boolean;
}) {
  const [channel, setChannel] = useState<ContentSlot["channel"]>("x");
  const [title, setTitle] = useState("");
  const [group, setGroup] = useState("Authority thread");
  const [suggesting, setSuggesting] = useState(false);

  const groups = useMemo(() => {
    const map = new Map<string, ContentSlot[]>();
    for (const slot of growth.slots) {
      const list = map.get(slot.group) ?? [];
      list.push(slot);
      map.set(slot.group, list);
    }
    return [...map.entries()];
  }, [growth.slots]);

  async function suggest() {
    const result = await act(
      "slotSuggest",
      { channel, title: title || undefined, group },
      "Best-time slot reserved",
    );
    if (result) {
      setSuggesting(false);
      setTitle("");
    }
  }

  return (
    <>
      <div className="page-head">
        <div>
          <div className="eyebrow">
            <span className="pulse-dot" /> PUBLISH WHEN IT LANDS
          </div>
          <h1>
            Best-Time Scheduler<span className="accent-period">.</span>
          </h1>
          <p>Slots chosen from your audience&apos;s real behaviour, grouped into campaigns and threads.</p>
        </div>
        <div className="page-actions">
          <button className="btn btn-dark" onClick={() => setSuggesting((value) => !value)}>
            <CalendarClock size={16} /> Find best time
          </button>
        </div>
      </div>

      <div className="thread-grid cols-4" style={{ marginBottom: 18 }}>
        <MetricTile label="Scheduled this week" value={String(growth.metrics.scheduledThisWeek)} delta="Across all groups" tone="ink" icon={CalendarClock} />
        <MetricTile label="Avg. slot score" value={String(Math.round(growth.slots.reduce((total, slot) => total + slot.score, 0) / Math.max(1, growth.slots.length)))} delta="Predicted engagement" tone="violet" icon={TrendingUp} />
        <MetricTile label="Groups" value={String(groups.length)} delta="Threads & campaigns" icon={Layers} />
        <MetricTile label="Channels" value={String(new Set(growth.slots.map((slot) => slot.channel)).size)} delta="X, LinkedIn, Reddit…" icon={Globe2} />
      </div>

      {suggesting && (
        <div className="thread-panel mb-4">
          <div className="flex items-center justify-between">
            <Kicker>Reserve a slot</Kicker>
            <button className="icon-button" onClick={() => setSuggesting(false)} aria-label="Close">
              <X className="h-4 w-4" />
            </button>
          </div>
          <div className="mt-3 grid gap-3 sm:grid-cols-4">
            <select
              value={channel}
              onChange={(event) => setChannel(event.target.value as ContentSlot["channel"])}
              className="rounded-xl border-2 border-brand-black bg-white px-3 py-2.5 text-[12px] font-semibold outline-none focus:border-brand-orange"
            >
              {["x", "linkedin", "reddit", "newsletter", "blog"].map((option) => (
                <option key={option}>{option}</option>
              ))}
            </select>
            <input
              value={title}
              onChange={(event) => setTitle(event.target.value)}
              placeholder="Post title"
              className="rounded-xl border-2 border-brand-black bg-white px-3 py-2.5 text-[12px] font-semibold outline-none focus:border-brand-orange"
            />
            <input
              value={group}
              onChange={(event) => setGroup(event.target.value)}
              placeholder="Group"
              className="rounded-xl border-2 border-brand-black bg-white px-3 py-2.5 text-[12px] font-semibold outline-none focus:border-brand-orange"
            />
            <button className="btn btn-dark" disabled={busy} onClick={suggest}>
              <Sparkles size={15} /> Reserve
            </button>
          </div>
        </div>
      )}

      <div className="thread-split-layout thread-split-scheduler grid gap-4">
        <div className="thread-panel">
          <div className="flex items-center justify-between">
            <div>
              <Kicker>Queue</Kicker>
              <h3 className="mt-1 text-[17px] font-black tracking-[-0.04em]">Upcoming slots</h3>
            </div>
            <span className="thread-chip orange">{growth.slots.length} planned</span>
          </div>

          <div className="mt-4 space-y-2.5">
            {growth.slots.map((slot) => (
              <div
                key={slot.id}
                className="rounded-xl border border-brand-line bg-white p-3.5 transition-colors hover:border-brand-black"
              >
                <div className="flex items-start gap-3">
                  <div className="grid w-14 shrink-0 place-items-center rounded-lg bg-brand-black py-1.5 text-white">
                    <span className="font-mono text-[8px] uppercase tracking-[0.1em] text-white/50">
                      {new Date(slot.scheduledFor).toLocaleDateString("en-US", { month: "short" })}
                    </span>
                    <span className="text-[18px] font-black leading-none">
                      {new Date(slot.scheduledFor).getDate()}
                    </span>
                    <span className="font-mono text-[8px] text-brand-orange">
                      {new Date(slot.scheduledFor).toLocaleTimeString("en-US", {
                        hour: "2-digit",
                        minute: "2-digit",
                        hour12: false,
                      })}
                    </span>
                  </div>
                  <div className="min-w-0 flex-1">
                    <div className="flex items-center gap-2">
                      <span className="thread-chip">{slot.channel}</span>
                      <span className={`thread-chip ${slotTone[slot.status] ?? ""}`}>{slot.status}</span>
                      <span className="ml-auto font-mono text-[9px] font-bold text-brand-orange">
                        {slot.score}
                      </span>
                    </div>
                    <div className="mt-1.5 truncate text-[12.5px] font-black">{slot.title}</div>
                    <div className="mt-1 text-[10px] leading-snug text-brand-muted">{slot.reason}</div>
                  </div>
                  <div className="flex shrink-0 flex-col gap-1">
                    {slot.status === "planned" && (
                      <button
                        className="row-action"
                        title="Approve"
                        aria-label="Approve slot"
                        disabled={busy}
                        onClick={() => act("slotUpdate", { slotId: slot.id, status: "approved" }, "Slot approved")}
                      >
                        <Check size={13} />
                      </button>
                    )}
                    <button
                      className="row-action"
                      title="Remove"
                      aria-label="Remove slot"
                      disabled={busy}
                      onClick={() => act("slotRemove", { slotId: slot.id }, "Slot removed")}
                    >
                      <Trash2 size={13} />
                    </button>
                  </div>
                </div>
              </div>
            ))}
            {!growth.slots.length && (
              <EmptyState
                icon={CalendarClock}
                title="The queue is clear"
                copy="Reserve a best-time slot and Threadly will place it where your audience actually engages."
              />
            )}
          </div>
        </div>

        <div className="space-y-4">
          {groups.map(([groupName, slots]) => (
            <div key={groupName} className="thread-panel">
              <div className="flex items-center justify-between">
                <div>
                  <Kicker>Group</Kicker>
                  <h3 className="mt-1 text-[15px] font-black tracking-[-0.03em]">{groupName}</h3>
                </div>
                <span className="thread-chip">{slots.length}</span>
              </div>
              <div className="mt-3 space-y-1.5">
                {slots.map((slot) => (
                  <div key={slot.id} className="flex items-center gap-2 text-[10.5px]">
                    <span className="h-1.5 w-1.5 rounded-full bg-brand-orange" />
                    <span className="truncate font-semibold">{slot.title}</span>
                    <span className="ml-auto shrink-0 font-mono text-[8.5px] text-brand-quiet">
                      {new Date(slot.scheduledFor).toLocaleDateString("en-US", { weekday: "short", hour: "2-digit", minute: "2-digit", hour12: false })}
                    </span>
                  </div>
                ))}
              </div>
            </div>
          ))}

          <div className="thread-panel ink">
            <Kicker>Why these times</Kicker>
            <h3 className="relative z-10 mt-2 text-[18px] font-black leading-tight tracking-[-0.04em] text-white">
              Your audience, not a generic listicle.
            </h3>
            <p className="relative z-10 mt-2 text-[11px] leading-relaxed text-white/60">
              Slot scores blend historical engagement, timezone distribution and channel-specific
              behaviour from your own workspace.
            </p>
            <div className="relative z-10 mt-4 space-y-2">
              {(["x", "linkedin", "reddit", "newsletter"] as const).map((item) => {
                const best = growth.slots
                  .filter((slot) => slot.channel === item)
                  .sort((a, b) => b.score - a.score)[0];
                return (
                  <div key={item} className="flex items-center justify-between border-b border-white/10 pb-1.5 text-[10px] last:border-0">
                    <span className="uppercase tracking-[0.1em] text-white/45">{item}</span>
                    <span className="font-bold text-white">
                      {best
                        ? new Date(best.scheduledFor).toLocaleDateString("en-US", {
                            weekday: "long",
                            hour: "2-digit",
                            minute: "2-digit",
                            hour12: false,
                          })
                        : "—"}
                    </span>
                  </div>
                );
              })}
            </div>
          </div>
        </div>
      </div>
    </>
  );
}

/* ------------------------------------------------------------------ */
/* Revenue analytics                                                   */
/* ------------------------------------------------------------------ */

export function RevenuePage({ growth, leads }: { growth: Growth; leads: LeadLite[] }) {
  const channelTotals = useMemo(() => {
    const map = new Map<string, { spend: number; revenue: number; conversions: number }>();
    for (const campaign of growth.campaigns) {
      for (const channel of campaign.channels) {
        const current = map.get(channel.channel) ?? { spend: 0, revenue: 0, conversions: 0 };
        map.set(channel.channel, {
          spend: current.spend + channel.spend,
          revenue: current.revenue + channel.revenue,
          conversions: current.conversions + channel.conversions,
        });
      }
    }
    return [...map.entries()].sort((a, b) => b[1].revenue - a[1].revenue);
  }, [growth.campaigns]);

  const maxRevenue = Math.max(1, ...channelTotals.map(([, value]) => value.revenue));

  const funnel = [
    { label: "Signals captured", value: leads.length },
    { label: "Prospects scored", value: growth.scores.length },
    { label: "Qualified", value: growth.metrics.qualifiedLeads },
    { label: "In conversation", value: leads.filter((lead) => ["conversation", "converted"].includes(lead.stage)).length },
    { label: "Converted", value: leads.filter((lead) => lead.stage === "converted").length },
  ];

  return (
    <>
      <div className="page-head">
        <div>
          <div className="eyebrow">
            <span className="pulse-dot" /> ATTRIBUTION THAT HOLDS UP
          </div>
          <h1>
            Revenue Analytics<span className="accent-period">.</span>
          </h1>
          <p>From the first public signal to closed revenue, in one ledger.</p>
        </div>
        <span className="source-notice">
          <span className="tiny-dot" /> Live workspace records
        </span>
      </div>

      <div className="thread-grid cols-4" style={{ marginBottom: 18 }}>
        <MetricTile label="Pipeline value" value={money(growth.metrics.pipelineValue)} delta="Weighted by stage" tone="ink" icon={Target} />
        <MetricTile label="Attributed revenue" value={money(growth.metrics.attributedRevenue)} delta="Campaign ledger" icon={CircleDollarSign} />
        <MetricTile label="Blended ROAS" value={`${growth.metrics.blendedRoas.toFixed(2)}×`} delta="Across channels" tone="violet" icon={TrendingUp} />
        <MetricTile label="Qualified leads" value={String(growth.metrics.qualifiedLeads)} delta={`${growth.metrics.conversionRate}% converted`} icon={Users} />
      </div>

      <div className="thread-split-layout thread-split-revenue grid gap-4">
        <div className="thread-panel">
          <div className="flex items-center justify-between">
            <div>
              <Kicker>Channel performance</Kicker>
              <h3 className="mt-1 text-[17px] font-black tracking-[-0.04em]">Where the money is made</h3>
            </div>
            <span className="thread-chip orange">{channelTotals.length} channels</span>
          </div>

          <div className="mt-4 space-y-3">
            {channelTotals.map(([channel, value]) => {
              const roas = value.revenue / Math.max(1, value.spend);
              return (
                <div key={channel}>
                  <div className="flex items-center justify-between text-[11px]">
                    <span className="font-bold">{channelLabel[channel] ?? channel}</span>
                    <span className="font-mono text-[9.5px] text-brand-muted">
                      {money(value.revenue)} rev · {money(value.spend)} spend ·{" "}
                      <b className={roas >= 2.5 ? "text-brand-orange" : "text-brand-muted"}>
                        {roas.toFixed(2)}×
                      </b>
                    </span>
                  </div>
                  <div className="mt-1.5 flex h-3 overflow-hidden rounded-full bg-brand-line">
                    <div
                      className={`h-3 ${
                        channel === "google_search"
                          ? "bg-brand-orange"
                          : channel === "linkedin"
                            ? "bg-brand-violet"
                            : channel === "reddit"
                              ? "bg-brand-orangeDark"
                              : channel === "meta"
                                ? "bg-brand-violetPastel"
                                : "bg-brand-black"
                      }`}
                      style={{ width: `${(value.revenue / maxRevenue) * 100}%` }}
                    />
                  </div>
                </div>
              );
            })}
          </div>

          <div className="mt-5 grid grid-cols-3 gap-2 border-t border-brand-line pt-4">
            {[
              ["Spend", money(growth.metrics.adSpend)],
              ["Revenue", money(growth.metrics.attributedRevenue)],
              ["Net", money(growth.metrics.attributedRevenue - growth.metrics.adSpend)],
            ].map(([label, value]) => (
              <div key={label}>
                <Kicker>{label}</Kicker>
                <div className="mt-1 text-[16px] font-black tracking-[-0.04em]">{value}</div>
              </div>
            ))}
          </div>
        </div>

        <div className="thread-panel">
          <Kicker>Funnel</Kicker>
          <h3 className="mt-1 text-[17px] font-black tracking-[-0.04em]">Signal to revenue</h3>
          <div className="mt-4 space-y-2.5">
            {funnel.map((step, index) => (
              <div key={step.label}>
                <div className="flex items-center justify-between text-[10.5px]">
                  <span className="text-brand-muted">{step.label}</span>
                  <span className="font-mono font-bold">{step.value}</span>
                </div>
                <div className="mt-1 h-2 rounded-full bg-brand-line">
                  <div
                    className="h-2 rounded-full bg-gradient-to-r from-brand-orange to-brand-violet"
                    style={{
                      width: `${Math.max(4, (step.value / Math.max(1, funnel[0].value)) * 100)}%`,
                      opacity: 1 - index * 0.12,
                    }}
                  />
                </div>
              </div>
            ))}
          </div>
        </div>
      </div>

      <div className="grid gap-4 md:grid-cols-3" style={{ marginTop: 16 }}>
        {[
          {
            label: "Best source",
            value: channelTotals[0]?.[0] ? channelLabel[channelTotals[0][0]] : "—",
            copy: "Highest attributed revenue this quarter.",
            tone: "orange" as const,
          },
          {
            label: "Sequence reply rate",
            value: pct(growth.metrics.replyRate),
            copy: `${growth.metrics.enrolledProspects} prospects enrolled across cadences.`,
            tone: "violet" as const,
          },
          {
            label: "GEO citation share",
            value: pct(growth.metrics.geoShare),
            copy: "Share of completed web-grounded scans citing your domain.",
            tone: "ink" as const,
          },
        ].map((card) => (
          <div
            key={card.label}
            className={`rounded-2xl border-2 p-5 ${
              card.tone === "ink"
                ? "border-brand-black bg-brand-black text-white"
                : card.tone === "violet"
                  ? "border-brand-violet bg-brand-violetLight"
                  : "border-brand-black bg-white"
            }`}
          >
            <Kicker>{card.label}</Kicker>
            <div className="mt-2 text-[26px] font-black leading-none tracking-[-0.05em]">{card.value}</div>
            <p className={`mt-2 text-[10.5px] leading-relaxed ${card.tone === "ink" ? "text-white/55" : "text-brand-muted"}`}>
              {card.copy}
            </p>
          </div>
        ))}
      </div>
    </>
  );
}

/* ------------------------------------------------------------------ */
/* GEO visibility                                                      */
/* ------------------------------------------------------------------ */

const engineLabel: Record<string, string> = {
  chatgpt: "ChatGPT",
  perplexity: "Perplexity",
  gemini: "Gemini",
  google_ai: "Google AI",
  claude: "Claude",
  tavily: "Tavily AI",
};
const geoEngineCount = 3;

function SeoAuditPanel({
  initialUrl,
  act,
  busy,
}: {
  initialUrl: string;
  act: Act;
  busy: boolean;
}) {
  const [url, setUrl] = useState(initialUrl);
  const [report, setReport] = useState<SeoAuditReport | null>(null);
  const [error, setError] = useState("");

  useEffect(() => {
    try {
      const saved = sessionStorage.getItem("threadly-latest-seo-audit");
      if (!saved) return;
      const parsed = JSON.parse(saved) as Partial<SeoAuditReport>;
      if (typeof parsed.url === "string" && typeof parsed.checkedAt === "string" && Array.isArray(parsed.checks)) {
        setReport(parsed as SeoAuditReport);
        setUrl((current) => current || parsed.url || "");
      }
    } catch {
      sessionStorage.removeItem("threadly-latest-seo-audit");
    }
  }, []);

  useEffect(() => {
    if (!url.trim() && initialUrl) setUrl(initialUrl);
  }, [initialUrl, url]);

  async function audit() {
    if (!url.trim()) return;
    setError("");
    const result = await act("seoAudit", { url: url.trim() }, "Site audit complete");
    if (result?.audit && typeof result.audit === "object") {
      const nextReport = result.audit as SeoAuditReport;
      setReport(nextReport);
      setUrl(nextReport.url);
      try { sessionStorage.setItem("threadly-latest-seo-audit", JSON.stringify(nextReport)); } catch { /* Keep the report in memory if storage is unavailable. */ }
    } else if (!result) {
      setError("The page could not be audited. Check the URL and try again.");
    }
  }

  return (
    <div className="space-y-4">
      <section className="thread-panel">
        <div className="flex items-start gap-3">
          <span className="grid h-10 w-10 shrink-0 place-items-center rounded-xl bg-brand-orangeLight text-brand-orange"><Search size={18}/></span>
          <div className="min-w-0 flex-1">
            <Kicker>On-page SEO + AI discoverability</Kicker>
            <h2 className="mt-1 text-[18px] font-black tracking-[-0.04em]">Audit a public page</h2>
            <p className="mt-1 max-w-3xl text-[11px] leading-relaxed text-brand-muted">Check what search engines and answer engines can actually read: page metadata, structure, crawl files, and useful content. Every finding is based on the page fetched now.</p>
          </div>
        </div>
        <div className="mt-4 flex flex-col gap-2 sm:flex-row">
          <input
            type="url"
            value={url}
            onChange={(event) => { setUrl(event.target.value); setReport(null); }}
            onKeyDown={(event) => { if (event.key === "Enter" && !busy) void audit(); }}
            placeholder="https://example.com/page"
            aria-label="Public page URL to audit"
            className="min-w-0 flex-1 rounded-xl border-2 border-brand-line bg-white px-3 py-2.5 text-[12px] font-semibold outline-none focus:border-brand-orange"
          />
          <button className="btn btn-dark justify-center" disabled={busy || !url.trim()} onClick={() => void audit()}>
            <RefreshCw size={15} className={busy ? "animate-spin" : ""}/>{busy ? "Auditing…" : "Run site audit"}
          </button>
        </div>
        {error && <p className="mt-2 text-[11px] font-semibold text-red-700" role="alert">{error}</p>}
        <p className="mt-2 text-[9.5px] leading-relaxed text-brand-quiet">Public HTTPS pages only. Audits are rate-limited and never follow instructions found in page content.</p>
      </section>

      {report ? (
        <>
          <section className="thread-panel">
            <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
              <div className="min-w-0">
                <Kicker>Page audit · {new Date(report.checkedAt).toLocaleString()}</Kicker>
                <h3 className="mt-1 truncate text-[15px] font-black">{report.page.title || report.url}</h3>
                <p className="mt-1 truncate text-[10px] text-brand-muted">{report.url}</p>
              </div>
              <div className="flex items-center gap-3 rounded-xl bg-brand-paper px-4 py-3">
                <div className="text-[30px] font-black leading-none tracking-[-0.06em]">{report.score}</div>
                <div><div className="font-mono text-[9px] font-bold uppercase tracking-wider text-brand-orangeDark">Technical readiness</div><div className="mt-1 text-[9px] text-brand-muted">Based on {report.checks.filter((item) => item.status !== "info").length} page checks</div></div>
              </div>
            </div>
            <div className="mt-4 grid grid-cols-2 gap-2 md:grid-cols-4">
              <AuditStat label="Readable words" value={report.page.wordCount.toLocaleString()}/>
              <AuditStat label="Headings" value={String(report.page.headings)}/>
              <AuditStat label="Schema types" value={String(report.page.schemaTypes.length)}/>
              <AuditStat label="Findings" value={String(report.checks.filter((item) => item.status === "warning" || item.status === "issue").length)}/>
            </div>
          </section>
          <div className="grid gap-3 lg:grid-cols-2">
            {report.checks.map((item) => <AuditFinding key={item.id} item={item}/>)}
          </div>
          <section className="thread-panel gradient">
            <Kicker>Turn findings into a GEO content brief</Kicker>
            <h3 className="mt-2 text-[17px] font-black text-white">Make the answer easy to find, understand, and cite.</h3>
            <p className="mt-1 max-w-3xl text-[11px] leading-relaxed text-white/70">Use the tracked buyer questions in AI visibility with these crawl and content findings. A strong page combines clear answers, verifiable facts, helpful structure, and working discovery signals.</p>
            <button className="mt-4 inline-flex items-center gap-2 rounded-xl bg-white px-4 py-2.5 text-[11px] font-black text-brand-black" disabled={busy} onClick={() => act("slotSuggest", { channel: "blog", title: `SEO + GEO improvements · ${report.page.title || new URL(report.url).hostname}`, group: "Search visibility" }, "Content brief reserved")}>
              Reserve a content brief <ArrowUpRight size={14}/>
            </button>
          </section>
        </>
      ) : (
        <section className="thread-panel">
          <Kicker>What this checks</Kicker>
          <div className="mt-3 grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
            {["Search snippets and canonical URLs", "Headings, readable page text, and image descriptions", "Open Graph and Schema.org structured data", "robots.txt, XML sitemap, and optional llms.txt"].map((item) => <div key={item} className="rounded-xl border border-brand-line bg-brand-paper p-3 text-[10.5px] font-semibold leading-relaxed">{item}</div>)}
          </div>
        </section>
      )}
    </div>
  );
}

function AuditStat({ label, value }: { label: string; value: string }) {
  return <div className="rounded-xl border border-brand-line bg-brand-paper p-3"><Kicker>{label}</Kicker><div className="mt-1 text-[20px] font-black tracking-[-0.04em]">{value}</div></div>;
}

function AuditFinding({ item }: { item: SeoAuditCheck }) {
  const statusClass = item.status === "good" ? "border-emerald-200 bg-emerald-50 text-emerald-800" : item.status === "issue" ? "border-red-200 bg-red-50 text-red-800" : item.status === "warning" ? "border-amber-200 bg-amber-50 text-amber-900" : "border-brand-line bg-brand-paper text-brand-muted";
  return (
    <article className="thread-panel !p-4">
      <div className="flex items-start justify-between gap-3">
        <div className="min-w-0"><h3 className="text-[12px] font-black">{item.label}</h3><p className="mt-1 text-[10.5px] leading-relaxed text-brand-muted">{item.detail}</p></div>
        <span className={`shrink-0 rounded-full border px-2 py-1 font-mono text-[8px] font-bold uppercase ${statusClass}`}>{item.status}</span>
      </div>
      <p className="mt-3 text-[10px] leading-relaxed"><span className="font-bold">Next step: </span>{item.recommendation}</p>
      {item.evidence && <p className="mt-2 break-words rounded-lg bg-brand-paper px-2.5 py-2 font-mono text-[9px] leading-relaxed text-brand-quiet">{item.evidence}</p>}
    </article>
  );
}

export function GeoPage({
  growth,
  act,
  busy,
  initialUrl = "",
}: {
  growth: Growth;
  act: Act;
  busy: boolean;
  initialUrl?: string;
}) {
  const [panel, setPanel] = useState<"visibility" | "audit">("visibility");
  const [adding, setAdding] = useState(false);
  const [query, setQuery] = useState("");
  const [intent, setIntent] = useState<GeoQuery["intent"]>("commercial");
  const [selectedId, setSelectedId] = useState<string | null>(growth.geo[0]?.id ?? null);

  const selected = growth.geo.find((item) => item.id === selectedId) ?? growth.geo[0];

  async function add() {
    if (!query.trim()) return;
    const result = await act(
      "geoAdd",
      { query, intent },
      "Question added to GEO tracking",
    );
    if (result) {
      const created = result.query as GeoQuery | undefined;
      if (created) setSelectedId(created.id);
      setAdding(false);
      setQuery("");
    }
  }

  return (
    <>
      <div className="page-head">
        <div>
          <div className="eyebrow">
            <span className="pulse-dot" /> SEARCH + GENERATIVE ENGINE OPTIMIZATION
          </div>
          <h1>
            Search &amp; AI Visibility<span className="accent-period">.</span>
          </h1>
          <p>Check live, web-grounded answers and their sources for your tracked buyer questions.</p>
        </div>
        <div className="page-actions">
          <button className="btn btn-outline" onClick={() => setAdding((value) => !value)}>
            <Plus size={16} /> Track question
          </button>
          <button
            className="btn btn-dark"
            disabled={busy || growth.geo.length === 0}
            onClick={() => act("geoScan", {}, "All questions rescanned")}
          >
            <RefreshCw size={16} /> Rescan all
          </button>
        </div>
      </div>

      <div className="mb-4 flex gap-1 overflow-x-auto rounded-xl border border-brand-line bg-white p-1" role="tablist" aria-label="Search visibility tools">
        <button type="button" role="tab" aria-selected={panel === "visibility"} onClick={() => setPanel("visibility")} className={`shrink-0 rounded-lg px-3 py-2 text-[10px] font-bold ${panel === "visibility" ? "bg-brand-black text-white" : "text-brand-muted hover:bg-brand-paper"}`}>AI answer visibility</button>
        <button type="button" role="tab" aria-selected={panel === "audit"} onClick={() => setPanel("audit")} className={`shrink-0 rounded-lg px-3 py-2 text-[10px] font-bold ${panel === "audit" ? "bg-brand-black text-white" : "text-brand-muted hover:bg-brand-paper"}`}>SEO + GEO site audit</button>
      </div>

      {panel === "audit" ? <SeoAuditPanel initialUrl={initialUrl} act={act} busy={busy}/> : (
      <>

      <div className="thread-grid cols-4" style={{ marginBottom: 18 }}>
        <MetricTile label="Domain citation share" value={pct(growth.metrics.geoShare)} delta="Across completed provider scans" tone="ink" icon={Globe2} />
        <MetricTile label="Tracked questions" value={String(growth.geo.length)} delta="Add questions your buyers ask" icon={Target} />
        <MetricTile
          label="Citations"
          value={String(
            growth.geo.reduce(
              (total, item) => total + item.engines.filter((engine) => engine.status === "scanned" && engine.cited).length,
              0,
            ),
          )}
          delta="From provider source citations"
          tone="violet"
          icon={Link2}
        />
        <MetricTile
          label="Open gaps"
          value={String(growth.geo.filter((item) => item.engines.some((engine) => engine.status === "scanned") && item.shareOfAnswer === 0).length)}
          delta="No tracked domain citations"
          icon={Flame}
        />
      </div>

      <div className="mb-4 rounded-xl border border-brand-line bg-white px-4 py-3 text-[11px] leading-relaxed text-brand-muted">
        Scans use OpenAI web search and Gemini Google Search grounding. Add <code>OPENAI_API_KEY</code> and/or <code>GEMINI_API_KEY</code> in Vercel Project Settings → Environment Variables, then redeploy. Each scan makes a billable provider request. Only source URLs returned by the provider count as citations.
      </div>

      {adding && (
        <div className="thread-panel mb-4">
          <div className="flex items-center justify-between">
            <Kicker>Track a buyer question</Kicker>
            <button className="icon-button" onClick={() => setAdding(false)} aria-label="Close">
              <X className="h-4 w-4" />
            </button>
          </div>
          <div className="mt-3 grid gap-3 sm:grid-cols-[1.6fr_0.6fr_auto]">
            <input
              value={query}
              onChange={(event) => setQuery(event.target.value)}
              placeholder="e.g. best lead generation platform for agencies"
              className="rounded-xl border-2 border-brand-black bg-white px-3 py-2.5 text-[12px] font-semibold outline-none focus:border-brand-orange"
            />
            <select
              value={intent}
              onChange={(event) => setIntent(event.target.value as GeoQuery["intent"])}
              className="rounded-xl border-2 border-brand-black bg-white px-3 py-2.5 text-[12px] font-semibold outline-none focus:border-brand-orange"
            >
              <option value="commercial">Commercial</option>
              <option value="comparison">Comparison</option>
              <option value="informational">Informational</option>
            </select>
            <button className="btn btn-dark" disabled={busy || !query.trim()} onClick={add}>
              <Plus size={15} /> Add
            </button>
          </div>
        </div>
      )}

      <div className="thread-split-layout thread-split-geo grid gap-4">
        <div className="space-y-2.5">
          {growth.geo.length === 0 && (
            <div className="thread-panel text-center">
              <Globe2 className="mx-auto h-7 w-7 text-brand-violet" />
              <h3 className="mt-3 text-[14px] font-black">Track your first buyer question</h3>
              <p className="mt-1 text-[11px] leading-relaxed text-brand-muted">Add a question people ask before choosing a product. Then run a scan to see grounded answers and source links.</p>
              <button className="btn btn-dark mt-3" onClick={() => setAdding(true)}><Plus size={15} /> Track question</button>
            </div>
          )}
          {growth.geo.map((item) => {
            const active = item.id === selected?.id;
            const scannedCount = item.engines.filter((engine) => engine.status === "scanned").length;
            const cited = item.engines.filter((engine) => engine.status === "scanned" && engine.cited).length;
            return (
              <button
                key={item.id}
                type="button"
                onClick={() => setSelectedId(item.id)}
                className={`w-full rounded-2xl border-2 p-4 text-left transition-all ${
                  active
                    ? "border-brand-black bg-white shadow-[5px_5px_0_#ff4500]"
                    : "border-brand-line bg-white hover:border-brand-black"
                }`}
              >
                <div className="flex items-start justify-between gap-3">
                  <div className="min-w-0">
                    <div className="flex items-center gap-2">
                      <span className={`thread-chip ${item.intent === "commercial" ? "orange" : "violet"}`}>
                        {item.intent}
                      </span>
                    </div>
                    <div className="mt-2 text-[12.5px] font-black leading-snug">{item.query}</div>
                  </div>
                  <div className="shrink-0 text-right">
                    <div className="text-[19px] font-black leading-none tracking-[-0.05em]">
                      {scannedCount ? `${item.shareOfAnswer}%` : "—"}
                    </div>
                    <div className={`font-mono text-[8.5px] font-bold ${item.trend >= 0 ? "text-brand-orange" : "text-brand-quiet"}`}>
                      {scannedCount ? `${item.trend >= 0 ? "↑" : "↓"} ${Math.abs(item.trend).toFixed(1)} pt` : "not scanned"}
                    </div>
                  </div>
                </div>
                <div className="mt-2.5 flex items-center gap-1">
                  {item.engines.map((engine) => (
                    <span
                      key={engine.engine}
                      title={`${engineLabel[engine.engine]} · ${engine.status === "scanned" ? (engine.cited ? "domain cited" : "not cited") : engine.status.replace("_", " ")}`}
                      className={`grid h-5 w-5 place-items-center rounded-md font-mono text-[7px] font-black ${
                        engine.status === "scanned" && engine.cited
                          ? "bg-brand-orange text-white"
                          : "border border-brand-line bg-brand-paper text-brand-quiet"
                      }`}
                    >
                      {engineLabel[engine.engine].slice(0, 2).toUpperCase()}
                    </span>
                  ))}
                  <span className="ml-auto font-mono text-[8.5px] text-brand-quiet">
                    {scannedCount ? `${cited}/${scannedCount} citations` : `0/${geoEngineCount} scanned`}
                  </span>
                </div>
              </button>
            );
          })}
        </div>

        {selected && (
          <div className="space-y-4">
            <div className="thread-panel">
              <div className="flex items-start justify-between">
                <div>
                  <Kicker>Answer breakdown</Kicker>
                  <h3 className="mt-1 text-[17px] font-black leading-snug tracking-[-0.04em]">
                    {selected.query}
                  </h3>
                </div>
                <button
                  className="btn btn-outline"
                  disabled={busy}
                  onClick={() => act("geoScan", { queryId: selected.id }, "Question rescanned")}
                >
                  <RefreshCw size={14} /> Rescan
                </button>
              </div>

              <div className="mt-4 space-y-2">
                {selected.engines.map((engine) => (
                  <div
                    key={engine.engine}
                    className="flex items-center gap-3 rounded-xl border border-brand-line bg-brand-paper px-3 py-2.5"
                  >
                    <span
                      className={`grid h-7 w-7 shrink-0 place-items-center rounded-lg text-[8px] font-black ${
                        engine.status === "scanned" && engine.cited ? "bg-brand-black text-white" : "bg-brand-line text-brand-muted"
                      }`}
                    >
                      {engineLabel[engine.engine].slice(0, 2).toUpperCase()}
                    </span>
                    <div className="min-w-0 flex-1">
                      <div className="flex items-center gap-2">
                        <span className="text-[11px] font-black">{engineLabel[engine.engine]}</span>
                        <span
                          className={`thread-chip ${engine.status === "scanned" && engine.cited ? "ok" : engine.status === "failed" ? "orange" : ""}`}
                        >
                          {engine.status === "scanned" ? (engine.cited ? "domain cited" : "not cited") : engine.status === "not_configured" ? "not configured" : engine.status === "failed" ? "scan failed" : "not scanned"}
                        </span>
                      </div>
                      <p className="mt-0.5 text-[10px] leading-relaxed text-brand-muted">{engine.answer}</p>
                      {engine.sources.length > 0 && (
                        <div className="mt-1 flex flex-wrap gap-x-3 gap-y-1">
                          {engine.sources.map((source) => (
                            <a key={source.url} href={source.url} target="_blank" rel="noreferrer" className="max-w-full truncate text-[9px] font-bold text-brand-violet underline" onClick={(event) => event.stopPropagation()}>
                              {source.title || source.url}
                            </a>
                          ))}
                        </div>
                      )}
                    </div>
                    {engine.status === "scanned" && <div className="shrink-0 font-mono text-[9px] text-brand-quiet">{engine.sources.length} sources</div>}
                  </div>
                ))}
              </div>
            </div>

            <div className="thread-panel gradient">
              <Kicker>Next best action</Kicker>
              <h3 className="mt-2 text-[18px] font-black leading-tight tracking-[-0.04em] text-white">
                Close the gap before a competitor owns the answer.
              </h3>
              <p className="mt-2 text-[11px] leading-relaxed text-white/75">{selected.gap}</p>
              <button
                className="mt-4 inline-flex items-center gap-2 rounded-xl bg-white px-4 py-2.5 text-[11px] font-black text-brand-black"
                onClick={() => act("slotSuggest", { channel: "blog", title: `GEO fix · ${selected.query}`, group: "GEO series" }, "Content slot reserved")}
                disabled={busy}
              >
                Reserve a fix slot <ArrowUpRight size={14} />
              </button>
            </div>

            <div className="thread-panel">
              <Kicker>How Threadly measures this</Kicker>
              <p className="mt-2 text-[10.5px] leading-relaxed text-brand-muted">
                Scans run when you request them. A domain citation counts only when the provider returns a source URL on your configured domain. Results reflect provider search output at scan time; they do not represent the consumer-facing ChatGPT or Gemini product exactly.
              </p>
            </div>
          </div>
        )}
      </div>
      </>
      )}
    </>
  );
}

/* ------------------------------------------------------------------ */
/* Live stream hook                                                    */
/* ------------------------------------------------------------------ */

export function useLiveStream(enabled: boolean, initial: LiveEvent[], getIdToken?: () => Promise<string>) {
  const [events, setEvents] = useState<LiveEvent[]>(initial);
  const [connected, setConnected] = useState(false);

  useEffect(() => {
    // An empty seed is common while workspace data is loading. Returning the
    // current state in that case avoids a render loop when callers pass `[]`
    // inline, since that array has a new identity on every render.
    if (!initial.length) return;
    setEvents((current) => (current.length ? current : initial));
  }, [initial]);

  useEffect(() => {
    if (!enabled || typeof window === "undefined") return;
    let cancelled = false;
    let retryTimer: ReturnType<typeof setTimeout> | undefined;
    const controller = new AbortController();

    const connect = async () => {
      while (!cancelled) {
        try {
          const token = getIdToken ? await getIdToken() : "";
          if (cancelled) return;
          const response = await fetch("/api/stream", {
            headers: token ? { Authorization: `Bearer ${token}` } : undefined,
            cache: "no-store",
            signal: controller.signal,
          });
          if (!response.ok || !response.body) throw new Error("Live feed unavailable.");

          const reader = response.body.getReader();
          const decoder = new TextDecoder();
          let buffer = "";
          while (!cancelled) {
            const { done, value } = await reader.read();
            if (done) break;
            buffer += decoder.decode(value, { stream: true });
            const frames = buffer.split(/\r?\n\r?\n/);
            buffer = frames.pop() || "";
            for (const frame of frames) {
              const lines = frame.split(/\r?\n/);
              const eventName = lines.find(line => line.startsWith("event:"))?.slice(6).trim();
              const data = lines.filter(line => line.startsWith("data:")).map(line => line.slice(5).trim()).join("\n");
              if (eventName === "hello") setConnected(true);
              if (eventName === "snapshot") {
                try {
                  const payload = JSON.parse(data) as { events?: LiveEvent[] };
                  if (!cancelled && Array.isArray(payload.events) && payload.events.length) setEvents(payload.events);
                  if (!cancelled) setConnected(true);
                } catch {
                  /* Ignore malformed frames and keep the connection alive. */
                }
              }
              if (eventName === "error") setConnected(false);
            }
          }
          await reader.cancel().catch(() => undefined);
        } catch {
          if (cancelled) return;
        }
        if (!cancelled) setConnected(false);
        await new Promise<void>(resolve => {
          retryTimer = setTimeout(resolve, 3000);
        });
      }
    };

    void connect();

    return () => {
      cancelled = true;
      controller.abort();
      if (retryTimer) clearTimeout(retryTimer);
    };
    // getIdToken is intentionally excluded: callers pass a memoised function.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [enabled]);

  return { events, connected };
}
