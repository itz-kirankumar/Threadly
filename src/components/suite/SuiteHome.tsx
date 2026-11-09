"use client";

import { useCallback, useEffect, useState } from "react";
import type { User } from "firebase/auth";
import { priorityOf } from "@/lib/leads/score";
import type { CrmAccountsState, CrmLead, CrmStats, DealStage, LeadStage } from "@/lib/crm/types";
import type { AuditEntry, WorkspaceState } from "@/lib/geo/types";
import { ACTION_LABELS } from "@/components/geo/ActivityPanel";
import { appById, type AppId } from "@/lib/suite/apps";
import { APP_ICONS, ShellIcon } from "./icons";

interface Snapshot {
  leads: CrmLead[] | null;
  stats: CrmStats | null;
  accounts: CrmAccountsState | null;
  credits: { balance: number; granted: number; spent: number } | null;
  run: { companies: number; selected: string[]; contacts: number; competitors: number; ranAt: string | null } | null;
  campaigns: number | "off" | null;
  audit: AuditEntry[] | null;
}

const EMPTY: Snapshot = { leads: null, stats: null, accounts: null, credits: null, run: null, campaigns: null, audit: null };

function ago(iso: string | null): string {
  if (!iso) return "never";
  const minutes = Math.round((Date.now() - Date.parse(iso)) / 60_000);
  if (minutes < 60) return `${Math.max(1, minutes)} min ago`;
  const hours = Math.round(minutes / 60);
  if (hours < 48) return `${hours} h ago`;
  return `${Math.round(hours / 24)} days ago`;
}

function greeting(user: User | null): string {
  const hour = new Date().getHours();
  const part = hour < 12 ? "Good morning" : hour < 17 ? "Good afternoon" : "Good evening";
  const name = user?.displayName?.trim().split(/\s+/)[0] || (user?.email ?? "").split("@")[0];
  return name ? `${part}, ${name}` : part;
}

const LEAD_STAGES: Array<{ id: LeadStage; label: string }> = [
  { id: "new", label: "New" },
  { id: "contacted", label: "Contacted" },
  { id: "in_sequence", label: "In sequence" },
  { id: "follow_up_due", label: "Follow-up due" },
  { id: "replied", label: "Replied" },
  { id: "qualified", label: "Qualified" },
  { id: "won", label: "Won" },
];

const DEAL_STAGES: DealStage[] = ["qualification", "discovery", "proposal", "negotiation", "won"];

type Step = { app: AppId; title: string; value: string; note: string; state: "done" | "next" | "waiting" | "off" };

