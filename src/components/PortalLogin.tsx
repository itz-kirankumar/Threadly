"use client";

import Link from "next/link";
import ThreadlyLogo from "@/components/ThreadlyLogo";
import { useRouter } from "next/navigation";
import { useEffect, useRef, useState, type FormEvent } from "react";
import {
  createUserWithEmailAndPassword,
  getRedirectResult,
  GoogleAuthProvider,
  onAuthStateChanged,
  RecaptchaVerifier,
  sendEmailVerification,
  signInWithEmailAndPassword,
  signInWithPhoneNumber,
  signInWithPopup,
  signInWithRedirect,
  updateProfile,
  type ConfirmationResult,
  type User,
} from "firebase/auth";
import { getFirebaseAuth, initializeFirebaseAnalytics } from "@/lib/firebase-client";

type Method = "email" | "phone";

export default function PortalLogin() {
  const router = useRouter();
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [notice, setNotice] = useState("");
  const [method, setMethod] = useState<Method>("email");
  const [mode, setMode] = useState<"signin" | "signup">("signin");

  const [name, setName] = useState("");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [phone, setPhone] = useState("+91");
  const [otp, setOtp] = useState("");
  const [confirmation, setConfirmation] = useState<ConfirmationResult | null>(null);
  const [recaptchaKey, setRecaptchaKey] = useState(0);
  const recaptchaContainer = useRef<HTMLDivElement>(null);
  const recaptchaVerifier = useRef<RecaptchaVerifier | null>(null);
  const [resendCooldown, setResendCooldown] = useState(0);
  const [pendingVerifyUser, setPendingVerifyUser] = useState<User | null>(null);
  const [verifyCooldown, setVerifyCooldown] = useState(0);

  useEffect(() => {
    let unsubscribe = () => {};
    try {
      const auth = getFirebaseAuth();
      unsubscribe = onAuthStateChanged(auth, (user) => {
        if (user) router.replace("/portal");
      });
      getRedirectResult(auth).catch((caught) => {
        setError(caught instanceof Error ? caught.message : "Sign-in failed. Please try again.");
      });
      initializeFirebaseAnalytics().catch(() => undefined);
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : "Firebase is not configured.");
    }
    return () => {
      unsubscribe();
      recaptchaVerifier.current?.clear();
    };
  }, [router]);

  useEffect(() => {
    if (resendCooldown <= 0) return;
    const timer = setTimeout(() => setResendCooldown((c) => c - 1), 1000);
    return () => clearTimeout(timer);
  }, [resendCooldown]);

  useEffect(() => {
    if (verifyCooldown <= 0) return;
    const timer = setTimeout(() => setVerifyCooldown((c) => c - 1), 1000);
    return () => clearTimeout(timer);
  }, [verifyCooldown]);

  async function loginGoogle(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setBusy(true);
    setError("");
    try {
      const provider = new GoogleAuthProvider();
      provider.setCustomParameters({ prompt: "select_account" });
      const auth = getFirebaseAuth();
      try {
        // Popup first: the redirect flow loses the session on return when the
        // browser blocks third-party storage (Chrome + extensions), which
        // dropped users back on the login page with no error.
        await signInWithPopup(auth, provider);
        router.replace("/portal");
      } catch (popupError) {
        const code = (popupError as { code?: string })?.code;
        if (code === "auth/popup-blocked") {
          await signInWithRedirect(auth, provider);
          return;
        }
        if (code === "auth/popup-closed-by-user" || code === "auth/cancelled-popup-request") {
          setBusy(false);
          return;
        }
        throw popupError;
      }
    } catch {
      setError("Sign-in failed. Please try again.");
      setBusy(false);
    }
  }

  async function loginEmail(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setBusy(true);
    setError("");
    setNotice("");
    const auth = getFirebaseAuth();
    try {
      if (mode === "signup") {
        const credential = await createUserWithEmailAndPassword(auth, email.trim(), password);
        if (name.trim()) await updateProfile(credential.user, { displayName: name.trim() });
        await sendEmailVerification(credential.user);
        setPendingVerifyUser(credential.user);
        setVerifyCooldown(30);
        setNotice("Account created. We sent a verification link to your email - open it to confirm your address.");
      } else {
        const credential = await signInWithEmailAndPassword(auth, email.trim(), password);
        if (!credential.user.emailVerified) {
          await sendEmailVerification(credential.user);
          setPendingVerifyUser(credential.user);
          setVerifyCooldown(30);
          setNotice("Your email is not verified yet. We sent a fresh verification link - open it, then sign in again.");
        }
      }
    } catch (caught) {
      const code = (caught as { code?: string })?.code;
      if (code === "auth/email-already-in-use") setError("That email already has an account - sign in (Google works too), then add a password in Settings to tie both to one account.");
      else if (code === "auth/invalid-credential" || code === "auth/wrong-password") setError("Email or password is incorrect.");
      else if (code === "auth/weak-password") setError("Password needs at least 6 characters.");
      else if (code === "auth/user-not-found") setError("No account with that email - create one instead.");
      else setError(caught instanceof Error ? caught.message : "Email sign-in failed.");
    } finally {
      setBusy(false);
    }
  }

  async function resendVerificationEmail() {
    if (!pendingVerifyUser) return;
    setBusy(true);
    setError("");
    try {
      await sendEmailVerification(pendingVerifyUser);
      setVerifyCooldown(30);
      setNotice("Verification link sent again - check your inbox and spam folder.");
    } catch (caught) {
      const code = (caught as { code?: string })?.code;
      if (code === "auth/too-many-requests") setError("Too many attempts. Wait a few minutes and try again.");
      else setError(caught instanceof Error ? caught.message : "Could not resend the link.");
    } finally {
      setBusy(false);
    }
  }

  async function sendOtp(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    await deliverOtp();
  }

  // Resend: a used invisible reCAPTCHA cannot verify twice, so clear it and
  // remount the container node before creating the next verifier.
  async function resendOtp() {
    recaptchaVerifier.current?.clear();
    recaptchaVerifier.current = null;
    setRecaptchaKey((k) => k + 1);
    await new Promise((resolve) => setTimeout(resolve, 50));
    await deliverOtp();
  }

  async function deliverOtp() {
    setBusy(true);
    setError("");
    setNotice("");
    try {
      const auth = getFirebaseAuth();
      if (!recaptchaVerifier.current && recaptchaContainer.current) {
        recaptchaVerifier.current = new RecaptchaVerifier(auth, recaptchaContainer.current, { size: "invisible" });
      }
      const verifier = recaptchaVerifier.current;
      if (!verifier) throw new Error("Verification widget did not load. Refresh and try again.");
      const result = await signInWithPhoneNumber(auth, phone.trim(), verifier);
      setConfirmation(result);
      setResendCooldown(30);
      setNotice(`Code sent to ${phone.trim()}. Enter it below.`);
    } catch (caught) {
      const code = (caught as { code?: string })?.code;
      if (code === "auth/invalid-phone-number") setError("Enter the full number with country code, like +919876543210.");
      else if (code === "auth/too-many-requests") setError("Too many attempts. Wait a few minutes and try again.");
      else setError(caught instanceof Error ? caught.message : "Could not send the code.");
      recaptchaVerifier.current?.clear();
      recaptchaVerifier.current = null;
      // grecaptcha keeps the old widget bound to the container node even after
      // clear(); remount a fresh node so a retry can render again.
      setRecaptchaKey((k) => k + 1);
    } finally {
      setBusy(false);
    }
  }

  async function verifyOtp(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!confirmation) return;
    setBusy(true);
    setError("");
    try {
      await confirmation.confirm(otp.trim());
      router.replace("/portal");
    } catch (caught) {
      const code = (caught as { code?: string })?.code;
      if (code === "auth/invalid-verification-code") setError("That code is not right - check the SMS and try again.");
      else setError(caught instanceof Error ? caught.message : "Verification failed.");
      setBusy(false);
    }
  }

  const input =
    "w-full rounded-lg border border-white/10 bg-white/[0.04] px-3.5 py-2.5 text-sm text-zinc-100 placeholder-zinc-500 outline-none focus:border-violet-400/60";
  const primaryButton =
    "btn-gold w-full rounded-lg px-4 py-2.5 text-sm font-semibold disabled:opacity-60";

  return (
    <div className="premium relative flex min-h-screen flex-col overflow-hidden">
      <div className="premium-aura pointer-events-none absolute inset-x-0 top-0 h-[560px]" aria-hidden />
      <header className="relative">
        <div className="mx-auto flex h-[4.5rem] max-w-6xl items-center px-6">
          <Link href="/" aria-label="Threadly home"><ThreadlyLogo size={32} wordmark /></Link>
        </div>
      </header>
      <main className="relative flex flex-grow items-center justify-center px-6 py-16">
        <div className="premium-card w-full max-w-md rounded-3xl p-8">
          <p className="premium-eyebrow">Members only</p>
          <h1 className="mt-3 font-display text-4xl leading-tight">Welcome back</h1>
          <p className="mt-2 text-sm leading-relaxed text-zinc-400">
            Threadly is open to onboarded teams. Sign in with the email you were approved with. Not a member yet? <Link href="/#early-access" className="font-semibold text-[#D8B982] hover:text-[#f0dca6]">Request an invitation</Link>.
          </p>

          <form onSubmit={loginGoogle} className="mt-8">
            <button
              type="submit"
              disabled={busy}
              className="flex w-full items-center justify-center gap-3 rounded-lg border border-white/15 bg-white/[0.04] px-4 py-3 text-sm font-semibold text-[#F5F0E8] transition hover:border-[#D8B982]/50 disabled:opacity-60"
            >
              <svg width="18" height="18" viewBox="0 0 24 24" aria-hidden="true">
                <path fill="#4285F4" d="M23.5 12.27c0-.85-.08-1.66-.22-2.45H12v4.64h6.45a5.52 5.52 0 0 1-2.39 3.62v3h3.87c2.26-2.09 3.57-5.16 3.57-8.81z"/>
                <path fill="#34A853" d="M12 24c3.24 0 5.96-1.07 7.94-2.92l-3.87-3c-1.07.72-2.45 1.15-4.07 1.15-3.13 0-5.78-2.11-6.73-4.96H1.29v3.1A12 12 0 0 0 12 24z"/>
                <path fill="#FBBC05" d="M5.27 14.27a7.2 7.2 0 0 1 0-4.54v-3.1H1.29a12 12 0 0 0 0 10.74l3.98-3.1z"/>
                <path fill="#EA4335" d="M12 4.77c1.76 0 3.35.61 4.6 1.8l3.42-3.42A11.97 11.97 0 0 0 12 0 12 12 0 0 0 1.29 6.63l3.98 3.1C6.22 6.88 8.87 4.77 12 4.77z"/>
              </svg>
              {busy ? "Working…" : "Continue with Google"}
            </button>
          </form>

          <div className="my-5 flex items-center gap-3">
            <div className="h-px flex-1 bg-white/[0.08]" />
            <span className="text-xs text-zinc-600">or</span>
            <div className="h-px flex-1 bg-white/[0.08]" />
          </div>

          <div className="grid grid-cols-2 gap-1 rounded-lg border border-white/10 bg-white/[0.03] p-1">
            {(["email", "phone"] as Method[]).map((m) => (
              <button
                key={m}
                type="button"
                onClick={() => { setMethod(m); setError(""); setNotice(""); }}
                className={`rounded-md py-1.5 text-sm font-medium transition ${method === m ? "bg-violet-500/20 text-white" : "text-zinc-500 hover:text-zinc-300"}`}
              >
                {m === "email" ? "Email" : "Phone"}
              </button>
            ))}
          </div>

          {method === "email" && (
            <form onSubmit={loginEmail} className="mt-4 space-y-3">
              {mode === "signup" && (
                <input className={input} value={name} onChange={(e) => setName(e.target.value)} placeholder="Your name" autoComplete="name" required />
              )}
              <input className={input} type="email" value={email} onChange={(e) => setEmail(e.target.value)} placeholder="you@company.com" autoComplete="email" required />
              <input className={input} type="password" value={password} onChange={(e) => setPassword(e.target.value)} placeholder={mode === "signup" ? "Choose a password (6+ characters)" : "Password"} autoComplete={mode === "signup" ? "new-password" : "current-password"} required minLength={6} />
              <button type="submit" disabled={busy} className={primaryButton}>
                {busy ? "Working…" : mode === "signup" ? "Activate account" : "Sign in with email"}
              </button>
              <p className="text-center text-sm text-zinc-500">
                {mode === "signup" ? "Already a member?" : "Been approved?"}{" "}
                <button
                  type="button"
                  onClick={() => { setMode(mode === "signup" ? "signin" : "signup"); setError(""); setNotice(""); }}
                  className="text-[#D8B982] hover:text-[#f0dca6]"
                >
                  {mode === "signup" ? "Sign in" : "Activate your account"}
                </button>
              </p>
            </form>
          )}

          {method === "phone" && !confirmation && (
            <form onSubmit={sendOtp} className="mt-4 space-y-3">
              <input className={input} type="tel" value={phone} onChange={(e) => setPhone(e.target.value)} placeholder="+919876543210" autoComplete="tel" required />
              <button type="submit" disabled={busy} className={primaryButton}>
                {busy ? "Sending…" : "Send verification code"}
              </button>
              <p className="text-center text-xs text-zinc-600">We text you a one-time code. Standard SMS rates apply.</p>
            </form>
          )}

          {method === "phone" && confirmation && (
            <form onSubmit={verifyOtp} className="mt-4 space-y-3">
              <input
                className={`${input} text-center text-lg tracking-[0.3em]`}
                inputMode="numeric"
                value={otp}
                onChange={(e) => setOtp(e.target.value.replace(/\D/g, "").slice(0, 6))}
                placeholder="••••••"
                autoComplete="one-time-code"
                required
              />
              <button type="submit" disabled={busy || otp.length !== 6} className={primaryButton}>
                {busy ? "Verifying…" : "Verify and sign in"}
              </button>
              <p className="text-center text-sm text-zinc-500">
                <button
                  type="button"
                  onClick={() => void resendOtp()}
                  disabled={busy || resendCooldown > 0}
                  className="text-[#D8B982] hover:text-[#f0dca6] disabled:text-zinc-600 disabled:hover:text-zinc-600"
                >
                  {resendCooldown > 0 ? `Resend code in ${resendCooldown}s` : "Resend code"}
                </button>
                {" · Wrong number? "}
                <button type="button" onClick={() => { setConfirmation(null); setOtp(""); setNotice(""); }} className="text-[#D8B982] hover:text-[#f0dca6]">
                  Go back
                </button>
              </p>
            </form>
          )}

          <div key={recaptchaKey} ref={recaptchaContainer} />

          {notice && (
            <div className="mt-4 rounded-lg border border-emerald-500/30 bg-emerald-500/10 px-3 py-2">
              <p className="text-sm text-emerald-200">{notice}</p>
              {pendingVerifyUser && (
                <button
                  type="button"
                  onClick={() => void resendVerificationEmail()}
                  disabled={busy || verifyCooldown > 0}
                  className="mt-1.5 text-sm font-medium text-emerald-100 underline underline-offset-2 hover:text-white disabled:text-emerald-500 disabled:no-underline"
                >
                  {verifyCooldown > 0 ? `Resend verification email in ${verifyCooldown}s` : "Resend verification email"}
                </button>
              )}
            </div>
          )}
          {error && (
            <div className="mt-4 rounded-lg border border-rose-500/30 bg-rose-500/10 px-3 py-2">
              <p className="text-xs font-semibold uppercase tracking-wide text-rose-300">Sign-in needs attention</p>
              <p className="mt-1 text-sm text-rose-200">{error}</p>
            </div>
          )}
          <p className="mt-6 text-center text-sm text-zinc-500">
            Just looking?{" "}
            <Link href="/#live-demo" className="text-[#D8B982] hover:text-[#f0dca6]">
              Open the live demo
            </Link>
          </p>
        </div>
      </main>
    </div>
  );
}
