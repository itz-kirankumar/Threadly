"use client";

import { useEffect, useRef } from "react";
import { useLenis } from "lenis/react";

interface LenisMarqueeProps {
  items: string[];
  baseSpeed?: number;
  label?: string;
}

export default function LenisMarquee({
  items,
  baseSpeed = 1,
  label = "Plays well with",
}: LenisMarqueeProps) {
  const containerRef = useRef<HTMLDivElement>(null);
  const xPos = useRef(0);
  const currentSpeed = useRef(baseSpeed);
  const targetVelocity = useRef(0);
  const rafId = useRef<number | null>(null);

  // Hook into Lenis scroll velocity
  useLenis((lenis) => {
    // Lenis velocity is typically between -100 and 100
    targetVelocity.current = lenis.velocity * 0.25;
  });

  useEffect(() => {
    let active = true;

    const loop = () => {
      if (!active) return;

      // Smoothly blend scroll velocity into marquee speed
      const targetSpeed = baseSpeed + targetVelocity.current;
      currentSpeed.current += (targetSpeed - currentSpeed.current) * 0.08;
      // Decay target velocity back to zero
      targetVelocity.current *= 0.92;

      xPos.current -= currentSpeed.current;

      if (containerRef.current) {
        const halfWidth = containerRef.current.scrollWidth / 2;
        if (halfWidth > 0) {
          if (xPos.current <= -halfWidth) {
            xPos.current += halfWidth;
          } else if (xPos.current > 0) {
            xPos.current -= halfWidth;
          }
        }
        containerRef.current.style.transform = `translate3d(${xPos.current.toFixed(2)}px, 0, 0)`;
      }

      rafId.current = requestAnimationFrame(loop);
    };

    rafId.current = requestAnimationFrame(loop);

    return () => {
      active = false;
      if (rafId.current) cancelAnimationFrame(rafId.current);
    };
  }, [baseSpeed]);

  // Duplicate items for continuous seamless loop
  const displayItems = [...items, ...items, ...items, ...items];

  return (
    <section className="relative overflow-hidden border-y-2 border-brand-black bg-white py-4 select-none">
      <div className="flex items-center">
        {label && (
          <div className="z-10 shrink-0 bg-white px-5 sm:px-8 border-r-2 border-brand-black py-1">
            <span className="font-mono text-[9px] font-bold uppercase tracking-[0.16em] text-brand-orange whitespace-nowrap">
              {label}
            </span>
          </div>
        )}
        <div className="overflow-hidden whitespace-nowrap flex-1">
          <div
            ref={containerRef}
            className="inline-flex items-center gap-8 will-change-transform"
          >
            {displayItems.map((name, index) => (
              <span
                key={`${name}-${index}`}
                className="inline-flex items-center gap-8 text-[13px] font-extrabold text-brand-black transition-colors hover:text-brand-orange"
              >
                <span>{name}</span>
                <span className="h-1.5 w-1.5 rounded-full bg-brand-orange inline-block" />
              </span>
            ))}
          </div>
        </div>
      </div>
    </section>
  );
}
