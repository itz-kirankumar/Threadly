import Link from "next/link";
import ThreadlyLogo from "@/components/ThreadlyLogo";

export default function Footer(_props: { tone?: "dark" | "light" }) {
  return (
    <footer className="border-t border-white/[0.07] bg-[#08070c]">
      <div className="mx-auto flex max-w-6xl flex-col items-center justify-between gap-4 px-6 py-10 text-sm text-zinc-500 sm:flex-row">
        <p className="flex items-center gap-3"><ThreadlyLogo size={22} /> © {new Date().getFullYear()} Threadly. Private prospecting and AI visibility for B2B teams.</p>
        <div className="flex flex-wrap items-center justify-center gap-x-5 gap-y-2">
          <Link href="/pricing" className="transition hover:text-zinc-300">Pricing</Link>
          <Link href="/docs" className="transition hover:text-zinc-300">Docs</Link>
          <Link href="/blog" className="transition hover:text-zinc-300">Blog</Link>
          <Link href="/terms" className="transition hover:text-zinc-300">Terms</Link>
          <Link href="/privacy" className="transition hover:text-zinc-300">Privacy</Link>
          <Link href="/refund" className="transition hover:text-zinc-300">Refunds</Link>
          <Link href="/shipping" className="transition hover:text-zinc-300">Shipping</Link>
          <Link href="/security" className="transition hover:text-zinc-300">Security</Link>
          <Link href="/contact" className="transition hover:text-zinc-300">Contact</Link>
        </div>
      </div>
    </footer>
  );
}
