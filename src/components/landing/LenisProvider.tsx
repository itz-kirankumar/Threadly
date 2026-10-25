"use client";

import { useEffect } from "react";
import Lenis from "lenis";

// Buttery inertial smooth scrolling for the landing page.
export default function LenisProvider() {
  useEffect(() => {
    const lenis = new Lenis({ autoRaf: true, lerp: 0.11 });
    return () => lenis.destroy();
  }, []);
  return null;
}