// Home: the whole suite as one flow. Each app's live numbers sit in the order
// the work moves (profile, find, qualify, manage, reach out, get found), the
// next actions say what to do now, and the activity feed shows what changed.
export default function SuiteHome({ user, state, authedFetch, onOpenApp, canAdmin }: {
  user: User | null;
  state: WorkspaceState;
  authedFetch: (path: string, init?: RequestInit) => Promise<unknown>;
  onOpenApp: (id: AppId) => void;
  canAdmin: boolean;
}) {
  const [snap, setSnap] = useState<Snapshot>(EMPTY);
  const [failed, setFailed] = useState<string[]>([]);
  const [loading, setLoading] = useState(true);

  const load = useCallback(async () => {
    setLoading(true);
    const miss: string[] = [];
    const get = async <T,>(path: string, label: string | null): Promise<T | null> => {
      try {
        return (await authedFetch(path)) as T;
      } catch {
        if (label) miss.push(label);
        return null;
      }
    };
    const [leads, accounts, credits, prospecting, campaigns, audit] = await Promise.all([
      get<{ leads: CrmLead[]; stats: CrmStats }>("/api/crm/leads", "Leads"),
      get<CrmAccountsState>("/api/crm/accounts", "CRM"),
      get<{ balance: number; granted: number; spent: number }>("/api/credits", "credits"),
      get<{ state: { competitors?: { items: unknown[] }; companies?: { items: Array<{ selected: boolean; domain: string }>; ranAt: string }; contacts?: { items: unknown[] } } }>("/api/prospecting", "Prospecting"),
      canAdmin ? get<{ campaigns: unknown[] }>("/api/outbound/campaigns", null) : Promise.resolve(null),
      get<{ entries: AuditEntry[] }>("/api/geo/audit", null),
    ]);
    const companies = prospecting?.state.companies;
    setSnap({
      leads: leads?.leads ?? null,
      stats: leads?.stats ?? null,
      accounts,
      credits,
      run: prospecting
        ? {
            companies: companies?.items.length ?? 0,
            selected: (companies?.items ?? []).filter((c) => c.selected).map((c) => c.domain.toLowerCase()),
            contacts: prospecting.state.contacts?.items.length ?? 0,
            competitors: prospecting.state.competitors?.items.length ?? 0,
            ranAt: companies?.ranAt ?? null,
          }
        : null,
      campaigns: campaigns ? campaigns.campaigns.length : "off",
      audit: audit?.entries ?? null,
    });
    setFailed(miss);
    setLoading(false);
  }, [authedFetch, canAdmin]);

  useEffect(() => {
    void load();
  }, [load]);

  const brand = state.brand!;
  const latest = state.snapshots.length ? state.snapshots[state.snapshots.length - 1] : null;
  const leads = snap.leads ?? [];
  const bands = { Hot: 0, Warm: 0, Cold: 0 };
  for (const l of leads) if (l.score) bands[priorityOf(l.score)]++;
  const deals = snap.accounts?.deals ?? [];
  const openDeals = deals.filter((d) => d.stage !== "won" && d.stage !== "lost");
  const openValue = openDeals.reduce((sum, d) => sum + (d.value || 0), 0);
  const currency = openDeals[0]?.currency ?? "USD";
  const saved = new Set(leads.map((l) => l.domain.toLowerCase()));
  const notSaved = snap.run ? snap.run.selected.filter((d) => !saved.has(d)).length : 0;
  const withEmail = leads.filter((l) => l.email).length;
  const lastScan = state.runs[0]?.startedAt ?? null;
  const scanStale = lastScan ? Date.now() - Date.parse(lastScan) > 7 * 86_400_000 : true;

  const steps: Step[] = [
    { app: "settings", title: "Brand profile", value: brand.competitors.length ? `${brand.competitors.length} rival${brand.competitors.length === 1 ? "" : "s"}` : "Set up", note: brand.category || brand.domain, state: brand.competitors.length ? "done" : "next" },
    { app: "prospect", title: "Prospecting", value: snap.run?.ranAt ? `${snap.run.companies} found` : "Not run", note: snap.run?.ranAt ? `${snap.run.contacts} decision makers · ${ago(snap.run.ranAt)}` : "Find customers from your site", state: snap.run?.ranAt ? (notSaved ? "next" : "done") : "next" },
    { app: "outreach", title: "Leads", value: snap.leads ? `${leads.length} saved` : "—", note: snap.leads ? `${bands.Hot} hot · ${snap.stats?.followUpsDue ?? 0} follow-ups due` : "Could not be read", state: leads.length ? (snap.stats?.followUpsDue || bands.Hot ? "next" : "done") : "waiting" },
    { app: "crm", title: "CRM", value: snap.accounts ? `${snap.accounts.companies.length} accounts` : "—", note: snap.accounts ? `${openDeals.length} open deal${openDeals.length === 1 ? "" : "s"}${openValue ? ` · ${openValue.toLocaleString()} ${currency}` : ""}` : "Could not be read", state: openDeals.length ? "done" : leads.length ? "next" : "waiting" },
    { app: "enterprise", title: "Outbound", value: snap.campaigns === "off" ? (canAdmin ? "Off" : "Admins") : snap.campaigns === null ? "—" : `${snap.campaigns} campaign${snap.campaigns === 1 ? "" : "s"}`, note: snap.campaigns === "off" ? (canAdmin ? "Not enabled on this workspace" : "Run by workspace admins") : `${withEmail} lead${withEmail === 1 ? "" : "s"} with an email to import`, state: snap.campaigns === "off" ? "off" : snap.campaigns ? "done" : withEmail ? "next" : "waiting" },
    { app: "overview", title: "AI visibility", value: latest ? `${latest.mentionRate}%` : "No scan", note: latest ? `mentioned · ${state.queries.length} questions · ${ago(lastScan)}` : `${state.queries.length} question${state.queries.length === 1 ? "" : "s"} ready`, state: latest && !scanStale ? "done" : "next" },
  ];

  const next: Array<{ text: string; app: AppId; tag: string }> = [];
  if (!brand.competitors.length) next.push({ text: "Add the competitors you lose deals to: scans, prospecting and social search all use them.", app: "settings", tag: "Profile" });
  if (!snap.run?.ranAt) next.push({ text: "Run prospecting on your website to find competitors, customers and decision makers.", app: "prospect", tag: "Find" });
  else if (notSaved > 0) next.push({ text: `Save ${notSaved} selected compan${notSaved === 1 ? "y" : "ies"} from your last prospecting run to Leads.`, app: "prospect", tag: "Find" });
  if (bands.Hot) next.push({ text: `Work the ${bands.Hot} hot lead${bands.Hot === 1 ? "" : "s"} first.`, app: "outreach", tag: "Leads" });
  if (snap.stats?.followUpsDue) next.push({ text: `${snap.stats.followUpsDue} follow-up${snap.stats.followUpsDue === 1 ? " is" : "s are"} due today.`, app: "outreach", tag: "Leads" });
  if (leads.length && !deals.length) next.push({ text: "Open a deal in CRM when a lead becomes a real opportunity.", app: "crm", tag: "CRM" });
  if (typeof snap.campaigns === "number" && withEmail && !snap.campaigns) next.push({ text: `Load ${withEmail} lead${withEmail === 1 ? "" : "s"} with an email into an Outbound campaign.`, app: "enterprise", tag: "Outbound" });
  if (!state.queries.length) next.push({ text: "Add the questions your buyers ask AI assistants.", app: "queries", tag: "Visibility" });
  else if (scanStale) next.push({ text: lastScan ? `Your last AI visibility scan was ${ago(lastScan)}: run a fresh one.` : "Run your first AI visibility scan.", app: "runs", tag: "Visibility" });
  if (snap.credits && snap.credits.balance < 50) next.push({ text: `Only ${snap.credits.balance} credits left: top up before the next run.`, app: "settings", tag: "Billing" });

  const stageCounts = LEAD_STAGES.map((s) => ({ ...s, count: leads.filter((l) => l.stage === s.id).length }));
  const maxStage = Math.max(1, ...stageCounts.map((s) => s.count));
  const dealCounts = DEAL_STAGES.map((s) => {
    const inStage = deals.filter((d) => d.stage === s);
    return { stage: s, count: inStage.length, value: inStage.reduce((sum, d) => sum + (d.value || 0), 0) };
  });

  const stateStyle: Record<Step["state"], string> = {
    done: "bg-emerald-500/15 text-emerald-300",
    next: "bg-violet-500/15 text-violet-300",
    waiting: "bg-white/5 text-zinc-500",
    off: "bg-white/5 text-zinc-500",
  };
  const stateLabel: Record<Step["state"], string> = { done: "On track", next: "Action", waiting: "Waiting", off: "Off" };

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-end justify-between gap-3">
        <div>
          <p className="text-xs text-zinc-500">{new Date().toLocaleDateString(undefined, { weekday: "long", month: "long", day: "numeric" })}</p>
          <h1 className="mt-1 text-2xl font-semibold tracking-tight text-white">{greeting(user)}</h1>
          <p className="mt-1 text-sm text-zinc-400">Everything {brand.name} is doing to find buyers and get found, in one place.</p>
        </div>
        <button type="button" onClick={() => void load()} disabled={loading} className="ui-btn-secondary rounded-lg px-3 py-1.5 text-xs">
          {loading ? "Refreshing…" : "Refresh"}
        </button>
      </div>

      <section aria-label="How your apps connect" className="rounded-2xl border border-white/10 bg-white/[0.03] p-4">
        <div className="flex items-center justify-between gap-2">
          <h2 className="text-sm font-semibold text-white">Your growth flow</h2>
          <p className="hidden text-xs text-zinc-500 sm:block">Each app hands its work to the next</p>
        </div>
        <ol className="mt-3 grid gap-2 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-6">
          {steps.map((step, i) => {
            const meta = appById(step.app === "overview" ? "queries" : step.app);
            return (
              <li key={step.title} className="relative">
                <button
                  type="button"
                  onClick={() => onOpenApp(step.app === "overview" ? (latest ? "citations" : "queries") : step.app)}
                  className="suite-flow-step group flex h-full w-full flex-col rounded-xl border border-white/10 bg-white/[0.02] p-3 text-left transition hover:border-violet-400/50"
                >
                  <div className="flex items-center justify-between gap-2">
                    <span className={`suite-tile ${meta.tile} flex h-8 w-8 items-center justify-center rounded-lg`}>{APP_ICONS[meta.id]}</span>
                    <span className={`rounded-full px-2 py-0.5 text-[10px] font-semibold ${stateStyle[step.state]}`}>{stateLabel[step.state]}</span>
                  </div>
                  <p className="mt-3 text-[11px] font-medium uppercase tracking-wider text-zinc-500">{i + 1}. {step.title}</p>
                  <p className="mt-0.5 text-lg font-semibold tabular-nums text-white">{step.value}</p>
                  <p className="mt-0.5 line-clamp-2 text-xs text-zinc-400">{step.note}</p>
                </button>
                {i < steps.length - 1 && <span aria-hidden className="suite-flow-arrow absolute -right-2 top-1/2 z-10 hidden -translate-y-1/2 text-zinc-600 xl:block">{ShellIcon.arrow}</span>}
              </li>
            );
          })}
        </ol>
      </section>

      <div className="grid gap-4 lg:grid-cols-[minmax(0,1.25fr)_minmax(0,1fr)]">
        <section className="rounded-2xl border border-white/10 bg-white/[0.03] p-4" aria-label="Next actions">
          <h2 className="text-sm font-semibold text-white">Next actions</h2>
          {next.length ? (
            <ol className="mt-3 divide-y divide-white/[0.06]">
              {next.slice(0, 6).map((n) => (
                <li key={n.text}>
                  <button type="button" onClick={() => onOpenApp(n.app)} className="group flex w-full items-center gap-3 py-2.5 text-left">
                    <span className={`suite-tile ${appById(n.app).tile} flex h-7 w-7 shrink-0 items-center justify-center rounded-md`}>{APP_ICONS[n.app]}</span>
                    <span className="min-w-0 flex-1 text-sm text-zinc-200 group-hover:text-white">{n.text}</span>
                    <span className="shrink-0 text-[11px] text-zinc-500">{n.tag}</span>
                    <span className="shrink-0 text-zinc-600 transition group-hover:translate-x-0.5 group-hover:text-violet-300">{ShellIcon.arrow}</span>
                  </button>
                </li>
              ))}
            </ol>
          ) : (
            <p className="mt-3 text-sm text-zinc-400">{loading ? "Reading your apps…" : "Nothing waiting. New leads, follow-ups, deals and scans appear here."}</p>
          )}
          {failed.length > 0 && <p className="mt-2 text-xs text-amber-300">Not loaded: {failed.join(", ")}.</p>}
        </section>

        <section className="rounded-2xl border border-white/10 bg-white/[0.03] p-4" aria-label="Recent activity">
          <div className="flex items-center justify-between">
            <h2 className="text-sm font-semibold text-white">Recent activity</h2>
            <button type="button" onClick={() => { onOpenApp("settings"); window.dispatchEvent(new CustomEvent("threadly:open-settings", { detail: { section: "activity" } })); }} className="text-xs text-violet-300 hover:underline">View all</button>
          </div>
          <ul className="mt-3 space-y-2.5">
            {(snap.audit ?? []).slice(0, 6).map((e) => (
              <li key={e.id} className="flex gap-3">
                <span aria-hidden className="mt-1.5 h-1.5 w-1.5 shrink-0 rounded-full bg-violet-400" />
                <span className="min-w-0 flex-1">
                  <span className="block truncate text-[13px] text-zinc-200">{ACTION_LABELS[e.action] ?? e.action.replace(/[._]/g, " ")}</span>
                  <span className="block truncate text-xs text-zinc-500">{e.actor} · {ago(e.at)}</span>
                </span>
              </li>
            ))}
            {snap.audit?.length === 0 && <li className="text-sm text-zinc-500">No activity yet.</li>}
            {snap.audit === null && <li className="text-sm text-zinc-500">{loading ? "Loading…" : "Activity could not be read."}</li>}
          </ul>
        </section>
      </div>

      <div className="grid gap-4 lg:grid-cols-2">
        <section className="rounded-2xl border border-white/10 bg-white/[0.03] p-4" aria-label="Leads by stage">
          <div className="flex items-center justify-between">
            <h2 className="text-sm font-semibold text-white">Leads by stage</h2>
            <button type="button" onClick={() => onOpenApp("outreach")} className="text-xs text-violet-300 hover:underline">Open Leads</button>
          </div>
          <div className="mt-3 space-y-2">
            {stageCounts.map((s) => (
              <div key={s.id} className="grid grid-cols-[110px_1fr_32px] items-center gap-3 text-xs">
                <span className="text-zinc-400">{s.label}</span>
                <span className="h-2 overflow-hidden rounded-full bg-white/5">
                  <span className="block h-full rounded-full bg-violet-500" style={{ width: `${(s.count / maxStage) * 100}%` }} />
                </span>
                <span className="text-right tabular-nums text-zinc-300">{s.count}</span>
              </div>
            ))}
          </div>
        </section>

        <section className="rounded-2xl border border-white/10 bg-white/[0.03] p-4" aria-label="Deal pipeline">
          <div className="flex items-center justify-between">
            <h2 className="text-sm font-semibold text-white">Deal pipeline</h2>
            <button type="button" onClick={() => onOpenApp("crm")} className="text-xs text-violet-300 hover:underline">Open CRM</button>
          </div>
          <div className="mt-3 grid grid-cols-5 gap-2">
            {dealCounts.map((d) => (
              <div key={d.stage} className="rounded-lg border border-white/10 bg-white/[0.02] p-2.5">
                <p className="truncate text-[10px] font-medium uppercase tracking-wider text-zinc-500">{d.stage}</p>
                <p className="mt-1 text-lg font-semibold tabular-nums text-white">{d.count}</p>
                <p className="truncate text-[11px] tabular-nums text-zinc-500">{d.value ? d.value.toLocaleString() : "—"}</p>
              </div>
            ))}
          </div>
          <p className="mt-3 text-xs text-zinc-500">
            {snap.credits ? `${snap.credits.balance} credits left of ${snap.credits.granted}` : "Credits could not be read"} · {state.plan ? `${state.plan[0].toUpperCase()}${state.plan.slice(1)} plan` : "Free plan"}
          </p>
        </section>
      </div>
    </div>
  );
}
