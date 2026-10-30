import Link from "next/link";
import ThreadlyLogo from "@/components/ThreadlyLogo";

const COLUMNS = [
  { title: "Product", links: [["Overview", "/#product"], ["How it works", "/#how-it-works"], ["AI Visibility", "/#ai-visibility"], ["Pricing", "/pricing"]] },
  { title: "Developers", links: [["Developer overview", "/developers"], ["Documentation", "/docs"], ["Public API", "/docs/public-api"], ["Blog", "/blog"]] },
  { title: "Company", links: [["Terms", "/terms"], ["Privacy", "/privacy"], ["Refunds", "/refund"], ["Security", "/security"], ["Contact", "/contact"]] },
];

export default function Footer(_props: { tone?: "dark" | "light" }) {
  return (
    <footer className="border-t border-black/[0.08] bg-[#F6F5F2]">
      <div className="mx-auto grid max-w-6xl gap-10 px-6 py-14 sm:grid-cols-2 lg:grid-cols-[1.6fr_1fr_1fr_1fr]">
        <div>
          <ThreadlyLogo size={28} wordmark />
          <p className="mt-4 max-w-xs text-sm leading-relaxed text-[#6B6A72]">A private intelligence desk for B2B teams: market research, prospecting and AI visibility.</p>
        </div>
        {COLUMNS.map((column) => (
          <div key={column.title}>
            <p className="text-[11px] uppercase tracking-[0.18em] text-[#6B6A72]">{column.title}</p>
            <ul className="mt-4 space-y-2.5 text-sm">
              {column.links.map(([label, href]) => (
                <li key={href}><Link href={href} className="text-[#111114]/85 transition-colors hover:text-[#5B3DF5]">{label}</Link></li>
              ))}
            </ul>
          </div>
        ))}
      </div>
      <p className="mx-auto max-w-6xl border-t border-black/[0.08] px-6 py-6 text-xs text-[#6B6A72]">© {new Date().getFullYear()} Threadly</p>
    </footer>
  );
}
