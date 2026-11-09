"use client";

import Link from "next/link";
import { useEffect, useRef, useState, type ReactNode } from "react";
import { signOut, type User } from "firebase/auth";
import { getFirebaseAuth } from "@/lib/firebase-client";
import ThreadlyLogo from "@/components/ThreadlyLogo";
import { ACTION_LABELS } from "@/components/geo/ActivityPanel";
import ThemeToggle from "@/components/geo/ThemeToggle";
import { GROUP_LABELS, SUITE_APPS, appById, type AppGroup, type AppId } from "@/lib/suite/apps";
import type { AuditEntry } from "@/lib/geo/types";
import { APP_ICONS, ShellIcon } from "./icons";

export type NewAction = "lead" | "company" | "deal" | "question" | "prospecting" | "scan" | "campaign" | "invite";

const NEW_ITEMS: Array<{ id: NewAction; label: string; hint: string; app: AppId }> = [
  { id: "prospecting", label: "Prospecting run", hint: "Find customers from your website", app: "prospect" },
  { id: "lead", label: "Lead", hint: "Add a person or company to Leads", app: "outreach" },
  { id: "company", label: "Company", hint: "A CRM account", app: "crm" },
  { id: "deal", label: "Deal", hint: "An opportunity in the pipeline", app: "crm" },
  { id: "campaign", label: "Outbound campaign", hint: "A sequence with approvals", app: "enterprise" },
  { id: "question", label: "Buyer question", hint: "Track it in AI answers", app: "queries" },
  { id: "scan", label: "AI visibility scan", hint: "Ask every AI provider now", app: "runs" },
  { id: "invite", label: "Team invite", hint: "Bring a colleague in", app: "settings" },
];

function usePopover() {
  const [open, setOpen] = useState(false);
  const ref = useRef<HTMLDivElement>(null);
  useEffect(() => {
    if (!open) return;
    const onDown = (event: MouseEvent) => {
      if (ref.current && !ref.current.contains(event.target as Node)) setOpen(false);
    };
    const onKey = (event: KeyboardEvent) => {
      if (event.key === "Escape") setOpen(false);
    };
    document.addEventListener("mousedown", onDown);
    document.addEventListener("keydown", onKey);
    return () => {
      document.removeEventListener("mousedown", onDown);
      document.removeEventListener("keydown", onKey);
    };
  }, [open]);
  return { open, setOpen, ref };
}

function IconButton({ label, onClick, children, active, badge }: { label: string; onClick: () => void; children: ReactNode; active?: boolean; badge?: number }) {
  return (
    <button
      type="button"
      onClick={onClick}
      title={label}
      aria-label={label}
      aria-expanded={active}
      className={`suite-icon-btn relative flex h-9 w-9 items-center justify-center rounded-lg transition ${active ? "is-active" : ""}`}
    >
      {children}
      {badge ? <span className="suite-badge absolute -right-0.5 -top-0.5 min-w-[16px] rounded-full px-1 text-[10px] font-semibold leading-4">{badge > 9 ? "9+" : badge}</span> : null}
    </button>
  );
}

function nameOf(user: User): string {
  return user.displayName?.trim() || (user.email ?? "Account").split("@")[0];
}

function initialsOf(user: User): string {
  const parts = nameOf(user).split(/\s+/).filter(Boolean);
  return (parts.length > 1 ? parts[0][0] + parts[parts.length - 1][0] : nameOf(user).slice(0, 2)).toUpperCase();
}

function ago(iso: string): string {
  const minutes = Math.round((Date.now() - Date.parse(iso)) / 60_000);
  if (minutes < 60) return `${Math.max(1, minutes)}m`;
  const hours = Math.round(minutes / 60);
  if (hours < 48) return `${hours}h`;
  return `${Math.round(hours / 24)}d`;
}

const SEEN_KEY = "threadly_notifications_seen";

interface Props {
  user: User | null;
  app: AppId;
  theme: "light" | "dark";
  onToggleTheme: () => void;
  onOpenApp: (id: AppId) => void;
  onOpenSearch: () => void;
  onNew: (action: NewAction) => void;
  onToggleRail: () => void;
  authedFetch: (path: string, init?: RequestInit) => Promise<unknown>;
  canAdmin: boolean;
  plan?: string;
}

