"use client";

import { useEffect, useState } from "react";
import { EmailAuthProvider, GoogleAuthProvider, getRedirectResult, linkWithCredential, linkWithPopup, linkWithRedirect, type User } from "firebase/auth";
import { getFirebaseAuth } from "@/lib/firebase-client";

export function ProfileSettings({ user, busy, onSave }: { user: User; busy: boolean; onSave: (name: string) => Promise<void> }) {
  const [name, setName] = useState(user.displayName ?? "");
  const [saved, setSaved] = useState(false);
  const input =
    "w-full rounded-lg border border-white/10 bg-white/[0.04] px-3 py-2 text-sm text-zinc-100 placeholder-zinc-500 outline-none focus:border-violet-400/60";
  const label = "mb-1 block text-xs font-medium uppercase tracking-wide text-zinc-400";
  return (
    <form
      className="max-w-xl space-y-5"
      onSubmit={async (event) => {
        event.preventDefault();
        setSaved(false);
        await onSave(name);
        setSaved(true);
      }}
    >
      <div>
        <h2 className="text-xl font-semibold text-white">Profile</h2>
        <p className="mt-1 text-sm text-zinc-400">How you appear inside your workspace.</p>
      </div>
      <div>
        <label className={label} htmlFor="profile-name">Your name</label>
        <input id="profile-name" className={input} value={name} onChange={(e) => setName(e.target.value)} placeholder="Ada Lovelace" required />
      </div>
      <div>
        <label className={label}>Email</label>
        <p className="rounded-lg border border-white/[0.06] bg-white/[0.02] px-3 py-2 text-sm text-zinc-500">{user.email}</p>
        <p className="mt-1 text-xs text-zinc-600">Managed by your Google sign-in.</p>
      </div>
      <div className="flex items-center gap-3">
        <button
          type="submit"
          disabled={busy || !name.trim()}
          className="rounded-lg bg-violet-500 px-4 py-2 text-sm font-semibold text-white transition hover:bg-violet-400 disabled:opacity-50"
        >
          Save profile
        </button>
        {saved && <span className="text-xs text-emerald-400">Saved.</span>}
      </div>
      <SignInMethods user={user} />
    </form>
  );
}

const PROVIDER_LABELS: Record<string, string> = {
  "google.com": "Google",
  password: "Email and password",
  phone: "Phone",
};

function SignInMethods({ user }: { user: User }) {
  const [linkPassword, setLinkPassword] = useState("");
  const [message, setMessage] = useState("");
  const [linkError, setLinkError] = useState("");
  const [linkBusy, setLinkBusy] = useState(false);
  const linked = new Set(user.providerData.map((entry) => entry?.providerId).filter(Boolean) as string[]);

  useEffect(() => {
    getRedirectResult(getFirebaseAuth()).catch((caught) => {
      const code = (caught as { code?: string })?.code;
      if (code === "auth/credential-already-in-use") {
        setLinkError("That Google account is already linked to a different Threadly account.");
      }
    });
  }, []);

  async function linkGoogle() {
    setLinkError("");
    setMessage("");
    const provider = new GoogleAuthProvider();
    provider.setCustomParameters({ prompt: "select_account" });
    const target = getFirebaseAuth().currentUser ?? user;
    try {
      await linkWithPopup(target, provider);
      window.location.reload();
    } catch (popupError) {
      const code = (popupError as { code?: string })?.code;
      if (code === "auth/popup-blocked") await linkWithRedirect(target, provider);
      else if (code !== "auth/popup-closed-by-user" && code !== "auth/cancelled-popup-request") throw popupError;
    }
  }

  async function linkPasswordAccount(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!user.email) return;
    setLinkBusy(true);
    setLinkError("");
    setMessage("");
    try {
      await linkWithCredential(user, EmailAuthProvider.credential(user.email, linkPassword));
      setMessage("Password sign-in added to your account.");
      setLinkPassword("");
    } catch (caught) {
      const code = (caught as { code?: string })?.code;
      if (code === "auth/email-already-in-use" || code === "auth/credential-already-in-use") {
        setLinkError("That email is already tied to a different account.");
      } else if (code === "auth/weak-password") {
        setLinkError("Password needs at least 6 characters.");
      } else {
        setLinkError(caught instanceof Error ? caught.message : "Could not add password sign-in.");
      }
    } finally {
      setLinkBusy(false);
    }
  }

  const input =
    "w-full rounded-lg border border-white/10 bg-white/[0.04] px-3 py-2 text-sm text-zinc-100 placeholder-zinc-500 outline-none focus:border-violet-400/60";

  return (
    <div className="border-t border-white/[0.06] pt-5">
      <h3 className="text-sm font-semibold text-white">Sign-in methods</h3>
      <p className="mt-1 text-sm text-zinc-500">
        One account, every way in: your Google, email and verified phone all open this same workspace.
      </p>
      <div className="mt-3 space-y-2">
        {(["google.com", "password", "phone"] as const).map((id) => (
          <div key={id} className="flex items-center justify-between rounded-lg border border-white/[0.08] bg-white/[0.02] px-3 py-2.5">
            <span className="text-sm text-zinc-300">{PROVIDER_LABELS[id]}</span>
            {linked.has(id) ? (
              <span className="text-xs font-medium text-emerald-400">Linked</span>
            ) : id === "google.com" ? (
              <button type="button" onClick={linkGoogle} className="text-xs font-medium text-violet-300 hover:text-violet-200">
                Link Google
              </button>
            ) : id === "phone" ? (
              <span className="text-xs text-zinc-600">Sign out and sign in with your number to link</span>
            ) : null}
          </div>
        ))}
      </div>
      {!linked.has("password") && user.email && (
        <form onSubmit={linkPasswordAccount} className="mt-3 flex gap-2">
          <input
            className={input}
            type="password"
            value={linkPassword}
            onChange={(e) => setLinkPassword(e.target.value)}
            placeholder="Choose a password (6+ characters)"
            minLength={6}
            required
          />
          <button
            type="submit"
            disabled={linkBusy}
            className="shrink-0 rounded-lg bg-violet-500 px-4 py-2 text-sm font-semibold text-white transition hover:bg-violet-400 disabled:opacity-50"
          >
            {linkBusy ? "Adding…" : "Add password"}
          </button>
        </form>
      )}
      {message && <p className="mt-2 text-xs text-emerald-400">{message}</p>}
      {linkError && <p className="mt-2 text-xs text-rose-300">{linkError}</p>}
    </div>
  );
}
