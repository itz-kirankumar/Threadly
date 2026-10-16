"use client";

import Image from "next/image";
import Link from "next/link";
import { useEffect, useState } from "react";
import { ArrowRight, Sparkles, AlertCircle, RefreshCw } from "lucide-react";

interface PortalPreloaderProps {
  message?: string;
  error?: string;
  onRetry?: () => void;
  onContinueDemo?: () => void;
  onGoogleSignIn?: () => Promise<void> | void;
  signingIn?: boolean;
}

export default function PortalPreloader({
  message = "Opening your private workspace…",
  error,
  onRetry,
  onContinueDemo,
  onGoogleSignIn,
  signingIn = false,
}: PortalPreloaderProps) {
  const [statusIndex, setStatusIndex] = useState(0);
  const [showFallbackActions, setShowFallbackActions] = useState(false);

  const statuses = [
    message,
    "Verifying founder credentials & permissions…",
    "Calibrating conversation radar & X signals…",
    "Loading company context & lead intelligence…",
  ];

  useEffect(() => {
    const timer = setInterval(() => {
      setStatusIndex(prev => (prev + 1) % statuses.length);
    }, 2200);

    const fallbackTimer = setTimeout(() => {
      setShowFallbackActions(true);
    }, 2800);

    return () => {
      clearInterval(timer);
      clearTimeout(fallbackTimer);
    };
  }, [statuses.length]);

  return (
    <div className="portal-preloader-root light-mode" role="status" aria-live="polite">
      {/* Soft light ambient glow */}
      <div className="preloader-ambient-glow" />
      <div className="preloader-grid-overlay" />

      <div className="preloader-card">
        {/* Logo and emblem */}
        <div className="preloader-brand">
          <div className="preloader-emblem-wrap">
            <div className="preloader-orb-ring" />
            <div className="preloader-orb-glow" />
            <div className="preloader-emblem">
              <svg width="44" height="44" viewBox="0 0 100 100" fill="none" xmlns="http://www.w3.org/2000/svg">
                <path d="M50 0L59 41L100 50L59 59L50 100L41 59L0 50L41 41L50 0Z" fill="url(#violet-light-grad)" />
                <circle cx="50" cy="50" r="10" fill="#ffffff" />
                <circle cx="50" cy="50" r="5" fill="#361a62" />
                <defs>
                  <linearGradient id="violet-light-grad" x1="0" y1="0" x2="100" y2="100" gradientUnits="userSpaceOnUse">
                    <stop stopColor="#b129ff" />
                    <stop offset="0.6" stopColor="#7c3aed" />
                    <stop offset="1" stopColor="#361a62" />
                  </linearGradient>
                </defs>
              </svg>
            </div>
          </div>
          <Image
            src="/threadly-logo.svg"
            alt="Threadly"
            width={168}
            height={52}
            className="preloader-logo-image"
            priority
          />
        </div>

        {error ? (
          <div className="preloader-error-box">
            <div className="error-icon-row">
              <AlertCircle size={20} className="text-amber-600" />
              <strong>Authentication Notice</strong>
            </div>
            <p>{error}</p>
            <div className="preloader-error-actions">
              {onGoogleSignIn && (
                <button
                  type="button"
                  className="btn btn-dark"
                  onClick={onGoogleSignIn}
                  disabled={signingIn}
                  style={{ width: "100%", display: "inline-flex", alignItems: "center", justifyContent: "center", gap: 8, padding: "12px 18px", fontWeight: 650, borderRadius: 10 }}
                >
                  <span className="google-g" aria-hidden="true" style={{ width: 20, height: 20, fontSize: 13, borderRadius: "50%", background: "#fff", color: "#4285F4", display: "inline-flex", alignItems: "center", justifyContent: "center", fontWeight: "bold" }}>G</span>
                  {signingIn ? "Connecting to Google…" : "Continue with Google"}
                </button>
              )}
              <Link href="/portal/login" className="btn btn-outline" style={{ display: "inline-flex", alignItems: "center", justifyContent: "center", gap: 6 }}>
                Open sign-in page <ArrowRight size={13} />
              </Link>
              {onContinueDemo && (
                <button type="button" className="btn btn-demo-outline" onClick={onContinueDemo}>
                  Explore demo workspace <ArrowRight size={14} />
                </button>
              )}
              {onRetry && (
                <button type="button" className="btn" onClick={onRetry} style={{ background: "none", border: "none", color: "#71717a", fontSize: 12, cursor: "pointer", display: "inline-flex", alignItems: "center", justifyContent: "center", gap: 5 }}>
                  <RefreshCw size={12} /> Try again
                </button>
              )}
            </div>
          </div>
        ) : (
          <div className="preloader-loading-box">
            {/* Pulsing indicator tag */}
            <div className="preloader-badge">
              <span className="preloader-pulse-dot" />
              <span>WISE INTELLIGENCE OS</span>
            </div>

            {/* Shimmer progress bar */}
            <div className="preloader-progress-track">
              <div className="preloader-progress-bar" />
            </div>

            {/* Dynamic Status Text */}
            <p className="preloader-status-text">{statuses[statusIndex]}</p>

            {/* Immediate Google sign-in action if not logged in */}
            {onGoogleSignIn && (
              <div style={{ marginTop: 16, width: "100%" }}>
                <button
                  type="button"
                  className="btn btn-dark"
                  onClick={onGoogleSignIn}
                  disabled={signingIn}
                  style={{ width: "100%", display: "inline-flex", alignItems: "center", justifyContent: "center", gap: 8, padding: "12px 18px", fontWeight: 650, borderRadius: 10 }}
                >
                  <span className="google-g" aria-hidden="true" style={{ width: 20, height: 20, fontSize: 13, borderRadius: "50%", background: "#fff", color: "#4285F4", display: "inline-flex", alignItems: "center", justifyContent: "center", fontWeight: "bold" }}>G</span>
                  {signingIn ? "Connecting to Google…" : "Continue with Google"}
                </button>
              </div>
            )}

            {/* Fallback assistance */}
            <div className="preloader-fallback-prompt" style={{ marginTop: 10 }}>
              <div className="preloader-fallback-buttons">
                <Link href="/portal/login" className="preloader-link-btn">
                  Sign-in page <ArrowRight size={13} />
                </Link>
                {onContinueDemo && (
                  <button type="button" className="preloader-link-btn demo-btn" onClick={onContinueDemo}>
                    <Sparkles size={13} /> Guest preview
                  </button>
                )}
              </div>
            </div>
          </div>
        )}

        <div className="preloader-footer">
          <span>THREADLY · FOUNDER REVENUE INTELLIGENCE</span>
        </div>
      </div>
    </div>
  );
}
