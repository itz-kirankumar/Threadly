import Link from "next/link";
import Image from "next/image";

export default function Navbar() {
  return (
    <header className="sticky top-0 z-40 border-b border-white/10 bg-zinc-950/80 backdrop-blur">
      <div className="mx-auto flex h-16 max-w-6xl items-center justify-between px-6">
        <Link href="/" className="flex items-center gap-2.5">
          <Image src="/threadly-mark.svg" alt="Threadly" width={28} height={28} />
          <span className="text-lg font-semibold tracking-tight text-white">Threadly</span>
          <span className="rounded-full border border-violet-400/40 bg-violet-500/10 px-2 py-0.5 text-[11px] font-medium text-violet-300">
            GEO Intelligence
          </span>
        </Link>
        <nav className="flex items-center gap-5 text-sm">
          <Link href="/demo" className="text-zinc-400 transition hover:text-white">
            Live demo
          </Link>
          <Link
            href="/portal"
            className="rounded-lg bg-violet-500 px-4 py-2 font-semibold text-white transition hover:bg-violet-400"
          >
            Open workspace
          </Link>
        </nav>
      </div>
    </header>
  );
}
