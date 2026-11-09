// Likely work emails from evidence, the way email finders like Hunter work:
// when a company publishes a named person's address (marie@tally.so on its
// team page), the format it uses (first@) is learned and applied to the
// other decision makers found there. Every such address is labelled
// "likely, not verified": it is never sent to until a licensed provider
// verifies it, and no address is produced without a published example.

export type EmailFormat = "first" | "first.last" | "firstlast" | "f.last" | "flast" | "first_last" | "last";

const ROLE_ADDRESS = /^(info|hello|hi|sales|support|contact|team|hr|careers|jobs|admin|office|press|media|billing|accounts|help|marketing|partners?|privacy|legal|security|feedback|enquiries|inquiries|noreply|no-reply|admissions|placement|placements)$/;

function parts(name: string): { first: string; last: string } | null {
  const words = name.toLowerCase().normalize("NFKD").replace(/[̀-ͯ]/g, "").replace(/[^a-z\s-]/g, "").split(/\s+/).filter(Boolean);
  return words.length >= 2 ? { first: words[0].replace(/-/g, ""), last: words[words.length - 1].replace(/-/g, "") } : null;
}

export function render(format: EmailFormat, name: string, domain: string): string | null {
  const p = parts(name);
  if (!p) return null;
  const local = { first: p.first, "first.last": `${p.first}.${p.last}`, firstlast: `${p.first}${p.last}`, "f.last": `${p.first[0]}.${p.last}`, flast: `${p.first[0]}${p.last}`, first_last: `${p.first}_${p.last}`, last: p.last }[format];
  return `${local}@${domain}`;
}

// The format a published address shows for a known person, if any.
export function learnFormat(published: string[], people: string[], domain: string): { format: EmailFormat; example: string } | null {
  const formats: EmailFormat[] = ["first.last", "firstlast", "f.last", "flast", "first_last", "first", "last"];
  for (const email of published) {
    const [local, host] = email.toLowerCase().split("@");
    if (!host || host.replace(/^www\./, "") !== domain || ROLE_ADDRESS.test(local)) continue;
    for (const person of people) {
      for (const format of formats) {
        if (render(format, person, domain) === `${local}@${host}`) return { format, example: email.toLowerCase() };
      }
    }
  }
  return null;
}

// Likely addresses for the people found, from a learned format; the person
// whose address is published keeps that exact address.
export function likelyEmails(published: string[], people: string[], domain: string): Map<string, { email: string; basis: string; verified: false }> {
  const out = new Map<string, { email: string; basis: string; verified: false }>();
  const learned = learnFormat(published, people, domain);
  if (!learned) return out;
  for (const person of people) {
    const email = render(learned.format, person, domain);
    if (!email) continue;
    const own = published.map((e) => e.toLowerCase()).includes(email);
    out.set(person, { email, basis: own ? "published on the company's own site" : `same format as ${learned.example}, published on the company's site`, verified: false });
  }
  return out;
}
