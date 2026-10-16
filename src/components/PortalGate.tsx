"use client";

import { useEffect, useState, useCallback } from "react";
import { GoogleAuthProvider, onAuthStateChanged, signInWithPopup, signOut, type User } from "firebase/auth";
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
  const [signingIn, setSigningIn] = useState(false);

  const handleGoogleSignIn = async () => {
    setSigningIn(true);
    setAuthError("");
    try {
      const provider = new GoogleAuthProvider();
      provider.setCustomParameters({ prompt: "select_account" });
      const cred = await signInWithPopup(getFirebaseAuth(), provider);
      setUser(cred.user);
      setReady(true);
    } catch (err: unknown) {
      const code = (err as { code?: string })?.code;
      if (code === "auth/popup-closed-by-user" || code === "auth/cancelled-popup-request") {
        return;
      }
      if (code === "auth/unauthorized-domain") {
        const currentHost = typeof window !== "undefined" ? window.location.hostname : "this domain";
        setAuthError(`Domain "${currentHost}" is not authorized for Firebase sign-in. Open via http://localhost:3000 (not 127.0.0.1) or add "${currentHost}" in Firebase Console > Authentication > Settings > Authorized domains.`);
        return;
      }
      setAuthError(err instanceof Error ? err.message : "Google sign-in failed. Please try again.");
    } finally {
      setSigningIn(false);
    }
  };

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
  }, []);

  useEffect(() => {
    const unsubscribe = initAuth();
    return () => {
      if (unsubscribe) unsubscribe();
    };
  }, [initAuth]);

  // Keep these identities stable across renders. PortalWorkspace derives
  // `refresh` from getIdToken, and an inline function here would re-create
  // it every render, re-firing the auto-refresh effect forever.
  const demoGetIdToken = useCallback(async () => "demo-token", []);
  const demoSignOut = useCallback(async () => {
    setDemoMode(false);
    router.replace("/portal/login");
  }, [router]);
  const userGetIdToken = useCallback(() => user?.getIdToken() ?? Promise.reject(new Error("Sign in required.")), [user]);
  const userSignOut = useCallback(() => signOut(getFirebaseAuth()), []);

  if (demoMode) {
    return (
      <PortalWorkspace
        email="founder@demo.threadly.io"
        name="Demo Founder"
        getIdToken={demoGetIdToken}
        signOutAction={demoSignOut}
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
        onGoogleSignIn={handleGoogleSignIn}
        signingIn={signingIn}
      />
    );
  }

  if (!ready || !user) {
    return (
      <PortalPreloader
        message="Sign in to open your private founder workspace…"
        onContinueDemo={() => setDemoMode(true)}
        onGoogleSignIn={handleGoogleSignIn}
        signingIn={signingIn}
      />
    );
  }

  return (
    <PortalWorkspace
      email={user.email || ""}
      name={user.displayName || "Founder"}
      getIdToken={userGetIdToken}
      signOutAction={userSignOut}
    />
  );
}
