// One lead score for the whole product: the live demo's lead board and the
// workspace's saved leads use the same three parts, each 0 to 100, taken from
// facts a run read:
//   fit     how well they match what the company sells
//   intent  how ready they look to buy
//   reach   whether there is a direct way to them
// The score weighs intent highest. Every caller lists the facts behind it.

export type Priority = "Hot" | "Warm" | "Cold";

export const clampScore = (n: number) => Math.max(0, Math.min(100, Math.round(n)));

export function combineScore(fit: number, intent: number, reach: number): number {
  return clampScore(0.4 * fit + 0.45 * intent + 0.15 * reach);
}

export function priorityOf(score: number): Priority {
  return score >= 75 ? "Hot" : score >= 55 ? "Warm" : "Cold";
}

// A potential customer's fit and intent from why it was found: a
// competitor's customer already pays for the category (strong fit, a switch
// to win); a campaign match fits the audience but shows no buying yet.
export function companyFitIntent(signal: string | null | undefined, terms: string[] = []): { fit: number; intent: number; why: string[] } {
  const s = signal ?? "";
  // Hiring for the work the product supports: buying now.
  if (/^Hiring a /.test(s)) return { fit: 65 + Math.min(10, terms.length * 5), intent: 70, why: [s.replace(/^Hiring a/, "hiring a"), "a public job post this month"] };
  if (/^Customer of /.test(s)) return { fit: 80 + Math.min(10, terms.length * 5), intent: 45, why: [s.replace(/^Customer of/, "uses"), "a switch to win"] };
  return { fit: 55 + Math.min(10, terms.length * 5), intent: 25, why: [s || "matches the campaign", ...(terms.length ? [`homepage says ${terms.slice(0, 2).join(", ")}`] : [])] };
}

// Whether a person's title is one the campaign targets, or a founder or
// chief executive, who can always decide.
export function rightRole(title: string | null | undefined, roles: string[]): boolean {
  const t = (title ?? "").toLowerCase();
  if (!t) return false;
  const words = roles.join(" ").toLowerCase().split(/[^a-z]+/).filter((w) => w.length >= 3 && !["head", "chief", "officer", "vice", "president"].includes(w));
  return words.some((w) => t.includes(w)) || /\b(ceo|founder|co-?founder|owner|managing director|president)\b/.test(t);
}
