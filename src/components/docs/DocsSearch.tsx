"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { DOC_PAGES } from "@/lib/docs/content";

interface Hit {
  slug: string;
  title: string;
  section: string;
  snippet: string;
}

function searchDocs(query: string): Hit[] {
  const q = query.trim().toLowerCase();
  if (q.length < 2) return [];
  const hits: Hit[] = [];
  for (const page of DOC_PAGES) {
    const fields: { text: string; weight: number }[] = [
      { text: page.title, weight: 3 },
      { text: page.description, weight: 2 },
    ];
    for (const block of page.blocks) {
      if (block.type === "list") {
        for (const item of block.items) fields.push({ text: item, weight: 1 });
      } else if (block.type === "code") {
        fields.push({ text: block.text, weight: 1 });
      } else {
        fields.push({ text: block.text, weight: 1 });
      }
    }
    let best = -1;
    let snippet = "";
    for (const field of fields) {
      const idx = field.text.toLowerCase().indexOf(q);
      if (idx >= 0 && (best < 0 || field.weight > best)) {
        best = field.weight;
        const start = Math.max(0, idx - 40);
        snippet = (start > 0 ? "..." : "") + field.text.slice(start, idx + q.length + 60) + (idx + q.length + 60 < field.text.length ? "..." : "");
      }
    }
    if (best >= 0) hits.push({ slug: page.slug, title: page.title, section: page.section, snippet });
  }
  const titleMatches = (h: Hit) => h.title.toLowerCase().includes(q) ? 1 : 0;
  return hits.sort((a, b) => titleMatches(b) - titleMatches(a)).slice(0, 8);
}

export default function DocsSearch() {
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [query, setQuery] = useState("");
  const [active, setActive] = useState(0);
  const inputRef = useRef<HTMLInputElement>(null);
  const results = useMemo(() => searchDocs(query), [query]);

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if ((e.metaKey || e.ctrlKey) && e.key.toLowerCase() === "k") {
        e.preventDefault();
        setOpen((v) => !v);
      }
      if (e.key === "Escape") setOpen(false);
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, []);

  useEffect(() => {
    if (open) setTimeout(() => inputRef.current?.focus(), 0);
    else setQuery("");
  }, [open]);

  useEffect(() => setActive(0), [query]);

  const go = (slug: string) => {
    setOpen(false);
    router.push(`/docs/${slug}`);
  };

  return (
    <>
      <button
        onClick={() => setOpen(true)}
        className="flex w-full items-center gap-2 rounded-md border border-zinc-700 bg-zinc-900 px-3 py-2 text-sm text-zinc-500 transition hover:border-zinc-600"
      >
        <svg viewBox="0 0 24 24" className="h-4 w-4" fill="none" stroke="currentColor" strokeWidth="2">
          <circle cx="11" cy="11" r="7" />
          <path d="m21 21-4.3-4.3" strokeLinecap="round" />
        </svg>
        Search docs
        <kbd className="ml-auto rounded border border-zinc-700 bg-zinc-800 px-1.5 text-[10px] text-zinc-400">Ctrl K</kbd>
      </button>
      {open && (
        <div className="fixed inset-0 z-50 flex items-start justify-center bg-black/70 px-4 pt-24" onClick={() => setOpen(false)}>
          <div className="w-full max-w-lg overflow-hidden rounded-xl border border-zinc-700 bg-zinc-900 shadow-2xl" onClick={(e) => e.stopPropagation()}>
            <input
              ref={inputRef}
              value={query}
              onChange={(e) => setQuery(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === "ArrowDown") { e.preventDefault(); setActive((a) => Math.min(a + 1, results.length - 1)); }
                if (e.key === "ArrowUp") { e.preventDefault(); setActive((a) => Math.max(a - 1, 0)); }
                if (e.key === "Enter" && results[active]) go(results[active].slug);
              }}
              placeholder="Search the docs..."
              className="w-full border-b border-zinc-800 bg-transparent px-4 py-3 text-sm text-zinc-100 outline-none placeholder:text-zinc-500"
            />
            <div className="max-h-80 overflow-y-auto">
              {query.trim().length >= 2 && results.length === 0 && (
                <p className="px-4 py-6 text-center text-sm text-zinc-500">No matches for &quot;{query}&quot;</p>
              )}
              {results.map((hit, i) => (
                <button
                  key={hit.slug}
                  onClick={() => go(hit.slug)}
                  onMouseEnter={() => setActive(i)}
                  className={`block w-full px-4 py-3 text-left ${i === active ? "bg-zinc-800" : ""}`}
                >
                  <p className="text-[11px] uppercase tracking-wide text-zinc-500">{hit.section}</p>
                  <p className="text-sm font-medium text-zinc-100">{hit.title}</p>
                  <p className="mt-0.5 line-clamp-2 text-xs text-zinc-400">{hit.snippet}</p>
                </button>
              ))}
            </div>
          </div>
        </div>
      )}
    </>
  );
}
