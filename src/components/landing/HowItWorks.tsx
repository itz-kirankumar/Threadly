import type { ReactNode } from "react";
import Reveal from "./Reveal";

// The eight-step method. Each step carries a small drawing of its output,
// made of type and lines rather than stock art.

const Line = ({ w }: { w: string }) => <span className="block h-1.5 rounded-full bg-white/10" style={{ width: w }} />;
const Tag = ({ children }: { children: ReactNode }) => <span className="rounded-md border border-white/[0.08] px-2 py-1 text-[11px] text-[#A7A0AE]">{children}</span>;
const Wrap = ({ children }: { children: ReactNode }) => <div className="flex min-h-[64px] flex-wrap content-center items-center gap-1.5">{children}</div>;

const STEPS: Array<{ title: string; body: string; art: ReactNode }> = [
  { title: "Research your company", body: "Reads your homepage for what you sell and the audiences you name.", art: <div className="w-full space-y-2"><Line w="85%" /><Line w="60%" /><Line w="72%" /></div> },
  { title: "Audit AI readiness", body: "20 checks across crawler access, technical health, clarity, structured data and business signals, scored out of 100.", art: <Wrap><span className="font-display text-4xl text-[#D8B982]">/100</span></Wrap> },
  { title: "Map competitors", body: "Web searches and comparison articles, each candidate checked against its own homepage.", art: <Wrap>{["A", "B", "C", "D"].map((l) => <span key={l} className="flex h-8 w-8 items-center justify-center rounded-lg border border-white/[0.08] text-xs text-[#A7A0AE]">{l}</span>)}</Wrap> },
  { title: "Define campaigns", body: "Audiences your site and your competitors name, each turned into a search for companies.", art: <Wrap><Tag>Audience</Tag><Tag>Search</Tag><Tag>Roles</Tag></Wrap> },
  { title: "Find potential customers", body: "Company homepages read one by one, with publishers, directories and competitors left out.", art: <div className="w-full space-y-2">{["78%", "64%", "70%"].map((w) => <div key={w} className="flex items-center gap-2"><span className="h-4 w-4 rounded bg-white/10" /><Line w={w} /></div>)}</div> },
  { title: "Discover public buying signals", body: "Public Reddit, X and LinkedIn posts from people asking for what you sell, ranked by intent.", art: <Wrap><Tag>Reddit</Tag><Tag>X</Tag><Tag>LinkedIn</Tag></Wrap> },
  { title: "Identify decision-makers", body: "People in the roles you target, from a licensed data provider, with the source recorded.", art: <div className="flex w-full items-center gap-3"><span className="h-8 w-8 rounded-full bg-white/10" /><div className="flex-1 space-y-2"><Line w="60%" /><Line w="40%" /></div></div> },
  { title: "Draft the first email", body: "One draft per company that quotes its own words and lists every source.", art: <div className="w-full space-y-2"><Line w="30%" /><Line w="90%" /><Line w="76%" /></div> },
];

export default function HowItWorks() {
  return (
    <div className="grid gap-12 lg:grid-cols-[minmax(0,0.75fr)_minmax(0,1.25fr)]">
      <Reveal>
        <div className="lg:sticky lg:top-28">
          <p className="premium-eyebrow">How it works</p>
          <h2 className="mt-4 font-display text-5xl leading-[1.08] tracking-tight">From a website to a smarter pipeline.</h2>
          <p className="mt-5 max-w-sm text-[#A7A0AE]">Eight steps in one run. In your workspace you edit each one and approve what gets sent.</p>
        </div>
      </Reveal>
      <ol className="border-t border-white/[0.08]">
        {STEPS.map((step, i) => (
          <Reveal key={step.title}>
            <li className="grid gap-4 border-b border-white/[0.08] py-7 sm:grid-cols-[3rem_minmax(0,1fr)_170px] sm:items-center">
              <span className="text-sm tabular-nums text-[#D8B982]">{String(i + 1).padStart(2, "0")}</span>
              <div>
                <h3 className="text-[17px] text-[#F5F0E8]">{step.title}</h3>
                <p className="mt-1 text-sm leading-relaxed text-[#A7A0AE]">{step.body}</p>
              </div>
              <div aria-hidden className="hidden sm:block">{step.art}</div>
            </li>
          </Reveal>
        ))}
      </ol>
    </div>
  );
}
