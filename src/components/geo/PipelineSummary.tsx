"use client";

import { useCallback, useEffect, useState } from "react";
import { priorityOf } from "@/lib/leads/score";
import type { CrmAccountsState, CrmLead, CrmStats } from "@/lib/crm/types";

type Tab = "prospect" | "outreach" | "crm" | "enterprise" | "settings";

interface Snapshot {
  leads: CrmLead[] | null;
  stats: CrmStats | null;
  accounts: CrmAccountsState | null;
  credits: { balance: number; granted: number; spent: number } | null;
  run: { companies: number; selected: string[]; contacts: number; ranAt: string | null } | null;
}

const EMPTY: Snapshot = { leads: null, stats: null, accounts: null, credits: null, run: null };

function ago(iso: string | null): string {
  if (!iso) return "never";
  const minutes = Math.round((Date.now() - Date.parse(iso)) / 60_000);
  if (minutes < 60) return `${Math.max(1, minutes)} min ago`;
  const hours = Math.round(minutes / 60);
  if (hours < 48) return `${hours} h ago`;
  return `${Math.round(hours / 24)} days ago`;
}

function Card({ label, value, note, onClick }: { label: string; value: string; note: string; onClick?: () => void }) {
  const body = (
    <>
      <p className="text-xs font-medium uppercase tracking-wider text-zinc-500">{label}</p>
      <p className="mt-1 text-2xl font-semibold tabular-nums text-white">{value}</p>
      <p className="mt-1 text-xs text-zinc-400">{note}</p>
    </>
  );
  return onClick
    ? <button type="button" onClick={onClick} className="rounded-xl border border-white/10 bg-white/[0.03] p-4 text-left transition-colors hover:border-violet-400/50">{body}</button>
    : <div className="rounded-xl border border-white/10 bg-white/[0.03] p-4">{body}</div>;
}

