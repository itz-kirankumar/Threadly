"use client";

import { useState } from "react";
import { useLenis } from "lenis/react";
import { ArrowUp } from "lucide-react";

export default function ScrollProgressIndicator() {
  const [progress, setProgress] = useState(0);
  const [velocity, setVelocity] = useState(0);
  const [visible, setVisible] = useState(false);

  const lenis = useLenis((lenisInstance) => {
    setProgress(lenisInstance.progress);
    setVelocity(Math.round(lenisInstance.velocity * 10) / 10);
    setVisible(lenisInstance.scroll > 200);
  });

  const scrollToTop = () => {
    if (lenis) {
      lenis.scrollTo(0, {
        duration: 1.4,
        easing: (t: number) => Math.min(1, 1.001 - Math.pow(2, -10 * t)),
      });
    } else {
      window.scrollTo({ top: 0, behavior: "smooth" });
    }
  };

  const percentage = Math.min(100, Math.max(0, Math.round(progress * 100)));

  return (
    <>
      {/* Top glowing progress bar */}
      <div
        className="fixed top-0 left-0 right-0 h-[3px] z-[60] pointer-events-none origin-left transition-transform duration-75"
        style={{
          transform: `scaleX(${progress})`,
          background: "linear-gradient(90deg, #ff4500 0%, #7c3aed 50%, #ff4500 100%)",
          boxShadow: "0 0 10px rgba(255, 69, 0, 0.5), 0 0 5px rgba(124, 58, 237, 0.4)",
        }}
        aria-hidden="true"
      />

      {/* Floating interactive Lenis HUD and Back-to-Top button */}
      <div
        className={`fixed bottom-6 right-6 z-40 transition-all duration-300 ${
          visible ? "opacity-100 translate-y-0 pointer-events-auto" : "opacity-0 translate-y-4 pointer-events-none"
        }`}
      >
        <button
          type="button"
          onClick={scrollToTop}
          aria-label="Scroll to top"
          title="Scroll smoothly to top"
          className="group flex items-center gap-2 rounded-full border-2 border-brand-black bg-white px-3.5 py-2 shadow-[4px_4px_0_#0a0a0a] transition-all hover:-translate-y-0.5 hover:shadow-[5px_5px_0_#ff4500] active:translate-y-0.5 active:shadow-[2px_2px_0_#0a0a0a]"
        >
          <div className="flex items-center gap-1.5 font-mono text-[10px] font-bold text-brand-black">
            <span
              className="inline-block h-2 w-2 rounded-full transition-transform"
              style={{
                backgroundColor: Math.abs(velocity) > 2 ? "#ff4500" : "#7c3aed",
                transform: `scale(${1 + Math.min(Math.abs(velocity) * 0.05, 0.6)})`,
              }}
            />
            <span className="w-7 text-right">{percentage}%</span>
          </div>

          <div className="flex h-5 w-5 items-center justify-center rounded-full bg-brand-paper transition-transform group-hover:-translate-y-0.5">
            <ArrowUp className="h-3 w-3 text-brand-black group-hover:text-brand-orange transition-colors" />
          </div>
        </button>
      </div>
    </>
  );
}
