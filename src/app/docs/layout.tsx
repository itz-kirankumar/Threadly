import Link from "next/link";
import Navbar from "@/components/Navbar";
import DocsSearch from "@/components/docs/DocsSearch";
import DocsSidebar from "@/components/docs/DocsSidebar";
import { DOC_PAGES, DOC_SECTIONS } from "@/lib/docs/content";

export const metadata = {
  title: { default: "Threadly Docs", template: "%s - Threadly Docs" },
  description: "Guides and reference for the Threadly GEO intelligence platform.",
};

export default function DocsLayout({ children }: { children: React.ReactNode }) {
  const groups = DOC_SECTIONS.map((section) => ({
    section,
    pages: DOC_PAGES.filter((p) => p.section === section),
  }));
  return (
    <div className="flex min-h-screen flex-col bg-zinc-950 text-zinc-100">
      <Navbar />
      <div className="mx-auto flex w-full max-w-6xl flex-grow gap-10 px-6 py-10">
        <aside className="hidden w-60 shrink-0 md:block">
          <div className="sticky top-20">
            <DocsSearch />
            <DocsSidebar groups={groups} />
          </div>
        </aside>
        <main className="min-w-0 flex-1 pb-16">{children}</main>
        <nav className="fixed bottom-0 left-0 right-0 z-40 flex items-center justify-between border-t border-zinc-800 bg-zinc-950/95 px-4 py-2 md:hidden">
          <Link href="/docs/intro" className="text-sm text-zinc-400">Docs</Link>
          <DocsSearch />
        </nav>
      </div>
    </div>
  );
}
