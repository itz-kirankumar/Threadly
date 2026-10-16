"use client";

import { useEffect, useState, useCallback } from "react";
import { onAuthStateChanged, signOut, type User } from "firebase/auth";
import { useRouter } from "next/navigation";
import PortalWorkspace from "@/components/PortalWorkspace";
import PortalPreloader from "@/components/PortalPreloader";
import { getFirebaseAuth, initializeFirebaseAnalytics } from "@/lib/firebase-client";

export default function PortalGate() {
  const router = useRouter();
  const [user, setUser] = useState<User | null>(null);
  const [ready, setReady] = useState(false);
  const [authError, setAuthError] = useState("");
  const [demoMode, setDemoMode] = useState(false);

  const initAuth = useCallback(() => {
    setAuthError("");
    try {
      initializeFirebaseAnalytics().catch(() => undefined);
      const auth = getFirebaseAuth();
      const unsubscribe = onAuthStateChanged(
        auth,
        currentUser => {
          setUser(currentUser);
          setReady(true);
          if (!currentUser) {
            // Check if demo query param is set
            if (typeof window !== "undefined" && new URLSearchParams(window.location.search).get("demo") === "true") {
              setDemoMode(true);
            } else {
              router.replace("/portal/login");
            }
          }
        },
        error => {
          setAuthError(error.message);
          setReady(true);
        }
      );
      return unsubscribe;
    } catch (error) {
      setAuthError(error instanceof Error ? error.message : "Firebase is not configured.");
      setReady(true);
      return () => {};
    }
  }, [router]);

  useEffect(() => {
    const unsubscribe = initAuth();
    return () => {
      if (unsubscribe) unsubscribe();
    };
  }, [initAuth]);

  if (demoMode) {
    return (
      <PortalWorkspace
        email="founder@demo.wisentry.io"
        name="Demo Founder"
        getIdToken={async () => "demo-token"}
        signOutAction={async () => {
          setDemoMode(false);
          router.replace("/portal/login");
        }}
      />
    );
  }

  if (authError) {
    return (
      <PortalPreloader
        error={authError}
        onRetry={() => {
          setReady(false);
          initAuth();
        }}
        onContinueDemo={() => setDemoMode(true)}
      />
    );
  }

  if (!ready || !user) {
    return (
      <PortalPreloader
        message="Opening your private workspace…"
        onContinueDemo={() => setDemoMode(true)}
      />
    );
  }

  return (
    <PortalWorkspace
      email={user.email || ""}
      name={user.displayName || "Founder"}
      getIdToken={() => user.getIdToken()}
      signOutAction={() => signOut(getFirebaseAuth())}
    />
  );
}
