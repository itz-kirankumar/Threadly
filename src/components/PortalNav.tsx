"use client";

import Link from "next/link";
import Image from "next/image";
import { useEffect, useRef, useState } from "react";
import { onAuthStateChanged, signOut, type User } from "firebase/auth";
import { getFirebaseAuth } from "@/lib/firebase-client";

function displayName(user: User): string {
  if (user.displayName?.trim()) return user.displayName.trim();
  return (user.email ?? "Account").split("@")[0];
}

function initials(user: User): string {
  const name = displayName(user);
  const parts = name.split(/\s+/).filter(Boolean);
  return (parts.length > 1 ? parts[0][0] + parts[parts.length - 1][0] : name.slice(0, 2)).toUpperCase();
}

function ProfileMenu({ user }: { user: User }) {
  const [open, setOpen] = useState(false);
  const ref = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!open) return;
    const onDown = (event: MouseEvent) => {
      if (ref.current && !ref.current.contains(event.target as Node)) setOpen(false);
    };
    document.addEventListener("mousedown", onDown);
    return () => document.removeEventListener("mousedown", onDown);
  }, [open]);

  function openSettings(section: "profile" | "brand" | "keys") {
    setOpen(false);
    window.dispatchEvent(new CustomEvent("threadly:open-settings", { detail: { section } }));
  }

  const item = "block w-full rounded-md px-3 py-2 text-left text-[13px] text-zinc-300 transition hover:bg-white/[0.06] hover:text-white";

  return (
    <div ref={ref} className="relative">
      <button
        type="button"
        onClick={() => setOpen(!open)}
        className="flex items-center gap-2.5 rounded-full border border-white/10 py-1 pl-1 pr-3 transition hover:border-white/25"
      >
        <span className="flex h-7 w-7 items-center justify-center rounded-full bg-violet-500/20 text-[11px] font-semibold text-violet-300">
          {initials(user)}
        </span>
        <span className="hidden max-w-[140px] truncate text-[13px] font-medium text-zinc-200 sm:inline">{displayName(user)}</span>
        <svg width="10" height="6" viewBox="0 0 10 6" className={`text-zinc-500 transition ${open ? "rotate-180" : ""}`}>
          <path d="M1 1l4 4 4-4" stroke="currentColor" strokeWidth="1.5" fill="none" strokeLinecap="round" />
        </svg>
      </button>
      {open && (
        <div className="absolute right-0 top-full z-50 mt-2 w-60 rounded-xl border border-white/10 bg-zinc-900 p-1.5 shadow-2xl">
          <div className="border-b border-white/[0.06] px-3 py-2.5">
            <p className="truncate text-[13px] font-medium text-white">{displayName(user)}</p>
            <p className="truncate text-xs text-zinc-500">{user.email}</p>
          </div>
          <div className="py-1">
            <button type="button" className={item} onClick={() => openSettings("profile")}>
              Profile settings
            </button>
            <button type="button" className={item} onClick={() => openSettings("brand")}>
              Brand profile
            </button>
            <button type="button" className={item} onClick={() => openSettings("keys")}>
              AI provider keys
            </button>
          </div>
          <div className="border-t border-white/[0.06] py-1">
            <button
              type="button"
              className={`${item} text-zinc-500 hover:text-rose-300`}
              onClick={() => void signOut(getFirebaseAuth())}
            >
              Sign out
            </button>
          </div>
        </div>
      )}
    </div>
  );
}

export default function PortalNav() {
  const [user, setUser] = useState<User | null>(null);

  useEffect(() => {
    let unsubscribe = () => {};
    try {
      unsubscribe = onAuthStateChanged(getFirebaseAuth(), (current) => setUser(current));
    } catch {
      // Firebase not configured; header still renders signed-out state.
    }
    const onUserUpdated = () => {
      const current = getFirebaseAuth().currentUser;
      if (current) setUser({ ...current } as User);
    };
    window.addEventListener("threadly:user-updated", onUserUpdated);
    return () => {
      unsubscribe();
      window.removeEventListener("threadly:user-updated", onUserUpdated);
    };
  }, []);

  return (
    <header className="sticky top-0 z-40 border-b border-white/[0.06] bg-zinc-950/70 backdrop-blur-md">
      <div className="mx-auto flex h-14 max-w-6xl items-center justify-between px-6">
        <Link href="/portal" className="flex items-center gap-2.5">
          <Image src="/threadly-mark.svg" alt="Threadly" width={24} height={24} />
          <span className="text-[15px] font-semibold tracking-tight text-white">Threadly</span>
          <span className="rounded-full border border-violet-400/30 bg-violet-500/10 px-2 py-0.5 font-mono text-[10px] uppercase tracking-[0.14em] text-violet-300">
            Workspace
          </span>
        </Link>
        <nav className="flex items-center gap-5 text-sm">
          <Link href="/demo" className="hidden text-zinc-400 transition hover:text-white sm:inline">
            Live demo
          </Link>
          {user ? (
            <ProfileMenu user={user} />
          ) : (
            <Link
              href="/portal/login"
              className="rounded-full bg-white px-4 py-1.5 text-[13px] font-semibold text-zinc-950 transition hover:bg-zinc-200"
            >
              Sign in
            </Link>
          )}
        </nav>
      </div>
    </header>
  );
}
