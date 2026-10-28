// LOCAL EMULATOR E2E DRIVER (test-only). Requires: RTDB emulator on 127.0.0.1:9000 (firebase emulators:start --only database --project demo-threadly) + next start with FIREBASE_DATABASE_EMULATOR_HOST, ENABLE_DEMO_MODE=true, OUTBOUND_ENABLED=true, OUTBOUND_DATA_ROOT=outbound-test. Evidence class: localHTTP+emulator, never production RTDB or real providers.
// Threadly enterprise-outbound LOCAL HTTP e2e driver.
// Exercises the real Next.js route handlers over real HTTP against the local
// RTDB emulator (FIREBASE_DATABASE_EMULATOR_HOST). Evidence class: localHTTP
// + emulator RTDB - NOT production RTDB, NOT real providers. Sends are mock.
import { createHmac } from "node:crypto";
import { writeFileSync } from "node:fs";

const BASE = "http://localhost:3100";
const EMU = "http://127.0.0.1:9000";
const NS = "demo-threadly";
const TENANT = "demo-founder-uid"; // demo-token identity (ENABLE_DEMO_MODE=true)
const ADA = `ada.r${Date.now()}@gmail.com`; // fresh per run: suppression is tenant-wide
const UNSUB_SECRET = "local-test-secret";
const H = { Authorization: "Bearer demo-token", "Content-Type": "application/json" };

const evidence = [];
function deepFind(obj, key) {
  if (!obj || typeof obj !== "object") return undefined;
  if (key in obj) return obj[key];
  for (const v of Object.values(obj)) { const r = deepFind(v, key); if (r !== undefined) return r; }
  return undefined;
}
async function step(name, method, path, body, note = "") {
  let rec = { step: name, method, path, note };
  try {
    const res = await fetch(BASE + path, { method, headers: H, body: body === undefined ? undefined : JSON.stringify(body) });
    const text = await res.text();
    let json; try { json = JSON.parse(text); } catch { json = null; }
    rec.status = res.status; rec.body = json ?? text.slice(0, 300);
  } catch (e) { rec.status = "FETCH_ERROR"; rec.body = String(e); }
  evidence.push(rec);
  console.log(`${rec.status}\t${name}\t${JSON.stringify(rec.body).slice(0, 220)}`);
  return rec;
}
async function emuGet(path) { const r = await fetch(`${EMU}/${path}.json?ns=${NS}`); return r.json(); }
async function emuPut(path, value) { const r = await fetch(`${EMU}/${path}.json?ns=${NS}`, { method: "PUT", headers: { "Content-Type": "application/json" }, body: JSON.stringify(value) }); return r.status; }
function unsubUrl(email, campaignId) {
  const sig = createHmac("sha256", UNSUB_SECRET).update(`${TENANT}|${email.toLowerCase()}|${campaignId}`).digest("hex").slice(0, 32);
  const e = Buffer.from(email.toLowerCase(), "utf8").toString("base64url");
  return `/api/outbound/unsubscribe?t=${encodeURIComponent(TENANT)}&e=${encodeURIComponent(e)}&c=${encodeURIComponent(campaignId)}&sig=${sig}`;
}

// ---------- A: setup ----------
const icpCreate = await step("A1 icp create draft", "POST", "/api/outbound/icp", { action: "create", roles: ["sales", "growth"], regions: ["IN"], employeeBands: ["51-200"], sectors: ["saas"], exclusions: ["competitor.example"], approvedClaims: ["Cuts prospecting time"] });
const icpVersionId = deepFind(icpCreate.body, "icpVersionId");
await step("A2 icp confirm+activate", "POST", "/api/outbound/icp", { action: "confirm", icpVersionId });
await step("A3 icp GET current", "GET", "/api/outbound/icp");
await step("A4 source register", "POST", "/api/outbound/sources", { sourceName: "acmedata", licensePermitsUse: true, termsUrl: "https://acme.example/terms" });
const snd = await step("A5 sender register (stays pending_consent)", "POST", "/api/outbound/senders", { email: "rep@gothreadly.live", provider: "gmail" });
const senderId = deepFind(snd.body, "senderId");
const camp = await step("A6 campaign create", "POST", "/api/outbound/campaigns", { action: "create", campaignId: "e2ecampB", spec: { senderAllowlist: [senderId], templates: [{ step: 1, subject: "Quick question, {{first_name}}", body: "Hi {{first_name}}, quick question." }], allowedPersonalization: ["first_name"], followUpCount: 1, expiresAt: "2027-01-01T00:00:00Z" } });
const appr = await step("A7 campaign approve", "POST", "/api/outbound/campaigns", { action: "approve", campaignId: "e2ecampB", version: 1 });
const approvalId = deepFind(appr.body, "approvalId");

