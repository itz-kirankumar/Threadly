"use client";

import { Fragment, useCallback, useEffect, useMemo, useState } from "react";
import type { User } from "firebase/auth";
import type { MetricsSnapshot, WorkspaceState } from "@/lib/geo/types";
import SetupWizard from "./SetupWizard";
import QueryTable from "./QueryTable";
import TrendChart from "./TrendChart";
import {
  buildCitationLeaderboard,
  delta,
  formatDateTime,
  PROVIDER_COLORS,
  PROVIDER_LABELS,
  PROVIDER_ORDER,
} from "./helpers";

type Tab = "overview" | "queries" | "citations" | "runs" | "settings";

interface Props {
  user: User | null;
  readOnly?: boolean;
  initialState?: WorkspaceState;
}

function MetricCard({ label, value, suffix, change }: { label: string; value: string; suffix?: string; change: number | null }) {
  return (
    <div className="rounded-xl border border-white/10 bg-white/[0.03] p-4">
      <p className="text-xs font-medium uppercase tracking-wide text-zinc-500">{label}</p>
      <p className="mt-2 text-3xl font-semibold text-white">
        {value}
        {suffix && <span className="ml-0.5 text-lg text-zinc-400">{suffix}</span>}
      </p>
      {change !== null && (
        <p className={`mt-1 text-xs font-medium ${change > 0 ? "text-emerald-400" : change < 0 ? "text-rose-400" : "text-zinc-500"}`}>
          {change > 0 ? "▲" : change < 0 ? "▼" : "•"} {Math.abs(change)} vs last scan
        </p>
      )}
    </div>
  );
}

