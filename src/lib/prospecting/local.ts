// Local businesses from the map, for a business whose service fits them: a
// web agency's prospects are local businesses without a website, a review
// tool's are the ones with few or weak reviews.
//
// Sources, in order, by what the owner has configured:
//   MAPS_SCRAPER_URL       the owner's self-hosted Google Maps scraper
//                          (github.com/gosom/google-maps-scraper web mode),
//                          optionally behind MAPS_SCRAPER_TOKEN (Bearer)
//   GOOGLE_PLACES_API_KEY  Google's Places API (Text Search)
//   otherwise              OpenStreetMap through Nominatim (free, 1 request
//                          per second, attribution "© OpenStreetMap
//                          contributors")
// Google's terms do not allow scraping Maps; the Places API is the licensed
// route. Which one runs is the owner's choice of settings.

import { BOT_UA } from "./web.ts";

export interface LocalBusiness {
  name: string;
  category: string | null;
  address: string | null;
  phone: string | null;
  website: string | null;
  rating: number | null;
  reviews: number | null;
  mapsUrl: string | null;
  source: "Google Maps" | "OpenStreetMap";
  // Why it may need what the visitor sells, from its own listing.
  needs: string[];
  score: number;
}

export type ServiceNeed = "website" | "reviews" | "bookings" | "ordering" | "marketing" | "general";

export function mapsProvider(): { id: "scraper" | "places" | "osm"; label: string } {
  if (process.env.MAPS_SCRAPER_URL) return { id: "scraper", label: "Google Maps" };
  if (process.env.GOOGLE_PLACES_API_KEY) return { id: "places", label: "Google Maps" };
  return { id: "osm", label: "OpenStreetMap" };
}

// What the visitor's business offers a local business, from its own words.
export function serviceNeed(text: string): ServiceNeed {
  const t = text.toLowerCase();
  if (/\b(web ?design|website (?:design|development|builder)|web development|landing pages?)\b/.test(t)) return "website";
  if (/\b(reviews?|reputation|local seo|google business profile|google my business)\b/.test(t)) return "reviews";
  if (/\b(online ordering|food ordering|delivery app|pos\b|point of sale)\b/.test(t)) return "ordering";
  if (/\b(bookings?|appointments?|scheduling|reservations?)\b/.test(t)) return "bookings";
  if (/\b(marketing|social media|ads|advertising|seo|leads)\b/.test(t)) return "marketing";
  return "general";
}

const FREE_SITE = /(wixsite\.com|blogspot\.|business\.site|godaddysites\.com|weebly\.com|site123\.me|jimdosite\.com|facebook\.com|instagram\.com|linktr\.ee)/i;

export function scoreNeeds(b: Omit<LocalBusiness, "needs" | "score">, need: ServiceNeed, extra: { ordering?: string; reservations?: string } = {}): { needs: string[]; score: number } {
  const needs: string[] = [];
  let score = 1;
  const site = b.website ?? "";
  if (!site) {
    if (need === "website" || need === "marketing" || need === "bookings") { needs.push("No website on its listing"); score += 3; }
  } else if (FREE_SITE.test(site) && (need === "website" || need === "marketing")) {
    needs.push("Website on a free builder or social page"); score += 2;
  }
  if (b.source === "Google Maps") {
    if (b.rating !== null && b.rating < 4 && (need === "reviews" || need === "marketing")) { needs.push(`Rated ${b.rating.toFixed(1)} on Google`); score += 3; }
    if (b.reviews !== null && b.reviews < 30 && (need === "reviews" || need === "marketing")) { needs.push(`Only ${b.reviews} Google reviews`); score += 2; }
    if (need === "ordering" && !extra.ordering) { needs.push("No online ordering link"); score += 3; }
    if (need === "bookings" && !extra.reservations) { needs.push("No online booking link"); score += 2; }
  }
  if (!needs.length) needs.push(`Listed on ${b.source}`);
  return { needs, score };
}

// A minimal CSV reader: quoted fields, escaped quotes, newlines in quotes.
export function parseCsv(text: string): Array<Record<string, string>> {
  const rows: string[][] = [];
  let row: string[] = [];
  let field = "";
  let quoted = false;
  for (let i = 0; i < text.length; i++) {
    const c = text[i];
    if (quoted) {
      if (c === '"' && text[i + 1] === '"') { field += '"'; i++; }
      else if (c === '"') quoted = false;
      else field += c;
    } else if (c === '"') quoted = true;
    else if (c === ",") { row.push(field); field = ""; }
    else if (c === "\n" || c === "\r") {
      if (c === "\r" && text[i + 1] === "\n") i++;
      row.push(field); field = "";
      if (row.some((x) => x !== "")) rows.push(row);
      row = [];
    } else field += c;
  }
  if (field || row.length) { row.push(field); rows.push(row); }
  const [head, ...body] = rows;
  return head ? body.map((r) => Object.fromEntries(head.map((h, i) => [h.trim(), (r[i] ?? "").trim()]))) : [];
}

