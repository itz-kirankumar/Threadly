"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { onAuthStateChanged, signOut, type User } from "firebase/auth";
import GeoDashboard from "@/components/geo/GeoDashboard";
import { getFirebaseAuth, initializeFirebaseAnalytics } from "@/lib/firebase-client";

export default function PortalGate() {
  const router = useRouter();
  const [user, setUser] = useState<User | null>(null);
  const [ready, setReady] = useState(false);
  const [authError, setAuthError] = useState("");

  useEffect(() => {
    let unsubscribe = () => {};
    try {
      initializeFirebaseAnalytics().catch(() => undefined);
      const auth = getFirebaseAuth();
      unsubscribe = onAuthStateChanged(auth, (currentUser) => {
        setUser(currentUser);
        setReady(true);
        if (!currentUser) router.replace("/portal/login");
      });
    } catch (caught) {
      setAuthError(caught instanceof Error ? caught.message : "Firebase is not configured.");
      setReady(true);
    }
    return () => unsubscribe();
  }, [router]);

  if (authError) {
    return (
      <div className="mx-auto max-w-md px-6 py-24 text-center">
        <p className="text-sm text-rose-300">{authError}</p>
      </div>
    );
  }

  if (!ready || !user) {
    return <div className="py-24 text-center text-sm text-zinc-500">Loading…</div>;
  }

  return (
    <div>
      <div className="mb-6 flex items-center justify-between border-b border-white/10 pb-4">
        <p className="text-sm text-zinc-400">{user.email}</p>
        <button
          type="button"
          onClick={() => void signOut(getFirebaseAuth())}
          className="text-sm text-zinc-500 hover:text-zinc-300"
        >
          Sign out
        </button>
      </div>
      <GeoDashboard user={user} />
    </div>
  );
}
