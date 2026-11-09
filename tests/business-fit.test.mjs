import assert from "node:assert/strict";
import test from "node:test";
import { assessFit, businessKind, listedOn, localTypesIn, outletCount, planFor, sizeStatements } from "../src/lib/prospecting/fit.ts";
import { parseCsv, placesFromScraperCsv, scoreNeeds, serviceNeed } from "../src/lib/prospecting/local.ts";
import { xProfileFromResult } from "../src/lib/prospecting/people.ts";
import { titleCase } from "../src/lib/prospecting/steps.ts";

const evidence = (over = {}) => ({ name: "Acme", domain: "acme.io", category: "form builder", terms: ["form", "forms"], pages: [], html: "", location: null, wikidata: null, hits: [], sources: 10, ...over });
const hit = (domain, content, title = "Acme") => ({ url: `https://${domain}/acme`, domain, title, content, published: null });

test("team sizes: publisher sentences and bands count; LinkedIn member counts are weak", () => {
  assert.equal(sizeStatements("Tally Forms has 34 employees (October 2024, LinkedIn).", "getlatka.com", null, 3)[0].count, 34);
  assert.equal(sizeStatements("Company size 11-50 employees", "linkedin.com", null, 2)[0].count, 31);
  assert.equal(sizeStatements("It had a team size of 5990 employees as on May 31, 2026.", "tracxn.com", null, 2)[0].count, 5990);
  const weak = sizeStatements("## Employees\n- Now: 645", "linkedin.com", null, 2);
  assert.equal(weak[0].confidence, 1);
  // A customer quote on a homepage is not read; an about page is.
  assert.equal(sizeStatements("For teams of 500 employees", "own", null, 2, true).length, 0);
  assert.equal(sizeStatements("We're a remote team of 12 people.", "own", null, 2, true)[0].count, 12);
});

test("listings must sit next to the company's own name, and FAQ headings do not count", () => {
  assert.equal(listedOn("Compare Zoho with Salesforce (NYSE: CRM).", "Zoho"), null);
  assert.equal(listedOn("Is Zoho publicly traded? No, Zoho is private.", "Zoho"), null);
  assert.equal(listedOn("Freshworks (NASDAQ: FRSH) sells CRM.", "Freshworks"), "NASDAQ");
});

test("outlets count the business's own locations, not its customers", () => {
  assert.equal(outletCount("Wow! Momo crossed 850+ stores in over 95 cities this year."), 850);
  assert.equal(outletCount("Trusted by 5,000+ restaurants in 40 cities"), null);
});

test("kinds: a restaurant chain is physical, restaurant software is digital", () => {
  assert.equal(businessKind({ described: "Indian chain of fast food restaurants. Food and Beverage Services", headline: "QSR chain", body: "Find a store near you" }).kind, "physical business");
  assert.equal(businessKind({ described: "Restaurant POS software", headline: "POS software for restaurants", body: "Book a demo" }).kind, "software");
  assert.equal(businessKind({ described: "digital marketing agency", headline: "SEO agency", body: "Our services" }).kind, "agency");
});

test("the fit stops large companies and physical businesses, and serves small digital ones", () => {
  const big = assessFit(evidence({ hits: [hit("example.com", "Acme acme.io has 26,358 employees")] }));
  assert.equal(big.inSegment, false);
  assert.equal(big.size, "large");
  const small = assessFit(evidence({ hits: [hit("getlatka.com", "Acme acme.io has 34 employees"), hit("linkedin.com", "Acme forms. Employees - Now: 645")] }));
  assert.equal(small.inSegment, true);
  assert.equal(small.team.count, 34);
  const unknown = assessFit(evidence());
  assert.equal(unknown.inSegment, true);
  assert.equal(unknown.size, "unknown");
  const food = assessFit(evidence({ category: "fast food restaurant chain", pages: [{ url: "https://acme.io/", kind: "home", text: "Acme\nOur 120 outlets across India" }] }));
  assert.equal(food.inSegment, false);
});

test("local types and the plan: local businesses only when the site serves them", () => {
  assert.deepEqual(localTypesIn("Websites built for dentists and salons in Pune"), ["salons", "dentists"]);
  const fit = assessFit(evidence({ category: "web design agency", pages: [{ url: "https://acme.io/", kind: "home", text: "Web design agency\nWe build websites for dentists. Based in Pune, India." }] }));
  assert.ok(fit.sellsTo.includes("local businesses"));
  assert.equal(fit.place.city, "Pune");
  assert.ok(planFor(fit, { label: "OpenStreetMap" }).some((p) => p.step === "local"));
  assert.ok(!planFor(assessFit(evidence()), { label: "OpenStreetMap" }).some((p) => p.step === "local"));
});

test("map listings: the scraper's CSV is read and needs come from the listing", () => {
  const rows = parseCsv('title,category,website,phone,review_rating,review_count,link,status\n"Smile, Dental",Dentist,,+91 1,3.8,12,https://maps/x,\n');
  assert.equal(rows[0].title, "Smile, Dental");
  const [place] = placesFromScraperCsv('title,category,website,phone,review_rating,review_count,link,status\n"Smile, Dental",Dentist,,+91 1,3.8,12,https://maps/x,\n');
  assert.equal(place.rating, 3.8);
  assert.equal(serviceNeed("web design agency"), "website");
  assert.deepEqual(scoreNeeds(place, "website").needs, ["No website on its listing"]);
  assert.ok(scoreNeeds(place, "reviews").needs.includes("Rated 3.8 on Google"));
});

