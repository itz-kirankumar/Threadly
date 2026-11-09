// The billing country, recognised automatically. It decides the payment
// provider (India: Razorpay, elsewhere: Dodo), so it is taken from the best
// signal available and the buyer can still change it:
//   1. a country the buyer chose before (kept for next time),
//   2. the country of the request, from the hosting edge (x-vercel-ip-country),
//   3. the browser's time zone, then its language region.

export type CountrySource = "saved" | "location" | "time zone" | "browser language";

// Time zones that pin a country even when the language region does not
// (en-US browsers in India are common).
const ZONE_COUNTRY: Record<string, string> = {
  "Asia/Kolkata": "IN", "Asia/Calcutta": "IN", "Asia/Dubai": "AE", "Asia/Singapore": "SG", "Asia/Tokyo": "JP",
  "Europe/London": "GB", "Europe/Dublin": "IE", "Europe/Berlin": "DE", "Europe/Paris": "FR", "Europe/Amsterdam": "NL",
  "Australia/Sydney": "AU", "Australia/Melbourne": "AU", "Australia/Perth": "AU", "Africa/Johannesburg": "ZA",
  "America/Sao_Paulo": "BR", "America/Toronto": "CA", "America/Vancouver": "CA",
  "America/New_York": "US", "America/Chicago": "US", "America/Denver": "US", "America/Los_Angeles": "US", "America/Phoenix": "US",
  "Asia/Karachi": "PK", "Asia/Dhaka": "BD", "Asia/Colombo": "LK", "Asia/Kathmandu": "NP", "Asia/Riyadh": "SA", "Asia/Qatar": "QA",
  "Asia/Kuala_Lumpur": "MY", "Asia/Jakarta": "ID", "Asia/Manila": "PH", "Asia/Bangkok": "TH", "Asia/Hong_Kong": "HK", "Asia/Seoul": "KR",
  "Europe/Madrid": "ES", "Europe/Rome": "IT", "Europe/Stockholm": "SE", "Europe/Zurich": "CH", "Africa/Lagos": "NG", "Africa/Nairobi": "KE",
  "Pacific/Auckland": "NZ", "America/Mexico_City": "MX",
};

const CODE = /^[A-Z]{2}$/;

export function countryFromZone(zone: string | null | undefined): string | null {
  return zone ? ZONE_COUNTRY[zone] ?? null : null;
}

export function countryFromLanguages(languages: readonly string[] | null | undefined): string | null {
  for (const tag of languages ?? []) {
    const region = tag.split(/[-_]/)[1]?.toUpperCase();
    if (region && CODE.test(region)) return region;
  }
  return null;
}

export function detectCountry(input: { saved?: string | null; hint?: string | null; zone?: string | null; languages?: readonly string[] | null }): { code: string; source: CountrySource } | null {
  const saved = input.saved?.toUpperCase();
  if (saved && CODE.test(saved)) return { code: saved, source: "saved" };
  const hint = input.hint?.toUpperCase();
  // "XX" and "T1" are what edges send for unknown and Tor traffic.
  if (hint && CODE.test(hint) && hint !== "XX") return { code: hint, source: "location" };
  const zone = countryFromZone(input.zone);
  if (zone) return { code: zone, source: "time zone" };
  const lang = countryFromLanguages(input.languages);
  if (lang) return { code: lang, source: "browser language" };
  return null;
}

// The country's name in English, for codes outside the short picker list.
export function countryName(code: string): string {
  try {
    return new Intl.DisplayNames(["en"], { type: "region" }).of(code) ?? code;
  } catch {
    return code;
  }
}
