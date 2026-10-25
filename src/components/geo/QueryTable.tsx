"use client";

import { Fragment, useMemo, useState } from "react";
import type { BrandProfile, GeoProviderId, ProviderResult, QueryResult, TrackedQuery, WorkspaceState } from "@/lib/geo/types";
import { colorForProvider, labelForProvider } from "./helpers";

interface Props {
  state: WorkspaceState;
  readOnly: boolean;
  busy: boolean;
  onAdd: (text: string) => Promise<void>;
  onDelete?: (queryId: string) => Promise<void>;
  onSuggest: () => Promise<void>;
  suggestions: string[];
  suggestBusy: boolean;
  providerOrder: GeoProviderId[];
  providerLabels: Record<string, string>;
}

function Cell({ result }: { result?: ProviderResult }) {
  if (!result || result.status === "not_configured") {
    return <span className="text-xs text-zinc-600" title="API key not configured">—</span>;
  }
  if (result.status === "failed") {
    return <span className="text-xs text-zinc-600">—</span>;
  }
  return (
    <div className="flex items-center justify-center gap-1.5 text-xs">
      <span className={result.brandMentioned ? "text-emerald-300" : "text-zinc-600"} title={result.brandMentioned ? "Brand mentioned" : "Not mentioned"}>
        ●
      </span>
      <span className={result.brandCited ? "text-cyan-300" : "text-zinc-600"} title={result.brandCited ? "Brand domain cited" : "Not cited"}>
        ⬡
      </span>
      {result.brandPosition !== null && <span className="text-zinc-400">#{result.brandPosition}</span>}
    </div>
  );
}


const LINK_RE = /\[([^\]]+)\]\((https?:\/\/[^\s)]+)\)|(https?:\/\/[^\s)\],.;]+)/g;
const BOLD_RE = /\*\*([^*]+)\*\*/g;

