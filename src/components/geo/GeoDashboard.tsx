"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import type { User } from "firebase/auth";
import type { GeoProviderId, MetricsSnapshot, QueryResult, ScanRun, TrackedQuery, WorkspaceState } from "@/lib/geo/types";
import { PROVIDER_ERROR_LABELS, type ProviderErrorClass } from "@/lib/geo/provider-error";
import SetupWizard from "./SetupWizard";
import QueryTable from "./QueryTable";
import TrendChart from "./TrendChart";
import RecommendationsPanel from "./RecommendationsPanel";
import SocialPanel from "./SocialPanel";
import ProviderKeysPanel from "./ProviderKeysPanel";
import TeamPanel from "./TeamPanel";
import BillingPanel from "./BillingPanel";
import CreditsPanel from "./CreditsPanel";
import ActivityPanel from "./ActivityPanel";
import ApiKeysPanel from "./ApiKeysPanel";
import Tour, { TOUR_KEY } from "./Tour";
import CrmOutreachPanel from "@/components/crm/CrmOutreachPanel";
import ProspectingFlow from "@/components/prospecting/ProspectingFlow";
import CrmAccountsPanel from "@/components/crm/CrmAccountsPanel";
import OutboundPanel from "@/components/outbound/OutboundPanel";
import GeoFlowOptimizerPanel from "./GeoFlowOptimizerPanel";
import SuiteTopBar, { type NewAction } from "@/components/suite/SuiteTopBar";
import SearchPalette, { type PaletteCommand } from "@/components/suite/SearchPalette";
import PageHeader from "@/components/suite/PageHeader";
import SuiteHome from "@/components/suite/SuiteHome";
import BrandConnections from "@/components/suite/BrandConnections";
import { APP_ICONS, ShellIcon } from "@/components/suite/icons";
import { GROUP_LABELS, SETTINGS_SECTIONS, SUITE_APPS, type AppGroup, type AppId, type SettingsSection } from "@/lib/suite/apps";
import type { SearchHit } from "@/lib/suite/search";
import { sendSignal } from "@/lib/suite/signals";
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

function providerErrorTitle(run: ScanRun, id: string): string {
  const cls = run.providerErrors?.[id as GeoProviderId] as ProviderErrorClass | undefined;
  const label = cls ? PROVIDER_ERROR_LABELS[cls] ?? cls : "unknown error";
  return `Scan failed for this provider: ${label}`;
}

type Tab = AppId;

interface Props {
  user: User | null;
  readOnly?: boolean;
  initialState?: WorkspaceState;
  /** Read-only demo: per-run results served locally instead of the API. */
  demoRunDetails?: Record<string, { queries: TrackedQuery[]; results: QueryResult[] }>;
}

const INTELLIGENCE_TABS: Tab[] = ["overview", "queries", "citations", "optimizer", "runs"];
const RAIL_GROUPS: AppGroup[] = ["home", "sales", "visibility"];

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


type ProspectingSeed = {
  state: import("@/lib/prospecting/types").ProspectingState;
  capabilities: { search: boolean; model: boolean; contactProvider: string | null };
} | "error" | null;

