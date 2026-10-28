// POSITIVE mock-dispatch + booking-completion e2e (test-only, local emulator). All seeds are SYNTHETIC fixtures, labeled; never real DNS, real senders, or production data.
// POSITIVE mock-dispatch + booking-completion e2e (test-only, local emulator).
// ALL seeds below are SYNTHETIC FIXTURES in the local RTDB emulator, labeled
// as such; nothing touches real DNS, real senders, or production data.
import { writeFileSync } from "node:fs";
const BASE = "http://localhost:3100";
const EMU = "http://127.0.0.1:9000";
const NS = "demo-threadly";
const TENANT = "demo-founder-uid";
const H = { Authorization: "Bearer demo-token", "Content-Type": "application/json" };
const evidence = [];
function deepFind(o, k) { if (!o || typeof o !== "object") return undefined; if (k in o) return o[k]; for (const v of Object.values(o)) { const r = deepFind(v, k); if (r !== undefined) return r; } return undefined; }
async function step(name, method, path, body) {
  const rec = { step: name, method, path };
  try {
    const res = await fetch(BASE + path, { method, headers: H, body: body === undefined ? undefined : JSON.stringify(body) });
    const text = await res.text(); let json; try { json = JSON.parse(text); } catch { json = null; }
    rec.status = res.status; rec.body = json ?? text.slice(0, 300);
  } catch (e) { rec.status = "FETCH_ERROR"; rec.body = String(e); }
  evidence.push(rec); console.log(`${rec.status}\t${name}\t${JSON.stringify(rec.body).slice(0, 260)}`); return rec;
}
async function emuPut(path, value) { return (await fetch(`${EMU}/${path}.json?ns=${NS}`, { method: "PUT", headers: { "Content-Type": "application/json" }, body: JSON.stringify(value) })).status; }
async function emuGet(path) { return (await fetch(`${EMU}/${path}.json?ns=${NS}`)).json(); }

const RUN = Date.now().toString(36);
const DOMAIN = "mail.demo.example"; // synthetic domain; no real DNS involved
const CONTACT_EMAIL = `pat.${RUN}@gmail.com`;
const CAMP = `poscamp${RUN}`;

// Sender + SYNTHETIC preflight pass fixture (seeded, labeled; not real DNS evidence)
const snd = await step("P1 sender register (synthetic domain)", "POST", "/api/outbound/senders", { email: `rep@${DOMAIN}`, provider: "gmail" });
const senderId = deepFind(snd.body, "senderId");
const sndNode = await emuGet(`outbound-test/${TENANT}/senders/${senderId}`);
sndNode.status = "active";
sndNode.fixtureNote = "SYNTHETIC FIXTURE: seeded active in emulator only; real activation requires OAuth consent";
await emuPut(`outbound-test/${TENANT}/senders/${senderId}`, sndNode);
await emuPut(`outbound-test/${TENANT}/domainPreflight/${(await import("node:crypto")).createHash("sha256").update(DOMAIN).digest("hex")}`, {
  tenantId: TENANT, domain: DOMAIN, spf: "pass", dkim: "pass", dkimSelector: "synthetic", dmarc: "pass", dmarcPolicy: "reject",
  checkedAt: new Date().toISOString(), createdAt: new Date().toISOString(), createdBy: "fixture_seed",
  evidence: "SYNTHETIC FIXTURE: seeded pass record for local mock-dispatch e2e; NOT real DNS evidence",
});
await emuPut(`outbound-test/${TENANT}/ingestion/cursors/${senderId}`, {
  tenantId: TENANT, senderId, cursor: "synthetic-fixture-cursor", syncedAt: new Date().toISOString(),
  fixtureNote: "SYNTHETIC FIXTURE: seeded fresh sync cursor for local mock-dispatch e2e; real senders sync via provider webhooks",
});
console.log("fixtures: sender active + synthetic preflight pass + fresh sync cursor seeded (emulator only)");

