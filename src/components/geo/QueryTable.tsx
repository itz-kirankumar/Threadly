"use client";

import { Fragment, useState } from "react";
import type { GeoProviderId, ProviderResult, QueryResult, TrackedQuery, WorkspaceState } from "@/lib/geo/types";
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
    return <span className="text-xs text-rose-400" title={result.error ?? "Scan failed"}>failed</span>;
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

function AnswerDrawer({ queryResult, providerOrder, providerLabels }: { queryResult: QueryResult; providerOrder: GeoProviderId[]; providerLabels: Record<string, string> }) {
  const [provider, setProvider] = useState(providerOrder[0]);
  const result = queryResult.results.find((r) => r.provider === provider);
  return (
    <div className="border-t border-white/5 bg-white/[0.02] px-4 py-4">
      <div className="mb-3 flex flex-wrap gap-2">
        {providerOrder.map((id) => (
          <button
            key={id}
            type="button"
            onClick={() => setProvider(id)}
            className={`rounded-full border px-3 py-1 text-xs font-medium ${colorForProvider(id)} ${provider === id ? "" : "opacity-50 hover:opacity-90"}`}
          >
            {labelForProvider(id, providerLabels)}
          </button>
        ))}
      </div>
      {result && result.status === "scanned" ? (
        <div className="grid gap-4 md:grid-cols-2">
          <div>
            <p className="mb-1 text-xs font-medium uppercase tracking-wide text-zinc-500">Answer</p>
            <p className="whitespace-pre-wrap rounded-lg bg-white/[0.03] p-3 text-sm leading-relaxed text-zinc-300">
              {result.answer}
            </p>
          </div>
          <div>
            <p className="mb-1 text-xs font-medium uppercase tracking-wide text-zinc-500">
              Citations ({result.citations.length})
            </p>
            <ul className="space-y-1.5">
              {result.citations.map((citation) => (
                <li key={citation.url} className="truncate text-sm">
                  <a
                    href={citation.url}
                    target="_blank"
                    rel="noreferrer"
                    className={`hover:underline ${citation.domain.includes("loomify") ? "text-violet-300" : "text-cyan-300"}`}
                  >
                    {citation.domain}
                  </a>
                  <span className="ml-2 text-xs text-zinc-500">{citation.title}</span>
                </li>
              ))}
              {!result.citations.length && <li className="text-sm text-zinc-600">No citations returned.</li>}
            </ul>
            {result.competitorsMentioned.length > 0 && (
              <p className="mt-3 text-xs text-zinc-500">
                Also mentioned: {result.competitorsMentioned.join(", ")}
              </p>
            )}
          </div>
        </div>
      ) : (
        <p className="text-sm text-zinc-500">{result?.answer ?? "No result."}</p>
      )}
    </div>
  );
}

export default function QueryTable({ state, readOnly, busy, onAdd, onDelete, onSuggest, suggestions, suggestBusy, providerOrder, providerLabels }: Props) {
  const canDelete = !readOnly && Boolean(onDelete);
  const [newQuery, setNewQuery] = useState("");
  const [open, setOpen] = useState<string | null>(null);
  const resultsByQuery = new Map(state.results.map((r) => [r.queryId, r]));

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

      <div className="overflow-x-auto rounded-xl border border-white/10">
        <table className="w-full text-left text-sm">
          <thead>
            <tr className="border-b border-white/10 bg-white/[0.03] text-xs uppercase tracking-wide text-zinc-500">
              <th className="px-4 py-3 font-medium">Buyer question</th>
              {providerOrder.map((id) => (
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
                    {providerOrder.map((id) => (
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
                        <AnswerDrawer queryResult={queryResult} providerOrder={providerOrder} providerLabels={providerLabels} />
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
