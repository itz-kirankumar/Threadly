"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { DocPage } from "@/lib/docs/content";

interface Props {
  groups: { section: string; pages: DocPage[] }[];
}

export default function DocsSidebar({ groups }: Props) {
  const pathname = usePathname();
  return (
    <nav className="mt-5 space-y-6">
      {groups.map((group) => (
        <div key={group.section}>
          <p className="mb-2 text-[11px] font-semibold uppercase tracking-widest text-zinc-500">{group.section}</p>
          <ul className="space-y-0.5 border-l border-zinc-800">
            {group.pages.map((page) => {
              const href = `/docs/${page.slug}`;
              const current = pathname === href;
              return (
                <li key={page.slug}>
                  <Link
                    href={href}
                    className={`-ml-px block border-l-2 py-1.5 pl-3 text-sm transition ${
                      current
                        ? "border-emerald-400 font-medium text-emerald-300"
                        : "border-transparent text-zinc-400 hover:border-zinc-600 hover:text-zinc-200"
                    }`}
                  >
                    {page.title}
                  </Link>
                </li>
              );
            })}
          </ul>
        </div>
      ))}
    </nav>
  );
}
