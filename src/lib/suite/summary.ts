// The live counts the suite shows in its side rail: what is waiting in each
// app. Pure so it can be tested; /api/suite/summary loads the records.

import type { AppId } from "./apps.ts";

export interface SuiteSummary {
  // Badge per app: a number and whether it needs attention (shown in accent).
  badges: Partial<Record<AppId, { count: number; alert: boolean; hint: string }>>;
}

export interface SummaryInput {
  leads: Array<{ domain: string; stage: string; score: number; nextFollowUpAt?: string | null }> | null;
  deals: Array<{ stage: string }> | null;
  prospecting: { selected: string[] } | null;
  questions: number | null;
  runs: number | null;
  now?: number;
}

const HOT = 75;

export function buildSummary(input: SummaryInput): SuiteSummary {
  const now = input.now ?? Date.now();
  const badges: SuiteSummary["badges"] = {};
  if (input.leads) {
    const open = input.leads.filter((l) => l.stage !== "won" && l.stage !== "lost");
    const due = open.filter((l) => l.stage === "follow_up_due" || (l.nextFollowUpAt && Date.parse(l.nextFollowUpAt) <= now)).length;
    const hotNew = open.filter((l) => l.stage === "new" && l.score >= HOT).length;
    const alert = due + hotNew;
    badges.outreach = alert
      ? { count: alert, alert: true, hint: [due && `${due} follow-up${due === 1 ? "" : "s"} due`, hotNew && `${hotNew} hot lead${hotNew === 1 ? "" : "s"} not contacted`].filter(Boolean).join(", ") }
      : { count: open.length, alert: false, hint: `${open.length} open lead${open.length === 1 ? "" : "s"}` };
  }
  if (input.deals) {
    const open = input.deals.filter((d) => d.stage !== "won" && d.stage !== "lost").length;
    badges.crm = { count: open, alert: false, hint: `${open} open deal${open === 1 ? "" : "s"}` };
  }
  if (input.prospecting && input.leads) {
    const saved = new Set(input.leads.map((l) => l.domain.toLowerCase()));
    const waiting = input.prospecting.selected.filter((d) => !saved.has(d.toLowerCase())).length;
    if (waiting) badges.prospect = { count: waiting, alert: true, hint: `${waiting} selected compan${waiting === 1 ? "y" : "ies"} not saved to Leads` };
  }
  if (input.questions !== null) badges.queries = { count: input.questions, alert: false, hint: `${input.questions} tracked question${input.questions === 1 ? "" : "s"}` };
  if (input.runs !== null) badges.runs = { count: input.runs, alert: false, hint: `${input.runs} scan${input.runs === 1 ? "" : "s"}` };
  return { badges };
}
