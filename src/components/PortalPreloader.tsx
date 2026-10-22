"use client";

import Image from "next/image";
import { useEffect, useState } from "react";
import { AlertCircle, RefreshCw } from "lucide-react";

interface PortalPreloaderProps {
  message?: string;
  error?: string;
  onRetry?: () => void;
}

export default function PortalPreloader({
  message = "Opening your private workspace…",
  error,
  onRetry,
}: PortalPreloaderProps) {
  const [statusIndex, setStatusIndex] = useState(0);

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

    return () => clearInterval(timer);
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
              <svg width="42" height="42" viewBox="0 0 64 64" fill="none" xmlns="http://www.w3.org/2000/svg">
                <path
                  d="M22 15c8.4 0 15.2 6.8 15.2 15.2S30.4 45.4 22 45.4"
                  fill="none"
                  stroke="#ff4500"
                  strokeWidth="7"
                  strokeLinecap="round"
                />
                <path
                  d="M42 49c-8.4 0-15.2-6.8-15.2-15.2S33.6 18.6 42 18.6"
                  fill="none"
                  stroke="#7c3aed"
                  strokeWidth="7"
                  strokeLinecap="round"
                />
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
              {onRetry && (
                <button
                  type="button"
                  className="btn btn-dark"
                  onClick={onRetry}
                  style={{ display: "inline-flex", alignItems: "center", justifyContent: "center", gap: 6 }}
                >
                  <RefreshCw size={13} /> Try again
                </button>
              )}
            </div>
          </div>
        ) : (
          <div className="preloader-loading-box">
            {/* Pulsing indicator tag */}
            <div className="preloader-badge">
              <span className="preloader-pulse-dot" />
              <span>FOUNDER REVENUE OS</span>
            </div>

            {/* Shimmer progress bar */}
            <div className="preloader-progress-track">
              <div className="preloader-progress-bar" />
            </div>

            {/* Dynamic Status Text */}
            <p className="preloader-status-text">{statuses[statusIndex]}</p>
          </div>
        )}

        <div className="preloader-footer">
          <span>THREADLY · FOUNDER REVENUE INTELLIGENCE</span>
        </div>
      </div>
    </div>
  );
}
