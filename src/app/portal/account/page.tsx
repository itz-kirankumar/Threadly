"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { onAuthStateChanged, type User } from "firebase/auth";
import AccountSettings from "@/components/AccountSettings";
import PhoneGate from "@/components/PhoneGate";
import { getFirebaseAuth } from "@/lib/firebase-client";

export default function AccountPage() {
  const router = useRouter();
  const [user, setUser] = useState<User | null>(null);
  const [ready, setReady] = useState(false);

  useEffect(() => {
    const auth = getFirebaseAuth();
    return onAuthStateChanged(auth, (currentUser) => {
      setUser(currentUser);
      setReady(true);
      if (!currentUser) router.replace("/portal/login");
    });
  }, [router]);

  if (!ready || !user) {
    return <div className="min-h-screen bg-zinc-950 py-24 text-center text-sm text-zinc-500">Loading…</div>;
  }
  if (!user.phoneNumber) {
    return <PhoneGate user={user} />;
  }
  return <AccountSettings user={user} />;
}
