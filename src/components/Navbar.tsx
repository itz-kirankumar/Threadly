import Link from "next/link";
import Image from "next/image";

export default function Navbar() {
  return (
    <header className="sticky top-0 z-40 border-b border-white/[0.06] bg-zinc-950/70 backdrop-blur-md">
      <div className="mx-auto flex h-16 max-w-6xl items-center justify-between px-6">
        <Link href="/" className="flex items-center gap-2.5">
          <Image src="/threadly-mark.svg" alt="Threadly" width={26} height={26} />
          <span className="text-[17px] font-semibold tracking-tight text-white">Threadly</span>
        </Link>
        <nav className="flex items-center gap-6 text-sm">
          <Link href="/demo" className="hidden text-zinc-400 transition hover:text-white sm:inline">
            Live demo
          </Link>
          <Link href="/pricing" className="hidden text-zinc-400 transition hover:text-white sm:inline">
            Pricing
          </Link>
          <Link href="/docs" className="hidden text-zinc-400 transition hover:text-white sm:inline">
            Docs
          </Link>
          <Link href="/portal" className="hidden text-zinc-400 transition hover:text-white sm:inline">
            Log in
          </Link>
          <Link
            href="/portal"
            className="rounded-full bg-white px-4 py-1.5 text-[13px] font-semibold text-zinc-950 transition hover:bg-zinc-200"
          >
            Get started
          </Link>
        </nav>
      </div>
    </header>
  );
}
