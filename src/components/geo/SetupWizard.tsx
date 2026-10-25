"use client";

import { useState } from "react";
import type { BrandProfile, Competitor } from "@/lib/geo/types";

interface Props {
  busy: boolean;
  error: string;
  onSave: (brand: {
    name: string;
    domain: string;
    aliases: string[];
    category: string;
    competitors: Competitor[];
  }) => Promise<void>;
  initial?: BrandProfile | null;
  onCancel?: () => void;
}

const emptyCompetitor: Competitor = { name: "", domain: "", aliases: [] };

export default function SetupWizard({ busy, error, onSave, initial, onCancel }: Props) {
  const [name, setName] = useState(initial?.name ?? "");
  const [domain, setDomain] = useState(initial?.domain ?? "");
  const [aliases, setAliases] = useState((initial?.aliases ?? []).join(", "));
  const [category, setCategory] = useState(initial?.category ?? "");
  const [competitors, setCompetitors] = useState<Competitor[]>(
    initial?.competitors.length ? initial.competitors : [{ ...emptyCompetitor }, { ...emptyCompetitor }],
  );

  function updateCompetitor(index: number, patch: Partial<Competitor>) {
    setCompetitors((list) => list.map((item, i) => (i === index ? { ...item, ...patch } : item)));
  }

  async function submit(event: React.FormEvent) {
    event.preventDefault();
    await onSave({
      name,
      domain,
      aliases: aliases.split(",").map((a) => a.trim()).filter(Boolean),
      category,
      competitors: competitors.filter((c) => c.name.trim() && c.domain.trim()),
    });
  }

  const input =
    "w-full rounded-lg border border-white/10 bg-white/[0.04] px-3 py-2 text-sm text-zinc-100 placeholder-zinc-500 outline-none focus:border-violet-400/60";
  const label = "mb-1 block text-xs font-medium uppercase tracking-wide text-zinc-400";

  return (
    <form onSubmit={submit} className="mx-auto max-w-xl space-y-5">
      <div>
        <h2 className="text-xl font-semibold text-white">{initial ? "Brand settings" : "Set up your brand"}</h2>
        <p className="mt-1 text-sm text-zinc-400">
          Threadly asks ChatGPT, Claude and Gemini the questions your buyers ask, then measures whether
          those answers mention and cite you versus your competitors.
        </p>
      </div>
      <div className="grid gap-4 sm:grid-cols-2">
        <div>
          <label className={label} htmlFor="brand-name">Brand name</label>
          <input id="brand-name" className={input} value={name} onChange={(e) => setName(e.target.value)} placeholder="Acme Analytics" required />
        </div>
        <div>
          <label className={label} htmlFor="brand-domain">Website domain</label>
          <input id="brand-domain" className={input} value={domain} onChange={(e) => setDomain(e.target.value)} placeholder="acme.com" required />
        </div>
      </div>
      <div>
        <label className={label} htmlFor="brand-aliases">Aliases (comma-separated, optional)</label>
        <input id="brand-aliases" className={input} value={aliases} onChange={(e) => setAliases(e.target.value)} placeholder="Acme, Acme AI" />
      </div>
      <div>
        <label className={label} htmlFor="brand-category">What do you sell? (one phrase)</label>
        <input id="brand-category" className={input} value={category} onChange={(e) => setCategory(e.target.value)} placeholder="B2B revenue analytics software" required />
      </div>
      <div>
        <div className="mb-2 flex items-center justify-between">
          <span className={label.replace("mb-1 ", "")}>Competitors (up to 8)</span>
          {competitors.length < 8 && (
            <button
              type="button"
              onClick={() => setCompetitors((list) => [...list, { ...emptyCompetitor }])}
              className="text-xs font-medium text-violet-300 hover:text-violet-200"
            >
              + Add competitor
            </button>
          )}
        </div>
        <div className="space-y-2">
          {competitors.map((competitor, index) => (
            <div key={index} className="flex gap-2">
              <input
                className={input}
                value={competitor.name}
                onChange={(e) => updateCompetitor(index, { name: e.target.value })}
                placeholder="Competitor name"
                aria-label={`Competitor ${index + 1} name`}
              />
              <input
                className={input}
                value={competitor.domain}
                onChange={(e) => updateCompetitor(index, { domain: e.target.value })}
                placeholder="competitor.com"
                aria-label={`Competitor ${index + 1} domain`}
              />
              {competitors.length > 1 && (
                <button
                  type="button"
                  onClick={() => setCompetitors((list) => list.filter((_, i) => i !== index))}
                  className="rounded-lg border border-white/10 px-2 text-zinc-500 hover:text-zinc-300"
                  aria-label="Remove competitor"
                >
                  ×
                </button>
              )}
            </div>
          ))}
        </div>
      </div>
      {error && <p className="rounded-lg border border-rose-500/30 bg-rose-500/10 px-3 py-2 text-sm text-rose-300">{error}</p>}
      <div className="flex gap-3">
        <button
          type="submit"
          disabled={busy}
          className="rounded-lg bg-violet-500 px-4 py-2 text-sm font-semibold text-white transition hover:bg-violet-400 disabled:opacity-50"
        >
          {busy ? "Saving…" : initial ? "Save changes" : "Save and continue"}
        </button>
        {onCancel && (
          <button type="button" onClick={onCancel} className="rounded-lg border border-white/10 px-4 py-2 text-sm text-zinc-300 hover:bg-white/5">
            Cancel
          </button>
        )}
      </div>
    </form>
  );
}
