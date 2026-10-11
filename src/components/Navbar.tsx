"use client";

import Link from "next/link";
import Image from "next/image";
import { ArrowRight } from "lucide-react";

export default function Navbar() {
  return (
    <header className="w-full fixed top-0 z-50 bg-white/90 backdrop-blur-md border-b border-gray-200/80 shadow-sm py-3 transition-all duration-300">
      <div className="container mx-auto px-4 sm:px-6 lg:px-12 flex items-center justify-between">
        
        {/* Logo */}
        <Link href="/" className="flex items-center gap-3">
          <div className="relative w-36 h-9 md:w-44 md:h-10 flex items-center overflow-hidden">
            <Image 
              src="/logo.png" 
              alt="Wisentry Logo" 
              fill
              className="object-contain object-left"
              priority
            />
          </div>
        </Link>

        {/* Nav Links */}
        <nav className="hidden lg:flex items-center gap-8 text-sm font-semibold text-gray-700">
          <Link href="/signal-radar" className="hover:text-brand-violet transition-colors">Signal Radar</Link>
          <Link href="/beta-collective" className="hover:text-brand-violet transition-colors">Beta Collective</Link>
          <Link href="/ai-engine" className="hover:text-brand-violet transition-colors">AI Engine</Link>
          <Link href="/playbook" className="hover:text-brand-violet transition-colors">Playbook</Link>
          <Link href="/case-studies" className="hover:text-brand-violet transition-colors">Case Studies</Link>
          <Link href="/about" className="hover:text-brand-violet transition-colors">About</Link>
        </nav>

        {/* Action CTA */}
        <div className="flex items-center gap-3">
          <Link 
            href="/#waitlist"
            className="btn-tactile-violet inline-flex items-center justify-center gap-2 px-5 py-2.5 sm:px-6 sm:py-3 rounded-full bg-brand-violet border-2 border-brand-violet text-white text-xs sm:text-sm font-extrabold tracking-wide cursor-pointer focus:outline-none"
          >
            <span>Let&apos;s grow</span>
            <ArrowRight className="w-4 h-4 text-brand-pastel" />
          </Link>
        </div>
      </div>
    </header>
  );
}
