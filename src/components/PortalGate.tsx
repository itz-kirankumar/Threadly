"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { onAuthStateChanged, type User } from "firebase/auth";
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

  return <GeoDashboard user={user} />;
}
