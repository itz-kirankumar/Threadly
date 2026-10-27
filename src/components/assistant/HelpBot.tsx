"use client";

import { useEffect, useRef, useState } from "react";

type Msg = { role: "user" | "bot"; text: string };

const QUICK = ["What does Threadly do?", "How do scans work?", "Pricing & trial", "Contact support"];
const GREETING: Msg = {
  role: "bot",
  text: "Hi! I'm the Threadly assistant. Ask me about the product, pricing, docs or support, and I'll point you to the right page.",
};

function renderWithLinks(text: string) {
  const parts = text.split(/(\[[^\]]+\]\([^)]+\))/g);
  return parts.map((part, i) => {
    const m = part.match(/^\[([^\]]+)\]\(([^)]+)\)$/);
    if (m) {
      return (
        <a key={i} href={m[2]} className="font-medium text-violet-300 underline decoration-violet-500/50 hover:text-violet-200">
          {m[1]}
        </a>
      );
    }
    return <span key={i}>{part}</span>;
  });
}

export default function HelpBot() {
  const [open, setOpen] = useState(false);
  const [messages, setMessages] = useState<Msg[]>([GREETING]);
  const [input, setInput] = useState("");
  const [busy, setBusy] = useState(false);
  const listRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    listRef.current?.scrollTo({ top: listRef.current.scrollHeight });
  }, [messages, busy, open]);

  async function send(text: string) {
    const msg = text.trim();
    if (!msg || busy) return;
    setMessages((prev) => [...prev, { role: "user", text: msg }]);
    setInput("");
    setBusy(true);
    try {
      const res = await fetch("/api/assistant/chat", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ message: msg }),
      });
      const data = (await res.json()) as { reply?: string };
      setMessages((prev) => [...prev, { role: "bot", text: data.reply ?? "Something went wrong on my side. The [contact page](/contact) reaches the team." }]);
    } catch {
      setMessages((prev) => [...prev, { role: "bot", text: "I couldn't reach the server just now. Please try again, or use the [contact page](/contact)." }]);
    } finally {
      setBusy(false);
    }
  }

  return (
    <>
      <button
        type="button"
        aria-label={open ? "Close help assistant" : "Open help assistant"}
        onClick={() => setOpen((v) => !v)}
        className="assistant-fab fixed bottom-5 right-5 z-50 flex h-14 w-14 items-center justify-center rounded-full border border-violet-400/40 bg-gradient-to-br from-violet-600 to-fuchsia-600 text-white shadow-lg shadow-violet-900/50 transition-transform hover:scale-105 focus:outline-none focus-visible:ring-2 focus-visible:ring-violet-300"
      >
        {open ? (
          <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.4" strokeLinecap="round"><path d="M6 6l12 12M18 6L6 18" /></svg>
        ) : (
          <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round">
            <path d="M21 11.5a8.38 8.38 0 0 1-8.5 8.5 8.5 8.5 0 0 1-3.8-.9L3 21l1.9-5.7a8.5 8.5 0 1 1 16.1-3.8z" />
            <circle cx="8.5" cy="11.5" r="1" fill="currentColor" /><circle cx="12" cy="11.5" r="1" fill="currentColor" /><circle cx="15.5" cy="11.5" r="1" fill="currentColor" />
          </svg>
        )}
      </button>

      {open && (
        <div
          role="dialog"
          aria-label="Threadly help assistant"
          className="assistant-panel fixed bottom-[5.5rem] right-5 z-50 flex w-[min(360px,calc(100vw-2.5rem))] flex-col overflow-hidden rounded-2xl border border-white/10 bg-[#12121a]/95 shadow-2xl shadow-black/60 backdrop-blur"
          style={{ height: "min(480px, 62vh)" }}
        >
          <div className="flex items-center gap-2.5 border-b border-white/10 bg-gradient-to-r from-violet-600/20 to-fuchsia-600/20 px-4 py-3">
            <span className="assistant-pulse relative flex h-2.5 w-2.5 rounded-full bg-emerald-400" />
            <div>
              <p className="text-sm font-semibold text-white">Threadly Assistant</p>
              <p className="text-[11px] text-zinc-400">24/7 automated help</p>
            </div>
          </div>

          <div ref={listRef} className="flex-1 space-y-3 overflow-y-auto px-4 py-3">
            {messages.map((m, i) => (
              <div key={i} className={`assistant-msg flex ${m.role === "user" ? "justify-end" : "justify-start"}`}>
                <div
                  className={`max-w-[85%] rounded-2xl px-3.5 py-2.5 text-[13px] leading-relaxed ${
                    m.role === "user"
                      ? "rounded-br-sm bg-violet-600 text-white"
                      : "rounded-bl-sm border border-white/10 bg-white/5 text-zinc-200"
                  }`}
                >
                  {renderWithLinks(m.text)}
                </div>
              </div>
            ))}
            {busy && (
              <div className="flex justify-start">
                <div className="assistant-typing flex gap-1 rounded-2xl rounded-bl-sm border border-white/10 bg-white/5 px-3.5 py-3">
                  <span /><span /><span />
                </div>
              </div>
            )}
          </div>

          {messages.length <= 1 && (
            <div className="flex flex-wrap gap-1.5 px-4 pb-2">
              {QUICK.map((q) => (
                <button
                  key={q}
                  type="button"
                  onClick={() => void send(q)}
                  className="rounded-full border border-violet-400/30 bg-violet-500/10 px-2.5 py-1 text-[11px] text-violet-200 transition-colors hover:bg-violet-500/25"
                >
                  {q}
                </button>
              ))}
            </div>
          )}

          <form
            className="flex items-center gap-2 border-t border-white/10 p-3"
            onSubmit={(e) => {
              e.preventDefault();
              void send(input);
            }}
          >
            <input
              value={input}
              onChange={(e) => setInput(e.target.value)}
              placeholder="Ask about Threadly..."
              maxLength={800}
              aria-label="Message the Threadly assistant"
              className="flex-1 rounded-xl border border-white/10 bg-white/5 px-3 py-2 text-[13px] text-white placeholder:text-zinc-500 focus:border-violet-400/60 focus:outline-none"
            />
            <button
              type="submit"
              disabled={busy || !input.trim()}
              aria-label="Send message"
              className="flex h-9 w-9 items-center justify-center rounded-xl bg-violet-600 text-white transition-colors hover:bg-violet-500 disabled:opacity-40"
            >
              <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round"><path d="M22 2L11 13" /><path d="M22 2l-7 20-4-9-9-4z" /></svg>
            </button>
          </form>
        </div>
      )}
    </>
  );
}
