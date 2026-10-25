"use client";

import Link from "next/link";
import Image from "next/image";
import { useRouter } from "next/navigation";
import { useEffect, useState, type FormEvent } from "react";
import { GoogleAuthProvider, onAuthStateChanged, signInWithPopup } from "firebase/auth";
import { getFirebaseAuth, initializeFirebaseAnalytics } from "@/lib/firebase-client";

export default function PortalLogin() {
  const router = useRouter();
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");

  useEffect(() => {
    let unsubscribe = () => {};
    try {
      const auth = getFirebaseAuth();
      unsubscribe = onAuthStateChanged(auth, (user) => {
        if (user) router.replace("/portal");
      });
      initializeFirebaseAnalytics().catch(() => undefined);
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : "Firebase is not configured.");
    }
    return () => unsubscribe();
  }, [router]);

  async function login(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setBusy(true);
    setError("");
    try {
      const provider = new GoogleAuthProvider();
      provider.setCustomParameters({ prompt: "select_account" });
      await signInWithPopup(getFirebaseAuth(), provider);
      router.replace("/portal");
    } catch (caught) {
      const code = (caught as { code?: string })?.code;
      if (code === "auth/popup-closed-by-user" || code === "auth/cancelled-popup-request") {
        setBusy(false);
        return;
      }
      if (code === "auth/unauthorized-domain") {
        const host = typeof window !== "undefined" ? window.location.hostname : "this domain";
        setError(`Add ${host} to the Firebase project's authorized domains, then try again.`);
      } else {
        setError(caught instanceof Error ? caught.message : "Sign-in failed. Please try again.");
      }
      setBusy(false);
    }
  }

  return (
    <div className="flex min-h-screen flex-col bg-zinc-950">
      <header className="border-b border-white/10">
        <div className="mx-auto flex h-16 max-w-6xl items-center px-6">
          <Link href="/" className="flex items-center gap-2.5">
            <Image src="/threadly-mark.svg" alt="Threadly" width={28} height={28} />
            <span className="text-lg font-semibold tracking-tight text-white">Threadly</span>
          </Link>
        </div>
      </header>
      <main className="flex flex-grow items-center justify-center px-6 py-16">
        <div className="w-full max-w-md">
          <h1 className="text-2xl font-bold text-white">Sign in to your workspace</h1>
          <p className="mt-2 text-sm leading-relaxed text-zinc-400">
            Your GEO workspace — brand profile, tracked questions and scan history — is private to your Google
            account.
          </p>
          <form onSubmit={login} className="mt-8">
            <button
              type="submit"
              disabled={busy}
              className="flex w-full items-center justify-center gap-3 rounded-lg bg-white px-4 py-3 text-sm font-semibold text-zinc-900 transition hover:bg-zinc-200 disabled:opacity-60"
            >
              <svg width="18" height="18" viewBox="0 0 24 24" aria-hidden="true">
                <path fill="#4285F4" d="M23.5 12.27c0-.85-.08-1.66-.22-2.45H12v4.64h6.45a5.52 5.52 0 0 1-2.39 3.62v3h3.87c2.26-2.09 3.57-5.16 3.57-8.81z"/>
                <path fill="#34A853" d="M12 24c3.24 0 5.96-1.07 7.94-2.92l-3.87-3c-1.07.72-2.45 1.15-4.07 1.15-3.13 0-5.78-2.11-6.73-4.96H1.29v3.1A12 12 0 0 0 12 24z"/>
                <path fill="#FBBC05" d="M5.27 14.27a7.2 7.2 0 0 1 0-4.54v-3.1H1.29a12 12 0 0 0 0 10.74l3.98-3.1z"/>
                <path fill="#EA4335" d="M12 4.77c1.76 0 3.35.61 4.6 1.8l3.42-3.42A11.97 11.97 0 0 0 12 0 12 12 0 0 0 1.29 6.63l3.98 3.1C6.22 6.88 8.87 4.77 12 4.77z"/>
              </svg>
              {busy ? "Opening Google…" : "Continue with Google"}
            </button>
          </form>
          {error && (
            <div className="mt-4 rounded-lg border border-rose-500/30 bg-rose-500/10 px-3 py-2">
              <p className="text-xs font-semibold uppercase tracking-wide text-rose-300">Sign-in needs attention</p>
              <p className="mt-1 text-sm text-rose-200">{error}</p>
            </div>
          )}
          <p className="mt-6 text-center text-sm text-zinc-500">
            Just looking?{" "}
            <Link href="/demo" className="text-violet-300 hover:text-violet-200">
              Open the live demo
            </Link>
          </p>
        </div>
      </main>
    </div>
  );
}
