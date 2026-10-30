"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { useEffect, useState } from "react";
import ThreadlyLogo from "@/components/ThreadlyLogo";

const LINKS = [
  { label: "Product", id: "product" },
  { label: "How it works", id: "how-it-works" },
  { label: "AI Visibility", id: "ai-visibility" },
  { label: "Developers", id: "developers" },
  { label: "Pricing", id: "pricing" },
];

// Transparent over the hero, blurred once the page scrolls. On the landing
// page the link for the section in view is marked active.
export default function Navbar(_props: { tone?: "dark" | "light" }) {
  const home = usePathname() === "/";
  const [scrolled, setScrolled] = useState(false);
  const [active, setActive] = useState("");
  const [open, setOpen] = useState(false);

  useEffect(() => {
    const onScroll = () => setScrolled(window.scrollY > 12);
    onScroll();
    window.addEventListener("scroll", onScroll, { passive: true });
    return () => window.removeEventListener("scroll", onScroll);
  }, []);

  useEffect(() => {
    if (!home) return;
    const observer = new IntersectionObserver(
      (entries) => {
        for (const entry of entries) {
          if (entry.isIntersecting) setActive(entry.target.id);
          else setActive((current) => (current === entry.target.id ? "" : current));
        }
      },
      { rootMargin: "-45% 0px -50% 0px" },
    );
    for (const link of LINKS) {
      const section = document.getElementById(link.id);
      if (section) observer.observe(section);
    }
    return () => observer.disconnect();
  }, [home]);

  const solid = scrolled || open || !home;
  return (
    <header className={`sticky top-0 z-40 border-b transition-colors duration-300 ${home ? "-mb-[4.5rem]" : ""} ${solid ? "border-white/[0.08] bg-[#08070B]/90 backdrop-blur-xl" : "border-transparent bg-transparent"}`}>
      <div className="mx-auto flex h-[4.5rem] max-w-6xl items-center justify-between gap-6 px-6">
        <Link href="/" aria-label="Threadly home" className="shrink-0">
          <ThreadlyLogo size={30} wordmark />
        </Link>
        <nav aria-label="Primary" className="hidden items-center gap-1 lg:flex">
          {LINKS.map((link) => (
            <Link
              key={link.id}
              href={`/#${link.id}`}
              aria-current={active === link.id ? "true" : undefined}
              className={`rounded-full px-3.5 py-1.5 text-[13px] transition-colors duration-200 ${active === link.id ? "bg-white/[0.07] text-[#F5F0E8]" : "text-[#A7A0AE] hover:text-[#F5F0E8]"}`}
            >
              {link.label}
            </Link>
          ))}
        </nav>
        <div className="flex items-center gap-2">
          <Link href="/portal" className="hidden px-3 py-1.5 text-[13px] text-[#A7A0AE] transition-colors hover:text-[#F5F0E8] sm:inline">Sign in</Link>
          <Link href="/#early-access" className="btn-gold whitespace-nowrap rounded-full px-4 py-2 text-[13px] font-medium">Request an invitation</Link>
          <button
            type="button"
            aria-label={open ? "Close menu" : "Open menu"}
            aria-expanded={open}
            aria-controls="mobile-nav"
            onClick={() => setOpen((v) => !v)}
            className="flex h-9 w-9 items-center justify-center rounded-full text-[#F5F0E8] hover:bg-white/[0.07] lg:hidden"
          >
            <svg viewBox="0 0 24 24" className="h-5 w-5" fill="none" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" aria-hidden>
              {open ? <path d="M6 6l12 12M18 6 6 18" /> : <path d="M4 8h16M4 16h16" />}
            </svg>
          </button>
        </div>
      </div>
      {open && (
        <nav id="mobile-nav" aria-label="Mobile" className="border-t border-white/[0.08] px-6 py-3 lg:hidden">
          {LINKS.map((link) => (
            <Link key={link.id} href={`/#${link.id}`} onClick={() => setOpen(false)} className="block py-3 text-[15px] text-[#F5F0E8]">{link.label}</Link>
          ))}
          <Link href="/portal" onClick={() => setOpen(false)} className="block py-3 text-[15px] text-[#A7A0AE]">Sign in</Link>
        </nav>
      )}
    </header>
  );
}
