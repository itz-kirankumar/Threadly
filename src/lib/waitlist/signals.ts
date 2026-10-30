// Checks about an applicant's company that do not rely on what they typed:
// the domain's public mail records and its registration date. Each returns
// null when the lookup itself fails, so an outage is never held against them.

import { resolveMx, resolveTxt } from "node:dns/promises";

export interface MailSetup {
  mx: boolean;
  spf: boolean;
  dmarc: boolean;
}

const NO_RECORD = new Set(["ENOTFOUND", "ENODATA"]);

async function exists<T>(lookup: Promise<T[]>): Promise<T[] | null> {
  try {
    return await lookup;
  } catch (error) {
    return NO_RECORD.has((error as { code?: string }).code ?? "") ? [] : null;
  }
}

export async function mailSetup(domain: string): Promise<MailSetup | null> {
  const [mx, txt, dmarc] = await Promise.all([exists(resolveMx(domain)), exists(resolveTxt(domain)), exists(resolveTxt(`_dmarc.${domain}`))]);
  if (mx === null || txt === null || dmarc === null) return null;
  const joined = (records: string[][]) => records.map((r) => r.join(""));
  return {
    mx: mx.length > 0,
    spf: joined(txt).some((r) => r.toLowerCase().startsWith("v=spf1")),
    dmarc: joined(dmarc).some((r) => r.toLowerCase().startsWith("v=dmarc1")),
  };
}

// Days since registration, from the public RDAP registry.
export async function domainAgeDays(domain: string, now = Date.now()): Promise<number | null> {
  try {
    const tld = domain.split(".").pop();
    const url = tld === "com" || tld === "net" ? `https://rdap.verisign.com/${tld}/v1/domain/${encodeURIComponent(domain)}` : `https://rdap.org/domain/${encodeURIComponent(domain)}`;
    const res = await fetch(url, { headers: { Accept: "application/rdap+json", "User-Agent": "ThreadlyBot/1.0 (+https://www.gothreadly.live/security)" }, signal: AbortSignal.timeout(6000), redirect: "follow" });
    if (!res.ok) return null;
    const body = (await res.json()) as { events?: Array<{ eventAction?: string; eventDate?: string }> };
    const registered = body.events?.find((e) => e.eventAction === "registration")?.eventDate;
    const at = registered ? Date.parse(registered) : NaN;
    return Number.isNaN(at) ? null : Math.floor((now - at) / 86_400_000);
  } catch {
    return null;
  }
}
