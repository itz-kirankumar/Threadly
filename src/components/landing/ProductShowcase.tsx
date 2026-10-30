"use client";

import { Tab, TabGroup, TabList, TabPanel, TabPanels } from "@headlessui/react";
import type { ReactNode } from "react";
import CountUp from "./CountUp";

// The workspace, shown with fictional sample data. Everything here is
// illustrative and labelled as such; real results come from the live search.

function Stat({ label, value, suffix }: { label: string; value: number; suffix?: string }) {
  return (
    <div className="rounded-xl border border-black/[0.08] bg-[#FFFFFF] p-4">
      <p className="text-[11px] uppercase tracking-[0.14em] text-[#6B6A72]">{label}</p>
      <p className="mt-2 text-3xl tracking-tight text-[#111114]"><CountUp value={value} suffix={suffix} /></p>
    </div>
  );
}

function Rows({ head, rows }: { head: string[]; rows: ReactNode[][] }) {
  return (
    <div className="overflow-x-auto rounded-xl border border-black/[0.08]">
      <table className="w-full min-w-[520px] text-left text-sm">
        <thead><tr className="bg-[#FFFFFF] text-[11px] uppercase tracking-[0.14em] text-[#6B6A72]">{head.map((h) => <th key={h} className="px-4 py-3 font-normal">{h}</th>)}</tr></thead>
        <tbody>
          {rows.map((row, i) => (
            <tr key={i} className="border-t border-black/[0.06]">
              {row.map((cell, j) => <td key={j} className={`px-4 py-3 ${j === 0 ? "text-[#111114]" : "text-[#6B6A72]"}`}>{cell}</td>)}
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

const Pill = ({ children, tone = "main" }: { children: ReactNode; tone?: "main" | "muted" }) => (
  <span className={`rounded-full px-2 py-0.5 text-xs ${tone === "main" ? "bg-[#5B3DF5]/10 text-[#5B3DF5]" : "bg-black/[0.05] text-[#6B6A72]"}`}>{children}</span>
);

const TABS: Array<{ name: string; panel: ReactNode }> = [
  {
    name: "Market Pipeline",
    panel: (
      <div className="space-y-4">
        <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
          <Stat label="Companies discovered" value={248} />
          <Stat label="Qualified" value={86} />
          <Stat label="New opportunities" value={14} />
          <Stat label="Campaign progress" value={62} suffix="%" />
        </div>
        <Rows head={["Recent discovery", "Campaign", "Status"]} rows={[
          ["Acme Robotics", "Warehouse automation", <Pill key="a">Qualified</Pill>],
          ["Globex Cloud", "Mid-market SaaS", <Pill key="b" tone="muted">Researching</Pill>],
          ["Initech Finance", "Fintech operations", <Pill key="c">Qualified</Pill>],
        ]} />
      </div>
    ),
  },
  {
    name: "Company Intelligence",
    panel: (
      <div className="grid gap-4 lg:grid-cols-[minmax(0,1.3fr)_minmax(0,1fr)]">
        <div className="rounded-xl border border-black/[0.08] bg-[#FFFFFF] p-5">
          <div className="flex items-start justify-between gap-3">
            <div>
              <p className="font-display text-3xl text-[#111114]">Acme Robotics</p>
              <p className="mt-1 text-sm text-[#6B6A72]">acme-robotics.example · Warehouse automation</p>
            </div>
            <Pill>Research complete</Pill>
          </div>
          <p className="mt-4 text-sm leading-relaxed text-[#6B6A72]">Builds picking robots for mid-sized fulfilment centres, and describes itself as selling to operations leaders replacing manual sortation.</p>
        </div>
        <div className="space-y-4">
          <div className="rounded-xl border border-black/[0.08] p-4">
            <p className="text-[11px] uppercase tracking-[0.14em] text-[#6B6A72]">Competitors</p>
            <p className="mt-2 text-sm text-[#111114]">Globex Automation · Hooli Robotics · Vehement Systems</p>
          </div>
          <div className="rounded-xl border border-black/[0.08] p-4">
            <p className="text-[11px] uppercase tracking-[0.14em] text-[#6B6A72]">Sources</p>
            <ul className="mt-2 space-y-1 font-mono text-xs text-[#6B6A72]"><li>acme-robotics.example/</li><li>acme-robotics.example/customers</li></ul>
          </div>
        </div>
      </div>
    ),
  },
  {
    name: "Buying Signals",
    panel: (
      <Rows head={["Public post", "Source", "Found", "Intent"]} rows={[
        ["Anyone moved off manual sortation this year?", "Reddit", "2 days ago", <Pill key="a">Asking for a recommendation</Pill>],
        ["Looking for an alternative to our current WMS add-on", "LinkedIn", "4 days ago", <Pill key="b">Looking for an alternative</Pill>],
        ["How are you handling peak season picking?", "X", "6 days ago", <Pill key="c" tone="muted">Asking for help</Pill>],
      ]} />
    ),
  },
  {
    name: "Decision Makers",
    panel: (
      <div className="space-y-3">
        <Rows head={["Contact", "Title", "Company", "Source", "Verification"]} rows={[
          ["Alex Sample", "VP Operations", "Acme Robotics", "Licensed provider", <Pill key="a">Verified</Pill>],
          ["Sam Placeholder", "Head of Logistics", "Globex Cloud", "Licensed provider", <Pill key="b">Verified</Pill>],
          ["Jo Example", "Director of Supply Chain", "Initech Finance", "Licensed provider", <Pill key="c" tone="muted">Unverified</Pill>],
        ]} />
        <p className="text-xs text-[#6B6A72]">Contacts come only from a licensed data provider, with the source recorded. Profiles are not scraped and addresses are not guessed.</p>
      </div>
    ),
  },
  {
    name: "AI Visibility",
    panel: (
      <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
        <Stat label="Mention rate" value={48} suffix="%" />
        <Stat label="Citation share" value={22} suffix="%" />
        <Stat label="Share of voice" value={31} suffix="%" />
        <Stat label="Tracked questions" value={25} />
      </div>
    ),
  },
];

export default function ProductShowcase() {
  return (
    <TabGroup className="gloss-panel overflow-hidden rounded-[20px]">
      <div className="flex items-center justify-between gap-4 border-b border-black/[0.08] px-4 py-3">
        <span className="flex items-center gap-1.5" aria-hidden><i className="h-2.5 w-2.5 rounded-full bg-black/15" /><i className="h-2.5 w-2.5 rounded-full bg-black/15" /><i className="h-2.5 w-2.5 rounded-full bg-black/15" /></span>
        <span className="rounded-full border border-[#5B3DF5]/30 px-2.5 py-0.5 text-[11px] text-[#5B3DF5]">Illustrative sample data</span>
      </div>
      <div className="grid md:grid-cols-[220px_minmax(0,1fr)]">
        <TabList aria-label="Workspace views" className="flex gap-1 overflow-x-auto border-b border-black/[0.08] p-2 md:flex-col md:border-b-0 md:border-r">
          {TABS.map((tab) => (
            <Tab key={tab.name} className="shrink-0 rounded-lg px-3 py-2 text-left text-sm text-[#6B6A72] outline-none transition-colors hover:text-[#111114] focus-visible:ring-2 focus-visible:ring-[#5B3DF5]/60 data-[selected]:bg-black/[0.07] data-[selected]:text-[#111114]">
              {tab.name}
            </Tab>
          ))}
        </TabList>
        <TabPanels className="min-h-[360px] min-w-0 p-4 sm:p-6">
          {TABS.map((tab) => <TabPanel key={tab.name} className="fade-in outline-none">{tab.panel}</TabPanel>)}
        </TabPanels>
      </div>
    </TabGroup>
  );
}
