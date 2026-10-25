"use client";

import { useState } from "react";
import type { ProviderKeyStatus } from "@/lib/geo/types";
import { colorForProvider } from "./helpers";

interface Props {
  providers: ProviderKeyStatus[];
  keyEncryption: boolean;
  busy: boolean;
  onSaveBuiltin: (provider: string, apiKey: string, model?: string) => Promise<void>;
  onAddCustom: (input: { name: string; baseUrl: string; model: string; apiKey: string }) => Promise<void>;
  onRemove: (target: { provider?: string; customId?: string }) => Promise<void>;
}

const BUILTIN_HINTS: Record<string, string> = {
  chatgpt: "platform.openai.com/api-keys",
  claude: "console.anthropic.com/settings/keys",
  gemini: "aistudio.google.com/apikey",
};

function StatusBadge({ source, lastFour }: { source: ProviderKeyStatus["source"]; lastFour?: string }) {
  if (source === "user") {
    return (
      <span className="inline-flex items-center gap-1.5 rounded-full border border-violet-500/30 bg-violet-500/10 px-2.5 py-0.5 text-[11px] font-medium text-violet-300">
        <span className="h-1.5 w-1.5 rounded-full bg-violet-400" />
        Connected ····{lastFour}
      </span>
    );
  }
  if (source === "platform") {
    return (
      <span className="inline-flex items-center gap-1.5 rounded-full border border-white/10 bg-white/[0.04] px-2.5 py-0.5 text-[11px] font-medium text-zinc-400">
        <span className="h-1.5 w-1.5 rounded-full bg-emerald-400" />
        Platform default
      </span>
    );
  }
  return (
    <span className="inline-flex items-center gap-1.5 rounded-full border border-white/10 bg-white/[0.02] px-2.5 py-0.5 text-[11px] font-medium text-zinc-500">
      <span className="h-1.5 w-1.5 rounded-full bg-zinc-600" />
      Not configured
    </span>
  );
}