// The suite's top bar, the same on every app: app launcher, the current app,
// one search across the workspace, create anything, notifications, help,
// theme and the account menu.
export default function SuiteTopBar({ user, app, theme, onToggleTheme, onOpenApp, onOpenSearch, onNew, onToggleRail, authedFetch, canAdmin, plan }: Props) {
  const launcher = usePopover();
  const create = usePopover();
  const bell = usePopover();
  const account = usePopover();
  const [entries, setEntries] = useState<AuditEntry[] | null>(null);
  const [seen, setSeen] = useState<string>("");

  useEffect(() => {
    try {
      setSeen(window.localStorage.getItem(SEEN_KEY) ?? "");
    } catch {
      // storage unavailable: every entry counts as new until opened
    }
    authedFetch("/api/geo/audit")
      .then((payload) => setEntries((payload as { entries: AuditEntry[] }).entries ?? []))
      .catch(() => setEntries([]));
  }, [authedFetch]);

  const unread = (entries ?? []).filter((e) => !seen || e.at > seen).length;

  function openBell() {
    bell.setOpen(!bell.open);
    const newest = entries?.[0]?.at;
    if (newest) {
      setSeen(newest);
      try {
        window.localStorage.setItem(SEEN_KEY, newest);
      } catch {
        // storage unavailable
      }
    }
  }

  const current = appById(app);
  const groups = (Object.keys(GROUP_LABELS) as AppGroup[]).map((g) => ({ id: g, label: GROUP_LABELS[g], apps: SUITE_APPS.filter((a) => a.group === g) }));
  const menuItem = "flex w-full items-start gap-3 rounded-lg px-3 py-2 text-left transition hover:bg-white/[0.06]";

  return (
    <header className="suite-topbar sticky top-0 z-40 flex h-[52px] shrink-0 items-center gap-2 border-b border-white/[0.08] px-2 md:px-3">
      <div ref={launcher.ref} className="relative">
        <IconButton label="All apps" onClick={() => launcher.setOpen(!launcher.open)} active={launcher.open}>
          {ShellIcon.waffle}
        </IconButton>
        {launcher.open && (
          <div className="suite-popover absolute left-0 top-full z-50 mt-2 w-[min(92vw,620px)] rounded-2xl border border-white/10 bg-zinc-950 p-4 shadow-2xl">
            <p className="ui-label px-1">Threadly apps</p>
            <div className="mt-3 space-y-4">
              {groups.map((group) => (
                <div key={group.id}>
                  <p className="px-1 pb-1.5 text-[11px] font-medium text-zinc-500">{group.label}</p>
                  <div className="grid gap-1 sm:grid-cols-2">
                    {group.apps.map((item) => (
                      <button
                        key={item.id}
                        type="button"
                        onClick={() => {
                          launcher.setOpen(false);
                          onOpenApp(item.id);
                        }}
                        className={`${menuItem} ${item.id === app ? "bg-violet-500/10" : ""}`}
                      >
                        <span className={`suite-tile ${item.tile} flex h-9 w-9 shrink-0 items-center justify-center rounded-lg`}>{APP_ICONS[item.id]}</span>
                        <span className="min-w-0">
                          <span className="block text-sm font-medium text-white">{item.name}</span>
                          <span className="block text-xs leading-snug text-zinc-500">{item.description}</span>
                        </span>
                      </button>
                    ))}
                  </div>
                </div>
              ))}
            </div>
          </div>
        )}
      </div>

      <button type="button" onClick={onToggleRail} className="hidden h-9 w-9 items-center justify-center rounded-lg text-zinc-500 transition hover:bg-white/[0.06] hover:text-white md:flex" title="Collapse or expand the side rail (Ctrl/Cmd+B)" aria-label="Toggle side rail">
        {ShellIcon.panel}
      </button>

      <Link href="/portal" className="flex shrink-0 items-center gap-2 pr-1" aria-label="Threadly home">
        <ThreadlyLogo size={22} />
        <span className="text-[15px] font-semibold tracking-tight text-white">Threadly</span>
      </Link>
      <span aria-hidden className="hidden h-5 w-px bg-white/10 sm:block" />
      <span className="hidden truncate text-[15px] font-medium text-zinc-300 sm:block">{current.name}</span>

      <div className="mx-auto flex min-w-0 flex-1 justify-center px-2">
        <button
          type="button"
          onClick={onOpenSearch}
          className="suite-search flex h-9 w-full max-w-xl items-center gap-2.5 rounded-lg border border-white/10 px-3 text-left text-sm text-zinc-500 transition hover:border-white/20"
        >
          {ShellIcon.search}
          <span className="min-w-0 flex-1 truncate">Search leads, companies, deals, questions…</span>
          <kbd className="hidden rounded border border-white/10 px-1.5 py-0.5 font-sans text-[10px] text-zinc-500 sm:inline">Ctrl K</kbd>
        </button>
      </div>

      <div ref={create.ref} className="relative">
        <button
          type="button"
          onClick={() => create.setOpen(!create.open)}
          aria-expanded={create.open}
          className="flex h-9 items-center gap-1.5 rounded-lg bg-violet-500 px-3 text-sm font-semibold text-white transition hover:bg-violet-400"
        >
          {ShellIcon.plus}
          <span className="hidden sm:inline">New</span>
        </button>
        {create.open && (
          <div className="suite-popover absolute right-0 top-full z-50 mt-2 w-72 rounded-xl border border-white/10 bg-zinc-950 p-1.5 shadow-2xl">
            {NEW_ITEMS.filter((item) => canAdmin || (item.id !== "invite" && item.id !== "campaign")).map((item) => (
              <button
                key={item.id}
                type="button"
                className={menuItem}
                onClick={() => {
                  create.setOpen(false);
                  onNew(item.id);
                }}
              >
                <span className={`suite-tile ${appById(item.app).tile} flex h-7 w-7 shrink-0 items-center justify-center rounded-md`}>{APP_ICONS[item.app]}</span>
                <span className="min-w-0">
                  <span className="block text-sm text-white">{item.label}</span>
                  <span className="block text-xs text-zinc-500">{item.hint}</span>
                </span>
              </button>
            ))}
          </div>
        )}
      </div>

      <div ref={bell.ref} className="relative">
        <IconButton label="Notifications" onClick={openBell} active={bell.open} badge={unread}>
          {ShellIcon.bell}
        </IconButton>
        {bell.open && (
          <div className="suite-popover absolute right-0 top-full z-50 mt-2 w-80 overflow-hidden rounded-xl border border-white/10 bg-zinc-950 shadow-2xl">
            <div className="flex items-center justify-between border-b border-white/[0.08] px-4 py-3">
              <p className="text-sm font-semibold text-white">Notifications</p>
              <button type="button" className="text-xs text-violet-300 hover:underline" onClick={() => { bell.setOpen(false); onOpenApp("settings"); window.dispatchEvent(new CustomEvent("threadly:open-settings", { detail: { section: "activity" } })); }}>
                Activity log
              </button>
            </div>
            <div className="max-h-96 overflow-y-auto p-1.5">
              {entries === null && <p className="px-3 py-6 text-center text-xs text-zinc-500">Loading…</p>}
              {entries?.length === 0 && <p className="px-3 py-6 text-center text-xs text-zinc-500">Nothing yet. Scans, saved leads, team and key changes show up here.</p>}
              {entries?.slice(0, 12).map((entry) => (
                <div key={entry.id} className="rounded-lg px-3 py-2 hover:bg-white/[0.04]">
                  <div className="flex items-baseline justify-between gap-2">
                    <p className="truncate text-[13px] font-medium text-zinc-200">{ACTION_LABELS[entry.action] ?? entry.action.replace(/[._]/g, " ")}</p>
                    <span className="shrink-0 text-[11px] text-zinc-500">{ago(entry.at)}</span>
                  </div>
                  <p className="truncate text-xs text-zinc-500">{entry.detail || entry.actor}</p>
                </div>
              ))}
            </div>
          </div>
        )}
      </div>

      <span className="hidden md:inline-flex">
        <IconButton label="Help and docs" onClick={() => window.open("/docs", "_blank", "noopener")}>
          {ShellIcon.help}
        </IconButton>
      </span>
      <span className="hidden md:inline-flex">
        <ThemeToggle theme={theme} onToggle={onToggleTheme} />
      </span>

      {user && (
        <div ref={account.ref} className="relative">
          <button
            type="button"
            onClick={() => account.setOpen(!account.open)}
            aria-expanded={account.open}
            aria-label="Account"
            title={user.email ?? "Account"}
            className="ml-0.5 flex h-9 w-9 items-center justify-center rounded-full bg-violet-500/20 text-[11px] font-semibold text-violet-300 ring-1 ring-white/10 transition hover:ring-white/30"
          >
            {initialsOf(user)}
          </button>
          {account.open && (
            <div className="suite-popover absolute right-0 top-full z-50 mt-2 w-64 rounded-xl border border-white/10 bg-zinc-950 p-1.5 shadow-2xl">
              <div className="flex items-center gap-3 border-b border-white/[0.06] px-3 py-3">
                <span className="flex h-10 w-10 shrink-0 items-center justify-center rounded-full bg-violet-500/20 text-xs font-semibold text-violet-300">{initialsOf(user)}</span>
                <span className="min-w-0">
                  <span className="block truncate text-[13px] font-medium text-white">{nameOf(user)}</span>
                  <span className="block truncate text-xs text-zinc-500">{user.email}</span>
                  {plan && <span className="mt-0.5 block text-[11px] font-medium text-violet-300">{plan}</span>}
                </span>
              </div>
              <div className="py-1">
                <Link href="/portal/account" className="block rounded-md px-3 py-2 text-[13px] text-zinc-300 hover:bg-white/[0.06] hover:text-white" onClick={() => account.setOpen(false)}>
                  My account
                </Link>
                <button type="button" className="block w-full rounded-md px-3 py-2 text-left text-[13px] text-zinc-300 hover:bg-white/[0.06] hover:text-white" onClick={() => { account.setOpen(false); onOpenApp("settings"); }}>
                  Workspace settings
                </button>
                <button type="button" className="block w-full rounded-md px-3 py-2 text-left text-[13px] text-zinc-300 hover:bg-white/[0.06] hover:text-white md:hidden" onClick={() => { account.setOpen(false); onToggleTheme(); }}>
                  {theme === "dark" ? "Light theme" : "Dark theme"}
                </button>
              </div>
              <div className="border-t border-white/[0.06] py-1">
                <button type="button" className="block w-full rounded-md px-3 py-2 text-left text-[13px] text-zinc-500 hover:bg-white/[0.06] hover:text-rose-300" onClick={() => void signOut(getFirebaseAuth())}>
                  Sign out
                </button>
              </div>
            </div>
          )}
        </div>
      )}
    </header>
  );
}