// ICP + source + campaign with EXPLICIT mock-only cost ceiling
const icp = await step("P2 icp create", "POST", "/api/outbound/icp", { action: "create", roles: ["sales"], regions: ["IN"], employeeBands: ["51-200"], sectors: ["saas"], exclusions: [], approvedClaims: ["Cuts prospecting time"] });
await step("P3 icp confirm", "POST", "/api/outbound/icp", { action: "confirm", icpVersionId: deepFind(icp.body, "icpVersionId") });
await step("P4 source register", "POST", "/api/outbound/sources", { sourceName: "acmedata", licensePermitsUse: true, termsUrl: "https://acme.example/terms" });
const camp = await step("P5 campaign create (explicit synthetic cost ceiling)", "POST", "/api/outbound/campaigns", { action: "create", campaignId: CAMP, spec: { senderAllowlist: [senderId], templates: [{ step: 1, subject: "Quick question, {{first_name}}", body: "Hi {{first_name}}, quick question." }], allowedPersonalization: ["first_name"], followUpCount: 0, costCeiling: { currency: "USD", amount: 100000 }, expiresAt: "2027-01-01T00:00:00Z" } });
const appr = await step("P6 campaign approve", "POST", "/api/outbound/campaigns", { action: "approve", campaignId: CAMP, version: 1 });
const approvalId = deepFind(appr.body, "approvalId");

// Contact: import + SYNTHETIC verification-valid fixture
const mapping = { email: "email", fullName: "fullName", accountName: "accountName", accountDomain: "accountDomain" };
const csv = `email,fullName,accountName,accountDomain\n${CONTACT_EMAIL},Pat Morgan,Acme,acme.com`;
await step("P7 import commit", "POST", "/api/outbound/import", { action: "commit", csv, mapping, sourceName: "acmedata", acquiredAt: "2026-10-01", rightsConfirmed: true, subscriberClass: "corporate", country: "IN" });
const contactsNode = (await emuGet(`outbound-test/${TENANT}/contacts`)) ?? {};
const contact = Object.values(contactsNode).find((c) => c.email === CONTACT_EMAIL);
const contactId = contact.contactId;
contact.verification = { state: "valid", verifiedAt: new Date().toISOString(), verifier: "fixture_seed_emulator_only" };
await emuPut(`outbound-test/${TENANT}/contacts/${contactId}`, contact);
console.log("fixture: contact verification seeded valid (emulator only; real valid needs paid provider)");

// Full flow to positive mock dispatch
await step("P8 enroll", "POST", "/api/outbound/enrollments", { campaignId: CAMP, version: 1, approvalId, contactId });
await step("P9 plan", "POST", "/api/outbound/plan", { campaignId: CAMP });
await step("P10 drafts run", "POST", "/api/outbound/drafts", { campaignId: CAMP });
const drafts = await step("P11 drafts list", "GET", `/api/outbound/drafts?campaignId=${CAMP}`);
const draftId = deepFind(drafts.body, "draftId");
await step("P12 draft approve", "POST", "/api/outbound/drafts", { action: "approve", draftId });
const d1 = await step("P13 DISPATCH #1 (mock provider; expect 1 synthetic accept)", "POST", "/api/outbound/dispatch", { campaignId: CAMP });
const d2 = await step("P14 DISPATCH #2 (idempotency: expect 0 new, no duplicate)", "POST", "/api/outbound/dispatch", { campaignId: CAMP });
await step("P15 usage (mock send marked synthetic, excluded from real counts)", "GET", "/api/outbound/usage");

// Booking completion
const pol = await step("P16 booking policy save", "POST", "/api/outbound/meetings", { action: "save-policy", hostPool: [senderId], durationMinutes: 30, startHour: 9, endHour: 17, timezone: "Asia/Kolkata" });
const policyId = deepFind(pol.body, "policyId");
const link = await step("P17 booking link create", "POST", "/api/outbound/meetings", { action: "create-booking-link", contactId, organizerSenderId: senderId, policyId });
const bookingUrl = deepFind(link.body, "bookingUrl");
const token = new URL(bookingUrl).pathname.split("/").pop();
const offer = await step("P18 booking offer (public)", "GET", `/api/outbound/booking/${token}`);
const slot = offer.body?.slots?.[0]?.startISO;
await step("P19 slot select -> meeting booked (mock calendar, synthetic)", "POST", `/api/outbound/booking/${token}`, { startISO: slot });
await step("P20 same link reuse -> single-use enforced", "POST", `/api/outbound/booking/${token}`, { startISO: slot });
await step("P21 meetings list (booked, synthetic-labeled)", "GET", "/api/outbound/meetings");

writeFileSync("/tmp/e2e-positive-evidence.jsonl", evidence.map((e) => JSON.stringify(e)).join("\n") + "\n");
console.log(`\nevidence: ${evidence.length} records -> /tmp/e2e-positive-evidence.jsonl`);
