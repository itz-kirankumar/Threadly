"use client";

import { useEffect, useState } from "react";
import { useParams } from "next/navigation";
import Link from "next/link";
import { GoogleAuthProvider, onAuthStateChanged, signInWithPopup, type User } from "firebase/auth";
import { getFirebaseAuth } from "@/lib/firebase-client";
import SupportLink from "@/components/SupportLink";

export default function ClaimPage() {
  const params = useParams<{ id: string }>();
  const claimId = params.id;
  const [user, setUser] = useState<User | null | undefined>(undefined);
  const [state, setState] = useState<{ status: "idle" | "working" | "done" | "error"; message?: string; plan?: string; periodEnd?: string }>({ status: "idle" });

  useEffect(() => onAuthStateChanged(getFirebaseAuth(), setUser), []);

  useEffect(() => {
    if (!user || state.status === "working" || state.status === "done") return;
    const stored = sessionStorage.getItem("threadly_claim");
    if (!stored) {
      setState({ status: "error", message: "No purchase is waiting to be linked in this browser. If you paid on another device, open the claim link there." });
      return;
    }
    const { claimId: storedId, claimSecret } = JSON.parse(stored) as { claimId: string; claimSecret: string };
    if (storedId !== claimId) {
      setState({ status: "error", message: "This claim link does not match the purchase waiting in this browser." });
      return;
    }
    (async () => {
      setState({ status: "working" });
      try {
        const token = await user.getIdToken();
        const res = await fetch("/api/billing/guest/claim", {
          method: "POST",
          headers: { "Content-Type": "application/json", Authorization: `Bearer ${token}` },
          body: JSON.stringify({ claimId: storedId, claimSecret }),
        });
        const data = await res.json();
        if (!res.ok) throw new Error(data.error || "Could not link the purchase yet.");
        sessionStorage.removeItem("threadly_claim");
        setState({ status: "done", plan: data.plan, periodEnd: data.periodEnd });
      } catch (err) {
        setState({ status: "error", message: err instanceof Error ? err.message : "Could not link the purchase yet." });
      }
    })();
  }, [user, claimId, state.status]);

  const signIn = async () => {
    try {
      await signInWithPopup(getFirebaseAuth(), new GoogleAuthProvider());
    } catch {
      // user closed the popup
    }
  };

  return (
    <main className="mx-auto flex min-h-screen max-w-md flex-col justify-center px-6 py-16">
      <Link href="/" className="mb-8 text-sm text-zinc-500 hover:text-zinc-300">&larr; Threadly</Link>
      {state.status === "done" ? (
        <>
          <h1 className="text-2xl font-semibold text-white">Your plan is active</h1>
          <p className="mt-2 text-sm text-zinc-400">
            {state.plan === "growth" ? "Growth" : "Pro"} is linked to {user?.email}.
            {state.periodEnd ? ` It runs until ${new Date(state.periodEnd).toLocaleDateString()}.` : ""}
          </p>
          <Link href="/portal" className="mt-6 rounded-lg bg-white px-4 py-3 text-center text-sm font-semibold text-zinc-900 transition hover:bg-zinc-200">
            Open your workspace
          </Link>
        </>
      ) : user ? (
        <>
          <h1 className="text-2xl font-semibold text-white">Linking your purchase…</h1>
          {state.status === "error" && (
            <div className="mt-4 rounded-lg border border-red-400/30 bg-red-500/10 px-3.5 py-2.5 text-xs text-red-200">
              <p>{state.message}</p>
              <SupportLink reference={claimId} />
            </div>
          )}
        </>
      ) : (
        <>
          <h1 className="text-2xl font-semibold text-white">One last step</h1>
          <p className="mt-2 text-sm text-zinc-400">
            Sign in with the same email and mobile number you used at checkout to link this plan to your Threadly account.
            New here? The same button creates your account.
          </p>
          <button
            type="button"
            onClick={signIn}
            className="mt-6 rounded-lg bg-white px-4 py-3 text-sm font-semibold text-zinc-900 transition hover:bg-zinc-200"
          >
            Continue with Google
          </button>
        </>
      )}
    </main>
  );
}
