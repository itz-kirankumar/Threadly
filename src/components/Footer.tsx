import Link from "next/link";

export default function Footer() {
  return (
    <footer className="border-t border-white/10">
      <div className="mx-auto flex max-w-6xl flex-col items-center justify-between gap-4 px-6 py-8 text-sm text-zinc-500 sm:flex-row">
        <p>© {new Date().getFullYear()} Threadly. Measure how AI answers talk about your brand.</p>
        <div className="flex gap-5">
          <Link href="/docs" className="transition hover:text-zinc-300">Docs</Link>
          <Link href="/terms" className="transition hover:text-zinc-300">Terms</Link>
          <Link href="/privacy" className="transition hover:text-zinc-300">Privacy</Link>
          <Link href="/security" className="transition hover:text-zinc-300">Security</Link>
        </div>
      </div>
    </footer>
  );
}