export default function GeoDashboard({ user, readOnly = false, initialState }: Props) {
  const [state, setState] = useState<WorkspaceState | null>(initialState ?? null);
  const [tab, setTab] = useState<Tab>("overview");
  const [loading, setLoading] = useState(!initialState);
  const [scanning, setScanning] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [suggestions, setSuggestions] = useState<string[]>([]);
  const [suggestBusy, setSuggestBusy] = useState(false);

  const authedFetch = useCallback(
    async (path: string, init?: RequestInit) => {
      if (!user) throw new Error("Sign in to continue.");
      const token = await user.getIdToken();
      const response = await fetch(path, {
        ...init,
        headers: { "Content-Type": "application/json", Authorization: `Bearer ${token}`, ...(init?.headers ?? {}) },
      });
      const payload = await response.json().catch(() => ({}));
      if (!response.ok) throw new Error((payload as { error?: string }).error ?? "Request failed.");
      return payload;
    },
    [user],
  );

  const refresh = useCallback(async () => {
    if (readOnly) return;
    try {
      const next = (await authedFetch("/api/geo/state")) as WorkspaceState;
      setState(next);
      setError("");
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : "Could not load your workspace.");
    } finally {
      setLoading(false);
    }
  }, [authedFetch, readOnly]);

  useEffect(() => {
    if (!readOnly) void refresh();
  }, [refresh, readOnly]);

  const latest = state?.snapshots.length ? state.snapshots[state.snapshots.length - 1] : null;
  const citations = useMemo(() => (state ? buildCitationLeaderboard(state) : []), [state]);

  async function runScan() {
    setScanning(true);
    setError("");
    try {
      await authedFetch("/api/geo/scan", { method: "POST", body: JSON.stringify({}) });
      await refresh();
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : "Scan failed.");
    } finally {
      setScanning(false);
    }
  }

  async function saveBrand(input: { name: string; domain: string; aliases: string[]; category: string; competitors: { name: string; domain: string; aliases: string[] }[] }) {
    setBusy(true);
    setError("");
    try {
      await authedFetch("/api/geo/brand", { method: "PUT", body: JSON.stringify(input) });
      await refresh();
      setTab("queries");
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : "Could not save.");
    } finally {
      setBusy(false);
    }
  }

  async function addQuery(text: string) {
    setBusy(true);
    try {
      await authedFetch("/api/geo/queries", { method: "POST", body: JSON.stringify({ text }) });
      setSuggestions((list) => list.filter((s) => s !== text));
      await refresh();
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : "Could not add the question.");
    } finally {
      setBusy(false);
    }
  }

  async function removeQuery(queryId: string) {
    try {
      await authedFetch("/api/geo/queries", { method: "DELETE", body: JSON.stringify({ queryId }) });
      await refresh();
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : "Could not delete the question.");
    }
  }

  async function suggestQueries() {
    setSuggestBusy(true);
    try {
      const payload = (await authedFetch("/api/geo/suggest", { method: "POST", body: "{}" })) as { suggestions?: string[] };
      const existing = new Set((state?.queries ?? []).map((q) => q.text));
      setSuggestions((payload.suggestions ?? []).filter((s) => !existing.has(s)));
    } catch {
      setSuggestions([]);
    } finally {
      setSuggestBusy(false);
    }
  }

  if (loading) {
    return <div className="py-24 text-center text-sm text-zinc-500">Loading your GEO workspace…</div>;
  }

  if (!state?.brand) {
    if (readOnly) return null;
    return (
      <div className="py-10">
        <SetupWizard busy={busy} error={error} onSave={saveBrand} />
      </div>
    );
  }

  const tabs: Array<{ id: Tab; label: string }> = [
    { id: "overview", label: "Overview" },
    { id: "queries", label: `Questions (${state.queries.length})` },
    { id: "citations", label: "Citations" },
    { id: "runs", label: `Scans (${state.runs.length})` },
    ...(!readOnly ? [{ id: "settings" as Tab, label: "Settings" }] : []),
  ];

  return (
    <div className="space-y-6">
      {readOnly && (
        <div className="rounded-xl border border-amber-400/30 bg-amber-500/10 px-4 py-3 text-sm text-amber-200">
          Sample data for a fictional brand (“Loomify”). Sign in to track your own brand across ChatGPT, Claude, Gemini and Perplexity.
        </div>
      )}

      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h1 className="text-xl font-semibold text-white">{state.brand.name}</h1>
          <p className="text-sm text-zinc-500">
            {state.brand.domain} · vs {state.brand.competitors.map((c) => c.name).join(", ") || "no competitors set"}
          </p>
        </div>
        {!readOnly && (
          <button
            type="button"
            onClick={runScan}
            disabled={scanning || !state.queries.length}
            className="rounded-lg bg-violet-500 px-5 py-2.5 text-sm font-semibold text-white transition hover:bg-violet-400 disabled:opacity-50"
          >
            {scanning ? "Scanning 4 AI providers…" : "Run scan now"}
          </button>
        )}
      </div>

      {error && <p className="rounded-lg border border-rose-500/30 bg-rose-500/10 px-3 py-2 text-sm text-rose-300">{error}</p>}

      <div className="flex gap-1 overflow-x-auto border-b border-white/10">
        {tabs.map((item) => (
          <button
            key={item.id}
            type="button"
            onClick={() => setTab(item.id)}
            className={`whitespace-nowrap border-b-2 px-4 py-2 text-sm font-medium transition ${
              tab === item.id ? "border-violet-400 text-white" : "border-transparent text-zinc-500 hover:text-zinc-300"
            }`}
          >
            {item.label}
          </button>
        ))}
      </div>

      {tab === "overview" && (
        <div className="space-y-6">
          <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
            <MetricCard label="Mention rate" value={latest ? String(latest.mentionRate) : "—"} suffix="%" change={latest ? delta(latest.mentionRate, state.snapshots, "mentionRate") : null} />
            <MetricCard label="Citation share" value={latest ? String(latest.citationShare) : "—"} suffix="%" change={latest ? delta(latest.citationShare, state.snapshots, "citationShare") : null} />
            <MetricCard label="Share of voice" value={latest ? String(latest.shareOfVoice) : "—"} suffix="%" change={latest ? delta(latest.shareOfVoice, state.snapshots, "shareOfVoice") : null} />
            <MetricCard label="Avg. position" value={latest?.avgPosition ? `#${latest.avgPosition}` : "—"} change={null} />
          </div>

          <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
            {PROVIDER_ORDER.map((id) => {
              const metrics = latest?.perProvider[id];
              return (
                <div key={id} className={`rounded-xl border p-4 ${PROVIDER_COLORS[id]}`}>
                  <p className="text-sm font-semibold">{PROVIDER_LABELS[id]}</p>
                  {metrics?.status === "scanned" ? (
                    <p className="mt-1 text-xs opacity-80">
                      Mentioned in {metrics.mentionRate}% · cited {metrics.citationShare}%
                    </p>
                  ) : metrics?.status === "failed" ? (
                    <p className="mt-1 text-xs text-rose-300">Last scan failed</p>
                  ) : (
                    <p className="mt-1 text-xs opacity-60">API key not configured</p>
                  )}
                </div>
              );
            })}
          </div>

          <div className="rounded-xl border border-white/10 bg-white/[0.03] p-4">
            <p className="mb-2 text-sm font-medium text-zinc-300">Trend across scans</p>
            <TrendChart snapshots={state.snapshots} />
          </div>

          {!latest && (
            <p className="rounded-xl border border-white/10 bg-white/[0.03] p-6 text-center text-sm text-zinc-400">
              No scans yet. {readOnly ? "" : "Add buyer questions, then run your first scan to measure AI visibility."}
            </p>
          )}
        </div>
      )}

      {tab === "queries" && (
        <QueryTable
          state={state}
          readOnly={readOnly}
          busy={busy}
          onAdd={addQuery}
          onDelete={removeQuery}
          onSuggest={suggestQueries}
          suggestions={suggestions}
          suggestBusy={suggestBusy}
        />
      )}

      {tab === "citations" && (
        <div className="overflow-hidden rounded-xl border border-white/10">
          <table className="w-full text-left text-sm">
            <thead>
              <tr className="border-b border-white/10 bg-white/[0.03] text-xs uppercase tracking-wide text-zinc-500">
                <th className="px-4 py-3 font-medium">Domain</th>
                <th className="px-4 py-3 font-medium">Type</th>
                <th className="px-4 py-3 text-right font-medium">Cited in answers</th>
              </tr>
            </thead>
            <tbody>
              {citations.map((row) => (
                <tr key={row.domain} className="border-b border-white/5">
                  <td className="px-4 py-2.5">
                    <a href={row.exampleUrl} target="_blank" rel="noreferrer" className="text-cyan-300 hover:underline">
                      {row.domain}
                    </a>
                  </td>
                  <td className="px-4 py-2.5">
                    <span
                      className={`rounded-full px-2 py-0.5 text-xs font-medium ${
                        row.kind === "brand"
                          ? "bg-violet-500/15 text-violet-300"
                          : row.kind === "competitor"
                            ? "bg-rose-500/15 text-rose-300"
                            : "bg-white/5 text-zinc-400"
                      }`}
                    >
                      {row.kind === "brand" ? "You" : row.kind === "competitor" ? "Competitor" : "Source"}
                    </span>
                  </td>
                  <td className="px-4 py-2.5 text-right text-zinc-300">{row.count}</td>
                </tr>
              ))}
              {!citations.length && (
                <tr>
                  <td colSpan={3} className="px-4 py-10 text-center text-sm text-zinc-500">
                    Run a scan to see which domains AI assistants cite for your category.
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </div>
      )}

      {tab === "runs" && (
        <div className="space-y-2">
          {state.runs.map((run) => (
            <div key={run.id} className="flex flex-wrap items-center justify-between gap-2 rounded-xl border border-white/10 bg-white/[0.03] px-4 py-3">
              <div>
                <p className="text-sm text-zinc-200">{formatDateTime(run.startedAt)}</p>
                <p className="text-xs text-zinc-500">{run.queryCount} questions × 4 providers</p>
              </div>
              <div className="flex gap-1.5">
                {PROVIDER_ORDER.map((id) => (
                  <span key={id} className={`rounded-full border px-2 py-0.5 text-xs ${PROVIDER_COLORS[id]} ${run.providerStatus[id] === "scanned" ? "" : "opacity-40"}`}>
                    {PROVIDER_LABELS[id]} {run.providerStatus[id] === "scanned" ? "✓" : run.providerStatus[id] === "failed" ? "✗" : "—"}
                  </span>
                ))}
              </div>
            </div>
          ))}
          {!state.runs.length && (
            <p className="rounded-xl border border-white/10 bg-white/[0.03] p-6 text-center text-sm text-zinc-500">No scans yet.</p>
          )}
        </div>
      )}

      {tab === "settings" && !readOnly && (
        <SetupWizard busy={busy} error={error} onSave={saveBrand} initial={state.brand} />
      )}
    </div>
  );
}