export default function GeoDashboard({ user, readOnly = false, initialState, demoRunDetails }: Props) {
  const [state, setState] = useState<WorkspaceState | null>(initialState ?? null);
  const [tab, setTab] = useState<Tab>(() => {
    // Deep links such as /portal?tab=enterprise (used by the OAuth consent
    // callback redirect) land directly on the requested tab.
    // Signed-in workspaces open on Prospecting; the public demo on Overview.
    const fallback: Tab = readOnly ? "overview" : "prospect";
    if (typeof window === "undefined") return fallback;
    const requested = new URLSearchParams(window.location.search).get("tab");
    const valid: Tab[] = ["prospect", "overview", "queries", "citations", "runs", "optimizer", "outreach", "crm", "enterprise", "social", "settings"];
    return valid.includes(requested as Tab) && (!readOnly || requested !== "prospect") ? (requested as Tab) : fallback;
  });
  const [loading, setLoading] = useState(!initialState);
  const [prospectingSeed, setProspectingSeed] = useState<ProspectingSeed>(null);
  const [scanning, setScanning] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  // The scan error message, so Retry shows only while that error is displayed.
  const [scanError, setScanError] = useState("");
  const [suggestions, setSuggestions] = useState<string[]>([]);
  const [suggestBusy, setSuggestBusy] = useState(false);
  const [showTour, setShowTour] = useState(false);
  const [keyEncryption, setKeyEncryption] = useState(true);
  const [justOnboarded, setJustOnboarded] = useState(false);
  const [settingsSection, setSettingsSection] = useState<SettingsSection>("brand");
  const [expandedRunId, setExpandedRunId] = useState<string | null>(null);
  const [sidebarCollapsed, setSidebarCollapsed] = useState(false);
  const [theme, setTheme] = useState<"light" | "dark">("dark");
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
      if (readOnly) {
        // Demo mode has no API session - serve the bundled per-run results.
        setRunDetails((prev) => ({ ...prev, [runId]: demoRunDetails?.[runId] ?? "error" }));
        return;
      }
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
    [authedFetch, expandedRunId, runDetails, readOnly, demoRunDetails],
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


  // Dashboard theme: apply the class only while the dashboard is mounted so
  // public pages always stay dark. localStorage applies instantly on the next
  // visit; the account preference (API) is authoritative once loaded.
  useEffect(() => {
    const stored = typeof window !== "undefined" ? window.localStorage.getItem("threadly-theme") : null;
    if (stored === "light" || stored === "dark") setTheme(stored);
    // The account preference arrives with the /api/app-shell mount request below.
  }, []);

  useEffect(() => {
    const root = document.documentElement;
    root.classList.toggle("light", theme === "light");
    return () => root.classList.remove("light");
  }, [theme]);

  const toggleTheme = useCallback(() => {
    setTheme((current) => {
      const next = current === "dark" ? "light" : "dark";
      try { window.localStorage.setItem("threadly-theme", next); } catch { /* private mode */ }
      authedFetch("/api/geo/ui-prefs", { method: "PUT", body: JSON.stringify({ theme: next }) }).catch(() => undefined);
      return next;
    });
  }, [authedFetch]);

  // App shell: one mount request for workspace state, theme, key status and
  // the prospecting snapshot (previously four separate mount fetches plus
  // /api/access in PortalGate). Each section fails independently, mirroring the
  // previous per-endpoint behavior; refresh() still reloads state on its own.
  useEffect(() => {
    if (readOnly || !user) return;
    let cancelled = false;
    authedFetch("/api/app-shell")
      .then((payload) => {
        if (cancelled) return;
        const sections = (payload as { sections?: Record<string, { error?: string } & Record<string, unknown>> }).sections ?? {};
        const prefs = sections.uiPrefs;
        if (prefs && (prefs.theme === "light" || prefs.theme === "dark")) setTheme(prefs.theme);
        const next = sections.state;
        if (next && !next.error) {
          setState(next as unknown as WorkspaceState);
          setError("");
        } else {
          setError(typeof next?.error === "string" ? next.error : "Could not load your workspace.");
        }
        const keys = sections.keys;
        if (typeof keys?.keyEncryption === "boolean") setKeyEncryption(keys.keyEncryption);
        const prospecting = sections.prospecting;
        setProspectingSeed(prospecting && !prospecting.error ? (prospecting as unknown as ProspectingSeed) : "error");
      })
      .catch((caught) => {
        if (cancelled) return;
        setError(caught instanceof Error ? caught.message : "Could not load your workspace.");
        setProspectingSeed("error");
      })
      .finally(() => {
        if (!cancelled) setLoading(false);
      });
    return () => {
      cancelled = true;
    };
  }, [authedFetch, readOnly, user]);

  useEffect(() => {
    try {
      if (window.localStorage.getItem("threadly_sidebar_collapsed") === "1") setSidebarCollapsed(true);
    } catch {
      // storage unavailable
    }
  }, []);

  // Welcome + trial-live email, fired once the workspace unlocks. The server
  // keeps a per-workspace flag, so repeat logins never resend.
  useEffect(() => {
    if (readOnly || !user) return;
    authedFetch("/api/email/lifecycle", { method: "POST", body: JSON.stringify({ kind: "welcome-trial" }) }).catch(() => undefined);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [user]);

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

  // Search palette (Cmd/Ctrl+K) and side rail toggle (Cmd/Ctrl+B).
  const [paletteOpen, setPaletteOpen] = useState(false);

  const paletteCommands = useMemo<PaletteCommand[]>(() => {
    const commands: PaletteCommand[] = SUITE_APPS.filter((app) => !readOnly || !["prospect", "outreach", "crm", "enterprise", "social", "settings"].includes(app.id)).map((app) => ({
      id: `app:${app.id}`,
      label: `Open ${app.name}`,
      hint: "App",
      run: () => setTab(app.id),
    }));
    if (!readOnly) {
      commands.push(
        { id: "new-lead", label: "New lead", hint: "Create", run: () => newThing("lead") },
        { id: "new-company", label: "New CRM company", hint: "Create", run: () => newThing("company") },
        { id: "new-deal", label: "New deal", hint: "Create", run: () => newThing("deal") },
        { id: "new-question", label: "New buyer question", hint: "Create", run: () => newThing("question") },
        { id: "scan", label: "Run AI visibility scan now", hint: "Action", run: () => void runScan() },
        { id: "prospecting", label: "Start a prospecting run", hint: "Action", run: () => setTab("prospect") },
        { id: "brand", label: "Edit brand profile and competitors", hint: "Settings", run: () => openSettings("brand") },
        { id: "team", label: "Invite a teammate", hint: "Settings", run: () => openSettings("team") },
        { id: "billing", label: "Billing and credits", hint: "Settings", run: () => openSettings("billing") },
        { id: "tour", label: "Take the AI visibility tour", hint: "Help", run: () => { setTab("overview"); setShowTour(true); } },
        { id: "account", label: "Open my account", hint: "Page", run: () => { window.location.href = "/portal/account"; } },
      );
    }
    commands.push({ id: "sidebar", label: "Toggle side rail", hint: "Ctrl/Cmd+B", run: () => toggleSidebar() });
    return commands;
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [readOnly, toggleSidebar]);

  useEffect(() => {
    function onKey(event: KeyboardEvent) {
      const mod = event.metaKey || event.ctrlKey;
      if (mod && event.key.toLowerCase() === "k") {
        event.preventDefault();
        setPaletteOpen((open) => !open);
      } else if (mod && event.key.toLowerCase() === "b") {
        event.preventDefault();
        toggleSidebar();
      } else if (event.key === "Escape") {
        setPaletteOpen(false);
      }
    }
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [toggleSidebar]);

  function openSettings(section: SettingsSection) {
    setTab("settings");
    setSettingsSection(section);
  }

  const openRecord = useCallback((hit: SearchHit) => {
    setTab(hit.app);
    sendSignal({ name: "open-record", kind: hit.kind, id: hit.id });
  }, []);

  // "+ New" from anywhere: open the app that owns the record with its form.
  function newThing(action: NewAction) {
    if (action === "scan") {
      setTab("runs");
      void runScan();
      return;
    }
    if (action === "invite") return openSettings("team");
    const app: Record<Exclude<NewAction, "scan" | "invite">, Tab> = { lead: "outreach", company: "crm", deal: "crm", question: "queries", prospecting: "prospect", campaign: "enterprise" };
    setTab(app[action]);
    sendSignal({ name: "new", action });
  }

  const commandPalette = (
    <SearchPalette
      open={paletteOpen}
      onClose={() => setPaletteOpen(false)}
      commands={paletteCommands}
      onOpenRecord={openRecord}
      authedFetch={readOnly ? null : authedFetch}
    />
  );

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

  // The product tour explains the Intelligence (GEO) tabs, so it starts the
  // first time one of them is opened rather than over the prospecting flow.
  useEffect(() => {
    if (readOnly || !state?.brand || tab === "overview" || !INTELLIGENCE_TABS.includes(tab)) return;
    try {
      if (!window.localStorage.getItem(TOUR_KEY)) setShowTour(true);
    } catch {
      // storage unavailable - skip the tour
    }
  }, [readOnly, state?.brand, tab]);

  useEffect(() => {
    if (readOnly) return;
    const handler = (event: Event) => {
      const section = (event as CustomEvent<{ section?: SettingsSection }>).detail?.section;
      setTab("settings");
      if (section) setSettingsSection(section);
    };
    window.addEventListener("threadly:open-settings", handler);
    return () => window.removeEventListener("threadly:open-settings", handler);
  }, [readOnly]);



  async function runScan() {
    setScanning(true);
    setError("");
    setScanError("");
    try {
      await authedFetch("/api/geo/scan", { method: "POST", body: JSON.stringify({}) });
      await refresh();
    } catch (caught) {
      const message = caught instanceof Error ? caught.message : "The scan could not run. Try again, or contact hello@gothreadly.live.";
      setError(message);
      setScanError(message);
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
      setTab(firstSave ? "prospect" : "queries");
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

  // The suite's apps in rail order (src/lib/suite/apps.ts): Home, Sales,
  // AI visibility, Admin. The public demo shows the AI visibility apps only.
  const counts: Partial<Record<Tab, number>> = { queries: state.queries.length, runs: state.runs.length };
  const tabs = SUITE_APPS.filter((app) => !readOnly || ["overview", "queries", "citations", "optimizer", "runs"].includes(app.id)).map((app) => ({
    id: app.id,
    label: readOnly && app.id === "overview" ? "Overview" : app.name,
    group: app.group,
    count: counts[app.id],
  }));

  const geoContext = readOnly || INTELLIGENCE_TABS.includes(tab);
  const canAdmin = state.team?.role !== "member";
  const scanButton = (
    <button
      type="button"
      data-tour="run-scan"
      onClick={runScan}
      disabled={scanning || !state.queries.length}
      className="rounded-lg bg-violet-500 px-4 py-2 text-sm font-semibold text-white transition hover:bg-violet-400 disabled:opacity-50"
    >
      {scanning ? "Scanning AI providers…" : "Run scan now"}
    </button>
  );
  const trialBadge = state.plan === "trial" ? (
    <span className="rounded-full border border-amber-400/30 bg-amber-500/10 px-3 py-1 text-xs font-medium text-amber-200">7-day trial · 1 scan included</span>
  ) : null;
  const settingsLabel = SETTINGS_SECTIONS.find((item) => item.id === settingsSection)?.label;

  const body = (
    <>
      {readOnly && (
        <div className="rounded-xl border border-amber-400/30 bg-amber-500/10 px-4 py-3 text-sm text-amber-200">
          Sample data for a fictional brand (“Loomify”). Everything is clickable - open a question or a scan to read the full AI answers. Sign in to track your own brand across ChatGPT, Claude and Gemini.
        </div>
      )}

      {readOnly ? (
        <div>
          <h1 className="flex items-center gap-2.5 text-xl font-semibold text-white">{state.brand.name}</h1>
          <p className="text-sm text-zinc-500">
            {state.brand.domain} · vs {state.brand.competitors.map((c) => c.name).join(", ") || "no competitors set"}
          </p>
        </div>
      ) : tab !== "overview" ? (
        <PageHeader
          app={tab}
          crumb={tab === "settings" ? settingsLabel : undefined}
          subtitle={geoContext ? `${state.brand.domain} · vs ${state.brand.competitors.map((c) => c.name).join(", ") || "no competitors set"}` : undefined}
          onOpenApp={setTab}
          actions={geoContext ? <>{trialBadge}{scanButton}</> : trialBadge}
        />
      ) : null}

      {error && (
        <div role="alert" className="flex flex-wrap items-center justify-between gap-2 rounded-lg border border-rose-500/30 bg-rose-500/10 px-3 py-2 text-sm text-rose-300">
          <p>{error}</p>
          {scanError && error === scanError && (
            <button type="button" onClick={() => void runScan()} disabled={scanning} className="rounded-lg border border-rose-400/40 px-3 py-1 text-xs font-semibold text-rose-200 hover:bg-rose-500/10 disabled:opacity-40">
              {scanning ? "Retrying..." : "Retry scan"}
            </button>
          )}
        </div>
      )}

      <div className="flex items-start gap-6">
        {readOnly && (
        <nav
          aria-label="Workspace sections"
          className="sticky top-20 hidden w-48 shrink-0 flex-col gap-1 rounded-xl border border-white/10 bg-white/[0.02] p-2 md:flex"
        >
          {tabs.map((item) => (
            <button
              key={item.id}
              type="button"
              data-tour={`tab-${item.id}`}
              onClick={() => setTab(item.id)}
              title={item.label}
              aria-current={tab === item.id ? "page" : undefined}
              className="nav-item flex items-center gap-2.5 rounded-lg px-2.5 py-2 text-sm font-medium transition"
            >
              <span aria-hidden className="shrink-0">{APP_ICONS[item.id]}</span>
              <span className="whitespace-nowrap">{item.label}</span>
            </button>
          ))}
        </nav>
        )}
        <div className="min-w-0 flex-1 space-y-6">

      {tab === "overview" && (
        <div className="space-y-6">
          {!readOnly && <SuiteHome user={user} state={state} authedFetch={authedFetch} onOpenApp={setTab} canAdmin={canAdmin} />}
          {!readOnly && (
            <div className="flex flex-wrap items-center justify-between gap-3 border-t border-white/[0.08] pt-6">
              <div>
                <h2 className="text-base font-semibold text-white">AI visibility</h2>
                <p className="text-xs text-zinc-500">{state.brand.domain} · vs {state.brand.competitors.map((c) => c.name).join(", ") || "no competitors set"}</p>
              </div>
              <div className="flex items-center gap-2">{trialBadge}{scanButton}</div>
            </div>
          )}
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
                    <th className="px-2.5 py-2.5 font-medium md:px-4">Brand</th>
                    <th className="px-2.5 py-2.5 text-right font-medium md:px-4">Visibility</th>
                    <th className="px-2.5 py-2.5 text-right font-medium md:px-4">Mentioned in</th>
                    <th className="hidden px-4 py-2.5 text-right font-medium md:table-cell">Domain cited in</th>
                  </tr>
                </thead>
                <tbody>
                  {competitorRows.map((row) => (
                    <tr key={row.domain} className={`border-b border-white/5 ${row.isBrand ? "bg-violet-500/[0.06]" : ""}`}>
                      <td className="px-2.5 py-2.5 md:px-4">
                        <span className={row.isBrand ? "font-medium text-violet-200" : "text-zinc-200"}>{row.name}</span>
                        <span className="ml-2 hidden text-xs text-zinc-600 sm:inline">{row.domain}</span>
                      </td>
                      <td className="px-2.5 py-2.5 text-right md:px-4">
                        <span className={row.isBrand ? "font-semibold text-violet-200" : "text-zinc-300"}>{row.visibility}%</span>
                      </td>
                      <td className="whitespace-nowrap px-2.5 py-2.5 text-right text-zinc-400 md:px-4">{row.mentioned} of {row.total} answers</td>
                      <td className="hidden px-4 py-2.5 text-right text-zinc-400 md:table-cell">{row.citationCount} of {row.total} answers</td>
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
                  <p className="text-xs text-zinc-500">
                    {(() => {
                      const statuses = Object.values(run.providerStatus);
                      const scanned = statuses.filter((status) => status === "scanned").length;
                      const attempted = statuses.filter((status) => status === "scanned" || status === "failed").length;
                      return (
                        <>
                          {run.queryCount} questions · {scanned} of {attempted} providers returned results
                          {scanned === 0 && attempted > 0 && <span className="text-amber-400"> · scan failed</span>}
                        </>
                      );
                    })()}
                  </p>
                </div>
                <div className="flex gap-1.5">
                  {Object.keys(run.providerStatus).filter((id) => run.providerStatus[id] === "scanned").map((id) => (
                    <span key={id} className={`rounded-full border px-2 py-0.5 text-xs ${colorForProvider(id)}`}>
                      {labelForProvider(id, providerLabels)}
                    </span>
                  ))}
                  {Object.keys(run.providerStatus).filter((id) => run.providerStatus[id] === "failed").map((id) => (
                    <span
                      key={id}
                      title={providerErrorTitle(run, id)}
                      className="rounded-full border border-amber-400/40 px-2 py-0.5 text-xs text-amber-300"
                    >
                      {labelForProvider(id, providerLabels)}: failed
                    </span>
                  ))}
                </div>
              </button>
              {expandedRunId === run.id && (() => {
                const detail = runDetails[run.id];
                return (
                  <div className="border-t border-white/10 px-2 py-3">
                    {Object.keys(run.providerStatus).filter((id) => run.providerStatus[id] === "failed").length > 0 && (
                      <p className="mx-3 mb-2 rounded-lg border border-amber-400/30 bg-amber-500/10 px-3 py-2 text-xs text-amber-200">
                        {Object.keys(run.providerStatus)
                          .filter((id) => run.providerStatus[id] === "failed")
                          .map((id) => `${labelForProvider(id, providerLabels)} failed (${providerErrorTitle(run, id).replace("Scan failed for this provider: ", "")})`)
                          .join(" · ")}
                        {" - this scan's metrics cover the remaining providers only."}
                      </p>
                    )}
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
      {tab === "optimizer" && (
        <GeoFlowOptimizerPanel
          brand={state?.brand ?? null}
          queries={state?.queries ?? []}
          authedFetch={authedFetch}
          readOnly={readOnly}
        />
      )}
      {tab === "prospect" && !readOnly && user && (
        <ProspectingFlow
          authedFetch={authedFetch}
          getToken={() => user.getIdToken()}
          brand={{ name: state.brand.name, domain: state.brand.domain, logoDataUrl: state.brand.logoDataUrl }}
          onOpenTab={(next) => setTab(next)}
          seed={prospectingSeed}
        />
      )}
      {tab === "outreach" && !readOnly && (
        <CrmOutreachPanel authedFetch={authedFetch} />
      )}
      {tab === "crm" && !readOnly && (
        <CrmAccountsPanel authedFetch={authedFetch} onOpenApp={setTab} />
      )}
      {tab === "enterprise" && !readOnly && (
        <OutboundPanel authedFetch={authedFetch} />
      )}
      {tab === "social" && !readOnly && (
        <SocialPanel authedFetch={authedFetch} />
      )}

      {tab === "settings" && !readOnly && (
        <div className="grid gap-6 md:grid-cols-[220px_minmax(0,1fr)]">
          <nav aria-label="Settings sections" className="flex gap-1 overflow-x-auto md:sticky md:top-[76px] md:flex-col md:self-start">
            {SETTINGS_SECTIONS.filter((item) => canAdmin || !item.adminOnly).map((item) => (
              <button
                key={item.id}
                type="button"
                onClick={() => setSettingsSection(item.id)}
                aria-current={settingsSection === item.id ? "page" : undefined}
                className="nav-item rounded-lg px-3.5 py-2.5 text-left transition md:w-full"
              >
                <span className="block whitespace-nowrap text-sm font-medium">{item.label}</span>
                <span className="mt-0.5 hidden text-[11px] text-zinc-500 md:block">{item.hint}</span>
              </button>
            ))}
          </nav>
          <div className="min-w-0 max-w-5xl">
            {settingsSection === "brand" && (
              <div className="grid gap-6 xl:grid-cols-[minmax(0,1fr)_280px]">
                <div className="rounded-2xl border border-white/10 bg-white/[0.03] p-5 md:p-6">
                  <SetupWizard busy={busy} error={error} onSave={saveBrand} initial={state.brand} />
                </div>
                <BrandConnections brand={state.brand} queries={state.queries.length} onOpenApp={setTab} />
              </div>
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
            {settingsSection === "billing" && user && (
              <div className="space-y-6">
                <CreditsPanel authedFetch={authedFetch} />
                <BillingPanel authedFetch={authedFetch} />
              </div>
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

    </>
  );

  if (readOnly) {
    return (
      <div className="portal portal-embedded space-y-6 pb-20 md:pb-0">
        {commandPalette}
        {body}
        {/* Mobile tab bar for the demo: the section rail is hidden below md. */}
        <nav
          aria-label="Demo sections"
          className="fixed inset-x-0 bottom-0 z-40 flex items-stretch gap-1 overflow-x-auto border-t border-white/[0.08] bg-zinc-950/95 px-2 pb-[max(0.4rem,env(safe-area-inset-bottom))] pt-1.5 backdrop-blur md:hidden"
        >
          {tabs.map((item) => (
            <button
              key={item.id}
              type="button"
              onClick={() => setTab(item.id)}
              aria-label={item.label}
              aria-current={tab === item.id ? "page" : undefined}
              className="nav-item nav-item-compact flex min-w-[68px] flex-none flex-col items-center gap-0.5 rounded-lg px-2 py-1.5 text-[11px] font-medium transition"
            >
              <span aria-hidden className="shrink-0">{APP_ICONS[item.id]}</span>
              <span className="whitespace-nowrap">{item.label}</span>
            </button>
          ))}
        </nav>
      </div>
    );
  }

  const railLabel = sidebarCollapsed ? "hidden" : "hidden md:block";
  const railName = sidebarCollapsed ? "hidden" : "hidden md:inline";

  const navButton = (item: { id: Tab; label: string; count?: number }) => (
    <button
      key={item.id}
      type="button"
      data-tour={`tab-${item.id}`}
      onClick={() => setTab(item.id)}
      title={item.label}
      aria-current={tab === item.id ? "page" : undefined}
      className="nav-item flex w-full items-center gap-2.5 rounded-lg px-2.5 py-[7px] text-[13.5px] font-medium transition"
    >
      <span aria-hidden className="shrink-0">{APP_ICONS[item.id]}</span>
      <span className={`flex-1 truncate text-left ${railName}`}>{item.label}</span>
      {item.count !== undefined && <span className={`rounded-full bg-white/5 px-1.5 text-[10px] tabular-nums text-zinc-500 ${railName}`}>{item.count}</span>}
    </button>
  );

  const settingsTab = tabs.find((item) => item.id === "settings");

  return (
    <div className="portal suite flex min-h-screen flex-col">
      {commandPalette}
      <SuiteTopBar
        user={user}
        app={tab}
        theme={theme}
        onToggleTheme={toggleTheme}
        onOpenApp={setTab}
        onOpenSearch={() => setPaletteOpen(true)}
        onNew={newThing}
        onToggleRail={toggleSidebar}
        authedFetch={authedFetch}
        canAdmin={canAdmin}
        plan={state.plan ? `${state.plan[0].toUpperCase()}${state.plan.slice(1)} plan` : undefined}
      />
      <div className="flex min-h-0 flex-1">
        <aside
          aria-label="Workspace navigation"
          className={`suite-rail sticky top-[52px] hidden h-[calc(100vh-52px)] shrink-0 flex-col border-r border-white/[0.08] transition-all md:flex ${sidebarCollapsed ? "md:w-[60px]" : "md:w-60"}`}
        >
          <button
            type="button"
            onClick={() => openSettings("brand")}
            title={`${state.brand.name} · ${state.brand.domain}`}
            className="mx-2 mt-3 flex items-center gap-2.5 rounded-xl border border-white/10 bg-white/[0.03] p-2 text-left transition hover:border-white/20"
          >
            {state.brand.logoDataUrl ? (
              // eslint-disable-next-line
              <img src={state.brand.logoDataUrl} alt="" className="h-8 w-8 shrink-0 rounded-lg border border-white/10 object-cover" />
            ) : (
              <span className="flex h-8 w-8 shrink-0 items-center justify-center rounded-lg bg-violet-500/20 text-xs font-semibold text-violet-300">
                {state.brand.name.slice(0, 1).toUpperCase()}
              </span>
            )}
            <span className={`min-w-0 flex-1 ${railLabel}`}>
              <span className="block truncate text-sm font-semibold leading-tight text-white">{state.brand.name}</span>
              <span className="block truncate text-xs text-zinc-500">{state.brand.domain}</span>
            </span>
          </button>

          <nav className="min-h-0 flex-1 overflow-y-auto px-2 py-3">
            {RAIL_GROUPS.map((group) => {
              const items = tabs.filter((item) => item.group === group);
              if (!items.length) return null;
              return (
                <div key={group} className={group === "home" ? "" : "pt-4"}>
                  {group !== "home" && (
                    <p className={`nav-label px-2.5 pb-1.5 text-[10px] font-semibold uppercase tracking-widest ${railLabel}`}>{GROUP_LABELS[group]}</p>
                  )}
                  <div className="space-y-0.5">{items.map(navButton)}</div>
                </div>
              );
            })}
          </nav>

          <div className="shrink-0 space-y-0.5 border-t border-white/[0.06] p-2">
            {settingsTab && navButton(settingsTab)}
            <button
              type="button"
              onClick={() => setPaletteOpen(true)}
              title="Search and commands (Ctrl/Cmd+K)"
              className="nav-item flex w-full items-center gap-2.5 rounded-lg px-2.5 py-[7px] text-[13px] transition"
            >
              <span aria-hidden className="shrink-0">{ShellIcon.search}</span>
              <span className={`flex-1 text-left ${railName}`}>Search</span>
              <kbd className={`rounded border border-white/10 px-1 text-[10px] text-zinc-500 ${railName}`}>Ctrl K</kbd>
            </button>
          </div>
        </aside>

        <main className="min-w-0 flex-1 px-4 pb-24 pt-6 md:px-8 md:pb-10 md:pt-7">
          <div className="mx-auto max-w-[1240px] space-y-6">{body}</div>
        </main>
      </div>

      {/* Mobile tab bar: the desktop rail is hidden below md, so navigation
          moves to a fixed bottom bar (same apps, same icons). */}
      <nav
        aria-label="Workspace navigation"
        className="fixed inset-x-0 bottom-0 z-40 flex items-stretch gap-1 overflow-x-auto border-t border-white/[0.08] bg-zinc-950/95 px-2 pb-[max(0.4rem,env(safe-area-inset-bottom))] pt-1.5 backdrop-blur md:hidden"
      >
        {tabs.map((item) => (
          <button
            key={item.id}
            type="button"
            onClick={() => setTab(item.id)}
            aria-label={item.label}
            aria-current={tab === item.id ? "page" : undefined}
            className="nav-item nav-item-compact flex min-w-[68px] flex-none flex-col items-center gap-0.5 rounded-lg px-2 py-1.5 text-[11px] font-medium transition"
          >
            <span aria-hidden className="shrink-0">{APP_ICONS[item.id]}</span>
            <span className="whitespace-nowrap">{item.label}</span>
          </button>
        ))}
      </nav>

      {showTour && <Tour onNavigate={(next) => setTab(next)} onDone={() => setShowTour(false)} />}
    </div>
  );
}
