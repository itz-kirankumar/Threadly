import Link from "next/link";

export default function Footer({ tone = "dark" }: { tone?: "dark" | "light" }) {
  const light = tone === "light";
  return (
    <footer className={light ? "border-t border-zinc-200 bg-[#f7f6f3]" : "border-t border-white/10"}>
      <div className={`mx-auto flex max-w-6xl flex-col items-center justify-between gap-4 px-6 py-8 text-sm sm:flex-row ${light ? "text-zinc-600 [&_a:hover]:text-zinc-900" : "text-zinc-500"}`}>
        <p>© {new Date().getFullYear()} Threadly. Prospecting and AI visibility for B2B teams.</p>
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
