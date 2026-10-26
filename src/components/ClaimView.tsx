"use client";

import Link from "next/link";
import SupportLink from "@/components/SupportLink";

export type ClaimViewProps = {
  status: "signin" | "working" | "error" | "done";
  message?: string;
  plan?: string;
  periodEnd?: string;
  email?: string | null;
  claimRef?: string;
  onSignIn?: () => void;
};

export default function ClaimView({ status, message, plan, periodEnd, email, claimRef, onSignIn }: ClaimViewProps) {
  return (
    <main className="mx-auto flex min-h-screen max-w-md flex-col justify-center px-6 py-16">
      <Link href="/" className="mb-8 text-sm text-zinc-500 hover:text-zinc-300">&larr; Threadly</Link>
      {status === "done" ? (
        <>
          <h1 className="text-2xl font-semibold text-white">Your plan is active</h1>
          <p className="mt-2 text-sm text-zinc-400">
            {plan === "growth" ? "Growth" : plan === "trial" ? "7-Day Trial" : "Pro"} is linked to {email}.
            {periodEnd ? ` It runs until ${new Date(periodEnd).toLocaleDateString()}.` : ""}
          </p>
          <Link href="/portal" className="mt-6 rounded-lg bg-white px-4 py-3 text-center text-sm font-semibold text-zinc-900 transition hover:bg-zinc-200">
            Open your workspace
          </Link>
        </>
      ) : status === "working" || status === "error" ? (
        <>
          <h1 className="text-2xl font-semibold text-white">{status === "error" ? "Purchase needs review" : "Linking your purchase…"}</h1>
          {status === "error" && (
            <div className="mt-4 rounded-lg border border-red-400/30 bg-red-500/10 px-3.5 py-2.5 text-xs text-red-200">
              <p>{message}</p>
              <SupportLink reference={claimRef} />
            </div>
          )}
        </>
      ) : (
        <>
          <h1 className="text-2xl font-semibold text-white">One last step</h1>
          <p className="mt-2 text-sm text-zinc-400">
            Sign in with the same email and mobile number you used at checkout to link this plan to your Threadly account.
            New here? The same button creates your account.
          </p>
          <button
            type="button"
            onClick={onSignIn}
            className="mt-6 rounded-lg bg-white px-4 py-3 text-sm font-semibold text-zinc-900 transition hover:bg-zinc-200"
          >
            Continue with Google
          </button>
        </>
      )}
    </main>
  );
}
