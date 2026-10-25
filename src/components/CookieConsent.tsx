"use client";

import Link from "next/link";
import { useEffect, useState } from "react";

const STORAGE_KEY = "threadly_cookie_consent";

export default function CookieConsent() {
  const [visible, setVisible] = useState(false);

  useEffect(() => {
    try {
      if (!localStorage.getItem(STORAGE_KEY)) setVisible(true);
    } catch {
      setVisible(true);
    }
  }, []);

  const choose = (value: "accepted" | "declined") => {
    try {
      localStorage.setItem(STORAGE_KEY, JSON.stringify({ value, at: new Date().toISOString() }));
    } catch {
      // storage unavailable - just dismiss for this session
    }
    setVisible(false);
  };

  if (!visible) return null;

  return (
    <div className="fixed inset-x-0 bottom-0 z-50 px-4 pb-4">
      <div className="mx-auto flex max-w-3xl flex-col gap-3 rounded-xl border border-white/10 bg-zinc-900/95 p-4 shadow-2xl shadow-black/50 backdrop-blur-md sm:flex-row sm:items-center">
        <p className="text-sm leading-relaxed text-zinc-300">
          Threadly uses essential cookies to keep you signed in and optional analytics to improve the product. See our{" "}
          <Link href="/privacy" className="text-cyan-300 underline decoration-cyan-500/40 hover:decoration-cyan-300">
            privacy policy
          </Link>
          .
        </p>
        <div className="flex shrink-0 gap-2">
          <button
            onClick={() => choose("declined")}
            className="rounded-full border border-white/15 px-4 py-1.5 text-[13px] font-medium text-zinc-300 transition hover:bg-white/5"
          >
            Decline
          </button>
          <button
            onClick={() => choose("accepted")}
            className="rounded-full bg-white px-4 py-1.5 text-[13px] font-semibold text-zinc-950 transition hover:bg-zinc-200"
          >
            Accept
          </button>
        </div>
      </div>
    </div>
  );
}
