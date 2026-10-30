// What a prospecting step costs. A step is billed for the results it adds
// (new companies, new contacts, drafted emails) and keeps only the results
// the balance paid for. Dependency-free so it is unit-testable in plain node.

import type { ProspectingState, StepId } from "../prospecting/types.ts";
import type { CreditAction } from "./rates.ts";

export interface StepBill {
  action: CreditAction;
  units: number; // billable results the step produced
}

const contactKey = (c: { companyDomain: string; email: string | null; name: string }) => `${c.companyDomain}|${(c.email ?? c.name).toLowerCase()}`;

// The billable results in `after` that were not in `before`.
export function stepBill(step: StepId, before: ProspectingState, after: ProspectingState): StepBill | null {
  switch (step) {
    case "research":
      return { action: "research", units: 1 };
    case "companies": {
      const had = new Set((before.companies?.items ?? []).map((c) => c.domain));
      return { action: "company", units: (after.companies?.items ?? []).filter((c) => !had.has(c.domain)).length };
    }
    case "contacts": {
      const had = new Set((before.contacts?.items ?? []).map(contactKey));
      return { action: "contact", units: (after.contacts?.items ?? []).filter((c) => !had.has(contactKey(c))).length };
    }
    case "emails":
      return { action: "email", units: after.emails?.items.length ?? 0 };
    default:
      // Competitors and campaigns are part of the research run.
      return null;
  }
}

// Keeps only the first `paid` new results of the step; the rest are dropped
// so nothing unpaid is saved.
export function keepPaid(step: StepId, before: ProspectingState, after: ProspectingState, paid: number): ProspectingState {
  if (step === "companies" && after.companies) {
    const had = new Set((before.companies?.items ?? []).map((c) => c.domain));
    let left = paid;
    const items = after.companies.items.filter((c) => had.has(c.domain) || left-- > 0);
    return { ...after, companies: { ...after.companies, items } };
  }
  if (step === "contacts" && after.contacts) {
    const had = new Set((before.contacts?.items ?? []).map(contactKey));
    let left = paid;
    const items = after.contacts.items.filter((c) => had.has(contactKey(c)) || left-- > 0);
    return { ...after, contacts: { ...after.contacts, items } };
  }
  if (step === "emails" && after.emails) {
    return { ...after, emails: { ...after.emails, items: after.emails.items.slice(0, paid) } };
  }
  return after;
}