// The revenue side of the workspace at a glance: saved leads by score band,
// follow-ups due, the CRM's records, credits and the last prospecting run.
// Each number says what it counts and where it comes from; a section that
// cannot be read says so instead of showing zero.
export default function PipelineSummary({ authedFetch, onNavigate }: { authedFetch: (path: string, init?: RequestInit) => Promise<unknown>; onNavigate: (tab: Tab) => void }) {
  const [snap, setSnap] = useState<Snapshot>(EMPTY);
  const [failed, setFailed] = useState<string[]>([]);

  const load = useCallback(async () => {
    const miss: string[] = [];
    const get = async <T,>(path: string, label: string): Promise<T | null> => {
      try {
        return (await authedFetch(path)) as T;
      } catch {
        miss.push(label);
        return null;
      }
    };
    const [leads, accounts, credits, prospecting] = await Promise.all([
      get<{ leads: CrmLead[]; stats: CrmStats }>("/api/crm/leads", "leads"),
      get<CrmAccountsState>("/api/crm/accounts", "CRM"),
      get<{ balance: number; granted: number; spent: number }>("/api/credits", "credits"),
      get<{ state: { companies?: { items: Array<{ selected: boolean; domain: string }>; ranAt: string }; contacts?: { items: unknown[] } } }>("/api/prospecting", "prospecting"),
    ]);
    const companies = prospecting?.state.companies;
    setSnap({
      leads: leads?.leads ?? null,
      stats: leads?.stats ?? null,
      accounts,
      credits,
      run: prospecting ? { companies: companies?.items.length ?? 0, selected: (companies?.items ?? []).filter((c) => c.selected).map((c) => c.domain.toLowerCase()), contacts: prospecting.state.contacts?.items.length ?? 0, ranAt: companies?.ranAt ?? null } : null,
    });
    setFailed(miss);
  }, [authedFetch]);

  useEffect(() => {
    void load();
  }, [load]);

  const leads = snap.leads ?? [];
  const bands = { Hot: 0, Warm: 0, Cold: 0, unscored: 0 };
  for (const l of leads) {
    if (!l.score) bands.unscored++;
    else bands[priorityOf(l.score)]++;
  }
  const openDeals = (snap.accounts?.deals ?? []).filter((d) => d.stage !== "won" && d.stage !== "lost");
  const openValue = openDeals.reduce((sum, d) => sum + (d.value || 0), 0);
  const currency = openDeals[0]?.currency ?? "USD";
  // Exactly the selected companies from the last run that are not yet leads.
  const saved = new Set(leads.map((l) => l.domain.toLowerCase()));
  const notSaved = snap.run ? snap.run.selected.filter((d) => !saved.has(d)).length : 0;

  const next: Array<{ text: string; tab: Tab }> = [];
  if (!snap.run?.ranAt) next.push({ text: "Run prospecting on your website to find competitors, customers and decision makers.", tab: "prospect" });
  else if (notSaved > 0) next.push({ text: `Save ${notSaved} selected compan${notSaved === 1 ? "y" : "ies"} from your last run to Leads.`, tab: "prospect" });
  if (bands.Hot) next.push({ text: `Work the ${bands.Hot} hot lead${bands.Hot === 1 ? "" : "s"} first.`, tab: "outreach" });
  if (snap.stats?.followUpsDue) next.push({ text: `${snap.stats.followUpsDue} follow-up${snap.stats.followUpsDue === 1 ? " is" : "s are"} due.`, tab: "outreach" });
  if (leads.length && !(snap.accounts?.deals ?? []).length) next.push({ text: "Open a deal when a lead becomes a real opportunity.", tab: "crm" });
  if (snap.credits && snap.credits.balance < 50) next.push({ text: `Only ${snap.credits.balance} credits left: top up before the next run.`, tab: "settings" });

  return (
    <section className="space-y-3" aria-label="Revenue pipeline">
      <div className="flex items-end justify-between gap-3">
        <div>
          <h2 className="text-sm font-semibold text-white">Revenue pipeline</h2>
          <p className="text-xs text-zinc-500">Live from your saved leads, CRM, credits and last prospecting run.</p>
        </div>
        <button type="button" onClick={() => void load()} className="rounded-lg border border-white/10 px-2.5 py-1 text-xs text-zinc-300 hover:border-white/30">Refresh</button>
      </div>
      <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
        <Card label="Saved leads" value={snap.leads ? String(leads.length) : "—"} note={snap.leads ? `${bands.Hot} hot, ${bands.Warm} warm, ${bands.Cold} cold${bands.unscored ? `, ${bands.unscored} not scored` : ""}` : "Could not be read"} onClick={() => onNavigate("outreach")} />
        <Card label="Follow-ups due" value={snap.stats ? String(snap.stats.followUpsDue) : "—"} note={snap.stats ? `of ${snap.stats.activeInSequence} lead${snap.stats.activeInSequence === 1 ? "" : "s"} in a sequence, due now` : "Could not be read"} onClick={() => onNavigate("outreach")} />
        <Card label="CRM" value={snap.accounts ? `${snap.accounts.companies.length} / ${snap.accounts.contacts.length}` : "—"} note={snap.accounts ? `companies / contacts; ${openDeals.length} open deal${openDeals.length === 1 ? "" : "s"}${openValue ? ` worth ${openValue.toLocaleString()} ${currency}` : ""}` : "Could not be read"} onClick={() => onNavigate("crm")} />
        <Card label="Credits" value={snap.credits ? String(snap.credits.balance) : "—"} note={snap.credits ? `left of ${snap.credits.granted} added; ${snap.credits.spent} used` : "Could not be read"} onClick={() => onNavigate("settings")} />
      </div>
      <div className="grid gap-3 lg:grid-cols-[minmax(0,1fr)_minmax(0,1.4fr)]">
        <Card label="Last prospecting run" value={snap.run?.ranAt ? ago(snap.run.ranAt) : "None yet"} note={snap.run?.ranAt ? `${snap.run.companies} companies found, ${snap.run.selected.length} selected (${notSaved} not yet in Leads), ${snap.run.contacts} decision makers` : "Start one from Prospecting"} onClick={() => onNavigate("prospect")} />
        <div className="rounded-xl border border-white/10 bg-white/[0.03] p-4">
          <p className="text-xs font-medium uppercase tracking-wider text-zinc-500">Next actions</p>
          {next.length ? (
            <ol className="mt-2 space-y-1.5">
              {next.slice(0, 4).map((n, i) => (
                <li key={n.text} className="flex gap-2 text-sm text-zinc-200">
                  <span className="tabular-nums text-violet-300">{i + 1}</span>
                  <button type="button" onClick={() => onNavigate(n.tab)} className="text-left hover:text-white hover:underline">{n.text}</button>
                </li>
              ))}
            </ol>
          ) : <p className="mt-2 text-sm text-zinc-400">Nothing waiting. New leads, follow-ups and deals appear here.</p>}
          {failed.length > 0 && <p className="mt-2 text-xs text-amber-300">Not loaded: {failed.join(", ")}.</p>}
        </div>
      </div>
    </section>
  );
}
