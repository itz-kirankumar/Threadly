import Link from "next/link";

const columns = [
  {
    title: "Platform",
    links: [
      { href: "/portal?demo=true", label: "Workspace" },
      { href: "/signal-radar", label: "Signal Radar" },
      { href: "/ai-engine", label: "AI Engine" },
      { href: "/beta-collective", label: "Beta Collective" },
    ],
  },
  {
    title: "Growth",
    links: [
      { href: "/playbook", label: "Playbook" },
      { href: "/case-studies", label: "Case Studies" },
      { href: "/mission", label: "Mission" },
      { href: "/careers", label: "Careers" },
    ],
  },
  {
    title: "Company",
    links: [
      { href: "/about", label: "About Threadly" },
      { href: "/security", label: "Security" },
      { href: "/privacy", label: "Privacy" },
      { href: "/terms", label: "Terms" },
    ],
  },
];

export default function Footer() {
  return (
    <footer className="relative overflow-hidden border-t-2 border-brand-black bg-brand-black text-white">
      <div className="ink-grid pointer-events-none absolute inset-0 opacity-70" aria-hidden />

      <div className="relative mx-auto w-full max-w-[1240px] px-5 pb-10 pt-16 lg:px-8">
        <div className="grid gap-12 lg:grid-cols-[1.3fr_2fr]">
          <div>
            <div className="flex items-center gap-3">
              <span className="grid h-10 w-10 place-items-center rounded-xl bg-white text-brand-black">
                <svg viewBox="0 0 64 64" className="h-6 w-6" aria-hidden>
                  <path
                    d="M22 15c8.4 0 15.2 6.8 15.2 15.2S30.4 45.4 22 45.4"
                    fill="none"
                    stroke="#ff4500"
                    strokeWidth="7"
                    strokeLinecap="round"
                  />
                  <path
                    d="M42 49c-8.4 0-15.2-6.8-15.2-15.2S33.6 18.6 42 18.6"
                    fill="none"
                    stroke="#7c3aed"
                    strokeWidth="7"
                    strokeLinecap="round"
                  />
                </svg>
              </span>
              <span className="text-[26px] font-black tracking-[-0.05em]">
                threadly<span className="text-brand-orange">.</span>
              </span>
            </div>
            <p className="mt-5 max-w-sm text-sm leading-relaxed text-white/60">
              The growth operating system. Find the people already talking about
              the problem you solve, reach them like a human, and compound every
              channel — search, social and AI answers.
            </p>
            <div className="mt-6 flex flex-wrap gap-2">
              {["Leads", "Outreach", "Campaigns", "Scheduling", "Analytics", "GEO"].map((tag) => (
                <span
                  key={tag}
                  className="rounded-full border border-white/15 px-3 py-1.5 font-mono text-[10px] font-bold uppercase tracking-[0.1em] text-white/70"
                >
                  {tag}
                </span>
              ))}
            </div>
          </div>

          <div className="grid grid-cols-2 gap-8 sm:grid-cols-3">
            {columns.map((column) => (
              <div key={column.title}>
                <h4 className="font-mono text-[10px] font-bold uppercase tracking-[0.16em] text-brand-orange">
                  {column.title}
                </h4>
                <ul className="mt-4 space-y-2.5">
                  {column.links.map((link) => (
                    <li key={link.label}>
                      <Link
                        href={link.href}
                        className="text-[13px] font-semibold text-white/70 transition-colors hover:text-white"
                      >
                        {link.label}
                      </Link>
                    </li>
                  ))}
                </ul>
              </div>
            ))}
          </div>
        </div>

        <div className="my-12 select-none overflow-hidden">
          <div
            aria-hidden
            className="whitespace-nowrap text-center text-[clamp(64px,17vw,220px)] font-black uppercase leading-[0.82] tracking-[-0.065em] text-transparent"
            style={{
              WebkitTextStroke: "2px rgba(255,255,255,0.16)",
            }}
          >
            threadly
          </div>
        </div>

        <div className="flex flex-col gap-4 border-t border-white/12 pt-6 text-[11px] text-white/45 sm:flex-row sm:items-center sm:justify-between">
          <span>© {new Date().getFullYear()} Threadly Inc. All rights reserved.</span>
          <div className="flex items-center gap-5">
            <a
              href="https://discord.gg/xTeuQ9yE4"
              target="_blank"
              rel="noopener noreferrer"
              className="font-bold text-white/70 transition-colors hover:text-brand-orange"
            >
              Community
            </a>
            <span className="font-mono uppercase tracking-[0.1em]">
              Built for founders who ship
            </span>
          </div>
        </div>
      </div>
    </footer>
  );
}
