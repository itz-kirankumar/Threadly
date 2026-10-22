"use client";

import { useEffect, useRef, type ReactNode } from "react";
import { useLenis } from "lenis/react";

interface LenisParallaxProps {
  children?: ReactNode;
  speed?: number; // e.g. 0.2 for slower move, -0.2 for faster move
  velocityTilt?: boolean; // tilt with scroll velocity
  className?: string;
  style?: React.CSSProperties;
  "aria-hidden"?: boolean | "true" | "false";
}

export default function LenisParallax({
  children,
  speed = 0.1,
  velocityTilt = false,
  className = "",
  style = {},
  "aria-hidden": ariaHidden,
}: LenisParallaxProps) {
  const containerRef = useRef<HTMLDivElement>(null);
  const targetOffset = useRef(0);
  const targetTilt = useRef(0);
  const currentOffset = useRef(0);
  const currentTilt = useRef(0);
  const rafId = useRef<number | null>(null);

  useLenis((lenis) => {
    if (!containerRef.current) return;

    const rect = containerRef.current.getBoundingClientRect();
    const windowHeight = window.innerHeight;

    // Check if element is within or near viewport
    if (rect.bottom >= -200 && rect.top <= windowHeight + 200) {
      // Calculate progress relative to window center (-1 to 1)
      const elementCenter = rect.top + rect.height / 2;
      const windowCenter = windowHeight / 2;
      const distance = elementCenter - windowCenter;

      targetOffset.current = distance * speed;

      if (velocityTilt) {
        // Clamp velocity tilt between -6 and 6 degrees
        const rawTilt = lenis.velocity * 0.12;
        targetTilt.current = Math.max(-6, Math.min(6, rawTilt));
      }
    }
  });

  useEffect(() => {
    let active = true;

    const updateLoop = () => {
      if (!active) return;

      // Smooth interpolation for inertia feel
      currentOffset.current += (targetOffset.current - currentOffset.current) * 0.12;
      if (velocityTilt) {
        currentTilt.current += (targetTilt.current - currentTilt.current) * 0.1;
      }

      if (containerRef.current) {
        let transformStr = `translate3d(0, ${currentOffset.current.toFixed(2)}px, 0)`;
        if (velocityTilt) {
          transformStr += ` rotateX(${(-currentTilt.current).toFixed(2)}deg)`;
        }
        containerRef.current.style.transform = transformStr;
      }

      rafId.current = requestAnimationFrame(updateLoop);
    };

    rafId.current = requestAnimationFrame(updateLoop);

    return () => {
      active = false;
      if (rafId.current) cancelAnimationFrame(rafId.current);
    };
  }, [velocityTilt]);

  return (
    <div
      ref={containerRef}
      aria-hidden={ariaHidden}
      className={`will-change-transform ${className}`}
      style={{
        ...style,
        transformStyle: velocityTilt ? "preserve-3d" : undefined,
      }}
    >
      {children}
    </div>
  );
}
