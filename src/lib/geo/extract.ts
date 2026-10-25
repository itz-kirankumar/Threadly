import type { BrandProfile, Citation, ProviderResult, GeoProviderId, ProviderStatus } from "./types";
import type { ProviderAnswer } from "./providers";

function escapeRegExp(value: string): string {
  return value.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

function namePattern(name: string): RegExp {
  return new RegExp(`(^|[^a-z0-9])${escapeRegExp(name.toLowerCase())}([^a-z0-9]|$)`, "i");
}

function firstIndex(answer: string, names: string[]): number {
  let best = -1;
  for (const name of names) {
    if (!name.trim()) continue;
    const match = namePattern(name).exec(answer);
    if (match && (best === -1 || match.index < best)) best = match.index;
  }
  return best;
}

function domainMatches(citationDomain: string, domain: string): boolean {
  const target = domain.replace(/^www\./, "").toLowerCase();
  return citationDomain === target || citationDomain.endsWith(`.${target}`);
}

export function analyzeAnswer(
  provider: GeoProviderId,
  status: ProviderStatus,
  raw: ProviderAnswer | null,
  brand: BrandProfile,
  error?: string,
): ProviderResult {
  if (status !== "scanned" || !raw) {
    return {
      provider,
      status,
      answer:
        status === "not_configured"
          ? "Add this provider's API key to enable scans."
          : `Scan failed${error ? `: ${error}` : "."}`,
      citations: [],
      brandMentioned: false,
      brandCited: false,
      brandCitationCount: 0,
      brandPosition: null,
      competitorsMentioned: [],
      competitorsCited: [],
      error,
      scannedAt: new Date().toISOString(),
    };
  }

  const answer = raw.answer;
  const brandNames = [brand.name, ...brand.aliases];
  const brandIdx = firstIndex(answer, brandNames);
  const brandMentioned = brandIdx !== -1;
  const brandCitationCount = raw.citations.filter((c) => domainMatches(c.domain, brand.domain)).length;
  const brandCited = brandCitationCount > 0;

  const competitorsMentioned: string[] = [];
  const competitorsCited: string[] = [];
  const contenderPositions: number[] = brandMentioned ? [brandIdx] : [];

  for (const competitor of brand.competitors) {
    const names = [competitor.name, ...(competitor.aliases ?? [])];
    const idx = firstIndex(answer, names);
    if (idx !== -1) {
      competitorsMentioned.push(competitor.name);
      contenderPositions.push(idx);
    }
    if (raw.citations.some((c) => domainMatches(c.domain, competitor.domain))) {
      competitorsCited.push(competitor.name);
    }
  }

  // Position among named brands (ours + competitors), 1 = mentioned first.
  let brandPosition: number | null = null;
  if (brandMentioned) {
    const earlier = contenderPositions.filter((pos) => pos < brandIdx).length;
    brandPosition = earlier + 1;
  }

  return {
    provider,
    status,
    answer,
    citations: raw.citations,
    brandMentioned,
    brandCited,
    brandCitationCount,
    brandPosition,
    competitorsMentioned,
    competitorsCited,
    scannedAt: new Date().toISOString(),
  };
}
