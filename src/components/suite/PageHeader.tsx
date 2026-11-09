"use client";

import type { ReactNode } from "react";
import { GROUP_LABELS, SUITE_APPS, appById, type AppId } from "@/lib/suite/apps";
import { APP_ICONS } from "./icons";

// Every app opens with the same header: where you are in the suite, what the
// app does, which apps it hands work to, and the app's own actions.
export default function PageHeader({ app, title, subtitle, actions, onOpenApp, crumb }: {
  app: AppId;
  title?: string;
  subtitle?: ReactNode;
  actions?: ReactNode;
  crumb?: string;
  onOpenApp: (id: AppId) => void;
}) {
  const meta = appById(app);
  const feeds = meta.feeds.map(appById);
  const fedBy = SUITE_APPS.filter((a) => a.id !== app && a.feeds.includes(app) && a.group !== "admin");
  return (
    <div className="suite-page-header flex flex-wrap items-start justify-between gap-4 border-b border-white/[0.08] pb-5">
      <div className="min-w-0">
        <nav aria-label="Breadcrumb" className="flex items-center gap-1.5 text-xs text-zinc-500">
          <button type="button" onClick={() => onOpenApp("overview")} className="hover:text-white hover:underline">Threadly</button>
          {meta.group !== "home" && (
            <>
              <span aria-hidden>/</span>
              <span>{GROUP_LABELS[meta.group]}</span>
            </>
          )}
          <span aria-hidden>/</span>
          {crumb ? (
            <>
              <button type="button" onClick={() => onOpenApp(app)} className="hover:text-white hover:underline">{meta.name}</button>
              <span aria-hidden>/</span>
              <span className="text-zinc-300">{crumb}</span>
            </>
          ) : (
            <span className="text-zinc-300">{meta.name}</span>
          )}
        </nav>
        <div className="mt-2 flex items-center gap-3">
          <span className={`suite-tile ${meta.tile} flex h-10 w-10 shrink-0 items-center justify-center rounded-xl`}>{APP_ICONS[app]}</span>
          <div className="min-w-0">
            <h1 className="truncate text-xl font-semibold tracking-tight text-white">{title ?? meta.name}</h1>
            <p className="text-sm text-zinc-400">{subtitle ?? meta.description}</p>
          </div>
        </div>
        {(feeds.length > 0 || fedBy.length > 0) && (
          <div className="mt-3 flex flex-wrap items-center gap-1.5 text-xs text-zinc-500">
            {fedBy.length > 0 && <span>Gets work from</span>}
            {fedBy.map((a) => (
              <button key={a.id} type="button" onClick={() => onOpenApp(a.id)} className="suite-chip flex items-center gap-1 rounded-full border border-white/10 px-2 py-0.5 text-zinc-300 hover:border-violet-400/50">
                <span className="scale-75">{APP_ICONS[a.id]}</span>{a.name}
              </button>
            ))}
            {feeds.length > 0 && <span className={fedBy.length ? "ml-2" : ""}>Sends work to</span>}
            {feeds.map((a) => (
              <button key={a.id} type="button" onClick={() => onOpenApp(a.id)} className="suite-chip flex items-center gap-1 rounded-full border border-white/10 px-2 py-0.5 text-zinc-300 hover:border-violet-400/50">
                <span className="scale-75">{APP_ICONS[a.id]}</span>{a.name}
              </button>
            ))}
          </div>
        )}
      </div>
      {actions && <div className="flex flex-wrap items-center gap-2">{actions}</div>}
    </div>
  );
}
