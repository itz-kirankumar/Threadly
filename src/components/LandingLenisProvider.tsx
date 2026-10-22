"use client";

import { useEffect, useRef, useState, type ReactNode } from "react";
import { ReactLenis, useLenis, type LenisRef } from "lenis/react";
import "lenis/dist/lenis.css";

interface LandingLenisProviderProps {
  children: ReactNode;
}

function AnchorHandler() {
  const lenis = useLenis();

  useEffect(() => {
    if (!lenis) return;

    const handleAnchorClick = (e: MouseEvent) => {
      const target = (e.target as HTMLElement).closest("a");
      if (!target) return;

      const href = target.getAttribute("href");
      if (!href) return;

      // Handle in-page anchors like "#modules" or "/#modules"
      const isInternalAnchor =
        href.startsWith("#") ||
        (href.startsWith("/#") && (window.location.pathname === "/" || window.location.pathname === ""));

      if (isInternalAnchor) {
        const hash = href.startsWith("/#") ? href.slice(1) : href;
        if (hash === "#" || hash === "") {
          e.preventDefault();
          lenis.scrollTo(0, { duration: 1.2 });
          return;
        }

        const targetEl = document.querySelector(hash);
        if (targetEl) {
          e.preventDefault();
          lenis.scrollTo(targetEl as HTMLElement, {
            offset: -88, // Clear fixed navbar
            duration: 1.2,
          });
          window.history.pushState(null, "", hash);
        }
      }
    };

    document.addEventListener("click", handleAnchorClick);
    return () => document.removeEventListener("click", handleAnchorClick);
  }, [lenis]);

  return null;
}

export default function LandingLenisProvider({ children }: LandingLenisProviderProps) {
  const lenisRef = useRef<LenisRef>(null);
  const [prefersReducedMotion, setPrefersReducedMotion] = useState(false);

  useEffect(() => {
    const mediaQuery = window.matchMedia("(prefers-reduced-motion: reduce)");
    setPrefersReducedMotion(mediaQuery.matches);

    const listener = (event: MediaQueryListEvent) => {
      setPrefersReducedMotion(event.matches);
    };

    mediaQuery.addEventListener("change", listener);
    return () => mediaQuery.removeEventListener("change", listener);
  }, []);

  // Dedicated continuous RAF loop to guarantee Lenis advances and never freezes
  useEffect(() => {
    if (prefersReducedMotion) return;

    let rafId: number;
    function update(time: number) {
      lenisRef.current?.lenis?.raf(time);
      rafId = requestAnimationFrame(update);
    }
    rafId = requestAnimationFrame(update);

    return () => {
      cancelAnimationFrame(rafId);
    };
  }, [prefersReducedMotion]);

  if (prefersReducedMotion) {
    return <>{children}</>;
  }

  return (
    <ReactLenis
      ref={lenisRef}
      root
      options={{
        autoRaf: false, // Handled by our dedicated requestAnimationFrame loop
        duration: 1.2,
        easing: (t: number) => Math.min(1, 1.001 - Math.pow(2, -10 * t)),
        orientation: "vertical",
        gestureOrientation: "vertical",
        smoothWheel: true,
        wheelMultiplier: 1.0,
        touchMultiplier: 1.5,
        syncTouch: false,
      }}
    >
      <AnchorHandler />
      {children}
    </ReactLenis>
  );
}
