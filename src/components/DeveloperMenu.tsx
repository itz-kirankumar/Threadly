"use client";

import Link from "next/link";
import { useEffect, useRef, useState } from "react";

type DevLink = { label: string; href: string; external?: boolean; note?: string };
type DevGroup = { title: string; tint: string; icon: "code" | "box" | "book"; links: DevLink[] };

const GROUPS: DevGroup[] = [
  {
    title: "Docs & API",
    tint: "bg-blue-500/15 text-blue-400",
    icon: "code",
    links: [
      { label: "Documentation", href: "/docs" },
      { label: "Quickstart", href: "/docs/quickstart" },
      { label: "Public API", href: "/docs/public-api", note: "GET /api/v1/summary" },
      { label: "Connect your own AI keys", href: "/docs/own-api-keys" },
    ],
  },
  {
    title: "Libraries",
    tint: "bg-violet-500/15 text-violet-400",
    icon: "box",
    links: [
      { label: "npm: threadly-geo", href: "https://www.npmjs.com/package/threadly-geo", external: true, note: "GEO scanner library" },
      { label: "GitHub repository", href: "https://github.com/itz-kirankumar/Threadly", external: true },
    ],
  },
  {
    title: "Resources",
    tint: "bg-emerald-500/15 text-emerald-400",
    icon: "book",
    links: [
      { label: "Live demo", href: "/#live-demo" },
      { label: "Blog", href: "/blog" },
      { label: "llms.txt", href: "/llms.txt", note: "for AI assistants" },
    ],
  },
];

function GroupIcon({ icon }: { icon: DevGroup["icon"] }) {
  const cls = "h-4 w-4";
  if (icon === "code")
    return (
      <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" className={cls} aria-hidden="true">
        <path d="m8 6-6 6 6 6M16 6l6 6-6 6" strokeLinecap="round" strokeLinejoin="round" />
      </svg>
    );
  if (icon === "box")
    return (
      <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" className={cls} aria-hidden="true">
        <path d="M21 8 12 3 3 8v8l9 5 9-5V8ZM3 8l9 5 9-5M12 13v8" strokeLinecap="round" strokeLinejoin="round" />
      </svg>
    );
  return (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" className={cls} aria-hidden="true">
      <path d="M4 19.5A2.5 2.5 0 0 1 6.5 17H20V4H6.5A2.5 2.5 0 0 0 4 6.5v13Z" strokeLinecap="round" strokeLinejoin="round" />
      <path d="M4 19.5A2.5 2.5 0 0 0 6.5 22H20v-5" strokeLinecap="round" strokeLinejoin="round" />
    </svg>
  );
}

export default function DeveloperMenu() {
  const [open, setOpen] = useState(false);
  const rootRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!open) return;
    const onPointer = (event: PointerEvent) => {
      if (rootRef.current && !rootRef.current.contains(event.target as Node)) setOpen(false);
    };
    const onKey = (event: KeyboardEvent) => {
      if (event.key === "Escape") setOpen(false);
    };
    document.addEventListener("pointerdown", onPointer);
    document.addEventListener("keydown", onKey);
    return () => {
      document.removeEventListener("pointerdown", onPointer);
      document.removeEventListener("keydown", onKey);
    };
  }, [open]);

  return (
    <div ref={rootRef} className="relative">
      <button
        type="button"
        aria-haspopup="menu"
        aria-expanded={open}
        onClick={() => setOpen((v) => !v)}
        className={`flex items-center gap-1.5 rounded-full border px-3.5 py-1.5 text-[13px] font-medium transition ${
          open
            ? "border-white/25 bg-white/10 text-white"
            : "border-white/10 bg-white/[0.04] text-zinc-300 hover:border-white/20 hover:text-white"
        }`}
      >
        Developer
        <svg
          viewBox="0 0 24 24"
          fill="none"
          stroke="currentColor"
          strokeWidth="2"
          className={`h-3.5 w-3.5 transition-transform ${open ? "rotate-180" : ""}`}
          aria-hidden="true"
        >
          <path d="m6 9 6 6 6-6" strokeLinecap="round" strokeLinejoin="round" />
        </svg>
      </button>
      {open && (
        <div
          role="menu"
          className="fixed inset-x-3 top-[4.25rem] z-50 max-h-[75vh] overflow-y-auto rounded-2xl border border-white/10 bg-zinc-950 p-5 shadow-2xl shadow-black/60 sm:absolute sm:inset-x-auto sm:right-0 sm:top-full sm:mt-2 sm:w-[44rem] sm:max-w-[calc(100vw-3rem)]"
        >
          <div className="grid gap-6 sm:grid-cols-3">
            {GROUPS.map((group) => (
              <div key={group.title}>
                <div className="flex items-center gap-2.5 rounded-lg bg-white/[0.04] px-3 py-2">
                  <span className={`flex h-7 w-7 items-center justify-center rounded-md ${group.tint}`}>
                    <GroupIcon icon={group.icon} />
                  </span>
                  <span className="text-[13px] font-semibold text-white">{group.title}</span>
                </div>
                <ul className="mt-2 space-y-0.5">
                  {group.links.map((link) => (
                    <li key={link.label}>
                      <Link
                        href={link.href}
                        role="menuitem"
                        onClick={() => setOpen(false)}
                        {...(link.external ? { target: "_blank", rel: "noopener noreferrer" } : {})}
                        className="block rounded-md px-3 py-2 text-[13px] text-zinc-400 transition hover:bg-white/[0.06] hover:text-white"
                      >
                        <span className="block leading-snug">
                          {link.label}
                          {link.external && <span className="ml-1 text-zinc-600" aria-hidden="true">&#8599;</span>}
                        </span>
                        {link.note && <span className="mt-0.5 block text-[11px] leading-snug text-zinc-600">{link.note}</span>}
                      </Link>
                    </li>
                  ))}
                </ul>
              </div>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}
