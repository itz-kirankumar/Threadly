import Link from "next/link";
import Image from "next/image";
import DeveloperMenu from "@/components/DeveloperMenu";

// tone="light" is the landing page; other public pages use the dark bar.
export default function Navbar({ tone = "dark" }: { tone?: "dark" | "light" }) {
  if (tone === "light") {
    return (
      <header className="sticky top-0 z-40 border-b border-zinc-200/70 bg-[#f7f6f3]/80 backdrop-blur-md">
        <div className="mx-auto flex h-16 max-w-6xl items-center justify-between px-6">
          <Link href="/" className="flex items-center gap-2.5">
            <Image src="/threadly-mark.svg" alt="Threadly" width={26} height={26} />
            <span className="text-[17px] font-semibold tracking-tight text-zinc-900">Threadly</span>
          </Link>
          <nav className="flex items-center gap-6 text-sm">
            <Link href="/#how-it-works" className="hidden text-zinc-600 transition hover:text-zinc-900 sm:inline">How it works</Link>
            <Link href="/pricing" className="hidden text-zinc-600 transition hover:text-zinc-900 sm:inline">Pricing</Link>
            <Link href="/blog" className="hidden text-zinc-600 transition hover:text-zinc-900 md:inline">Blog</Link>
            <DeveloperMenu tone="light" />
            <Link href="/portal" className="hidden text-zinc-600 transition hover:text-zinc-900 sm:inline">Sign in</Link>
            <Link href="/#early-access" className="whitespace-nowrap rounded-full bg-gradient-to-r from-violet-600 to-fuchsia-600 px-4 py-1.5 text-[13px] font-semibold text-white shadow-[0_6px_18px_-8px_rgba(124,58,237,0.8)] transition hover:brightness-110">
              Check eligibility
            </Link>
          </nav>
        </div>
      </header>
    );
  }
  return (
    <header className="sticky top-0 z-40 border-b border-white/[0.06] bg-zinc-950/70 backdrop-blur-md">
      <div className="mx-auto flex h-16 max-w-6xl items-center justify-between px-6">
        <Link href="/" className="flex items-center gap-2.5">
          <Image src="/threadly-mark.svg" alt="Threadly" width={26} height={26} />
          <span className="text-[17px] font-semibold tracking-tight text-white">Threadly</span>
        </Link>
        <nav className="flex items-center gap-6 text-sm">
          <Link href="/#live-demo" className="hidden text-zinc-400 transition hover:text-white sm:inline">
            Live demo
          </Link>
          <Link href="/pricing" className="hidden text-zinc-400 transition hover:text-white sm:inline">
            Pricing
          </Link>
          <DeveloperMenu />
          <Link
            href="/#early-access"
            className="whitespace-nowrap rounded-full bg-white px-4 py-1.5 text-[13px] font-semibold text-zinc-950 transition hover:bg-zinc-200"
          >
            Request access
          </Link>
        </nav>
      </div>
    </header>
  );
}
