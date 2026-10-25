"use client";

import { useEffect, useRef } from "react";

// Soft violet glow that drifts toward the pointer over the hero.
export default function HeroGlow() {
  const ref = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const el = ref.current;
    if (!el) return;
    let raf = 0;
    const target = { x: 70, y: 20 };
    const pos = { x: 70, y: 20 };
    const onMove = (event: PointerEvent) => {
      target.x = (event.clientX / window.innerWidth) * 100;
      target.y = (event.clientY / window.innerHeight) * 100;
    };
    const tick = () => {
      pos.x += (target.x - pos.x) * 0.06;
      pos.y += (target.y - pos.y) * 0.06;
      el.style.background = `radial-gradient(600px circle at ${pos.x}% ${pos.y}%, rgba(139, 92, 246, 0.14), transparent 70%)`;
      raf = requestAnimationFrame(tick);
    };
    window.addEventListener("pointermove", onMove);
    raf = requestAnimationFrame(tick);
    return () => {
      window.removeEventListener("pointermove", onMove);
      cancelAnimationFrame(raf);
    };
  }, []);

  return <div ref={ref} className="pointer-events-none absolute inset-0" />;
}
