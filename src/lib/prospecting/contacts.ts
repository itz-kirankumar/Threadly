// Decision-maker lookup through a licensed B2B contact provider. Threadly
// does not scrape social networks or guess addresses (PRD: no scraping behind
// a login, licensed sources only). The provider is active only when the
// workspace owner has configured its key, which is the owner's decision to
// use that supplier (PRD D05).

import type { Evidence, ProspectContact } from "./types.ts";

export interface ContactProvider {
  id: string;
  label: string;
  findByDomain(domain: string, roles: string[]): Promise<ProspectContact[]>;
}

const SENIORITY = "senior,executive";

class HunterProvider implements ContactProvider {
  id = "hunter";
  label = "Hunter";
  private apiKey: string;
  constructor(apiKey: string) {
    this.apiKey = apiKey;
  }

  async findByDomain(domain: string, roles: string[]): Promise<ProspectContact[]> {
    const url = new URL("https://api.hunter.io/v2/domain-search");
    url.searchParams.set("domain", domain);
    url.searchParams.set("type", "personal");
    url.searchParams.set("seniority", SENIORITY);
    url.searchParams.set("limit", "10");
    const res = await fetch(url, { headers: { "X-API-KEY": this.apiKey }, signal: AbortSignal.timeout(15_000) });
    if (res.status === 429) throw new Error("provider_rate_limited");
    if (!res.ok) throw new Error(`provider_error:${res.status}`);
    const body = (await res.json()) as {
      data?: { emails?: Array<{ value?: string; first_name?: string | null; last_name?: string | null; position?: string | null; confidence?: number; linkedin?: string | null; verification?: { status?: string | null } | null; sources?: Array<{ uri?: string }> }> };
    };
    const at = new Date().toISOString();
    const wanted = roles.map((r) => r.toLowerCase()).filter(Boolean);
    return (body.data?.emails ?? [])
      .filter((e) => typeof e.value === "string" && (e.first_name || e.last_name))
      .map((e) => {
        const name = [e.first_name, e.last_name].filter(Boolean).join(" ");
        const evidence: Evidence[] = [{ kind: "provider", url: `https://hunter.io/search/${domain}`, quote: `Hunter domain search, ${e.sources?.length ?? 0} public source(s)`, at }];
        return {
          id: `${domain}:${(e.value as string).toLowerCase()}`,
          companyDomain: domain,
          name,
          firstName: e.first_name ?? null,
          title: e.position ?? null,
          email: (e.value as string).toLowerCase(),
          confidence: typeof e.confidence === "number" ? e.confidence : null,
          verification: e.verification?.status ?? null,
          linkedinUrl: e.linkedin ? `https://www.linkedin.com/in/${e.linkedin.replace(/^.*\/in\//, "").replace(/\/$/, "")}` : null,
          source: "hunter",
          evidence,
        } satisfies ProspectContact;
      })
      .sort((a, b) => roleRank(b.title, wanted) - roleRank(a.title, wanted) || (b.confidence ?? 0) - (a.confidence ?? 0));
  }
}

function roleRank(title: string | null, wanted: string[]): number {
  const t = (title ?? "").toLowerCase();
  return wanted.some((w) => t.includes(w)) ? 1 : 0;
}

export function contactProvider(): ContactProvider | null {
  const key = process.env.HUNTER_API_KEY;
  return key ? new HunterProvider(key) : null;
}