test("an X profile counts only when the name matches and the bio names the company", () => {
  const ok = xProfileFromResult({ url: "https://x.com/MarieMartens", title: "Marie (@MarieMartens) / X", content: "Bootstrapping @TallyForms with @filipminev. tally.so" }, "Marie Martens", { name: "Tally", domain: "tally.so" });
  assert.deepEqual(ok, { handle: "MarieMartens", url: "https://x.com/MarieMartens" });
  assert.equal(xProfileFromResult({ url: "https://x.com/MarieMartens", title: "Marie (@MarieMartens) / X", content: "Photographer in Ghent" }, "Marie Martens", { name: "Tally", domain: "tally.so" }), null);
  assert.equal(xProfileFromResult({ url: "https://x.com/TallyForms/status/1", title: "Tally (@TallyForms) / X", content: "tally.so" }, "Marie Martens", { name: "Tally", domain: "tally.so" }), null);
});

test("title case keeps apostrophes lower case", () => {
  assert.equal(titleCase("india's fastest growing"), "India's Fastest Growing");
});

test("keywords: services are phrases, buyers' searches are checked, gaps are suggested", async () => {
  const { serviceKeywords, buyerQueries, positionOf, suggestKeywords } = await import("../src/lib/prospecting/keywords.ts");
  const services = serviceKeywords({ phrases: ["AI career coach"], keywords: ["interview practice", "job link", "message", "whatsapp"], areas: [], related: ["mock interview"] });
  assert.deepEqual(services, ["ai career coach", "interview practice", "mock interview"]);
  assert.deepEqual(buyerQueries(["mock interview"]), ["best mock interview", "mock interview recommendations", "top mock interview tools"]);
  assert.equal(positionOf([{ domain: "a.com" }, { domain: "www.praxy.me" }], "praxy.me"), 2);
  const hits = ["x.com", "y.com", "z.com"].map((domain) => ({ domain, title: "Top interview questions", content: "Practice common interview questions with mock interviews rather than guessing." }));
  const out = suggestKeywords(hits, "AI career coach for interview practice", services).map((s) => s.phrase);
  assert.ok(out.some((p) => p.includes("interview questions")));
  assert.ok(!out.includes("rather than"), "phrases unrelated to the services are not suggested");
});

test("hiring signals: job posts name the company; roles follow the product", async () => {
  const { hiringRoles, jobPostFromResult } = await import("../src/lib/prospecting/hiring.ts");
  assert.deepEqual(hiringRoles("cold email outreach"), ["Sales Development Representative", "Account Executive", "Head of Sales"]);
  assert.equal(jobPostFromResult({ url: "https://jobs.lever.co/acme/123-abc", title: "Acme - SDR", published: null }, "SDR").slug, "acme");
  assert.equal(jobPostFromResult({ url: "https://wellfound.com/company/acme-labs/jobs/1-sdr", title: "SDR at Acme Labs", published: null }, "SDR").slug, "acme-labs");
  assert.equal(jobPostFromResult({ url: "https://jobs.lever.co/acme", title: "Acme jobs", published: null }, "SDR"), null, "a board's own page is not a post");
});

test("published emails: only what the page shows, never guessed", async () => {
  const { publishedEmails } = await import("../src/lib/prospecting/text.ts");
  assert.deepEqual(publishedEmails('<a href="mailto:Hello@Tally.so?subject=x">x</a> sales@tally.so logo@2x.png noreply@tally.so'), ["hello@tally.so", "sales@tally.so"]);
});

test("likely emails come only from a format the company publishes for a named person", async () => {
  const { likelyEmails, learnFormat } = await import("../src/lib/prospecting/email-pattern.ts");
  const people = ["Marie Martens", "Filip Minev"];
  assert.equal(learnFormat(["hello@tally.so", "sales@tally.so"], people, "tally.so"), null, "role addresses teach nothing");
  const out = likelyEmails(["marie@tally.so"], people, "tally.so");
  assert.equal(out.get("Filip Minev").email, "filip@tally.so");
  assert.equal(out.get("Filip Minev").verified, false);
  assert.match(out.get("Marie Martens").basis, /published/);
  assert.equal(likelyEmails(["jane.doe@other.com"], people, "tally.so").size, 0, "another domain teaches nothing");
});

test("every lead carries BANT with evidence", async () => {
  const { scorePerson, leadsCsv } = await import("../src/lib/live-demo/leads.ts");
  const lead = scorePerson({ company: "Acme", domain: "acme.io", name: "Jane Doe", title: "Head of Sales", source: null, profileUrl: null }, { domain: "acme.io", name: "Acme", description: null, signal: "Hiring a Sales Development Representative" }, ["Head of Sales"]);
  assert.equal(lead.bant.authority.met, true);
  assert.equal(lead.bant.timing.met, true);
  assert.match(leadsCsv([lead]), /budget\+authority\+need\+timing/);
});
