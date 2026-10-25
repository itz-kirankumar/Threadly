"use client";

import Link from "next/link";
import Image from "next/image";
import { useEffect, useState } from "react";
import { onAuthStateChanged, signOut, type User } from "firebase/auth";
import { getFirebaseAuth } from "@/lib/firebase-client";

export default function PortalNav() {
  const [user, setUser] = useState<User | null>(null);

  useEffect(() => {
    let unsubscribe = () => {};
    try {
      unsubscribe = onAuthStateChanged(getFirebaseAuth(), (current) => setUser(current));
    } catch {
      // Firebase not configured; header still renders signed-out state.
    }
    return () => unsubscribe();
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
            <div className="flex items-center gap-3">
              <span className="hidden max-w-[200px] truncate text-xs text-zinc-500 md:inline">{user.email}</span>
              <button
                type="button"
                onClick={() => void signOut(getFirebaseAuth())}
                className="rounded-full border border-white/15 px-3.5 py-1.5 text-[13px] font-medium text-zinc-300 transition hover:bg-white/5"
              >
                Sign out
              </button>
            </div>
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