function escapeRe(value: string): string {
  return value.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

interface HighlightName {
  name: string;
  kind: "brand" | "competitor";
}

function highlightPattern(brand: BrandProfile | null): { re: RegExp; kinds: Map<string, "brand" | "competitor"> } | null {
  if (!brand) return null;
  const names: HighlightName[] = [
    ...[brand.name, ...(brand.aliases ?? [])].filter((n) => n?.trim()).map((name) => ({ name, kind: "brand" as const })),
    ...(brand.competitors ?? []).flatMap((c) =>
      [c.name, ...(c.aliases ?? [])].filter((n) => n?.trim()).map((name) => ({ name, kind: "competitor" as const })),
    ),
  ];
  if (!names.length) return null;
  const kinds = new Map(names.map((n) => [n.name.toLowerCase(), n.kind]));
  const re = new RegExp(
    `(^|[^a-z0-9])(${names.map((n) => escapeRe(n.name)).sort((a, b) => b.length - a.length).join("|")})(?=[^a-z0-9]|$)`,
    "gi",
  );
  return { re, kinds };
}

function renderInline(text: string, highlight: { re: RegExp; kinds: Map<string, "brand" | "competitor"> } | null, keyPrefix: string): React.ReactNode[] {
  // First pass: markdown links + bare URLs become anchors.
  const nodes: React.ReactNode[] = [];
  let last = 0;
  let m: RegExpExecArray | null;
  LINK_RE.lastIndex = 0;
  let k = 0;
  while ((m = LINK_RE.exec(text))) {
    if (m.index > last) nodes.push(...renderFormattedText(text.slice(last, m.index), highlight, `${keyPrefix}-t${k++}`));
    const label = m[1] ?? m[3];
    const url = m[2] ?? m[3];
    nodes.push(
      <a key={`${keyPrefix}-a${k++}`} href={url} target="_blank" rel="noreferrer" className="text-cyan-300 underline decoration-cyan-500/40 hover:decoration-cyan-300">
        {label}
      </a>,
    );
    last = m.index + m[0].length;
  }
  if (last < text.length) nodes.push(...renderFormattedText(text.slice(last), highlight, `${keyPrefix}-t${k++}`));
  return nodes;
}

function renderFormattedText(text: string, highlight: { re: RegExp; kinds: Map<string, "brand" | "competitor"> } | null, keyPrefix: string): React.ReactNode[] {
  // Second pass: **bold**.
  const nodes: React.ReactNode[] = [];
  let last = 0;
  let m: RegExpExecArray | null;
  BOLD_RE.lastIndex = 0;
  let k = 0;
  while ((m = BOLD_RE.exec(text))) {
    if (m.index > last) nodes.push(...renderHighlighted(text.slice(last, m.index), highlight, `${keyPrefix}-p${k++}`));
    nodes.push(
      <strong key={`${keyPrefix}-b${k++}`} className="font-semibold text-zinc-100">
        {renderHighlighted(m[1], highlight, `${keyPrefix}-bi${k}`)}
      </strong>,
    );
    last = m.index + m[0].length;
  }
  if (last < text.length) nodes.push(...renderHighlighted(text.slice(last), highlight, `${keyPrefix}-p${k++}`));
  return nodes;
}

function renderHighlighted(text: string, highlight: { re: RegExp; kinds: Map<string, "brand" | "competitor"> } | null, keyPrefix: string): React.ReactNode[] {
  // Final pass: brand + competitor name highlights.
  if (!highlight) return [text];
  const nodes: React.ReactNode[] = [];
  let last = 0;
  let m: RegExpExecArray | null;
  highlight.re.lastIndex = 0;
  let k = 0;
  while ((m = highlight.re.exec(text))) {
    const start = m.index + m[1].length;
    if (start > last) nodes.push(text.slice(last, start));
    const kind = highlight.kinds.get(m[2].toLowerCase()) ?? "competitor";
    nodes.push(
      <mark
        key={`${keyPrefix}-h${k++}`}
        className={
          kind === "brand"
            ? "rounded bg-violet-500/25 px-0.5 font-medium text-violet-200"
            : "rounded bg-amber-500/20 px-0.5 text-amber-200/90"
        }
      >
        {m[2]}
      </mark>,
    );
    last = start + m[2].length;
  }
  if (last < text.length) nodes.push(text.slice(last));
  return nodes;
}

function AnswerText({ answer, brand }: { answer: string; brand: BrandProfile | null }) {
  const highlight = useMemo(() => highlightPattern(brand), [brand]);
  const blocks: React.ReactNode[] = [];
  const lines = answer.split("\n");
  let list: string[] = [];
  let ordered = false;
  let k = 0;
  const flushList = () => {
    if (!list.length) return;
    const items = list.map((item, i) => <li key={i}>{renderInline(item, highlight, `li${k}-${i}`)}</li>);
    blocks.push(
      ordered ? (
        <ol key={`ol${k++}`} className="list-decimal space-y-1 pl-5">{items}</ol>
      ) : (
        <ul key={`ul${k++}`} className="list-disc space-y-1 pl-5">{items}</ul>
      ),
    );
    list = [];
  };
  for (const rawLine of lines) {
    const line = rawLine.trimEnd();
    const bullet = /^[-*•]\s+(.+)$/.exec(line);
    const numbered = /^\d+[.)]\s+(.+)$/.exec(line);
    if (bullet || numbered) {
      if (list.length && ordered !== Boolean(numbered)) flushList();
      ordered = Boolean(numbered);
      list.push((bullet ?? numbered)![1]);
      continue;
    }
    flushList();
    const heading = /^(#{1,4})\s+(.+)$/.exec(line);
    if (heading) {
      blocks.push(
        <p key={`h${k++}`} className="pt-1 font-semibold text-zinc-100">
          {renderInline(heading[2], highlight, `h${k}`)}
        </p>,
      );
    } else if (line.trim()) {
      blocks.push(<p key={`p${k++}`}>{renderInline(line, highlight, `p${k}`)}</p>);
    }
  }
  flushList();
  return <div className="space-y-2 rounded-lg bg-white/[0.03] p-3 text-sm leading-relaxed text-zinc-300">{blocks}</div>;
}

function AnswerDrawer({ queryResult, brand, providerOrder, providerLabels }: { queryResult: QueryResult; brand: BrandProfile | null; providerOrder: GeoProviderId[]; providerLabels: Record<string, string> }) {
  const answered = providerOrder.filter((id) =>
    queryResult.results.some((r) => r.provider === id && r.status === "scanned"),
  );
  const chips = answered.length ? answered : providerOrder;
  const [provider, setProvider] = useState(chips[0]);
  const active = chips.includes(provider) ? provider : chips[0];
  const result = queryResult.results.find((r) => r.provider === active);
  return (
    <div className="border-t border-white/5 bg-white/[0.02] px-4 py-4">
      <div className="mb-3 flex flex-wrap gap-2">
        {chips.map((id) => (
          <button
            key={id}
            type="button"
            onClick={() => setProvider(id)}
            className={`rounded-full border px-3 py-1 text-xs font-medium ${colorForProvider(id)} ${active === id ? "" : "opacity-50 hover:opacity-90"}`}
          >
            {labelForProvider(id, providerLabels)}
          </button>
        ))}
      </div>
      {result && result.status === "scanned" ? (
        <div className="grid gap-4 md:grid-cols-2">
          <div>
            <p className="mb-1 text-xs font-medium uppercase tracking-wide text-zinc-500">Answer</p>
            <AnswerText answer={result.answer} brand={brand} />
          </div>
          <div>
            <p className="mb-1 text-xs font-medium uppercase tracking-wide text-zinc-500">
              Citations ({(result.citations ?? []).length})
            </p>
            <ul className="space-y-1.5">
              {(result.citations ?? []).map((citation) => (
                <li key={citation.url} className="truncate text-sm">
                  <a
                    href={citation.url}
                    target="_blank"
                    rel="noreferrer"
                    className={`hover:underline ${brand && citation.domain.includes(brand.domain.replace(/^www\./, "")) ? "text-violet-300" : "text-cyan-300"}`}
                  >
                    {citation.domain}
                  </a>
                  <span className="ml-2 text-xs text-zinc-500">{citation.title}</span>
                </li>
              ))}
              {!(result.citations ?? []).length && <li className="text-sm text-zinc-600">No citations returned.</li>}
            </ul>
            {(result.competitorsMentioned ?? []).length > 0 && (
              <p className="mt-3 text-xs text-zinc-500">
                Also mentioned: {(result.competitorsMentioned ?? []).join(", ")}
              </p>
            )}
          </div>
        </div>
      ) : (
        <p className="text-sm text-zinc-500">{result?.answer ?? "No result."}</p>
      )}
      {(queryResult.webResults ?? []).length > 0 && (
        <div className="mt-4 border-t border-white/5 pt-3">
          <p className="mb-1.5 text-xs font-medium uppercase tracking-wide text-zinc-500">
            Organic web results <span className="font-normal normal-case text-zinc-600">(classic search, not AI answers)</span>
          </p>
          <ul className="space-y-1.5">
            {(queryResult.webResults ?? []).map((item) => (
              <li key={item.url} className="truncate text-sm">
                <a href={item.url} target="_blank" rel="noreferrer" className="text-cyan-300 hover:underline">
                  {item.domain}
                </a>
                <span className="ml-2 text-xs text-zinc-500">{item.title}</span>
              </li>
            ))}
          </ul>
        </div>
      )}
    </div>
  );
}

export default function QueryTable({ state, readOnly, busy, onAdd, onDelete, onSuggest, suggestions, suggestBusy, providerOrder, providerLabels }: Props) {
  const canDelete = !readOnly && Boolean(onDelete);
  const [newQuery, setNewQuery] = useState("");
  const [open, setOpen] = useState<string | null>(null);
  const resultsByQuery = new Map(state.results.map((r) => [r.queryId, r]));
  const scannedProviders = providerOrder.filter((id) =>
    state.results.some((r) => r.results.some((cell) => cell.provider === id && cell.status === "scanned")),
  );
  const columns = scannedProviders.length ? scannedProviders : providerOrder;

  return (
    <div className="space-y-4">
      {!readOnly && (
        <div className="space-y-3">
          <form
            onSubmit={async (e) => {
              e.preventDefault();
              if (!newQuery.trim()) return;
              await onAdd(newQuery.trim());
              setNewQuery("");
            }}
            className="flex gap-2"
          >
            <input
              value={newQuery}
              onChange={(e) => setNewQuery(e.target.value)}
              placeholder="Add a buyer question, e.g. “best async video tools for remote teams”"
              className="w-full rounded-lg border border-white/10 bg-white/[0.04] px-3 py-2 text-sm text-zinc-100 placeholder-zinc-500 outline-none focus:border-violet-400/60"
            />
            <button
              type="submit"
              disabled={busy || !newQuery.trim()}
              className="whitespace-nowrap rounded-lg bg-violet-500 px-4 py-2 text-sm font-semibold text-white hover:bg-violet-400 disabled:opacity-50"
            >
              Track
            </button>
            <button
              type="button"
              onClick={onSuggest}
              disabled={suggestBusy}
              className="whitespace-nowrap rounded-lg border border-violet-400/40 px-4 py-2 text-sm font-medium text-violet-300 hover:bg-violet-500/10 disabled:opacity-50"
            >
              {suggestBusy ? "Thinking…" : "Suggest"}
            </button>
          </form>
          {suggestions.length > 0 && (
            <div className="flex flex-wrap gap-2">
              {suggestions.map((suggestion) => (
                <button
                  key={suggestion}
                  type="button"
                  onClick={() => onAdd(suggestion)}
                  className="rounded-full border border-white/10 bg-white/[0.03] px-3 py-1 text-xs text-zinc-300 hover:border-violet-400/50 hover:text-white"
                >
                  + {suggestion}
                </button>
              ))}
            </div>
          )}
        </div>
      )}

      <div className="flex items-center gap-4 text-xs text-zinc-500">
        <span><span className="text-emerald-300">●</span> mentioned</span>
        <span><span className="text-cyan-300">⬡</span> cited</span>
        <span># position among brands</span>
        <span>Click a row to read the answers</span>
      </div>

      {/* Mobile: stacked cards so the question text keeps full width */}
      <div className="space-y-2 md:hidden">
        {state.queries.map((query: TrackedQuery) => {
          const queryResult = resultsByQuery.get(query.id);
          const isOpen = open === query.id;
          return (
            <div key={query.id} className="rounded-xl border border-white/10">
              <button
                type="button"
                onClick={() => setOpen(isOpen ? null : query.id)}
                className="w-full px-3 py-3 text-left"
              >
                <p className="text-sm text-zinc-200">{query.text}</p>
                <p className="mt-0.5 text-xs text-zinc-600">{query.intent}</p>
                <div className="mt-2 flex flex-wrap items-center gap-x-4 gap-y-1.5">
                  {columns.map((id) => (
                    <span key={id} className="flex items-center gap-1.5 text-xs">
                      <span className="text-zinc-500">{labelForProvider(id, providerLabels)}</span>
                      <Cell result={queryResult?.results.find((r) => r.provider === id)} />
                    </span>
                  ))}
                </div>
              </button>
              {isOpen && queryResult && (
                <div className="border-t border-white/10 px-3 py-3">
                  <AnswerDrawer queryResult={queryResult} brand={state.brand} providerOrder={providerOrder} providerLabels={providerLabels} />
                </div>
              )}
            </div>
          );
        })}
        {!state.queries.length && (
          <p className="rounded-xl border border-white/10 px-4 py-10 text-center text-sm text-zinc-500">
            No questions tracked yet. Add the questions your buyers ask AI assistants.
          </p>
        )}
      </div>

      <div className="hidden overflow-x-auto rounded-xl border border-white/10 md:block">
        <table className="w-full text-left text-sm">
          <thead>
            <tr className="border-b border-white/10 bg-white/[0.03] text-xs uppercase tracking-wide text-zinc-500">
              <th className="px-4 py-3 font-medium">Buyer question</th>
              {columns.map((id) => (
                <th key={id} className="px-2 py-3 text-center font-medium">{labelForProvider(id, providerLabels)}</th>
              ))}
              {canDelete && <th className="w-10" />}
            </tr>
          </thead>
          <tbody>
            {state.queries.map((query: TrackedQuery) => {
              const queryResult = resultsByQuery.get(query.id);
              return (
                <Fragment key={query.id}>
                  <tr
                    onClick={() => setOpen(open === query.id ? null : query.id)}
                    className="cursor-pointer border-b border-white/5 transition hover:bg-white/[0.03]"
                  >
                    <td className="px-4 py-3">
                      <p className="text-zinc-200">{query.text}</p>
                      <p className="mt-0.5 text-xs text-zinc-600">{query.intent}</p>
                    </td>
                    {columns.map((id) => (
                      <td key={id} className="px-2 py-3 text-center">
                        <Cell result={queryResult?.results.find((r) => r.provider === id)} />
                      </td>
                    ))}
                    {canDelete && (
                      <td className="px-2 py-3 text-center">
                        <button
                          type="button"
                          aria-label="Delete question"
                          onClick={(e) => {
                            e.stopPropagation();
                            if (onDelete) void onDelete(query.id);
                          }}
                          className="text-zinc-600 hover:text-rose-400"
                        >
                          ×
                        </button>
                      </td>
                    )}
                  </tr>
                  {open === query.id && queryResult && (
                    <tr key={`${query.id}-drawer`}>
                      <td colSpan={!canDelete ? providerOrder.length + 1 : providerOrder.length + 2} className="p-0">
                        <AnswerDrawer queryResult={queryResult} brand={state.brand} providerOrder={providerOrder} providerLabels={providerLabels} />
                      </td>
                    </tr>
                  )}
                </Fragment>
              );
            })}
            {!state.queries.length && (
              <tr>
                <td colSpan={!canDelete ? providerOrder.length + 1 : providerOrder.length + 2} className="px-4 py-10 text-center text-sm text-zinc-500">
                  No questions tracked yet. Add the questions your buyers ask AI assistants.
                </td>
              </tr>
            )}
          </tbody>
        </table>
      </div>
    </div>
  );
}
