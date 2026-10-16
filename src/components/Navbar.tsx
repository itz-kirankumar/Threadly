"use client";

import Link from "next/link";
import { useEffect, useState } from "react";
import { ArrowRight, Menu, X } from "lucide-react";
import Image from "next/image";

const links = [
  { href: "/#platform", label: "Platform" },
  { href: "/#modules", label: "Modules" },
  { href: "/signal-radar", label: "Signal Radar" },
  { href: "/case-studies", label: "Stories" },
  { href: "/about", label: "About" },
];

export default function Navbar() {
  const [scrolled, setScrolled] = useState(false);
  const [open, setOpen] = useState(false);

  useEffect(() => {
    const onScroll = () => setScrolled(window.scrollY > 12);
    onScroll();
    window.addEventListener("scroll", onScroll, { passive: true });
    return () => window.removeEventListener("scroll", onScroll);
  }, []);

  return (
    <header
      className={`fixed inset-x-0 top-0 z-50 transition-all duration-300 ${
        scrolled
          ? "border-b-2 border-brand-black bg-brand-paper/95 backdrop-blur-md"
          : "border-b-2 border-transparent bg-transparent"
      }`}
    >
      <div className="mx-auto flex h-[76px] w-full max-w-[1240px] items-center justify-between px-5 lg:px-8">
        <Link href="/" className="flex items-center gap-3" aria-label="Threadly home">
          <Image
            src="/threadly-mark.svg"
            alt=""
            width={34}
            height={34}
            priority
            className="h-[34px] w-[34px]"
          />
          <span className="text-[26px] font-black tracking-[-0.05em] leading-none">
            threadly<span className="text-brand-orange">.</span>
          </span>
        </Link>

        <nav className="hidden items-center gap-1 lg:flex" aria-label="Main navigation">
          {links.map((link) => (
            <Link
              key={link.label}
              href={link.href}
              className="rounded-full px-4 py-2 text-[13px] font-bold text-brand-muted transition-colors hover:bg-white hover:text-brand-black"
            >
              {link.label}
            </Link>
          ))}
        </nav>

        <div className="flex items-center gap-2.5">
          <Link
            href="/portal/login"
            className="hidden rounded-full border-2 border-brand-black px-4 py-2.5 text-[12px] font-extrabold transition-all hover:bg-white sm:inline-flex"
          >
            Sign in
          </Link>
          <Link
            href="/portal?demo=true"
            className="btn-tactile-orange inline-flex items-center gap-2 rounded-full border-2 border-brand-orange bg-brand-orange px-4 py-2.5 text-[12px] font-extrabold text-white sm:px-5"
          >
            <span>Open workspace</span>
            <ArrowRight className="h-4 w-4" />
          </Link>
          <button
            type="button"
            className="grid h-10 w-10 place-items-center rounded-full border-2 border-brand-black lg:hidden"
            aria-label={open ? "Close menu" : "Open menu"}
            aria-expanded={open}
            onClick={() => setOpen((v) => !v)}
          >
            {open ? <X className="h-5 w-5" /> : <Menu className="h-5 w-5" />}
          </button>
        </div>
      </div>

      {open && (
        <div className="border-t-2 border-brand-black bg-brand-paper px-5 py-4 lg:hidden">
          <nav className="grid gap-1" aria-label="Mobile navigation">
            {links.map((link) => (
              <Link
                key={link.label}
                href={link.href}
                onClick={() => setOpen(false)}
                className="rounded-xl px-3 py-3 text-sm font-bold hover:bg-white"
              >
                {link.label}
              </Link>
            ))}
            <Link
              href="/portal/login"
              onClick={() => setOpen(false)}
              className="rounded-xl px-3 py-3 text-sm font-bold text-brand-orange hover:bg-white"
            >
              Sign in
            </Link>
          </nav>
        </div>
      )}
    </header>
  );
}
