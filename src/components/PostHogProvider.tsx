"use client";

import { useEffect } from "react";
import { sanitizeAnalyticsEvent, sanitizeTrackedUrl } from "@/lib/analytics-sanitize";
import { analyticsAllowed, CONSENT_CHANGE_EVENT } from "@/lib/consent";

// PostHog, consent-gated. No key configured -> renders nothing, loads nothing.
// Declined/undecided -> never initialized. Withdrawal after acceptance ->
// opted out and identity reset. Pageviews only: no autocapture, no session
// recording, no identified profiles.
//
// Capture is explicit, not automatic: posthog's own capture_pageview is off and
// every $pageview is fired by trackCurrent(), which first runs the route
// allowlist - non-marketing routes (portal, checkout, invite, claim, API,
// preview) are never tracked, so claim/invite secrets in URLs cannot reach
// PostHog. before_send stays configured as defense in depth.
export default function PostHogProvider() {
  useEffect(() => {
    const key = process.env.NEXT_PUBLIC_POSTHOG_KEY;
    if (!key) return;
    const host = process.env.NEXT_PUBLIC_POSTHOG_HOST || "https://us.i.posthog.com";
    let active = false;
    let stopped = false;

    const trackCurrent = async () => {
      if (!active || stopped) return;
      const url = sanitizeTrackedUrl(window.location.href);
      if (!url) return; // route not allowlisted - track nothing
      const { default: posthog } = await import("posthog-js");
      posthog.capture("$pageview", {
        $current_url: url,
        $pathname: new URL(url).pathname,
      });
    };

    const onNav = () => {
      // App Router navigations don't emit popstate; wrap pushState/replaceState.
      window.setTimeout(() => void trackCurrent(), 50);
    };

    const start = async () => {
      if (active || stopped) return;
      const { default: posthog } = await import("posthog-js");
      posthog.init(key, {
        api_host: host,
        autocapture: false,
        capture_pageview: false,
        capture_pageleave: false,
        disable_session_recording: true,
        person_profiles: "identified_only",
        opt_out_capturing_by_default: false,
        before_send: sanitizeAnalyticsEvent,
      });
      // Our consent gate has already run at this point; make sure the SDK's
      // own opt-out state can't silently swallow events.
      posthog.opt_in_capturing();
      active = true;
      window.addEventListener("popstate", onNav);
      const originalPush = window.history.pushState;
      const originalReplace = window.history.replaceState;
      window.history.pushState = function (...args) {
        const result = originalPush.apply(this, args);
        onNav();
        return result;
      };
      window.history.replaceState = function (...args) {
        const result = originalReplace.apply(this, args);
        onNav();
        return result;
      };
      void trackCurrent();
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
