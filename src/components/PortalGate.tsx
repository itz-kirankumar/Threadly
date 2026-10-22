"use client";

import { useEffect, useState, useCallback } from "react";
import { useRouter } from "next/navigation";
import { onAuthStateChanged, signOut, type User } from "firebase/auth";
import PortalWorkspace from "@/components/PortalWorkspace";
import PortalPreloader from "@/components/PortalPreloader";
import { getFirebaseAuth, initializeFirebaseAnalytics } from "@/lib/firebase-client";

const ADMIN_EMAILS = [
  "kiran160703kumar@gmail.com",
  "founder@demo.threadly.io"
];

function checkIsAdmin(email?: string | null): boolean {
  if (!email) return false;
  return ADMIN_EMAILS.includes(email.trim().toLowerCase());
}

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
          const userIsAdmin = checkIsAdmin(currentUser?.email);
          setUser(currentUser);
          setIsAdmin(userIsAdmin);
          setReady(true);
          if (!currentUser) {
            setAccessStatus(null);
            setIsAdmin(false);
            setAccessChecked(true);
            return;
          }

          if (userIsAdmin) {
            setIsAdmin(true);
            setAccessStatus("approved");
            setAccessChecked(true);
          } else {
            setAccessChecked(false);
          }

          void (async () => {
            try {
              const response = await fetch("/api/waitlist", {
                headers: { Authorization: `Bearer ${await currentUser.getIdToken()}` },
                cache: "no-store",
              });
              const data = await response.json().catch(() => ({}));
              if (!response.ok) throw new Error(data.error || "Could not check your beta access.");
              const verifiedAdmin = data.role === "admin" || userIsAdmin;
              const hasAccess = Boolean(data.accessGranted || verifiedAdmin || data.application?.status === "approved");
              setIsAdmin(verifiedAdmin);
              setAccessStatus(hasAccess ? "approved" : (data.application?.status || null));
            } catch (error) {
              if (!userIsAdmin) {
                setAuthError(error instanceof Error ? error.message : "Could not verify your beta access.");
              }
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

  // Admin bypass: if user is admin, never block with beta access request screen
  if (accessStatus !== "approved" && !isAdmin && !checkIsAdmin(user.email)) {
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
      isAdmin={isAdmin || checkIsAdmin(user.email)}
      getIdToken={userGetIdToken}
      signOutAction={userSignOut}
    />
  );
}
