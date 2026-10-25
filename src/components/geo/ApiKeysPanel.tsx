"use client";

import { useEffect, useState } from "react";
import type { ApiKeyRecord } from "@/lib/geo/types";

type ListedKey = Omit<ApiKeyRecord, "hash"> & { hash?: string };

export default function ApiKeysPanel({ authedFetch }: { authedFetch: (path: string, init?: RequestInit) => Promise<unknown> }) {
  const [keys, setKeys] = useState<ListedKey[] | "loading" | "error">("loading");
  const [name, setName] = useState("");
  const [busy, setBusy] = useState(false);
  const [newSecret, setNewSecret] = useState<string | null>(null);
  const [copied, setCopied] = useState(false);
  const [error, setError] = useState("");

  const load = () => {
    authedFetch("/api/geo/api-keys")
      .then((payload) => setKeys((payload as { keys: ListedKey[] }).keys))
      .catch(() => setKeys("error"));
  };

  useEffect(load, [authedFetch]);

  const create = async () => {
    setBusy(true);
    setError("");
    try {
      const payload = (await authedFetch("/api/geo/api-keys", {
        method: "POST",
        body: JSON.stringify({ name: name.trim() || "Default key" }),
      })) as { secret: string };
      setNewSecret(payload.secret);
      setName("");
      load();
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : "Could not create the key.");
    } finally {
      setBusy(false);
    }
  };

  const revoke = async (key: ListedKey & { hash?: string }) => {
    setBusy(true);
    try {
      // The list endpoint omits hashes; fetch full record id + hash via a second call is avoided by
      // sending id only - server resolves the hash from storage.
      await authedFetch("/api/geo/api-keys", { method: "DELETE", body: JSON.stringify({ id: key.id }) });
      load();
    } catch {
      setError("Could not revoke the key.");
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="space-y-4">
      <p className="text-sm text-zinc-400">
        Programmatic access to your latest visibility metrics. Authenticate with{" "}
        <code className="rounded bg-white/[0.06] px-1 py-0.5 text-xs text-zinc-200">Authorization: Bearer thly_...</code> on{" "}
        <code className="rounded bg-white/[0.06] px-1 py-0.5 text-xs text-zinc-200">GET /api/v1/summary</code>.
      </p>

      {newSecret && (
        <div className="rounded-lg border border-emerald-500/30 bg-emerald-500/10 p-3">
          <p className="text-sm font-medium text-emerald-200">Key created - copy it now, it will not be shown again.</p>
          <div className="mt-2 flex items-center gap-2">
            <code className="min-w-0 flex-1 truncate rounded bg-zinc-950/60 px-2 py-1.5 text-xs text-emerald-100">{newSecret}</code>
            <button
              type="button"
              onClick={() => {
                void navigator.clipboard?.writeText(newSecret);
                setCopied(true);
                setTimeout(() => setCopied(false), 1500);
              }}
              className="shrink-0 rounded-lg bg-emerald-500/20 px-3 py-1.5 text-xs font-medium text-emerald-200 hover:bg-emerald-500/30"
            >
              {copied ? "Copied" : "Copy"}
            </button>
          </div>
          <p className="mt-2 text-xs text-emerald-200/70">
            Try it: curl -H &quot;Authorization: Bearer {newSecret.slice(0, 12)}…&quot; https://www.gothreadly.live/api/v1/summary
          </p>
        </div>
      )}

      <div className="flex gap-2">
        <input
          value={name}
          onChange={(event) => setName(event.target.value)}
          placeholder="Key name (e.g. reporting script)"
          maxLength={40}
          className="min-w-0 flex-1 rounded-lg border border-white/10 bg-white/[0.03] px-3 py-2 text-sm text-white placeholder:text-zinc-600 focus:border-violet-400 focus:outline-none"
        />
        <button
          type="button"
          onClick={create}
          disabled={busy}
          className="shrink-0 rounded-lg bg-violet-500 px-4 py-2 text-sm font-semibold text-white transition hover:bg-violet-400 disabled:opacity-50"
        >
          Create key
        </button>
      </div>
      {error && <p className="text-sm text-rose-300">{error}</p>}

      {keys === "loading" && <p className="text-sm text-zinc-500">Loading keys…</p>}
      {keys === "error" && <p className="text-sm text-rose-300">Could not load API keys.</p>}
      {Array.isArray(keys) && keys.length === 0 && <p className="text-sm text-zinc-500">No API keys yet.</p>}
      {Array.isArray(keys) && keys.length > 0 && (
        <ul className="divide-y divide-white/5 rounded-xl border border-white/10">
          {keys.map((key) => (
            <li key={key.id} className="flex items-center justify-between gap-3 px-4 py-3">
              <div className="min-w-0">
                <p className="text-sm font-medium text-zinc-200">{key.name}</p>
                <p className="text-xs text-zinc-500">
                  thly_…{key.lastFour} · created {new Date(key.createdAt).toLocaleDateString()}
                  {key.lastUsedAt ? ` · last used ${new Date(key.lastUsedAt).toLocaleDateString()}` : " · never used"}
                </p>
              </div>
              <button
                type="button"
                onClick={() => revoke(key)}
                disabled={busy}
                className="shrink-0 rounded-lg border border-rose-500/30 px-3 py-1.5 text-xs font-medium text-rose-300 hover:bg-rose-500/10 disabled:opacity-50"
              >
                Revoke
              </button>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
