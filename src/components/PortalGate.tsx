"use client";

import { useEffect, useState, useCallback } from "react";
import { useRouter } from "next/navigation";
import { onAuthStateChanged, signOut, type User } from "firebase/auth";
import PortalWorkspace from "@/components/PortalWorkspace";
import PortalPreloader from "@/components/PortalPreloader";
import { getFirebaseAuth, initializeFirebaseAnalytics } from "@/lib/firebase-client";

export default function PortalGate() {
  const router = useRouter();
  const [user, setUser] = useState<User | null>(null);
  const [ready, setReady] = useState(false);
  const [authError, setAuthError] = useState("");
  const [accessChecked, setAccessChecked] = useState(false);
  const [accessStatus, setAccessStatus] = useState<"pending" | "approved" | "rejected" | null>(null);
  const [isAdmin, setIsAdmin] = useState(false);

  const initAuth = useCallback(() => {
    setAuthError("");
    try {
      initializeFirebaseAnalytics().catch(() => undefined);
      const auth = getFirebaseAuth();
      const unsubscribe = onAuthStateChanged(
        auth,
        currentUser => {
          setUser(currentUser);
          setIsAdmin(false);
          setReady(true);
          if (!currentUser) {
            setAccessStatus(null);
            setIsAdmin(false);
            setAccessChecked(true);
            return;
          }
          setAccessChecked(false);
          void (async () => {
            try {
              const response = await fetch("/api/waitlist", {
                headers: { Authorization: `Bearer ${await currentUser.getIdToken()}` },
                cache: "no-store",
              });
              const data = await response.json().catch(() => ({}));
              if (!response.ok) throw new Error(data.error || "Could not check your beta access.");
              setIsAdmin(data.role === "admin");
              setAccessStatus(data.application?.status || null);
            } catch (error) {
              setAuthError(error instanceof Error ? error.message : "Could not verify your beta access.");
            } finally {
              setAccessChecked(true);
            }
          })();
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

  useEffect(() => {
    if (ready && !user && !authError) {
      router.replace("/portal/login");
    }
  }, [ready, user, authError, router]);

  const userGetIdToken = useCallback(() => user?.getIdToken() ?? Promise.reject(new Error("Sign in required.")), [user]);
  const userSignOut = useCallback(() => signOut(getFirebaseAuth()), []);

  if (authError) {
    return (
      <PortalPreloader
        error={authError}
        onRetry={() => {
          setReady(false);
          initAuth();
        }}
      />
    );
  }

  if (!ready || !user) {
    return <PortalPreloader message="Opening your private workspace…" />;
  }

  if (!accessChecked) {
    return <PortalPreloader message="Checking your Threadly 2.0 beta access…" />;
  }

  if (accessStatus !== "approved") {
    return (
      <main id="wisentry-portal" className="portal-auth">
        <header className="portal-auth-header">
          <a href="/" className="portal-login-brand">
            threadly<span className="brand-dot">.</span>
          </a>
          <button className="btn btn-outline" onClick={userSignOut}>
            Sign out
          </button>
        </header>
        <section className="portal-auth-copy" style={{ maxWidth: 700, margin: "14vh auto", padding: 28 }}>
          <div className="eyebrow">
            <span className="pulse-dot" /> THREADLY 2.0 · BETA ACCESS
          </div>
          <h1>
            {accessStatus === "pending"
              ? "Your request is under review."
              : accessStatus === "rejected"
                ? "Your request was not approved."
                : "Request beta access to continue."}
          </h1>
          <p>
            {accessStatus === "pending"
              ? "The team is reviewing your application. Return to the homepage with this Google account to check your access."
              : accessStatus === "rejected"
                ? "You can update and resubmit your beta request from the homepage."
                : "The Threadly workspace is available to approved beta members. Join the waitlist from the homepage to request access."}
          </p>
          <div className="welcome-actions">
            <a className="btn btn-dark" href="/">
              {accessStatus === "pending" ? "Back to homepage" : "Join the beta waitlist"}
            </a>
            <button className="btn btn-outline" onClick={userSignOut}>
              Sign out
            </button>
          </div>
        </section>
      </main>
    );
  }

  return (
    <PortalWorkspace
      email={user.email || ""}
      name={user.displayName || "Founder"}
      isAdmin={isAdmin}
      getIdToken={userGetIdToken}
      signOutAction={userSignOut}
    />
  );
}