// ---------- B: data in ----------
const csv = `email,fullName,accountName,accountDomain\n${ADA},Ada Lovelace,Acme,acme.com\nbob@competitor.example,Bob Builder,Competitor,competitor.example\ncarol@zz-no-such-domain-e2e.example,Carol Danvers,Ghost,zz-no-such-domain-e2e.example`;
await step("B1 import preview", "POST", "/api/outbound/import", { action: "preview", csv, mapping: { email: "email", fullName: "fullName", accountName: "accountName", accountDomain: "accountDomain" } });
const imp = await step("B2 import commit (rights confirmed)", "POST", "/api/outbound/import", { action: "commit", csv, mapping: { email: "email", fullName: "fullName", accountName: "accountName", accountDomain: "accountDomain" }, sourceName: "acmedata", acquiredAt: "2026-10-01", rightsConfirmed: true, subscriberClass: "corporate", country: "IN" });
const contactsNode = (await emuGet(`outbound-test/${TENANT}/contacts`)) ?? {};
const contacts = Object.values(contactsNode);
const ada = contacts.find((c) => c.email === ADA.toLowerCase());
const bob = contacts.find((c) => c.email === "bob@competitor.example");
const carol = contacts.find((c) => c.email === "carol@zz-no-such-domain-e2e.example");
const adaId = ada?.contactId, bobId = bob?.contactId, carolId = carol?.contactId;
console.log("ids:", JSON.stringify({ icpVersionId, senderId, approvalId, adaId, bobId, carolId }));
await step("B3 verification ada (gmail MX present -> unknown, never valid)", "POST", "/api/outbound/verification", { contactId: adaId });
await step("B4 verification carol (no MX -> invalid)", "POST", "/api/outbound/verification", { contactId: carolId });
await step("B5 fit-score ada vs active ICP", "POST", "/api/outbound/fit-scores", { contactId: adaId, icpVersionId: "current" });
const enrAda = await step("B6 enroll ada", "POST", "/api/outbound/enrollments", { campaignId: "e2ecampB", version: 1, approvalId, contactId: adaId });
const adaEnrollId = deepFind(enrAda.body, "enrollmentId");
await step("B7 enroll bob (ICP-excluded domain -> blocked)", "POST", "/api/outbound/enrollments", { campaignId: "e2ecampB", version: 1, approvalId, contactId: bobId });

// ---------- C: plan with honest gates ----------
await step("C1 plan: ada verification=unknown -> skip w/ reason (fail-closed gate)", "POST", "/api/outbound/plan", { campaignId: "e2ecampB" });

// ---------- D: labeled fixture assist (routes never mint these states) ----------
// verification.state=valid requires a paid mailbox provider (owner decision);
// sender active requires OAuth consent (owner decision). Seed both directly
// in the EMULATOR as fixtures to exercise downstream route mechanics.
const adaNode = await emuGet(`outbound-test/${TENANT}/contacts/${adaId}`);
if (adaNode) {
  adaNode.verification = { state: "valid", verifiedAt: new Date().toISOString(), verifier: "fixture_seed_emulator_only" };
  await emuPut(`outbound-test/${TENANT}/contacts/${adaId}`, adaNode);
  console.log("fixture: ada verification seeded valid (emulator only)");
}
const sndNode = await emuGet(`outbound-test/${TENANT}/senders/${senderId}`);
if (sndNode) {
  sndNode.status = "active"; // fixture: stands in for an OAuth consent grant
  sndNode.fixtureNote = "status seeded active in emulator only; real activation requires OAuth consent";
  await emuPut(`outbound-test/${TENANT}/senders/${senderId}`, sndNode);
  console.log("fixture: sender seeded active (emulator only)");
}
await step("C1b preflight sender domain BEFORE dispatch", "POST", "/api/outbound/preflight", { domain: "gothreadly.live" });
await step("C2 plan after fixture: intent created for ada only", "POST", "/api/outbound/plan", { campaignId: "e2ecampB" });
await step("C3 drafts run (mock render, cost recorded UNKNOWN)", "POST", "/api/outbound/drafts", { campaignId: "e2ecampB" });
await step("C4 drafts list", "GET", "/api/outbound/drafts?campaignId=e2ecampB");
const draftId = deepFind((evidence[evidence.length - 1]).body, "draftId");
await step("C4b draft approve (human review)", "POST", "/api/outbound/drafts", { action: "approve", draftId });
const ks = await step("C5 kill switch engage (campaign)", "POST", "/api/outbound/killswitches", { scope: "campaign", target: "e2ecampB", reason: "e2e gate check" });
const switchId = deepFind(ks.body, "switchId");
await step("C6 dispatch while kill switch active -> blocked", "POST", "/api/outbound/dispatch", { campaignId: "e2ecampB" });
await step("C7 kill switch lift", "POST", "/api/outbound/killswitches", { action: "lift", switchId });
await step("C8 dispatch after lift (mock provider; cost gate expected)", "POST", "/api/outbound/dispatch", { campaignId: "e2ecampB" });
await step("C9 preflight gothreadly.live (real DNS)", "POST", "/api/outbound/preflight", { domain: "gothreadly.live" });
await step("C10 preflight nonexistent domain -> fail", "POST", "/api/outbound/preflight", { domain: "zz-no-such-domain-e2e.example" });

