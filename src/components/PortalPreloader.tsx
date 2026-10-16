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
}

export default function PortalPreloader({
  message = "Opening your private workspace…",
  error,
  onRetry,
  onContinueDemo,
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
            src="/logo.png"
            alt="Wisentry"
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
              {onRetry && (
                <button type="button" className="btn btn-dark" onClick={onRetry}>
                  <RefreshCw size={14} /> Try again
                </button>
              )}
              <Link href="/portal/login" className="btn btn-outline">
                Return to sign in
              </Link>
              {onContinueDemo && (
                <button type="button" className="btn btn-demo-outline" onClick={onContinueDemo}>
                  Explore demo workspace <ArrowRight size={14} />
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

            {/* Delayed fallback assistance if auth is taking a moment */}
            {showFallbackActions && (
              <div className="preloader-fallback-prompt">
                <span className="preloader-fallback-hint">Taking a moment to connect?</span>
                <div className="preloader-fallback-buttons">
                  <Link href="/portal/login" className="preloader-link-btn">
                    Go to sign-in page <ArrowRight size={13} />
                  </Link>
                  {onContinueDemo && (
                    <button type="button" className="preloader-link-btn demo-btn" onClick={onContinueDemo}>
                      <Sparkles size={13} /> Open guest preview
                    </button>
                  )}
                </div>
              </div>
            )}
          </div>
        )}

        <div className="preloader-footer">
          <span>WISENTRY · FOUNDER REVENUE INTELLIGENCE</span>
        </div>
      </div>
    </div>
  );
}
