import Link from "next/link";
import { ArrowLeft, Compass } from "lucide-react";

export default function NotFound() {
  return (
    <main className="min-h-screen bg-brand-paper text-brand-black flex items-center justify-center p-6 selection:bg-brand-orange selection:text-white">
      <div className="max-w-md w-full text-center space-y-6">
        <div className="inline-flex items-center justify-center w-14 h-14 rounded-2xl bg-orange-50 border border-orange-200 text-brand-orange shadow-sm">
          <Compass className="w-7 h-7 animate-spin-slow" />
        </div>
        
        <div className="space-y-2">
          <p className="text-xs font-mono tracking-widest text-brand-orange uppercase">404 · Page Not Found</p>
          <h1 className="text-3xl sm:text-4xl font-serif font-medium tracking-tight">
            Off the radar<span className="text-brand-orange">.</span>
          </h1>
          <p className="text-sm text-neutral-600 leading-relaxed">
            The page or conversation signal you were searching for has moved, expired, or doesn&apos;t exist.
          </p>
        </div>

        <div className="flex flex-col sm:flex-row items-center justify-center gap-3 pt-2">
          <Link
            href="/"
            className="w-full sm:w-auto inline-flex items-center justify-center gap-2 px-5 py-2.5 rounded-lg text-sm font-medium bg-neutral-900 text-white hover:bg-neutral-800 transition-colors shadow-sm"
          >
            <ArrowLeft className="w-4 h-4" />
            Back to Home
          </Link>
          <Link
            href="/portal"
            className="w-full sm:w-auto inline-flex items-center justify-center px-5 py-2.5 rounded-lg text-sm font-medium border border-neutral-200 bg-white hover:bg-neutral-50 transition-colors"
          >
            Open Portal
          </Link>
        </div>
      </div>
    </main>
  );
}
