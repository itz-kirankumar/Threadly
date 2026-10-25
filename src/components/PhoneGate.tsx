"use client";

import Image from "next/image";
import { useEffect, useRef, useState, type FormEvent } from "react";
import {
  linkWithPhoneNumber,
  RecaptchaVerifier,
  signOut,
  type ConfirmationResult,
  type User,
} from "firebase/auth";
import { getFirebaseAuth } from "@/lib/firebase-client";

export default function PhoneGate({ user }: { user: User }) {
  const [phone, setPhone] = useState("+91");
  const [otp, setOtp] = useState("");
  const [confirmation, setConfirmation] = useState<ConfirmationResult | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const recaptchaContainer = useRef<HTMLDivElement>(null);
  const recaptchaVerifier = useRef<RecaptchaVerifier | null>(null);

  useEffect(() => {
    return () => recaptchaVerifier.current?.clear();
  }, []);

  async function sendCode(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setBusy(true);
    setError("");
    try {
      const auth = getFirebaseAuth();
      if (!recaptchaVerifier.current && recaptchaContainer.current) {
        recaptchaVerifier.current = new RecaptchaVerifier(auth, recaptchaContainer.current, { size: "invisible" });
      }
      const verifier = recaptchaVerifier.current;
      if (!verifier) throw new Error("Verification widget did not load. Refresh and try again.");
      const result = await linkWithPhoneNumber(user, phone.trim(), verifier);
      setConfirmation(result);
    } catch (caught) {
      const code = (caught as { code?: string })?.code;
      if (code === "auth/invalid-phone-number") setError("Enter the full number with country code, like +919876543210.");
      else if (code === "auth/credential-already-in-use" || code === "auth/account-exists-with-different-credential") {
        setError("That number already has a Threadly account. Sign out, sign in with the number instead, then link your other sign-in methods in Settings > Profile - everything lands in one account.");
      } else if (code === "auth/too-many-requests") setError("Too many attempts. Wait a few minutes and try again.");
      else setError(caught instanceof Error ? caught.message : "Could not send the code.");
      recaptchaVerifier.current?.clear();
      recaptchaVerifier.current = null;
    } finally {
      setBusy(false);
    }
  }

  async function verifyCode(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!confirmation) return;
    setBusy(true);
    setError("");
    try {
      await confirmation.confirm(otp.trim());
      // Reload so every surface sees the linked phone on the fresh user object.
      window.location.reload();
    } catch (caught) {
      const code = (caught as { code?: string })?.code;
      if (code === "auth/invalid-verification-code") setError("That code is not right - check the SMS and try again.");
      else setError(caught instanceof Error ? caught.message : "Verification failed.");
      setBusy(false);
    }
  }

  const input =
    "w-full rounded-lg border border-white/10 bg-white/[0.04] px-3.5 py-2.5 text-sm text-zinc-100 placeholder-zinc-500 outline-none focus:border-violet-400/60";

  return (
    <div className="flex min-h-screen flex-col items-center justify-center bg-zinc-950 px-6">
      <div className="w-full max-w-md">
        <Image src="/threadly-mark.svg" alt="Threadly" width={32} height={32} className="mx-auto" />
        <h1 className="mt-6 text-center text-2xl font-bold text-white">Verify your phone</h1>
        <p className="mt-2 text-center text-sm leading-relaxed text-zinc-400">
          Threadly requires a verified phone number for every account. We text a one-time code to{" "}
          <span className="text-zinc-200">{user.email ? `finish securing ${user.email}` : "your number"}</span>.
        </p>

        {!confirmation ? (
          <form onSubmit={sendCode} className="mt-8 space-y-3">
            <input className={input} type="tel" value={phone} onChange={(e) => setPhone(e.target.value)} placeholder="+919876543210" autoComplete="tel" required />
            <button
              type="submit"
              disabled={busy}
              className="w-full rounded-lg bg-violet-500 px-4 py-2.5 text-sm font-semibold text-white transition hover:bg-violet-400 disabled:opacity-60"
            >
              {busy ? "Sending…" : "Send verification code"}
            </button>
          </form>
        ) : (
          <form onSubmit={verifyCode} className="mt-8 space-y-3">
            <input
              className={`${input} text-center text-lg tracking-[0.3em]`}
              inputMode="numeric"
              value={otp}
              onChange={(e) => setOtp(e.target.value.replace(/\D/g, "").slice(0, 6))}
              placeholder="••••••"
              autoComplete="one-time-code"
              required
            />
            <button
              type="submit"
              disabled={busy || otp.length !== 6}
              className="w-full rounded-lg bg-violet-500 px-4 py-2.5 text-sm font-semibold text-white transition hover:bg-violet-400 disabled:opacity-60"
            >
              {busy ? "Verifying…" : "Verify and continue"}
            </button>
            <p className="text-center text-sm text-zinc-500">
              Code sent to {phone.trim()}.{" "}
              <button type="button" onClick={() => { setConfirmation(null); setOtp(""); setError(""); }} className="text-violet-300 hover:text-violet-200">
                Change number
              </button>
            </p>
          </form>
        )}

        <div ref={recaptchaContainer} />

        {error && (
          <div className="mt-4 rounded-lg border border-rose-500/30 bg-rose-500/10 px-3 py-2">
            <p className="text-sm text-rose-200">{error}</p>
          </div>
        )}

        <p className="mt-6 text-center text-sm text-zinc-500">
          <button type="button" onClick={() => void signOut(getFirebaseAuth())} className="text-zinc-500 underline-offset-2 hover:text-zinc-300 hover:underline">
            Sign out
          </button>
        </p>
      </div>
    </div>
  );
}
