"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import { SUITE_APPS, appById } from "@/lib/suite/apps";
import type { SearchHit } from "@/lib/suite/search";
import { APP_ICONS, ShellIcon } from "./icons";

export interface PaletteCommand {
  id: string;
  label: string;
  hint: string;
  run: () => void;
}

interface Props {
  open: boolean;
  onClose: () => void;
  commands: PaletteCommand[];
  onOpenRecord: (hit: SearchHit) => void;
  authedFetch: ((path: string, init?: RequestInit) => Promise<unknown>) | null;
}

type Row = { key: string; section: string; label: string; hint: string; icon: React.ReactNode; tile: string; run: () => void };

// One box for everything: jump to any app, run any action, or find any
// record in the workspace (leads, CRM, prospecting finds, questions).
export default function SearchPalette({ open, onClose, commands, onOpenRecord, authedFetch }: Props) {
  const [query, setQuery] = useState("");
  const [index, setIndex] = useState(0);
  const [hits, setHits] = useState<SearchHit[]>([]);
  const [searching, setSearching] = useState(false);
  const seq = useRef(0);

  useEffect(() => {
    if (open) {
      setQuery("");
      setIndex(0);
      setHits([]);
    }
  }, [open]);

  useEffect(() => {
    const q = query.trim();
    if (!open || !authedFetch || q.length < 2) {
      setHits([]);
      setSearching(false);
      return;
    }
    const id = ++seq.current;
    setSearching(true);
    const timer = window.setTimeout(() => {
      authedFetch(`/api/search?q=${encodeURIComponent(q)}`)
        .then((payload) => {
          if (id === seq.current) setHits((payload as { hits?: SearchHit[] }).hits ?? []);
        })
        .catch(() => {
          if (id === seq.current) setHits([]);
        })
        .finally(() => {
          if (id === seq.current) setSearching(false);
        });
    }, 180);
    return () => window.clearTimeout(timer);
  }, [query, open, authedFetch]);

  const rows = useMemo<Row[]>(() => {
    const q = query.trim().toLowerCase();
    const apps = SUITE_APPS.filter((a) => !q || a.name.toLowerCase().includes(q) || a.description.toLowerCase().includes(q));
    const appRows: Row[] = [];
    const cmdRows: Row[] = commands
      .filter((c) => !q || c.label.toLowerCase().includes(q))
      .map((c) => ({ key: `cmd:${c.id}`, section: "Actions", label: c.label, hint: c.hint, icon: ShellIcon.arrow, tile: "suite-tile-neutral", run: c.run }));
    for (const a of apps) {
      const cmd = commands.find((c) => c.id === `app:${a.id}`);
      if (cmd) appRows.push({ key: `app:${a.id}`, section: "Apps", label: a.name, hint: a.description, icon: APP_ICONS[a.id], tile: a.tile, run: cmd.run });
    }
    const recordRows: Row[] = hits.map((h) => ({
      key: `rec:${h.kind}:${h.id}`,
      section: "Records",
      label: h.title,
      hint: `${h.kind} · ${h.subtitle}`,
      icon: APP_ICONS[h.app],
      tile: appById(h.app).tile,
      run: () => onOpenRecord(h),
    }));
    const actions = cmdRows.filter((r) => !r.key.startsWith("cmd:app:"));
    return q ? [...recordRows, ...appRows, ...actions] : [...appRows, ...actions];
  }, [query, commands, hits, onOpenRecord]);

  if (!open) return null;

  function choose(i: number) {
    const row = rows[i];
    if (!row) return;
    onClose();
    row.run();
  }

  let lastSection = "";
  return (
    <div className="fixed inset-0 z-50 flex items-start justify-center bg-black/60 px-4 pt-[12vh]" onClick={onClose}>
      <div role="dialog" aria-label="Search Threadly" className="suite-popover w-full max-w-2xl overflow-hidden rounded-2xl border border-white/10 bg-zinc-950 shadow-2xl" onClick={(e) => e.stopPropagation()}>
        <div className="flex items-center gap-3 border-b border-white/10 px-4">
          <span className="text-zinc-500">{ShellIcon.search}</span>
          <input
            autoFocus
            value={query}
            onChange={(e) => { setQuery(e.target.value); setIndex(0); }}
            onKeyDown={(e) => {
              if (e.key === "ArrowDown") { e.preventDefault(); setIndex((i) => Math.min(i + 1, rows.length - 1)); }
              else if (e.key === "ArrowUp") { e.preventDefault(); setIndex((i) => Math.max(i - 1, 0)); }
              else if (e.key === "Enter") { e.preventDefault(); choose(index); }
              else if (e.key === "Escape") onClose();
            }}
            placeholder="Search leads, companies, deals, people, questions, or type a command"
            className="h-14 w-full bg-transparent text-[15px] text-white placeholder-zinc-500 outline-none"
          />
          {searching && <span className="shrink-0 text-xs text-zinc-500">Searching…</span>}
        </div>
        <div className="max-h-[60vh] overflow-y-auto p-2">
          {rows.length === 0 && (
            <p className="px-3 py-8 text-center text-sm text-zinc-500">
              {query.trim().length >= 2 && !searching ? `Nothing matches “${query.trim()}”.` : "Type at least two letters to search records."}
            </p>
          )}
          {rows.map((row, i) => {
            const header = row.section !== lastSection ? row.section : null;
            lastSection = row.section;
            return (
              <div key={row.key}>
                {header && <p className="ui-label px-3 pb-1 pt-3 first:pt-1">{header}</p>}
                <button
                  type="button"
                  onClick={() => choose(i)}
                  onMouseEnter={() => setIndex(i)}
                  className={`flex w-full items-center gap-3 rounded-lg px-3 py-2 text-left ${i === index ? "bg-violet-500/15" : ""}`}
                >
                  <span className={`suite-tile ${row.tile} flex h-7 w-7 shrink-0 items-center justify-center rounded-md`}>{row.icon}</span>
                  <span className="min-w-0 flex-1">
                    <span className="block truncate text-sm text-white">{row.label}</span>
                    <span className="block truncate text-xs text-zinc-500">{row.hint}</span>
                  </span>
                  {i === index && <kbd className="shrink-0 rounded border border-white/10 px-1.5 py-0.5 font-sans text-[10px] text-zinc-500">Enter</kbd>}
                </button>
              </div>
            );
          })}
        </div>
        <div className="flex items-center gap-4 border-t border-white/10 px-4 py-2 text-[11px] text-zinc-500">
          <span>↑↓ to move</span>
          <span>Enter to open</span>
          <span>Esc to close</span>
        </div>
      </div>
    </div>
  );
}
