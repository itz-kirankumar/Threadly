import Link from "next/link";
import DeveloperMenu from "@/components/DeveloperMenu";
import ThreadlyLogo from "@/components/ThreadlyLogo";

// The public bar. `tone` stays for callers; every public page is the same
// black and gold now.
export default function Navbar(_props: { tone?: "dark" | "light" }) {
  return (
    <header className="sticky top-0 z-40 border-b border-white/[0.07] bg-[#08070c]/80 backdrop-blur-xl">
      <div className="mx-auto flex h-[4.5rem] max-w-6xl items-center justify-between px-6">
        <Link href="/" aria-label="Threadly home">
          <ThreadlyLogo size={32} wordmark />
        </Link>
        <nav className="flex items-center gap-6 text-sm">
          <Link href="/#how-it-works" className="hidden text-zinc-400 transition hover:text-[#f4efe6] md:inline">The method</Link>
          <Link href="/pricing" className="hidden text-zinc-400 transition hover:text-[#f4efe6] sm:inline">Pricing</Link>
          <Link href="/blog" className="hidden text-zinc-400 transition hover:text-[#f4efe6] md:inline">Journal</Link>
          <DeveloperMenu />
          <Link href="/portal" className="hidden text-zinc-400 transition hover:text-[#f4efe6] sm:inline">Member sign in</Link>
          <Link href="/#early-access" className="btn-gold whitespace-nowrap rounded-full px-4 py-2 text-[13px] font-semibold">
            Request an invitation
          </Link>
        </nav>
      </div>
    </header>
  );
}
