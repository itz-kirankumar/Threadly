"use client";

import { useEffect, useState } from "react";
import { useParams } from "next/navigation";
import { GoogleAuthProvider, onAuthStateChanged, signInWithPopup, type User } from "firebase/auth";
import { getFirebaseAuth } from "@/lib/firebase-client";
import ClaimView from "@/components/ClaimView";

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

  if (state.status === "done") {
    return <ClaimView status="done" plan={state.plan} periodEnd={state.periodEnd} email={user?.email} />;
  }
  if (user) {
    return <ClaimView status={state.status === "error" ? "error" : "working"} message={state.message} claimRef={claimId} />;
  }
  return <ClaimView status="signin" onSignIn={signIn} />;
}
