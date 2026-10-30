"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { signOut, updateProfile, type User } from "firebase/auth";
import { getFirebaseAuth } from "@/lib/firebase-client";
import { ProfileSettings } from "@/components/geo/ProfileSettings";

function Section({ title, hint, children }: { title: string; hint: string; children: React.ReactNode }) {
  return (
    <section className="rounded-xl border border-white/10 bg-white/[0.02] p-5 md:p-6">
      <h2 className="text-base font-semibold text-white">{title}</h2>
      <p className="mt-1 text-sm text-zinc-500">{hint}</p>
      <div className="mt-5">{children}</div>
    </section>
  );
}

function DeleteAccount({ user }: { user: User }) {
  const router = useRouter();
  const [confirmText, setConfirmText] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");

  async function removeAccount() {
    setBusy(true);
    setError("");
    try {
      const current = getFirebaseAuth().currentUser;
      if (!current) throw new Error("Sign in to continue.");
      const idToken = await current.getIdToken();
      const response = await fetch("/api/account", {
        method: "DELETE",
        headers: { Authorization: `Bearer ${idToken}` },
      });
      if (!response.ok) {
        const payload = (await response.json().catch(() => null)) as { error?: string } | null;
        throw new Error(payload?.error || "Could not delete your account.");
      }
      // The server deleted both the data and the Firebase user; drop the
      // local session and leave.
      await signOut(getFirebaseAuth()).catch(() => undefined);
      router.replace("/");
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : "Could not delete your account.");
    } finally {
      setBusy(false);
    }
  }

  return (
    <Section title="Delete account" hint="Permanently removes your workspace, scan history, tracked questions, team invites and provider keys. This cannot be undone.">
      <p className="text-sm text-zinc-400">
        Type <span className="font-mono text-zinc-200">DELETE</span> to confirm.
      </p>
      <div className="mt-3 flex flex-wrap items-center gap-2">
        <input
          value={confirmText}
          onChange={(event) => setConfirmText(event.target.value)}
          placeholder="DELETE"
          className="w-32 rounded-lg border border-white/10 bg-white/[0.04] px-3 py-2 text-sm text-zinc-100 placeholder-zinc-600 outline-none focus:border-rose-400/60"
        />
        <button
          type="button"
          disabled={busy || confirmText.trim() !== "DELETE"}
          onClick={() => void removeAccount()}
          className="rounded-lg bg-rose-500/90 px-4 py-2 text-sm font-semibold text-white transition hover:bg-rose-400 disabled:cursor-not-allowed disabled:opacity-40"
        >
          {busy ? "Deleting…" : "Delete my account"}
        </button>
      </div>
      {error && <p className="mt-3 text-xs text-rose-300">{error}</p>}
    </Section>
  );
}

export default function AccountSettings({ user }: { user: User }) {
  const router = useRouter();
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");

  // Same theme as the dashboard (saved per user there).
  useEffect(() => {
    let light = false;
    try {
      light = window.localStorage.getItem("threadly-theme") === "light";
    } catch {
      // storage unavailable - stay dark
    }
    document.documentElement.classList.toggle("light", light);
    return () => document.documentElement.classList.remove("light");
  }, []);

  async function saveDisplayName(name: string) {
    setBusy(true);
    setError("");
    try {
      const current = getFirebaseAuth().currentUser;
      if (!current) throw new Error("Sign in to continue.");
      await updateProfile(current, { displayName: name.trim() || null });
      window.dispatchEvent(new CustomEvent("threadly:user-updated"));
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : "Could not save your profile.");
      throw caught;
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="portal min-h-screen">
      <header className="border-b border-white/[0.06]">
        <div className="mx-auto flex max-w-3xl items-center justify-between px-6 py-4">
          <Link href="/portal" className="text-sm text-zinc-400 transition hover:text-white">
            ← Back to workspace
          </Link>
          <span className="text-xs uppercase tracking-widest text-zinc-600">Account</span>
        </div>
      </header>
      <main className="mx-auto max-w-3xl space-y-6 px-6 py-10">
        <div>
          <h1 className="text-2xl font-bold tracking-tight text-white">Account settings</h1>
          <p className="mt-1 text-sm text-zinc-500">
            Your sign-in and personal details. Workspace-level settings (brand, keys, team, billing) live in the workspace.
          </p>
        </div>
        {error && <p className="rounded-lg border border-rose-400/30 bg-rose-500/10 px-4 py-2 text-sm text-rose-200">{error}</p>}
        <Section title="Profile" hint="How you appear inside your workspace.">
          <ProfileSettings user={user} busy={busy} onSave={saveDisplayName} hideHeading />
        </Section>
        <Section title="Session" hint="Sign out of Threadly on this device.">
          <button
            type="button"
            onClick={() => void signOut(getFirebaseAuth()).then(() => router.replace("/portal/login"))}
            className="rounded-lg border border-white/15 px-4 py-2 text-sm font-medium text-zinc-200 transition hover:bg-white/[0.06]"
          >
            Sign out
          </button>
        </Section>
        <DeleteAccount user={user} />
      </main>
    </div>
  );
}