type Raw = Omit<LocalBusiness, "needs" | "score"> & { ordering?: string; reservations?: string };

const n = (v: unknown) => (v === "" || v === null || v === undefined || Number.isNaN(Number(v)) ? null : Number(v));
const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));

// The gosom scraper's REST API: create a job, wait for it, read its CSV.
export function placesFromScraperCsv(csv: string): Raw[] {
  return parseCsv(csv)
    .filter((r) => r.title && !/closed/i.test(r.status ?? ""))
    .map((r) => ({ name: r.title, category: r.category || null, address: r.address || null, phone: r.phone || null, website: r.website || null, rating: n(r.review_rating), reviews: n(r.review_count), mapsUrl: r.link || null, source: "Google Maps" as const, ordering: r.order_online, reservations: r.reservations }));
}

async function fromScraper(query: string, deadline: number): Promise<Raw[]> {
  const base = process.env.MAPS_SCRAPER_URL!.replace(/\/+$/, "");
  const headers: Record<string, string> = { "Content-Type": "application/json", ...(process.env.MAPS_SCRAPER_TOKEN ? { Authorization: `Bearer ${process.env.MAPS_SCRAPER_TOKEN}` } : {}) };
  const seconds = Math.max(30, Math.floor((deadline - Date.now()) / 1000) - 10);
  const created = await fetch(`${base}/api/v1/jobs`, { method: "POST", headers, body: JSON.stringify({ name: `threadly ${query}`.slice(0, 60), keywords: [query], lang: "en", depth: 1, zoom: 15, email: false, max_time: seconds }), signal: AbortSignal.timeout(15_000) });
  if (!created.ok) throw new Error(`scraper ${created.status}`);
  const { id } = (await created.json()) as { id: string };
  try {
    while (Date.now() < deadline) {
      await sleep(4000);
      const job = (await (await fetch(`${base}/api/v1/jobs/${id}`, { headers, signal: AbortSignal.timeout(10_000) })).json()) as { Status?: string; status?: string };
      const status = job.Status ?? job.status;
      if (status === "failed") throw new Error("scraper job failed");
      if (status === "ok") break;
    }
    const csv = await fetch(`${base}/api/v1/jobs/${id}/download`, { headers, signal: AbortSignal.timeout(15_000) });
    return csv.ok ? placesFromScraperCsv(await csv.text()) : [];
  } finally {
    void fetch(`${base}/api/v1/jobs/${id}`, { method: "DELETE", headers }).catch(() => {});
  }
}

async function fromPlaces(query: string): Promise<Raw[]> {
  const res = await fetch("https://places.googleapis.com/v1/places:searchText", {
    method: "POST",
    headers: { "Content-Type": "application/json", "X-Goog-Api-Key": process.env.GOOGLE_PLACES_API_KEY!, "X-Goog-FieldMask": "places.displayName,places.formattedAddress,places.nationalPhoneNumber,places.websiteUri,places.rating,places.userRatingCount,places.googleMapsUri,places.primaryTypeDisplayName,places.businessStatus" },
    body: JSON.stringify({ textQuery: query, pageSize: 20 }),
    signal: AbortSignal.timeout(12_000),
  });
  if (!res.ok) throw new Error(`places ${res.status}`);
  const body = (await res.json()) as { places?: Array<{ displayName?: { text?: string }; formattedAddress?: string; nationalPhoneNumber?: string; websiteUri?: string; rating?: number; userRatingCount?: number; googleMapsUri?: string; primaryTypeDisplayName?: { text?: string }; businessStatus?: string }> };
  return (body.places ?? []).filter((p) => p.displayName?.text && p.businessStatus !== "CLOSED_PERMANENTLY").map((p) => ({ name: p.displayName!.text!, category: p.primaryTypeDisplayName?.text ?? null, address: p.formattedAddress ?? null, phone: p.nationalPhoneNumber ?? null, website: p.websiteUri ?? null, rating: p.rating ?? null, reviews: p.userRatingCount ?? null, mapsUrl: p.googleMapsUri ?? null, source: "Google Maps" as const }));
}

let lastNominatim = 0;

