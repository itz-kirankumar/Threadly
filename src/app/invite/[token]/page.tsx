"use client";

import Link from "next/link";
import ThreadlyLogo from "@/components/ThreadlyLogo";
import { useParams, useRouter } from "next/navigation";
import { useEffect, useState } from "react";
import { GoogleAuthProvider, onAuthStateChanged, signInWithPopup, signInWithRedirect, type User } from "firebase/auth";
import { getFirebaseAuth } from "@/lib/firebase-client";

interface Preview {
  workspaceName: string;
  inviterName: string;
  role: string;
  expired: boolean;
}

export default function InvitePage() {
  const params = useParams<{ token: string }>();
  const router = useRouter();
  const token = params.token;
  const [user, setUser] = useState<User | null>(null);
  const [authReady, setAuthReady] = useState(false);
  const [preview, setPreview] = useState<Preview | null>(null);
  const [loadError, setLoadError] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [joined, setJoined] = useState("");

  useEffect(() => {
    let unsubscribe = () => {};
    try {
      unsubscribe = onAuthStateChanged(getFirebaseAuth(), (next) => {
        setUser(next);
        setAuthReady(true);
      });
    } catch {
      setAuthReady(true);
    }
    return () => unsubscribe();
  }, []);

  useEffect(() => {
    fetch(`/api/geo/team/preview?token=${encodeURIComponent(token)}`)
      .then(async (response) => {
        const payload = await response.json().catch(() => ({}));
        if (!response.ok) throw new Error((payload as { error?: string }).error ?? "Invite unavailable.");
        setPreview(payload as Preview);
      })
      .catch((caught) => setLoadError(caught instanceof Error ? caught.message : "Invite unavailable."));
  }, [token]);

  async function signIn() {
    setBusy(true);
    setError("");
    try {
      const provider = new GoogleAuthProvider();
      provider.setCustomParameters({ prompt: "select_account" });
      const auth = getFirebaseAuth();
      try {
        await signInWithPopup(auth, provider);
      } catch (popupError) {
        const code = (popupError as { code?: string })?.code;
        if (code === "auth/popup-blocked") {
          await signInWithRedirect(auth, provider);
          return;
        }
        throw popupError;
      }
    } catch (caught) {
      const code = (caught as { code?: string })?.code;
      if (code !== "auth/popup-closed-by-user" && code !== "auth/cancelled-popup-request") {
        setError(caught instanceof Error ? caught.message : "Sign-in failed.");
      }
    } finally {
      setBusy(false);
    }
  }

  async function accept() {
    if (!user) return;
    setBusy(true);
    setError("");
    try {
      const idToken = await user.getIdToken();
      const response = await fetch("/api/geo/team/accept", {
        method: "POST",
        headers: { "Content-Type": "application/json", Authorization: `Bearer ${idToken}` },
        body: JSON.stringify({ token }),
      });
      const payload = await response.json().catch(() => ({}));
      if (!response.ok) throw new Error((payload as { error?: string }).error ?? "Could not join.");
      setJoined((payload as { workspaceName?: string }).workspaceName ?? "the workspace");
      setTimeout(() => router.replace("/portal"), 1500);
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : "Could not join.");
      setBusy(false);
    }
  }

  return (
    <div className="flex min-h-screen flex-col site bg-zinc-950">
      <header className="border-b border-white/10">
        <div className="mx-auto flex h-16 max-w-6xl items-center px-6">
          <Link href="/" className="flex items-center gap-2.5">
            <ThreadlyLogo size={28} />
            <span className="text-lg font-semibold tracking-tight text-white">Threadly</span>
          </Link>
        </div>
      </header>
      <main className="flex flex-grow items-center justify-center px-6 py-16">
        <div className="w-full max-w-md rounded-2xl border border-white/10 bg-white/[0.02] p-8 text-center">
          {loadError ? (
            <>
              <h1 className="text-xl font-bold text-white">Invite unavailable</h1>
              <p className="mt-3 text-sm leading-relaxed text-zinc-400">{loadError}</p>
              <Link href="/portal" className="mt-6 inline-block rounded-lg bg-white px-5 py-2.5 text-sm font-semibold text-zinc-900 transition hover:bg-zinc-200">
                Go to your workspace
              </Link>
            </>
          ) : !preview ? (
            <p className="text-sm text-zinc-500">Checking invite...</p>
          ) : joined ? (
            <>
              <div className="mx-auto flex h-12 w-12 items-center justify-center rounded-full bg-emerald-500/15 text-emerald-300">
                <svg viewBox="0 0 24 24" className="h-6 w-6" fill="none" stroke="currentColor" strokeWidth="2.5"><path d="m5 13 4 4L19 7" strokeLinecap="round" strokeLinejoin="round"/></svg>
              </div>
              <h1 className="mt-4 text-xl font-bold text-white">You joined {joined}</h1>
              <p className="mt-2 text-sm text-zinc-400">Opening your workspace...</p>
            </>
          ) : (
            <>
              <h1 className="text-xl font-bold text-white">
                {preview.inviterName} invited you to <span className="text-violet-300">{preview.workspaceName}</span>
              </h1>
              <p className="mt-3 text-sm leading-relaxed text-zinc-400">
                You will join as {preview.role === "admin" ? "an admin" : "a member"} of this Threadly GEO workspace.
              </p>
              {preview.expired ? (
                <p className="mt-6 rounded-lg border border-amber-400/30 bg-amber-500/10 px-4 py-3 text-sm text-amber-200">
                  This invite link has expired. Ask {preview.inviterName} for a new one.
                </p>
              ) : error ? (
                <p className="mt-6 rounded-lg border border-rose-400/30 bg-rose-500/10 px-4 py-3 text-sm text-rose-200">{error}</p>
              ) : null}
              {!preview.expired && authReady && (
                <button
                  type="button"
                  disabled={busy}
                  onClick={user ? accept : signIn}
                  className="mt-6 w-full rounded-lg bg-white px-4 py-3 text-sm font-semibold text-zinc-900 transition hover:bg-zinc-200 disabled:opacity-60"
                >
                  {busy ? "One moment..." : user ? `Join as ${user.displayName || user.email}` : "Continue with Google"}
                </button>
              )}
            </>
          )}
        </div>
      </main>
    </div>
  );
}
