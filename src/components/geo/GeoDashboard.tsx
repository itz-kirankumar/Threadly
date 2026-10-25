"use client";

import { Fragment, useCallback, useEffect, useMemo, useState } from "react";
import { updateProfile, type User } from "firebase/auth";
import { getFirebaseAuth } from "@/lib/firebase-client";
import type { MetricsSnapshot, QueryResult, TrackedQuery, WorkspaceState } from "@/lib/geo/types";
import SetupWizard from "./SetupWizard";
import QueryTable from "./QueryTable";
import TrendChart from "./TrendChart";
import RecommendationsPanel from "./RecommendationsPanel";
import ProviderKeysPanel from "./ProviderKeysPanel";
import TeamPanel from "./TeamPanel";
import ActivityPanel from "./ActivityPanel";
import ApiKeysPanel from "./ApiKeysPanel";
import Tour, { TOUR_KEY } from "./Tour";
import {
  buildCitationLeaderboard,
  buildCompetitorComparison,
  classifySourceDomain,
  downloadCsv,
  SOURCE_TYPE_LABELS,
  colorForProvider,
  delta,
  formatDateTime,
  labelForProvider,
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

function ProfileSettings({ user, busy, onSave }: { user: User; busy: boolean; onSave: (name: string) => Promise<void> }) {
  const [name, setName] = useState(user.displayName ?? "");
  const [saved, setSaved] = useState(false);
  const input =
    "w-full rounded-lg border border-white/10 bg-white/[0.04] px-3 py-2 text-sm text-zinc-100 placeholder-zinc-500 outline-none focus:border-violet-400/60";
  const label = "mb-1 block text-xs font-medium uppercase tracking-wide text-zinc-400";
  return (
    <form
      className="max-w-xl space-y-5"
      onSubmit={async (event) => {
        event.preventDefault();
        setSaved(false);
        await onSave(name);
        setSaved(true);
      }}
    >
      <div>
        <h2 className="text-xl font-semibold text-white">Profile</h2>
        <p className="mt-1 text-sm text-zinc-400">How you appear inside your workspace.</p>
      </div>
      <div>
        <label className={label} htmlFor="profile-name">Your name</label>
        <input id="profile-name" className={input} value={name} onChange={(e) => setName(e.target.value)} placeholder="Ada Lovelace" required />
      </div>
      <div>
        <label className={label}>Email</label>
        <p className="rounded-lg border border-white/[0.06] bg-white/[0.02] px-3 py-2 text-sm text-zinc-500">{user.email}</p>
        <p className="mt-1 text-xs text-zinc-600">Managed by your Google sign-in.</p>
      </div>
      <div className="flex items-center gap-3">
        <button
          type="submit"
          disabled={busy || !name.trim()}
          className="rounded-lg bg-violet-500 px-4 py-2 text-sm font-semibold text-white transition hover:bg-violet-400 disabled:opacity-50"
        >
          Save profile
        </button>
        {saved && <span className="text-xs text-emerald-400">Saved.</span>}
      </div>
    </form>
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
  const [showTour, setShowTour] = useState(false);
  const [keyEncryption, setKeyEncryption] = useState(true);
  const [justOnboarded, setJustOnboarded] = useState(false);
  const [settingsSection, setSettingsSection] = useState<"profile" | "brand" | "keys" | "team" | "activity" | "api">("brand");
  const [expandedRunId, setExpandedRunId] = useState<string | null>(null);
  const [sidebarCollapsed, setSidebarCollapsed] = useState(false);
  const [runDetails, setRunDetails] = useState<Record<string, { queries: TrackedQuery[]; results: QueryResult[] } | "loading" | "error">>({});

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

  const toggleRun = useCallback(
    async (runId: string) => {
      if (expandedRunId === runId) {
        setExpandedRunId(null);
        return;
      }
      setExpandedRunId(runId);
      if (runDetails[runId]) return;
      setRunDetails((prev) => ({ ...prev, [runId]: "loading" }));
      try {
        const detail = (await authedFetch(`/api/geo/run-results?runId=${encodeURIComponent(runId)}`)) as {
          queries: TrackedQuery[];
          results: QueryResult[];
        };
        setRunDetails((prev) => ({ ...prev, [runId]: detail }));
      } catch {
        setRunDetails((prev) => ({ ...prev, [runId]: "error" }));
      }
    },
    [authedFetch, expandedRunId, runDetails],
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

  useEffect(() => {
    try {
      if (window.localStorage.getItem("threadly_sidebar_collapsed") === "1") setSidebarCollapsed(true);
    } catch {
      // storage unavailable
    }
  }, []);

  const toggleSidebar = useCallback(() => {
    setSidebarCollapsed((prev) => {
      try {
        window.localStorage.setItem("threadly_sidebar_collapsed", prev ? "0" : "1");
      } catch {
        // storage unavailable
      }
      return !prev;
    });
  }, []);

  const latest = state?.snapshots.length ? state.snapshots[state.snapshots.length - 1] : null;
  const citations = useMemo(() => (state ? buildCitationLeaderboard(state) : []), [state]);
  const competitorRows = useMemo(() => (state ? buildCompetitorComparison(state) : []), [state]);

  const providerOrder = useMemo(
    () => (state?.providers?.length ? state.providers.map((provider) => provider.id) : []),
    [state],
  );
  // Dynamic provider visibility: once a scan exists, only providers that
  // actually responded in the latest run show up. Before the first scan,
  // providers with a configured key show as ready. Unreachable providers
  // never render.
  const visibleProviders = useMemo(() => {
    if (latest) {
      return providerOrder.filter((id) => latest.perProvider[id]?.status === "scanned");
    }
    return providerOrder.filter((id) => {
      const keyStatus = state?.providers.find((provider) => provider.id === id);
      return keyStatus && keyStatus.source !== "none";
    });
  }, [latest, providerOrder, state?.providers]);

  const providerLabels = useMemo(() => {
    const labels: Record<string, string> = {};
    for (const provider of state?.providers ?? []) labels[provider.id] = provider.label;
    return labels;
  }, [state]);

  useEffect(() => {
    if (readOnly || !state?.brand) return;
    try {
      if (!window.localStorage.getItem(TOUR_KEY)) setShowTour(true);
    } catch {
      // storage unavailable - skip the tour
    }
  }, [readOnly, state?.brand]);

  useEffect(() => {
    if (readOnly) return;
    const handler = (event: Event) => {
      const section = (event as CustomEvent<{ section?: "profile" | "brand" | "keys" | "team" }>).detail?.section;
      setTab("settings");
      if (section) setSettingsSection(section);
    };
    window.addEventListener("threadly:open-settings", handler);
    return () => window.removeEventListener("threadly:open-settings", handler);
  }, [readOnly]);

  useEffect(() => {
    if (readOnly || !user) return;
    authedFetch("/api/geo/keys")
      .then((payload) => {
        const data = payload as { keyEncryption?: boolean };
        if (typeof data.keyEncryption === "boolean") setKeyEncryption(data.keyEncryption);
      })
      .catch(() => {
        // keys status unavailable - panel keeps its default
      });
  }, [authedFetch, readOnly, user]);

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

  async function saveBrand(input: { name: string; domain: string; aliases: string[]; category: string; competitors: { name: string; domain: string; aliases: string[] }[]; logoDataUrl?: string }) {
    setBusy(true);
    setError("");
    try {
      const firstSave = !state?.brand;
      await authedFetch("/api/geo/brand", { method: "PUT", body: JSON.stringify(input) });
      await refresh();
      setTab("queries");
      if (firstSave) setJustOnboarded(true);
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

  async function saveDisplayName(name: string) {
    setBusy(true);
    setError("");
    try {
      const current = getFirebaseAuth().currentUser;
      if (!current) throw new Error("Sign in to continue.");
      await updateProfile(current, { displayName: name.trim() || null });
      window.dispatchEvent(new CustomEvent("threadly:user-updated"));
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : "Could not save your profile.");
      throw caught;
    } finally {
      setBusy(false);
    }
  }

  async function keysRequest(init: RequestInit): Promise<void> {
    setBusy(true);
    setError("");
    try {
      const payload = (await authedFetch("/api/geo/keys", init)) as { keyEncryption?: boolean };
      if (typeof payload.keyEncryption === "boolean") setKeyEncryption(payload.keyEncryption);
      await refresh();
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : "Could not update keys.");
      throw caught;
    } finally {
      setBusy(false);
    }
  }

  async function saveBuiltinKey(provider: string, apiKey: string, model?: string) {
    await keysRequest({ method: "PUT", body: JSON.stringify({ provider, apiKey, ...(model ? { model } : {}) }) });
  }

  async function addCustomProvider(input: { name: string; baseUrl: string; model: string; apiKey: string }) {
    await keysRequest({ method: "PUT", body: JSON.stringify({ custom: input }) });
  }

  async function removeKey(target: { provider?: string; customId?: string }) {
    await keysRequest({ method: "DELETE", body: JSON.stringify(target) });
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
          Sample data for a fictional brand (“Loomify”). Sign in to track your own brand across ChatGPT, Claude and Gemini.
        </div>
      )}

      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h1 className="flex items-center gap-2.5 text-xl font-semibold text-white">
            {state.brand.logoDataUrl ? (
              // eslint-disable-next-line @next/next/no-img-element
              <img src={state.brand.logoDataUrl} alt="" className="h-7 w-7 rounded-md border border-white/10 object-cover" />
            ) : null}
            {state.brand.name}
          </h1>
          <p className="text-sm text-zinc-500">
            {state.brand.domain} · vs {state.brand.competitors.map((c) => c.name).join(", ") || "no competitors set"}
          </p>
        </div>
        {!readOnly && (
          <button
            type="button"
            data-tour="run-scan"
            onClick={runScan}
            disabled={scanning || !state.queries.length}
            className="rounded-lg bg-violet-500 px-5 py-2.5 text-sm font-semibold text-white transition hover:bg-violet-400 disabled:opacity-50"
          >
            {scanning ? "Scanning AI providers…" : "Run scan now"}
          </button>
        )}
      </div>

      {error && <p className="rounded-lg border border-rose-500/30 bg-rose-500/10 px-3 py-2 text-sm text-rose-300">{error}</p>}

      <div className="flex items-start gap-6">
        <nav
          aria-label="Workspace sections"
          className={`sticky top-20 flex shrink-0 flex-col gap-1 rounded-xl border border-white/10 bg-white/[0.02] p-2 transition-all ${
            sidebarCollapsed ? "w-12" : "w-12 md:w-48"
          }`}
        >
          {tabs.map((item) => (
            <button
              key={item.id}
              type="button"
              data-tour={`tab-${item.id}`}
              onClick={() => setTab(item.id)}
              title={item.label}
              className={`flex items-center gap-2.5 rounded-lg px-2.5 py-2 text-sm font-medium transition ${
                tab === item.id ? "bg-violet-500/15 text-white" : "text-zinc-500 hover:bg-white/[0.04] hover:text-zinc-300"
              }`}
            >
              <span aria-hidden className="shrink-0">{TAB_ICONS[item.id]}</span>
              <span className={`whitespace-nowrap ${sidebarCollapsed ? "hidden" : "hidden md:inline"}`}>{item.label}</span>
            </button>
          ))}
          <button
            type="button"
            onClick={toggleSidebar}
            title={sidebarCollapsed ? "Expand sidebar" : "Collapse sidebar"}
            className="mt-1 hidden items-center gap-2.5 rounded-lg border-t border-white/5 px-2.5 py-2 text-xs text-zinc-600 transition hover:text-zinc-300 md:flex"
          >
            <span aria-hidden className="shrink-0">{sidebarCollapsed ? "»" : "«"}</span>
            <span className={sidebarCollapsed ? "hidden" : ""}>Collapse</span>
          </button>
        </nav>
        <div className="min-w-0 flex-1 space-y-6">

      {tab === "overview" && (
        <div className="space-y-6">
          <div data-tour="metrics" className="grid grid-cols-2 gap-3 lg:grid-cols-4">
            <MetricCard label="Mention rate" value={latest ? String(latest.mentionRate) : "—"} suffix="%" change={latest ? delta(latest.mentionRate, state.snapshots, "mentionRate") : null} />
            <MetricCard label="Citation share" value={latest ? String(latest.citationShare) : "—"} suffix="%" change={latest ? delta(latest.citationShare, state.snapshots, "citationShare") : null} />
            <MetricCard label="Share of voice" value={latest ? String(latest.shareOfVoice) : "—"} suffix="%" change={latest ? delta(latest.shareOfVoice, state.snapshots, "shareOfVoice") : null} />
            <MetricCard label="Avg. position" value={latest?.avgPosition ? `#${latest.avgPosition}` : "—"} change={null} />
          </div>

          {visibleProviders.length > 0 && (
          <div data-tour="providers" className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
            {visibleProviders.map((id) => {
              const metrics = latest?.perProvider[id];
              const keyStatus = state.providers.find((provider) => provider.id === id);
              return (
                <div key={id} className={`rounded-xl border p-4 ${colorForProvider(id)}`}>
                  <p className="text-sm font-semibold">
                    {labelForProvider(id, providerLabels)}
                    {keyStatus?.source === "user" && <span className="ml-1.5 text-[10px] font-medium opacity-70">your key</span>}
                  </p>
                  {metrics?.status === "scanned" ? (
                    <p className="mt-1 text-xs opacity-80">
                      Mentioned in {metrics.mentionRate}% · cited {metrics.citationShare}%
                    </p>
                  ) : (
                    <p className="mt-1 text-xs opacity-80">Ready - included in next scan</p>
                  )}
                </div>
              );
            })}
          </div>
          )}

          <div className="rounded-xl border border-white/10 bg-white/[0.03] p-4">
            <p className="mb-2 text-sm font-medium text-zinc-300">Trend across scans</p>
            <TrendChart snapshots={state.snapshots} />
          </div>

          <RecommendationsPanel state={state} readOnly={readOnly} authedFetch={authedFetch} />

          {competitorRows.length > 1 && (
            <div className="overflow-hidden rounded-xl border border-white/10">
              <div className="border-b border-white/10 bg-white/[0.03] px-4 py-3">
                <p className="text-sm font-medium text-zinc-300">You vs competitors - latest scan</p>
              </div>
              <table className="w-full text-left text-sm">
                <thead>
                  <tr className="border-b border-white/10 text-xs uppercase tracking-wide text-zinc-500">
                    <th className="px-4 py-2.5 font-medium">Brand</th>
                    <th className="px-4 py-2.5 text-right font-medium">Visibility</th>
                    <th className="px-4 py-2.5 text-right font-medium">Mentioned in</th>
                    <th className="px-4 py-2.5 text-right font-medium">Domain cited in</th>
                  </tr>
                </thead>
                <tbody>
                  {competitorRows.map((row) => (
                    <tr key={row.domain} className={`border-b border-white/5 ${row.isBrand ? "bg-violet-500/[0.06]" : ""}`}>
                      <td className="px-4 py-2.5">
                        <span className={row.isBrand ? "font-medium text-violet-200" : "text-zinc-200"}>{row.name}</span>
                        <span className="ml-2 text-xs text-zinc-600">{row.domain}</span>
                      </td>
                      <td className="px-4 py-2.5 text-right">
                        <span className={row.isBrand ? "font-semibold text-violet-200" : "text-zinc-300"}>{row.visibility}%</span>
                      </td>
                      <td className="px-4 py-2.5 text-right text-zinc-400">{row.mentioned} of {row.total} answers</td>
                      <td className="px-4 py-2.5 text-right text-zinc-400">{row.citationCount} of {row.total} answers</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}

          {!latest && (
            <p className="rounded-xl border border-white/10 bg-white/[0.03] p-6 text-center text-sm text-zinc-400">
              No scans yet. {readOnly ? "" : "Add buyer questions, then run your first scan to measure AI visibility."}
            </p>
          )}
        </div>
      )}

      {tab === "queries" && justOnboarded && !readOnly && (
        <div className="rounded-xl border border-violet-400/30 bg-violet-500/10 px-4 py-3 text-sm text-violet-200">
          Brand saved - you are set up. Next: add the questions your buyers ask AI assistants (or press Suggest), then
          run your first scan from the top of the page. You can add your own AI provider keys anytime in Settings.
        </div>
      )}

      {tab === "queries" && (
        <QueryTable
          state={state}
          readOnly={readOnly}
          busy={busy}
          onAdd={addQuery}
          onDelete={state.team?.role === "member" ? undefined : removeQuery}
          onSuggest={suggestQueries}
          suggestions={suggestions}
          suggestBusy={suggestBusy}
          providerOrder={providerOrder}
          providerLabels={providerLabels}
        />
      )}

      {tab === "citations" && (
        <div className="space-y-3">
          {!readOnly && citations.length > 0 && (
            <div className="flex justify-end">
              <button
                type="button"
                onClick={() =>
                  downloadCsv(
                    `threadly-citations-${state.brand?.domain ?? "workspace"}.csv`,
                    [
                      ["domain", "type", "source_type", "cited_in_answers", "example_url", "example_title"],
                      ...citations.map((row) => [
                        row.domain,
                        row.kind === "brand" ? "you" : row.kind,
                        row.kind === "other" ? SOURCE_TYPE_LABELS[classifySourceDomain(row.domain)] : "",
                        String(row.count),
                        row.exampleUrl,
                        row.exampleTitle,
                      ]),
                    ],
                  )
                }
                className="rounded-lg border border-white/10 px-3 py-1.5 text-xs text-zinc-300 transition hover:bg-white/[0.06]"
              >
                Export CSV
              </button>
            </div>
          )}
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
                      {row.kind === "brand" ? "You" : row.kind === "competitor" ? "Competitor" : SOURCE_TYPE_LABELS[classifySourceDomain(row.domain)]}
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
        </div>
      )}

      {tab === "runs" && (
        <div className="space-y-2">
          {state.runs.map((run) => (
            <div key={run.id} className="overflow-hidden rounded-xl border border-white/10 bg-white/[0.03]">
              <button
                type="button"
                onClick={() => toggleRun(run.id)}
                className="flex w-full flex-wrap items-center justify-between gap-2 px-4 py-3 text-left transition hover:bg-white/[0.04]"
              >
                <div>
                  <p className="text-sm text-zinc-200">
                    <span className="mr-2 inline-block text-zinc-500">{expandedRunId === run.id ? "▾" : "▸"}</span>
                    {formatDateTime(run.startedAt)}
                  </p>
                  <p className="text-xs text-zinc-500">{run.queryCount} questions × {Object.values(run.providerStatus).filter((status) => status === "scanned").length || providerOrder.length} providers</p>
                </div>
                <div className="flex gap-1.5">
                  {Object.keys(run.providerStatus).filter((id) => run.providerStatus[id] === "scanned").map((id) => (
                    <span key={id} className={`rounded-full border px-2 py-0.5 text-xs ${colorForProvider(id)}`}>
                      {labelForProvider(id, providerLabels)} ✓
                    </span>
                  ))}
                </div>
              </button>
              {expandedRunId === run.id && (() => {
                const detail = runDetails[run.id];
                return (
                  <div className="border-t border-white/10 px-2 py-3">
                    {!detail || detail === "loading" ? (
                      <p className="px-3 py-6 text-center text-xs text-zinc-500">Loading scan results…</p>
                    ) : detail === "error" ? (
                      <p className="px-3 py-6 text-center text-xs text-red-400">Could not load this scan's results.</p>
                    ) : (
                      <QueryTable
                        state={{ ...state, queries: detail.queries, results: detail.results }}
                        readOnly
                        busy={false}
                        onAdd={async () => {}}
                        onSuggest={async () => {}}
                        suggestions={[]}
                        suggestBusy={false}
                        providerOrder={providerOrder}
                        providerLabels={providerLabels}
                      />
                    )}
                  </div>
                );
              })()}
            </div>
          ))}
          {!state.runs.length && (
            <p className="rounded-xl border border-white/10 bg-white/[0.03] p-6 text-center text-sm text-zinc-500">No scans yet.</p>
          )}
        </div>
      )}

      {tab === "settings" && !readOnly && (
        <div className="grid gap-6 md:grid-cols-[200px_1fr]">
          <nav className="flex gap-1 overflow-x-auto md:flex-col">
            {(
              [
                { id: "profile", label: "Profile", hint: "Your name and account" },
                ...(state.team?.role !== "member"
                  ? ([
                      { id: "brand", label: "Brand profile", hint: "Name, domain, logo, competitors" },
                      { id: "keys", label: "AI provider keys", hint: "Your own keys, custom providers" },
                    ] as const)
                  : []),
                { id: "team", label: "Team", hint: "Members, roles, invite links" },
                { id: "activity", label: "Activity log", hint: "Audit trail of workspace events" },
                { id: "api", label: "API access", hint: "Programmatic access keys" },
              ] as const
            ).map((item) => (
              <button
                key={item.id}
                type="button"
                onClick={() => setSettingsSection(item.id)}
                className={`rounded-lg px-3.5 py-2.5 text-left transition md:w-full ${
                  settingsSection === item.id ? "bg-violet-500/10 text-white" : "text-zinc-500 hover:bg-white/[0.04] hover:text-zinc-300"
                }`}
              >
                <span className="block whitespace-nowrap text-sm font-medium">{item.label}</span>
                <span className="mt-0.5 hidden text-[11px] text-zinc-600 md:block">{item.hint}</span>
              </button>
            ))}
          </nav>
          <div>
            {settingsSection === "profile" && user && (
              <ProfileSettings user={user} busy={busy} onSave={saveDisplayName} />
            )}
            {settingsSection === "brand" && (
              <SetupWizard busy={busy} error={error} onSave={saveBrand} initial={state.brand} />
            )}
            {settingsSection === "team" && user && (
              <TeamPanel authedFetch={authedFetch} currentUid={user.uid} />
            )}
            {settingsSection === "activity" && (
              <ActivityPanel authedFetch={authedFetch} />
            )}
            {settingsSection === "api" && (
              <ApiKeysPanel authedFetch={authedFetch} />
            )}
            {settingsSection === "keys" && (
              <ProviderKeysPanel
                providers={state.providers}
                keyEncryption={keyEncryption}
                busy={busy}
                onSaveBuiltin={saveBuiltinKey}
                onAddCustom={addCustomProvider}
                onRemove={removeKey}
              />
            )}
          </div>
        </div>
      )}

        </div>
      </div>

      {showTour && !readOnly && <Tour onNavigate={(next) => setTab(next)} onDone={() => setShowTour(false)} />}
    </div>
  );
}

const TAB_ICONS: Record<Tab, React.ReactNode> = {
  overview: (
    <svg width="16" height="16" viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="1.5">
      <rect x="1.5" y="1.5" width="5.5" height="5.5" rx="1" /><rect x="9" y="1.5" width="5.5" height="5.5" rx="1" />
      <rect x="1.5" y="9" width="5.5" height="5.5" rx="1" /><rect x="9" y="9" width="5.5" height="5.5" rx="1" />
    </svg>
  ),
  queries: (
    <svg width="16" height="16" viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round">
      <circle cx="8" cy="8" r="6" /><path d="M6.2 6.2c.3-1 1-1.6 1.9-1.6 1 0 1.8.7 1.8 1.6 0 1.2-1.4 1.5-1.8 2.4" /><circle cx="8" cy="11.2" r="0.4" fill="currentColor" />
    </svg>
  ),
  citations: (
    <svg width="16" height="16" viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round">
      <path d="M6.5 9.5a3 3 0 0 0 4.2 0l2.1-2.1a3 3 0 1 0-4.2-4.2l-1 1" /><path d="M9.5 6.5a3 3 0 0 0-4.2 0l-2.1 2.1a3 3 0 1 0 4.2 4.2l1-1" />
    </svg>
  ),
  runs: (
    <svg width="16" height="16" viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round">
      <path d="M13.5 8a5.5 5.5 0 1 1-1.6-3.9" /><path d="M13.5 2.5v2.6h-2.6" />
    </svg>
  ),
  settings: (
    <svg width="16" height="16" viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round">
      <circle cx="8" cy="8" r="2" />
      <path d="M8 1.8v1.7M8 12.5v1.7M1.8 8h1.7M12.5 8h1.7M3.6 3.6l1.2 1.2M11.2 11.2l1.2 1.2M12.4 3.6l-1.2 1.2M4.8 11.2l-1.2 1.2" />
    </svg>
  ),
};

