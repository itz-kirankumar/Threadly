"use client";

import { useEffect } from "react";
import { sanitizeAnalyticsEvent } from "@/lib/analytics-sanitize";
import { analyticsAllowed, CONSENT_CHANGE_EVENT } from "@/lib/consent";

// PostHog, consent-gated. No key configured -> renders nothing, loads nothing.
// Declined/undecided -> never initialized. Withdrawal after acceptance ->
// opted out and identity reset. Pageviews only: no autocapture, no session
// recording, no identified profiles. Query strings and hashes are stripped
// from tracked URLs so claim/invite/checkout secrets never leave the page.
export default function PostHogProvider() {
  useEffect(() => {
    const key = process.env.NEXT_PUBLIC_POSTHOG_KEY;
    if (!key) return;
    const host = process.env.NEXT_PUBLIC_POSTHOG_HOST || "https://us.i.posthog.com";
    let active = false;
    let stopped = false;

    const start = async () => {
      if (active || stopped) return;
      const { default: posthog } = await import("posthog-js");
      posthog.init(key, {
        api_host: host,
        autocapture: false,
        capture_pageview: true,
        capture_pageleave: false,
        disable_session_recording: true,
        person_profiles: "identified_only",
        opt_out_capturing_by_default: false,
        before_send: sanitizeAnalyticsEvent,
      });
      active = true;
    };

    const stop = async () => {
      if (!active) return;
      const { default: posthog } = await import("posthog-js");
      posthog.opt_out_capturing();
      posthog.reset();
      active = false;
    };

    const apply = () => {
      if (analyticsAllowed(window.localStorage)) void start();
      else void stop();
    };

    apply();
    const onChange = () => apply();
    window.addEventListener(CONSENT_CHANGE_EVENT, onChange);
    window.addEventListener("storage", onChange);
    return () => {
      stopped = true;
      window.removeEventListener(CONSENT_CHANGE_EVENT, onChange);
      window.removeEventListener("storage", onChange);
    };
  }, []);

  return null;
}
