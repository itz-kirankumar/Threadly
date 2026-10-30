"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { onAuthStateChanged, signOut, type User } from "firebase/auth";
import GeoDashboard from "@/components/geo/GeoDashboard";
import PhoneGate from "@/components/PhoneGate";
import ThreadlyLogo from "@/components/ThreadlyLogo";
import QualifyForm from "@/components/landing/QualifyForm";
import { getFirebaseAuth, initializeFirebaseAnalytics } from "@/lib/firebase-client";

export default function PortalGate() {
  const router = useRouter();
  const [user, setUser] = useState<User | null>(null);
  const [ready, setReady] = useState(false);
  const [authError, setAuthError] = useState("");
  // Invite-only: null while the server decides whether this account may enter.
  const [access, setAccess] = useState<{ allowed: boolean; email: string | null } | null>(null);

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

  useEffect(() => {
    if (!user) {
      setAccess(null);
      return;
    }
    let cancelled = false;
    (async () => {
      try {
        const res = await fetch("/api/access", { headers: { Authorization: `Bearer ${await user.getIdToken()}` }, cache: "no-store" });
        const body = (await res.json()) as { allowed?: boolean; email?: string | null };
        if (!cancelled) setAccess({ allowed: res.ok && body.allowed === true, email: body.email ?? user.email });
      } catch {
        if (!cancelled) setAuthError("We could not confirm your access. Refresh to try again.");
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [user]);

  if (authError) {
    return (
      <div className="mx-auto max-w-md px-6 py-24 text-center">
        <p className="text-sm text-rose-300">{authError}</p>
      </div>
    );
  }

  if (!ready || !user || !access) {
    return <div className="py-24 text-center text-sm text-zinc-500">Loading…</div>;
  }

  if (!access.allowed) {
    return <NotOnboarded email={access.email} />;
  }

  // Phone verification is mandatory for every account, on every sign-in path.
  // Phone-first sign-in already carries a verified number; Google and email
  // accounts link one here before the workspace unlocks.
  if (!user.phoneNumber) {
    return <PhoneGate user={user} />;
  }

  return <GeoDashboard user={user} />;
}

// Signed in, but not an onboarded account: nothing of the platform is shown.
function NotOnboarded({ email }: { email: string | null }) {
  const [checking, setChecking] = useState(false);
  if (checking) {
    // The domain comes from the signed-in email; personal addresses type theirs.
    const domain = /@(gmail|googlemail|yahoo|outlook|hotmail|live|icloud|proton|protonmail)\./i.test(email ?? "") ? "" : (email ?? "").split("@")[1] ?? "";
    return (
      <main className="site flex min-h-screen items-center justify-center px-4 py-10">
        <div className="w-full max-w-2xl rounded-3xl border border-black/[0.08] bg-[#FFFFFF] p-6 shadow-[0_8px_30px_-18px_rgba(17,17,20,0.25)] sm:p-8">
          <ThreadlyLogo size={32} wordmark />
          <h1 className="mt-5 font-display text-3xl tracking-tight">Check your eligibility</h1>
          <p className="mb-5 mt-1 text-sm text-[#6B6A72]">We check your company domain and website, then score your business.</p>
          <QualifyForm defaultEmail={email ?? ""} defaultDomain={domain} onQualified={() => window.location.reload()} />
          <button type="button" onClick={() => setChecking(false)} className="mt-4 text-sm text-[#6B6A72] hover:text-[#111114]">Back</button>
        </div>
      </main>
    );
  }
  return (
    <main className="relative flex min-h-screen items-center justify-center overflow-hidden bg-[#F6F5F2] px-6 text-[#111114]">
      <div className="relative w-full max-w-md rounded-3xl border border-black/[0.08] bg-[#FFFFFF] p-8 text-center shadow-[0_8px_30px_-18px_rgba(17,17,20,0.25)]">
        <div className="flex justify-center"><ThreadlyLogo size={44} /></div>
        <p className="mt-6 text-[11px] font-medium uppercase tracking-[0.3em] text-[#5B3DF5]">By invitation</p>
        <h1 className="mt-3 font-display text-4xl leading-tight">This account has not been onboarded</h1>
        <p className="mt-3 text-sm leading-relaxed text-[#6B6A72]">
          Threadly is open to eligible teams only.{email ? ` ${email} is not on the member list.` : " Sign in with the email you applied with."} If you were invited, use that exact email.
        </p>
        <div className="mt-7 grid gap-2">
          <button type="button" onClick={() => setChecking(true)} className="rounded-xl bg-[#111114] px-5 py-2.5 text-sm font-semibold text-[#FFFFFF] transition hover:bg-[#2B2A31]">Check your eligibility</button>
          <button type="button" onClick={() => signOut(getFirebaseAuth()).then(() => { window.location.href = "/portal/login"; })} className="rounded-xl border border-black/15 bg-[#FFFFFF] px-5 py-2.5 text-sm font-semibold text-[#111114] transition hover:bg-[#F3F2EE]">
            Use a different account
          </button>
        </div>
      </div>
    </main>
  );
}
