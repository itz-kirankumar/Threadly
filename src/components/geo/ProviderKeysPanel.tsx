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

function SourceChip({ source, lastFour }: { source: ProviderKeyStatus["source"]; lastFour?: string }) {
  if (source === "user") {
    return (
      <span className="rounded-full bg-violet-500/15 px-2 py-0.5 text-[11px] font-medium text-violet-300">
        Your key ····{lastFour}
      </span>
    );
  }
  if (source === "platform") {
    return <span className="rounded-full bg-white/5 px-2 py-0.5 text-[11px] text-zinc-400">Platform default</span>;
  }
  return <span className="rounded-full bg-white/5 px-2 py-0.5 text-[11px] text-zinc-500">Not configured</span>;
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
    <section className="rounded-xl border border-white/10 bg-white/[0.02] p-6">
      <h3 className="text-base font-semibold text-white">AI provider keys</h3>
      <p className="mt-1 text-sm leading-relaxed text-zinc-500">
        Scans use the platform's default keys. Add your own keys to scan on your accounts, use different models, or
        track providers beyond the defaults. Keys are encrypted at rest and never shown again after saving.
      </p>
      {!keyEncryption && (
        <p className="mt-3 rounded-lg border border-amber-400/30 bg-amber-500/10 px-3 py-2 text-sm text-amber-200">
          Key storage is not enabled on this deployment, so only platform default keys are available.
        </p>
      )}

      <div className="mt-5 space-y-3">
        {builtins.map((provider) => (
          <div key={provider.id} className="rounded-xl border border-white/10 p-4">
            <div className="flex flex-wrap items-center justify-between gap-2">
              <div className="flex items-center gap-3">
                <span className={`rounded-lg border px-2.5 py-1 text-xs font-semibold ${colorForProvider(provider.id)}`}>
                  {provider.label}
                </span>
                <SourceChip source={provider.source} lastFour={provider.lastFour} />
              </div>
              {keyEncryption && (
                <div className="flex gap-2">
                  {provider.source === "user" && (
                    <button
                      type="button"
                      disabled={busy}
                      onClick={() => void onRemove({ provider: provider.id })}
                      className="text-xs text-zinc-500 transition hover:text-rose-300"
                    >
                      Remove
                    </button>
                  )}
                  <button
                    type="button"
                    onClick={() => {
                      setOpenKey(openKey === provider.id ? null : provider.id);
                      setKeyValue("");
                      setModelValue("");
                    }}
                    className="text-xs font-medium text-violet-300 transition hover:text-violet-200"
                  >
                    {provider.source === "user" ? "Replace key" : "Use my own key"}
                  </button>
                </div>
              )}
            </div>
            {openKey === provider.id && (
              <form
                className="mt-3 flex flex-col gap-2 sm:flex-row"
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
                  className="rounded-lg bg-violet-500 px-4 py-2 text-sm font-semibold text-white transition hover:bg-violet-400 disabled:opacity-50"
                >
                  Save
                </button>
              </form>
            )}
          </div>
        ))}
      </div>

      <div className="mt-6 border-t border-white/10 pt-5">
        <div className="flex items-center justify-between">
          <div>
            <h4 className="text-sm font-semibold text-white">Custom providers</h4>
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

        {customs.map((provider) => (
          <div key={provider.id} className="mt-3 flex flex-wrap items-center justify-between gap-2 rounded-xl border border-white/10 p-4">
            <div className="flex items-center gap-3">
              <span className={`rounded-lg border px-2.5 py-1 text-xs font-semibold ${colorForProvider(provider.id)}`}>
                {provider.label}
              </span>
              <span className="font-mono text-[11px] text-zinc-500">
                {provider.model} · {provider.baseUrl}
              </span>
              <SourceChip source="user" lastFour={provider.lastFour} />
            </div>
            <button
              type="button"
              disabled={busy}
              onClick={() => void onRemove({ customId: provider.id })}
              className="text-xs text-zinc-500 transition hover:text-rose-300"
            >
              Remove
            </button>
          </div>
        ))}

        {showCustom && (
          <form
            className="mt-3 grid gap-2 rounded-xl border border-white/10 p-4 sm:grid-cols-2"
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
      </div>
    </section>
  );
}
