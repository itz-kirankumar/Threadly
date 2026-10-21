"use client";

import { useEffect } from "react";
import Link from "next/link";
import { AlertTriangle, RefreshCw, Home } from "lucide-react";

export default function ErrorBoundary({
  error,
  reset,
}: {
  error: Error & { digest?: string };
  reset: () => void;
}) {
  useEffect(() => {
    // Log error securely
    console.error("Threadly Application Error:", error);
  }, [error]);

  return (
    <main className="min-h-screen bg-brand-paper text-brand-black flex items-center justify-center p-6 selection:bg-brand-orange selection:text-white">
      <div className="max-w-md w-full text-center space-y-6">
        <div className="inline-flex items-center justify-center w-14 h-14 rounded-2xl bg-amber-50 border border-amber-200 text-amber-600 shadow-sm">
          <AlertTriangle className="w-7 h-7" />
        </div>

        <div className="space-y-2">
          <p className="text-xs font-mono tracking-widest text-amber-700 uppercase">System Notice</p>
          <h1 className="text-2xl sm:text-3xl font-serif font-medium tracking-tight">
            Something unexpected occurred<span className="text-brand-orange">.</span>
          </h1>
          <p className="text-sm text-neutral-600 leading-relaxed">
            {error.message && error.message.length < 120
              ? error.message
              : "A runtime condition interrupted this view. Your saved conversations and workspace data remain safe."}
          </p>
        </div>

        <div className="flex flex-col sm:flex-row items-center justify-center gap-3 pt-2">
          <button
            type="button"
            onClick={() => reset()}
            className="w-full sm:w-auto inline-flex items-center justify-center gap-2 px-5 py-2.5 rounded-lg text-sm font-medium bg-neutral-900 text-white hover:bg-neutral-800 transition-colors shadow-sm cursor-pointer"
          >
            <RefreshCw className="w-4 h-4" />
            Try again
          </button>
          <Link
            href="/"
            className="w-full sm:w-auto inline-flex items-center justify-center gap-2 px-5 py-2.5 rounded-lg text-sm font-medium border border-neutral-200 bg-white hover:bg-neutral-50 transition-colors"
          >
            <Home className="w-4 h-4" />
            Home
          </Link>
        </div>
      </div>
    </main>
  );
}