export default function ProviderKeysPanel({ providers, keyEncryption, busy, onSaveBuiltin, onAddCustom, onRemove }: Props) {
  const [openKey, setOpenKey] = useState<string | null>(null);
  const [keyValue, setKeyValue] = useState("");
  const [modelValue, setModelValue] = useState("");
  const [showCustom, setShowCustom] = useState(false);
  const [custom, setCustom] = useState({ name: "", baseUrl: "", model: "", apiKey: "" });

  const builtins = providers.filter((p) => p.kind === "builtin");
  const customs = providers.filter((p) => p.kind === "custom");

  const input =
    "w-full rounded-lg border border-white/10 bg-white/[0.04] px-3 py-2 text-sm text-white placeholder:text-zinc-600 focus:border-violet-400 focus:outline-none";

  return (
    <div className="space-y-6">
      <section className="overflow-hidden rounded-xl border border-white/10">
        <div className="border-b border-white/10 bg-white/[0.03] px-5 py-4">
          <h3 className="text-sm font-semibold text-white">Built-in providers</h3>
          <p className="mt-0.5 text-xs text-zinc-500">
            Scans use the platform's default keys unless you connect your own. Keys are encrypted at rest (AES-256-GCM)
            and shown only as a masked last-four.
          </p>
        </div>
        {!keyEncryption && (
          <p className="border-b border-amber-400/20 bg-amber-500/10 px-5 py-2.5 text-sm text-amber-200">
            Key storage is not enabled on this deployment, so only platform default keys are available.
          </p>
        )}
        <div className="divide-y divide-white/[0.06]">
          {builtins.map((provider) => (
            <div key={provider.id} className="px-5 py-4">
              <div className="flex flex-wrap items-center justify-between gap-3">
                <div className="flex items-center gap-3">
                  <span className={`w-20 rounded-md border px-2 py-1 text-center text-xs font-semibold ${colorForProvider(provider.id)}`}>
                    {provider.label}
                  </span>
                  <StatusBadge source={provider.source} lastFour={provider.lastFour} />
                  {provider.model && <span className="font-mono text-[11px] text-zinc-500">{provider.model}</span>}
                </div>
                {keyEncryption && (
                  <div className="flex items-center gap-2">
                    {provider.source === "user" && (
                      <button
                        type="button"
                        disabled={busy}
                        onClick={() => void onRemove({ provider: provider.id })}
                        className="rounded-md border border-white/10 px-2.5 py-1 text-xs text-zinc-500 transition hover:border-rose-400/40 hover:text-rose-300"
                      >
                        Disconnect
                      </button>
                    )}
                    <button
                      type="button"
                      onClick={() => {
                        setOpenKey(openKey === provider.id ? null : provider.id);
                        setKeyValue("");
                        setModelValue("");
                      }}
                      className="rounded-md border border-violet-400/40 px-2.5 py-1 text-xs font-medium text-violet-300 transition hover:bg-violet-500/10"
                    >
                      {provider.source === "user" ? "Replace key" : "Connect key"}
                    </button>
                  </div>
                )}
              </div>
              {openKey === provider.id && (
                <form
                  className="mt-3 flex flex-col gap-2 rounded-lg border border-white/10 bg-white/[0.02] p-3 sm:flex-row"
                  onSubmit={(event) => {
                    event.preventDefault();
                    void onSaveBuiltin(provider.id, keyValue, modelValue || undefined).then(() => setOpenKey(null));
                  }}
                >
                  <input
                    className={input}
                    type="password"
                    required
                    minLength={8}
                    value={keyValue}
                    onChange={(e) => setKeyValue(e.target.value)}
                    placeholder={`API key from ${BUILTIN_HINTS[provider.id] ?? "your provider"}`}
                    autoComplete="off"
                  />
                  <input
                    className={`${input} sm:max-w-[180px]`}
                    value={modelValue}
                    onChange={(e) => setModelValue(e.target.value)}
                    placeholder="Model (optional)"
                    autoComplete="off"
                  />
                  <button
                    type="submit"
                    disabled={busy}
                    className="whitespace-nowrap rounded-lg bg-violet-500 px-4 py-2 text-sm font-semibold text-white transition hover:bg-violet-400 disabled:opacity-50"
                  >
                    Save key
                  </button>
                </form>
              )}
            </div>
          ))}
        </div>
      </section>

      <section className="overflow-hidden rounded-xl border border-white/10">
        <div className="flex flex-wrap items-center justify-between gap-2 border-b border-white/10 bg-white/[0.03] px-5 py-4">
          <div>
            <h3 className="text-sm font-semibold text-white">Custom providers</h3>
            <p className="mt-0.5 text-xs text-zinc-500">
              Any OpenAI-compatible endpoint (Groq, Together, Mistral, your own gateway). Answers may not include live
              web search.
            </p>
          </div>
          {keyEncryption && (
            <button
              type="button"
              onClick={() => setShowCustom(!showCustom)}
              className="rounded-lg border border-white/15 px-3 py-1.5 text-xs font-medium text-zinc-300 transition hover:bg-white/5"
            >
              {showCustom ? "Close" : "+ Add provider"}
            </button>
          )}
        </div>

        {customs.length > 0 && (
          <div className="divide-y divide-white/[0.06]">
            {customs.map((provider) => (
              <div key={provider.id} className="flex flex-wrap items-center justify-between gap-3 px-5 py-4">
                <div className="flex items-center gap-3">
                  <span className={`rounded-md border px-2 py-1 text-xs font-semibold ${colorForProvider(provider.id)}`}>
                    {provider.label}
                  </span>
                  <span className="font-mono text-[11px] text-zinc-500">
                    {provider.model} · {provider.baseUrl}
                  </span>
                  <StatusBadge source="user" lastFour={provider.lastFour} />
                </div>
                <button
                  type="button"
                  disabled={busy}
                  onClick={() => void onRemove({ customId: provider.id })}
                  className="rounded-md border border-white/10 px-2.5 py-1 text-xs text-zinc-500 transition hover:border-rose-400/40 hover:text-rose-300"
                >
                  Remove
                </button>
              </div>
            ))}
          </div>
        )}

        {!customs.length && !showCustom && (
          <p className="px-5 py-6 text-sm text-zinc-600">No custom providers yet.</p>
        )}

        {showCustom && (
          <form
            className="grid gap-2 border-t border-white/[0.06] bg-white/[0.02] p-5 sm:grid-cols-2"
            onSubmit={(event) => {
              event.preventDefault();
              void onAddCustom(custom).then(() => {
                setShowCustom(false);
                setCustom({ name: "", baseUrl: "", model: "", apiKey: "" });
              });
            }}
          >
            <input
              className={input}
              required
              value={custom.name}
              onChange={(e) => setCustom({ ...custom, name: e.target.value })}
              placeholder="Provider name (e.g. Groq Llama)"
            />
            <input
              className={input}
              required
              value={custom.model}
              onChange={(e) => setCustom({ ...custom, model: e.target.value })}
              placeholder="Model (e.g. llama-3.3-70b-versatile)"
            />
            <input
              className={`${input} sm:col-span-2`}
              required
              type="url"
              value={custom.baseUrl}
              onChange={(e) => setCustom({ ...custom, baseUrl: e.target.value })}
              placeholder="Base URL (e.g. https://api.groq.com/openai/v1)"
            />
            <input
              className={`${input} sm:col-span-2`}
              required
              type="password"
              minLength={8}
              value={custom.apiKey}
              onChange={(e) => setCustom({ ...custom, apiKey: e.target.value })}
              placeholder="API key"
              autoComplete="off"
            />
            <button
              type="submit"
              disabled={busy}
              className="rounded-lg bg-violet-500 px-4 py-2 text-sm font-semibold text-white transition hover:bg-violet-400 disabled:opacity-50 sm:col-span-2"
            >
              Add provider
            </button>
          </form>
        )}
      </section>
    </div>
  );
}
