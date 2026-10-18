"use client";

import { useCallback, useEffect, useState } from "react";
import { GoogleAuthProvider, onAuthStateChanged, signInWithPopup, signOut, type User } from "firebase/auth";
import { getFirebaseAuth } from "@/lib/firebase-client";

type Application = {
  id: string | number;
  uid: string;
  email: string;
  fullName: string;
  startupName: string;
  industry: string;
  url?: string;
  challenge1: string;
  challenge2?: string;
  status: "pending" | "approved" | "rejected";
  createdAt: string;
  reviewedAt?: string;
  reviewedBy?: string;
};

export default function AdminWaitlist() {
  const [user, setUser] = useState<User | null>(null);
  const [applications, setApplications] = useState<Application[]>([]);
  const [loading, setLoading] = useState(true);
  const [busyId, setBusyId] = useState<string | number | null>(null);
  const [error, setError] = useState("");
  const [filter, setFilter] = useState<"all" | Application["status"]>("all");

  const loadApplications = useCallback(async (currentUser: User) => {
    setLoading(true);
    setError("");
    try {
      const response = await fetch("/api/admin/waitlist", {
        headers: { Authorization: `Bearer ${await currentUser.getIdToken()}` },
        cache: "no-store",
      });
      const data = await response.json().catch(() => ({}));
      if (!response.ok) throw new Error(data.error || "Could not load applications.");
      setApplications(data.applications || []);
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : "Could not load applications.");
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    let unsubscribe = () => {};
    try {
      unsubscribe = onAuthStateChanged(getFirebaseAuth(), currentUser => {
        setUser(currentUser);
        if (currentUser) void loadApplications(currentUser);
        else setLoading(false);
      });
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : "Firebase is not configured.");
      setLoading(false);
    }
    return () => unsubscribe();
  }, [loadApplications]);

  async function login() {
    setLoading(true);
    setError("");
    try {
      const provider = new GoogleAuthProvider();
      provider.setCustomParameters({ prompt: "select_account" });
      const result = await signInWithPopup(getFirebaseAuth(), provider);
      setUser(result.user);
      await loadApplications(result.user);
    } catch (caught) {
      const code = (caught as { code?: string })?.code;
      if (code !== "auth/popup-closed-by-user" && code !== "auth/cancelled-popup-request") {
        setError(caught instanceof Error ? caught.message : "Google sign-in failed.");
      }
      setLoading(false);
    }
  }

  async function updateStatus(application: Application, status: Application["status"]) {
    if (!user) return;
    setBusyId(application.id);
    setError("");
    try {
      const response = await fetch("/api/admin/waitlist", {
        method: "PATCH",
        headers: { "Content-Type": "application/json", Authorization: `Bearer ${await user.getIdToken()}` },
        body: JSON.stringify({ id: application.id, status }),
      });
      const data = await response.json().catch(() => ({}));
      if (!response.ok) throw new Error(data.error || "Could not update this request.");
      setApplications(current => current.map(item => item.id === application.id
        ? { ...item, status, reviewedAt: new Date().toISOString(), reviewedBy: user.email || "Admin" }
        : item));
      if (status === "approved" && data.emailSent === false) {
        setError("Access was approved, but Resend could not send the approval email. Check the Resend configuration and domain verification, then return this request to pending and approve it again to retry.");
      }
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : "Could not update this request.");
    } finally {
      setBusyId(null);
    }
  }

  const visible = applications.filter(item => filter === "all" || item.status === filter);
  const counts = {
    all: applications.length,
    pending: applications.filter(item => item.status === "pending").length,
    approved: applications.filter(item => item.status === "approved").length,
    rejected: applications.filter(item => item.status === "rejected").length,
  };

  return <main className="min-h-screen bg-[#f7f4ef] text-[#181818]">
    <header className="border-b-2 border-black bg-white">
      <div className="mx-auto flex max-w-6xl items-center justify-between px-5 py-5">
        <a href="/" className="text-xl font-black tracking-tight">threadly<span className="text-orange-600">.</span> <span className="ml-2 text-sm font-bold text-gray-500">ADMIN</span></a>
        {user && <div className="flex items-center gap-3 text-sm"><span className="hidden text-gray-600 sm:inline">{user.email}</span><button onClick={() => signOut(getFirebaseAuth())} className="rounded-lg border-2 border-black px-3 py-2 font-bold">Sign out</button></div>}
      </div>
    </header>
    <section className="mx-auto max-w-6xl px-5 py-10">
      <div className="flex flex-wrap items-end justify-between gap-4">
        <div><p className="font-mono text-xs font-bold uppercase tracking-widest text-orange-700">Threadly 2.0 · Beta access</p><h1 className="mt-2 text-4xl font-black tracking-tight">Waitlist requests</h1><p className="mt-2 text-gray-600">Review applications and approve access to the founder workspace.</p></div>
        {user && <button onClick={() => void loadApplications(user)} disabled={loading} className="rounded-xl border-2 border-black bg-white px-4 py-2.5 text-sm font-bold disabled:opacity-50">Refresh</button>}
      </div>

      {!user && <div className="mt-10 max-w-lg rounded-2xl border-2 border-black bg-white p-7 shadow-[5px_5px_0_#111]">
        <h2 className="text-xl font-black">Admin sign in</h2><p className="mt-2 text-sm text-gray-600">Use the authorized Google account to manage beta requests.</p>
        <button onClick={() => void login()} disabled={loading} className="mt-5 w-full rounded-xl border-2 border-black bg-black px-5 py-3 font-bold text-white disabled:opacity-50">{loading ? "Connecting…" : "Continue with Google"}</button>
      </div>}

      {error && <div role="alert" className="mt-6 rounded-xl border border-red-300 bg-red-50 px-4 py-3 text-sm font-semibold text-red-800">{error}{user && error.includes("authorized") && <button className="ml-3 underline" onClick={() => signOut(getFirebaseAuth())}>Sign out</button>}</div>}

      {user && !loading && !error && <>
        <div className="mt-8 flex flex-wrap gap-2">{(["all", "pending", "approved", "rejected"] as const).map(status => <button key={status} onClick={() => setFilter(status)} className={`rounded-full border-2 px-4 py-2 text-sm font-bold capitalize ${filter === status ? "border-black bg-black text-white" : "border-gray-300 bg-white"}`}>{status} <span className="ml-1 opacity-70">{counts[status]}</span></button>)}</div>
        <div className="mt-5 grid gap-4">
          {visible.map(application => <article key={application.id} className="rounded-2xl border-2 border-black bg-white p-5 shadow-[4px_4px_0_#111]">
            <div className="flex flex-wrap items-start justify-between gap-4">
              <div><div className="flex flex-wrap items-center gap-2"><h2 className="text-xl font-black">{application.fullName}</h2><span className={`rounded-full px-3 py-1 text-xs font-bold uppercase ${application.status === "approved" ? "bg-green-100 text-green-800" : application.status === "rejected" ? "bg-red-100 text-red-800" : "bg-amber-100 text-amber-800"}`}>{application.status}</span></div><p className="mt-1 text-sm text-gray-600">{application.email} · {application.startupName} · {application.industry}</p>{application.url && <a href={application.url} target="_blank" rel="noreferrer" className="mt-1 inline-block text-sm font-semibold text-blue-700 underline">{application.url}</a>}</div>
              <time className="text-xs text-gray-500">{new Date(application.createdAt).toLocaleString()}</time>
            </div>
            <p className="mt-4 text-sm"><strong>Growth blocker:</strong> {application.challenge1}</p>
            {application.challenge2 && <p className="mt-2 text-sm"><strong>More context:</strong> {application.challenge2}</p>}
            {application.reviewedBy && <p className="mt-3 text-xs text-gray-500">Reviewed by {application.reviewedBy}{application.reviewedAt ? ` · ${new Date(application.reviewedAt).toLocaleString()}` : ""}</p>}
            <div className="mt-4 flex flex-wrap gap-2">{application.status !== "approved" && <button onClick={() => void updateStatus(application, "approved")} disabled={busyId === application.id} className="rounded-lg border-2 border-green-800 bg-green-700 px-4 py-2 text-sm font-bold text-white disabled:opacity-50">{busyId === application.id ? "Saving…" : "Approve access"}</button>}{application.status !== "rejected" && <button onClick={() => void updateStatus(application, "rejected")} disabled={busyId === application.id} className="rounded-lg border-2 border-gray-400 bg-white px-4 py-2 text-sm font-bold disabled:opacity-50">Reject</button>}{application.status !== "pending" && <button onClick={() => void updateStatus(application, "pending")} disabled={busyId === application.id} className="rounded-lg border-2 border-gray-400 bg-white px-4 py-2 text-sm font-bold disabled:opacity-50">Return to pending</button>}</div>
          </article>)}
          {visible.length === 0 && <div className="rounded-2xl border-2 border-dashed border-gray-300 bg-white p-12 text-center text-gray-500">{applications.length ? "No requests in this status." : "No beta requests yet."}</div>}
        </div>
      </>}
      {user && loading && <p className="mt-8 text-sm text-gray-500">Loading requests…</p>}
    </section>
  </main>;
}
