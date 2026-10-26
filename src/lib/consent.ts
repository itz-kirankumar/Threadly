// Analytics consent: the CookieConsent banner's promise, enforced in code.
// Only an explicit "accepted" choice permits optional analytics. Undecided,
// declined, malformed, or unreadable storage all mean NO analytics.
export const CONSENT_STORAGE_KEY = "threadly_cookie_consent";
export const CONSENT_CHANGE_EVENT = "threadly:consent-change";

export type ConsentValue = "accepted" | "declined" | "undecided";

export function parseConsent(raw: string | null): ConsentValue {
  if (!raw) return "undecided";
  try {
    const parsed = JSON.parse(raw) as { value?: unknown };
    return parsed && parsed.value === "accepted" ? "accepted" : "declined";
  } catch {
    return "undecided";
  }
}

export function readConsent(storage: Pick<Storage, "getItem"> | null): ConsentValue {
  if (!storage) return "undecided";
  try {
    return parseConsent(storage.getItem(CONSENT_STORAGE_KEY));
  } catch {
    return "undecided";
  }
}

export function analyticsAllowed(storage: Pick<Storage, "getItem"> | null): boolean {
  return readConsent(storage) === "accepted";
}
