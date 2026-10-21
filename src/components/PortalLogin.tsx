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
      unsubscribe = onAuthStateChanged(auth, user => {
        if (user) {
          const params = typeof window !== "undefined" ? new URLSearchParams(window.location.search) : null;
          const invite = params?.get("invite");
          router.replace(invite ? `/portal?invite=${encodeURIComponent(invite)}` : "/portal");
        }
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
      const params = typeof window !== "undefined" ? new URLSearchParams(window.location.search) : null;
      const invite = params?.get("invite");
      router.replace(invite ? `/portal?invite=${encodeURIComponent(invite)}` : "/portal");
    } catch (caught) {
      const code = (caught as { code?: string })?.code;
      if (code === "auth/popup-closed-by-user" || code === "auth/cancelled-popup-request") {
        return;
      }
      if (code === "auth/unauthorized-domain") {
        const currentHost = typeof window !== "undefined" ? window.location.hostname : "this domain";
        setError(`Domain "${currentHost}" is not authorized for Firebase sign-in. Open via http://localhost:3000 (not 127.0.0.1) or add "${currentHost}" in Firebase Console > Authentication > Settings > Authorized domains.`);
        return;
      }
      setError(caught instanceof Error ? caught.message : "Google sign-in failed. Please try again.");
    } finally {
      setBusy(false);
    }
  }

  return <main id="wisentry-portal" className="portal-auth">
    <header className="portal-auth-header">
      <Link href="/" className="portal-auth-logo" aria-label="Threadly home">
        <Image src="/threadly-logo.svg" alt="Threadly" width={184} height={56} priority />
      </Link>
      <span className="portal-auth-label">FOUNDER WORKSPACE</span>
    </header>

    <div className="portal-auth-grid">
      <section className="portal-auth-copy">
        <div className="eyebrow"><span className="pulse-dot"/> YOUR SIGNALS, IN ONE PLACE</div>
        <h1>Turn real conversations into <em>customer growth.</em></h1>
        <p>Find people who need what you build, keep every conversation close, and move good opportunities forward.</p>
        <form onSubmit={login} className="portal-auth-actions">
          <button className="btn btn-dark" type="submit" disabled={busy}>
            <span aria-hidden="true" className="google-g">G</span>{busy ? "Connecting to Google…" : "Continue with Google"}<span aria-hidden="true">↗</span>
          </button>
          <Link href="/" className="btn btn-outline">Back to Threadly</Link>
        </form>
        {error && <div className="portal-auth-notice" role="alert"><span className="portal-auth-icon" aria-hidden="true">!</span><div><strong>Sign-in needs attention</strong><p>{error}</p></div></div>}
        <div className="portal-auth-privacy"><span className="tiny-dot"/> Your workspace is private to your Google account.</div>
      </section>

      <aside className="portal-auth-preview" aria-label="Threadly workspace features">
        <div className="portal-auth-preview-head"><span>WISE GROWTH, IN FOCUS</span><span className="portal-auth-live"><i/> PRIVATE</span></div>
        <div className="portal-auth-preview-title">A clearer path from signal to customer.</div>
        <div className="portal-auth-preview-row"><span className="preview-icon">⌕</span><div><strong>Discover real conversations</strong><small>Listen for the problems you solve</small></div></div>
        <div className="portal-auth-preview-row"><span className="preview-icon">✦</span><div><strong>Write with context</strong><small>Thoughtful replies, in your voice</small></div></div>
        <div className="portal-auth-preview-row"><span className="preview-icon">↗</span><div><strong>Keep momentum</strong><small>Track leads and plan follow-ups</small></div></div>
        <div className="portal-auth-preview-foot"><span>ONE PRIVATE WORKSPACE</span><span>THREADLY<span className="brand-dot">.</span></span></div>
      </aside>
    </div>
    <footer className="portal-auth-footer"><span>THREADLY · FOUNDER GROWTH PORTAL</span><Link href="/privacy">Privacy</Link></footer>
  </main>;
}
