// Icons for the suite: one per app, plus the shell's own controls.
import type { ReactNode } from "react";
import type { AppId } from "@/lib/suite/apps";

export const APP_ICONS: Record<AppId, ReactNode> = {
  prospect: (
    <svg width="16" height="16" viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round">
      <path d="M2.5 4h11M4.5 8h7M6.5 12h3" />
    </svg>
  ),
  crm: (
    <svg width="16" height="16" viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round">
      <rect x="2" y="5" width="12" height="8.5" rx="1.5" /><path d="M5.5 5V3.8A1.3 1.3 0 0 1 6.8 2.5h2.4a1.3 1.3 0 0 1 1.3 1.3V5" /><path d="M2 8.5h12" />
    </svg>
  ),
  enterprise: (
    <svg width="16" height="16" viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round">
      <path d="M2 13.5h12" /><path d="M3.5 13.5V6.5l4.5-3 4.5 3v7" /><path d="M6.5 13.5v-4h3v4" />
    </svg>
  ),
  overview: (
    <svg width="16" height="16" viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="1.5">
      <rect x="1.5" y="1.5" width="5.5" height="5.5" rx="1" /><rect x="9" y="1.5" width="5.5" height="5.5" rx="1" />
      <rect x="1.5" y="9" width="5.5" height="5.5" rx="1" /><rect x="9" y="9" width="5.5" height="5.5" rx="1" />
    </svg>
  ),
  queries: (
    <svg width="16" height="16" viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round">
      <circle cx="8" cy="8" r="6" /><path d="M6.2 6.2c.3-1 1-1.6 1.9-1.6 1 0 1.8.7 1.8 1.6 0 1.2-1.4 1.5-1.8 2.4" /><circle cx="8" cy="11.2" r="0.4" fill="currentColor" />
    </svg>
  ),
  citations: (
    <svg width="16" height="16" viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round">
      <path d="M6.5 9.5a3 3 0 0 0 4.2 0l2.1-2.1a3 3 0 1 0-4.2-4.2l-1 1" /><path d="M9.5 6.5a3 3 0 0 0-4.2 0l-2.1 2.1a3 3 0 1 0 4.2 4.2l1-1" />
    </svg>
  ),
  runs: (
    <svg width="16" height="16" viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round">
      <path d="M13.5 8a5.5 5.5 0 1 1-1.6-3.9" /><path d="M13.5 2.5v2.6h-2.6" />
    </svg>
  ),
  optimizer: (
    <svg width="16" height="16" viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round">
      <path d="M8.5 1.5 3 9h5l-.5 5.5L13 7H8l.5-5.5z" />
    </svg>
  ),
  outreach: (
    <svg width="16" height="16" viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round">
      <circle cx="8" cy="8" r="6" />
      <circle cx="8" cy="8" r="3" />
      <circle cx="8" cy="8" r="0.8" fill="currentColor" />
    </svg>
  ),
  social: (
    <svg width="16" height="16" viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round">
      <circle cx="7" cy="7" r="4.5" /><path d="m10.5 10.5 3 3" />
    </svg>
  ),
  settings: (
    <svg width="16" height="16" viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round">
      <circle cx="8" cy="8" r="2" />
      <path d="M8 1.8v1.7M8 12.5v1.7M1.8 8h1.7M12.5 8h1.7M3.6 3.6l1.2 1.2M11.2 11.2l1.2 1.2M12.4 3.6l-1.2 1.2M4.8 11.2l-1.2 1.2" />
    </svg>
  ),
};


const stroke = { fill: "none", stroke: "currentColor", strokeWidth: 1.6, strokeLinecap: "round" as const, strokeLinejoin: "round" as const };

export const ShellIcon = {
  waffle: (
    <svg width="18" height="18" viewBox="0 0 18 18" aria-hidden="true">
      {[3, 9, 15].flatMap((x) => [3, 9, 15].map((y) => <circle key={`${x}-${y}`} cx={x} cy={y} r="1.6" fill="currentColor" />))}
    </svg>
  ),
  search: (
    <svg width="16" height="16" viewBox="0 0 16 16" aria-hidden="true" {...stroke}><circle cx="7" cy="7" r="4.6" /><path d="m10.5 10.5 3.2 3.2" /></svg>
  ),
  plus: (
    <svg width="14" height="14" viewBox="0 0 14 14" aria-hidden="true" {...stroke} strokeWidth={1.9}><path d="M7 2.5v9M2.5 7h9" /></svg>
  ),
  bell: (
    <svg width="17" height="17" viewBox="0 0 18 18" aria-hidden="true" {...stroke}><path d="M4.5 12.5V8a4.5 4.5 0 0 1 9 0v4.5l1.2 1.5H3.3z" /><path d="M7.4 15.6a1.8 1.8 0 0 0 3.2 0" /></svg>
  ),
  help: (
    <svg width="17" height="17" viewBox="0 0 18 18" aria-hidden="true" {...stroke}><circle cx="9" cy="9" r="6.8" /><path d="M7 7.1c.3-1.1 1.1-1.7 2.1-1.7 1.1 0 2 .8 2 1.8 0 1.4-1.6 1.7-2 2.7" /><circle cx="9" cy="12.6" r=".5" fill="currentColor" /></svg>
  ),
  chevron: (
    <svg width="10" height="6" viewBox="0 0 10 6" aria-hidden="true"><path d="M1 1l4 4 4-4" stroke="currentColor" strokeWidth="1.5" fill="none" strokeLinecap="round" /></svg>
  ),
  panel: (
    <svg width="17" height="17" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.7" strokeLinecap="round" aria-hidden="true"><rect x="3.5" y="4.5" width="17" height="15" rx="3.5" /><path d="M9.75 4.5v15" /></svg>
  ),
  arrow: (
    <svg width="14" height="14" viewBox="0 0 14 14" aria-hidden="true" {...stroke}><path d="M3 7h8M8 4l3 3-3 3" /></svg>
  ),
};