// ---------- D2: experiments ----------
const exp = await step("D1 experiment create (draft, holdout 10)", "POST", "/api/outbound/experiments", { campaignId: "e2ecampB", campaignVersion: 1, variants: [{ key: "b", templates: [{ step: 1, subject: "Alt subject", body: "Alt body {{first_name}}" }] }], holdoutPercent: 10 });
const experimentId = deepFind(exp.body, "experimentId");
await step("D2 experiment activate (variants approved)", "POST", "/api/outbound/experiments", { action: "activate", experimentId, variantsApproved: true });

// ---------- E: replies, classification, response policy ----------
await step("E1 human reply recorded -> cancellable intents cancelled", "POST", "/api/outbound/replies", { campaignId: "e2ecampB", enrollmentId: adaEnrollId });
const conv = await step("E2 conversation classify (assistive)", "POST", "/api/outbound/conversations", { contactId: adaId, replyText: "This looks interesting, can we talk next week?" });
const conversationId = deepFind(conv.body, "conversationId");
await step("E3 conversation reclassify (human edit)", "POST", "/api/outbound/conversations", { action: "reclassify", conversationId, classification: "interested" });
await step("E4 conversation assign owner", "POST", "/api/outbound/conversations", { action: "assign-owner", conversationId, ownerUserId: TENANT });
const rp = await step("E5 response policy save", "POST", "/api/outbound/response-policies", { rules: [{ intent: "interested", category: "scheduling", templateId: "tmpl_book", templateText: "Here is my booking link: {{booking_link}}" }] });
await step("E6 response policy evaluate (DECIDE only, nothing sent)", "POST", "/api/outbound/response-policies", { action: "evaluate", intent: "interested", replyText: "can we talk next week?" });
void rp;

// ---------- F: booking + unsubscribe ----------
const pol = await step("F1 booking policy save", "POST", "/api/outbound/meetings", { action: "save-policy", hostPool: [senderId], durationMinutes: 30, startHour: 9, endHour: 17, timezone: "Asia/Kolkata" });
const policyId = deepFind(pol.body, "policyId");
const link = await step("F2 booking link create (mock calendar)", "POST", "/api/outbound/meetings", { action: "create-booking-link", contactId: adaId, organizerSenderId: senderId, policyId });
const bookingUrl = deepFind(link.body, "bookingUrl");
if (bookingUrl) {
  const token = new URL(bookingUrl).pathname.split("/").pop();
  await step("F3 public booking page (no auth)", "GET", `/api/outbound/booking/${token}`);
}
await step("F4 unsubscribe GET page", "GET", unsubUrl(ADA, "e2ecampB"));
await step("F5 unsubscribe POST one-click", "POST", unsubUrl(ADA, "e2ecampB"));
await step("F6 unsubscribe tampered sig -> invalid", "GET", "/api/outbound/unsubscribe?t=x&e=YUBiYw&c=e2ecampB&sig=deadbeef");
await step("F7 enroll ada after suppression (record ok; planner gates sends)", "POST", "/api/outbound/enrollments", { campaignId: "e2ecampB", version: 1, approvalId, contactId: adaId });
await step("F8 suppressions list", "GET", "/api/outbound/suppressions");

// ---------- G: accounting, export, retention, webhooks, isolation ----------
await step("G1 usage (lower bound, costComplete)", "GET", "/api/outbound/usage");
await step("G2 export", "GET", "/api/outbound/export");
await step("G3 retention dry run", "POST", "/api/outbound/retention", { execute: false });
await step("G4 gmail webhook without token -> fail closed", "POST", "/api/outbound/webhooks/gmail", { message: { data: "e2e" } });
const prodRoot = await emuGet("outbound");
evidence.push({ step: "G5 isolation: production root 'outbound' on emulator", status: prodRoot === null ? "ABSENT (pass)" : "PRESENT (fail)", body: prodRoot });
console.log(`isolation: outbound root = ${JSON.stringify(prodRoot)}`);
const testRoot = await emuGet(`outbound-test/${TENANT}`);
evidence.push({ step: "G6 isolation: outbound-test tenant tree keys", status: "info", body: testRoot ? Object.keys(testRoot) : null });
console.log(`tenant tree keys: ${testRoot ? Object.keys(testRoot).join(",") : "null"}`);

writeFileSync("/tmp/e2e-evidence.jsonl", evidence.map((e) => JSON.stringify(e)).join("\n") + "\n");
console.log(`\nevidence written: ${evidence.length} records -> /tmp/e2e-evidence.jsonl`);
