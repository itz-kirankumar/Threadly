"use client";

import { useEffect, useRef } from "react";

// Thin threads with small squares running along them. `sides` draws threads
// from both page edges into the `target` element; `fan` spreads them below
// it. Dots speed up as the cursor nears the target, on focus and typing, and
// fastest while a search runs (data-running on the target). Animation stops
// offscreen, and draws one still frame for reduced motion.

interface Curve { p0: [number, number]; c1: [number, number]; c2: [number, number]; p3: [number, number] }
interface Dot { curve: number; t: number; speed: number; accent: boolean }

function at(c: Curve, t: number): [number, number] {
  const u = 1 - t;
  const f = (i: 0 | 1) => u * u * u * c.p0[i] + 3 * u * u * t * c.c1[i] + 3 * u * t * t * c.c2[i] + t * t * t * c.p3[i];
  return [f(0), f(1)];
}

function sideCurves(w: number, h: number, box: DOMRect, origin: DOMRect): Curve[] {
  const y = box.top - origin.top + box.height / 2;
  const left = box.left - origin.left;
  const right = box.right - origin.left;
  const curves: Curve[] = [];
  const count = 7;
  for (let i = 0; i < count; i++) {
    const startY = (h * (i + 0.5)) / count;
    const endY = y + (i - (count - 1) / 2) * 3;
    const lx = left * 0.55;
    const rx = right + (w - right) * 0.45;
    curves.push({ p0: [0, startY], c1: [lx, startY], c2: [lx, endY], p3: [left, endY] });
    curves.push({ p0: [w, startY], c1: [rx, startY], c2: [rx, endY], p3: [right, endY] });
  }
  return curves;
}

function fanCurves(w: number, h: number, box: DOMRect, origin: DOMRect): Curve[] {
  const x = box.left - origin.left + box.width / 2;
  const top = box.bottom - origin.top;
  const curves: Curve[] = [];
  const count = 13;
  for (let i = 0; i < count; i++) {
    const n = i / (count - 1) - 0.5;
    const sx = w / 2 + n * w * 1.25;
    curves.push({ p0: [sx, h], c1: [x + n * w * 0.5, h * 0.82], c2: [x + n * 180, top + 90], p3: [x + n * 190, top] });
  }
  return curves;
}

export default function ThreadLines({ mode, target, className = "" }: { mode: "sides" | "fan"; target: string; className?: string }) {
  const ref = useRef<HTMLCanvasElement>(null);

  useEffect(() => {
    const canvas = ref.current;
    const ctx = canvas?.getContext("2d");
    if (!canvas || !ctx) return;
    const still = window.matchMedia("(prefers-reduced-motion: reduce)").matches;
    let curves: Curve[] = [];
    let dots: Dot[] = [];
    let frame = 0;
    let visible = true;
    let last = 0;
    let boost = 1;
    let pointer: { x: number; y: number } | null = null;
    const onPointer = (e: PointerEvent) => { pointer = { x: e.clientX, y: e.clientY }; };
    const onInput = () => { boost = Math.max(boost, 6); };
    const element = document.querySelector<HTMLElement>(target);
    window.addEventListener("pointermove", onPointer, { passive: true });
    element?.addEventListener("input", onInput);

    const desiredBoost = () => {
      if (!element) return 1;
      if (element.dataset.running === "true") return 8;
      let want = 1;
      if (pointer) {
        const box = element.getBoundingClientRect();
        const dx = Math.max(box.left - pointer.x, 0, pointer.x - box.right);
        const dy = Math.max(box.top - pointer.y, 0, pointer.y - box.bottom);
        want = 1 + 2.5 * Math.max(0, 1 - Math.hypot(dx, dy) / 420);
      }
      return element.matches(":focus-within") ? Math.max(want, 4) : want;
    };

    const layout = () => {
      const box = document.querySelector(target)?.getBoundingClientRect();
      const origin = canvas.getBoundingClientRect();
      const ratio = Math.min(window.devicePixelRatio || 1, 2);
      canvas.width = origin.width * ratio;
      canvas.height = origin.height * ratio;
      ctx.setTransform(ratio, 0, 0, ratio, 0, 0);
      if (!box) return;
      curves = mode === "sides" ? sideCurves(origin.width, origin.height, box, origin) : fanCurves(origin.width, origin.height, box, origin);
      dots = curves.flatMap((_, curve) => Array.from({ length: 3 }, (_v, i) => ({
        curve,
        t: (i / 3 + curve * 0.137) % 1,
        speed: 0.05 + ((curve * 7 + i * 3) % 5) * 0.012,
        accent: (curve + i * 2) % 5 === 0,
      })));
    };

    const draw = (now: number) => {
      const { width, height } = canvas.getBoundingClientRect();
      const dt = last ? Math.min((now - last) / 1000, 0.05) : 0;
      last = now;
      boost += (desiredBoost() - boost) * 0.06;
      ctx.clearRect(0, 0, width, height);
      ctx.strokeStyle = `rgba(17, 17, 20, ${Math.min(0.2, 0.07 + boost * 0.012)})`;
      ctx.lineWidth = 1;
      for (const c of curves) {
        ctx.beginPath();
        ctx.moveTo(...c.p0);
        ctx.bezierCurveTo(...c.c1, ...c.c2, ...c.p3);
        ctx.stroke();
      }
      for (const d of dots) {
        if (!still) d.t = (d.t + d.speed * boost * dt) % 1;
        const [x, y] = at(curves[d.curve], d.t);
        ctx.globalAlpha = Math.min(1, d.t * 8, (1 - d.t) * 8);
        ctx.fillStyle = d.accent ? "#5B3DF5" : "#B9B7BD";
        ctx.fillRect(x - 2, y - 2, 4, 4);
      }
      ctx.globalAlpha = 1;
      if (!still && visible) frame = requestAnimationFrame(draw);
    };

    layout();
    const resize = new ResizeObserver(() => { layout(); if (still) draw(0); });
    resize.observe(canvas);
    const seen = new IntersectionObserver(([entry]) => {
      const was = visible;
      visible = entry.isIntersecting;
      if (visible && !was) { last = 0; frame = requestAnimationFrame(draw); }
    });
    seen.observe(canvas);
    frame = requestAnimationFrame(draw);
    return () => {
      cancelAnimationFrame(frame);
      window.removeEventListener("pointermove", onPointer);
      element?.removeEventListener("input", onInput);
      resize.disconnect();
      seen.disconnect();
    };
  }, [mode, target]);

  return <canvas ref={ref} aria-hidden className={`pointer-events-none absolute inset-0 h-full w-full ${className}`} />;
}