async function fromOsm(query: string): Promise<Raw[]> {
  // Nominatim's policy: at most one request a second.
  const wait = lastNominatim + 1100 - Date.now();
  if (wait > 0) await sleep(wait);
  lastNominatim = Date.now();
  const res = await fetch(`https://nominatim.openstreetmap.org/search?${new URLSearchParams({ q: query, format: "jsonv2", limit: "40", extratags: "1", addressdetails: "1" })}`, { headers: { "User-Agent": BOT_UA, "Accept-Language": "en" }, signal: AbortSignal.timeout(12_000) });
  if (!res.ok) throw new Error(`nominatim ${res.status}`);
  const rows = (await res.json()) as Array<{ name?: string; type?: string; display_name?: string; osm_type?: string; osm_id?: number; extratags?: Record<string, string> }>;
  return rows.filter((r) => r.name).map((r) => ({
    name: r.name!,
    category: r.type ? r.type.replace(/_/g, " ") : null,
    address: (r.display_name ?? "").split(", ").slice(1, 4).join(", ") || null,
    phone: r.extratags?.phone ?? r.extratags?.["contact:phone"] ?? null,
    website: r.extratags?.website ?? r.extratags?.["contact:website"] ?? null,
    rating: null,
    reviews: null,
    mapsUrl: r.osm_type && r.osm_id ? `https://www.openstreetmap.org/${r.osm_type}/${r.osm_id}` : null,
    source: "OpenStreetMap" as const,
  }));
}

// Singular search words OpenStreetMap understands ("dentist in Pune").
const OSM_WORD: Record<string, string> = { colleges: "college", restaurants: "restaurant", cafes: "cafe", bakeries: "bakery", salons: "hairdresser", spas: "spa", dentists: "dentist", clinics: "clinic", physiotherapists: "physiotherapist", gyms: "fitness centre", hotels: "hotel", "real estate agents": "estate agent", "home service contractors": "plumber", "law firms": "lawyer", accountants: "accountant", "coaching centres": "school", "car dealers and garages": "car repair", "pet care businesses": "veterinary", "retail stores": "shop", pharmacies: "pharmacy", "event venues": "events venue", "travel agencies": "travel agency" };

export async function findLocalBusinesses(types: string[], city: string, need: ServiceNeed, opts: { deadline: number; log: (t: string) => void; limit?: number }): Promise<{ provider: string; items: LocalBusiness[]; queries: string[] }> {
  const provider = mapsProvider();
  const queries: string[] = [];
  const items: LocalBusiness[] = [];
  const seen = new Set<string>();
  for (const type of types.slice(0, 3)) {
    if (Date.now() > opts.deadline) break;
    const q = provider.id === "osm" ? `${OSM_WORD[type] ?? type} in ${city}` : `${type} in ${city}`;
    queries.push(q);
    opts.log(`searching ${provider.label} for "${q}"`);
    try {
      const raw = provider.id === "scraper" ? await fromScraper(q, opts.deadline) : provider.id === "places" ? await fromPlaces(q) : await fromOsm(q);
      let added = 0;
      for (const r of raw) {
        const key = `${r.name.toLowerCase()}|${(r.address ?? "").toLowerCase().slice(0, 24)}`;
        if (seen.has(key)) continue;
        seen.add(key);
        const { ordering, reservations, ...b } = r;
        items.push({ ...b, ...scoreNeeds(b, need, { ordering, reservations }) });
        added++;
      }
      opts.log(`  ${raw.length} listings, ${added} new`);
    } catch (error) {
      opts.log(`  ${provider.label} search failed (${error instanceof Error ? error.message : "error"}); continuing`);
    }
  }
  items.sort((a, b) => b.score - a.score || (b.reviews ?? 0) - (a.reviews ?? 0));
  return { provider: provider.label, items: items.slice(0, opts.limit ?? 40), queries };
}

// A first message to a local business, from facts on its own listing.
export function draftLocalMessage(sender: { name: string; summary: string }, b: LocalBusiness): { dm: string; followUps: Array<{ day: number; body: string; stage?: string }> } {
  const what = sender.summary.split(/(?<=[.!?])\s/)[0].replace(/\.$/, "");
  const fact = b.needs[0] && !/^Listed on/.test(b.needs[0]) ? ` I noticed: ${b.needs[0].charAt(0).toLowerCase()}${b.needs[0].slice(1)}.` : "";
  return {
    dm: `Hi ${b.name} team, I found you on ${b.source}${b.rating !== null ? ` (${b.rating.toFixed(1)} stars from ${b.reviews ?? 0} reviews)` : ""}.${fact} I'm with ${sender.name}: ${what}. Would a short, free suggestion for ${b.name} be useful?`,
    followUps: [
      { day: 3, stage: "Value", body: `Hi again, happy to send that suggestion for ${b.name} whenever suits you. One line back is enough.` },
      { day: 5, stage: "Qualify", body: `Quick question: is getting more customers through ${b.source === "Google Maps" ? "Google" : "online search"} something ${b.name} is working on right now?` },
      { day: 9, stage: "Close", body: `Last note from me. If now isn't the right time, no problem at all; wishing ${b.name} a great season.` },
    ],
  };
}
