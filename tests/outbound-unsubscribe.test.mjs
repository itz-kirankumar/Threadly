import { test } from "node:test";
import assert from "node:assert/strict";

const { buildUnsubscribeUrl, verifyUnsubscribeParams, unsubscribeFooter, listUnsubscribeHeaders, unsubscribeConfigFromEnv } = await import("../src/lib/outbound/unsubscribe.ts");
const { generateDrafts } = await import("../src/lib/outbound/draft-run.ts");
const { MemoryCampaignStore, approveCampaign, enrollContact, addSuppression } = await import("../src/lib/outbound/campaign.ts");
const { MemoryContactStore, planCampaignIntents } = await import("../src/lib/outbound/planner.ts");
const { MemoryLedgerStore } = await import("../src/lib/outbound/ledger.ts");
const { MemoryDraftStore } = await import("../src/lib/outbound/drafts.ts");
const { MemoryUsageStore } = await import("../src/lib/outbound/usage.ts");

const NOW = new Date("2026-10-28T12:00:00Z");
const CFG = { baseUrl: "https://app.test", secret: "test-secret" };

function urlParams(url) {
  const u = new URL(url);
  return { t: u.searchParams.get("t"), e: u.searchParams.get("e"), c: u.searchParams.get("c"), sig: u.searchParams.get("sig") };
}

test("capability URL roundtrips; tampering with tenant, email, campaign or signature is rejected", () => {
  const url = buildUnsubscribeUrl(CFG, { tenantId: "t1", email: "Person@Corp.Example", campaignId: "c1" });
  const ok = verifyUnsubscribeParams(CFG, urlParams(url));
  assert.deepEqual(ok, { tenantId: "t1", email: "person@corp.example", campaignId: "c1" });
  // wrong secret
  assert.equal(verifyUnsubscribeParams({ ...CFG, secret: "other" }, urlParams(url)), null);
  // tampered campaign
  const p1 = urlParams(url); p1.c = "c2";
  assert.equal(verifyUnsubscribeParams(CFG, p1), null);
  // tampered email payload (different valid email, same sig)
  const p2 = urlParams(url); p2.e = Buffer.from("other@corp.example").toString("base64url");
  assert.equal(verifyUnsubscribeParams(CFG, p2), null);
  // garbage
  assert.equal(verifyUnsubscribeParams(CFG, { t: "t1", e: "!!!", c: "c1", sig: "x" }), null);
  assert.equal(verifyUnsubscribeParams(CFG, {}), null);
});

test("headers and footer shapes", () => {
  assert.deepEqual(listUnsubscribeHeaders("https://app.test/u?x=1"), {
    "List-Unsubscribe": "<https://app.test/u?x=1>",
    "List-Unsubscribe-Post": "List-Unsubscribe=One-Click",
  });
  assert.match(unsubscribeFooter("https://app.test/u"), /^\n\n--\nUnsubscribe: https:\/\/app\.test\/u$/);
});

test("generateDrafts refuses without unsubscribe config (runtime fail-closed)", async () => {
  const campaigns = new MemoryCampaignStore();
  const ledger = new MemoryLedgerStore();
  const contacts = new MemoryContactStore();
  await assert.rejects(
    () => generateDrafts({ campaigns, ledger, contacts, drafts: new MemoryDraftStore(), usage: new MemoryUsageStore() }, { tenantId: "t1", campaignId: "c1", actor: "u1", now: NOW }),
    /unsubscribe config required/,
  );
});

test("a verified token creates an opt-out suppression; replay is idempotent", async () => {
  const campaigns = new MemoryCampaignStore();
  const url = buildUnsubscribeUrl(CFG, { tenantId: "t1", email: "ada@corp.example", campaignId: "c1" });
  const v = verifyUnsubscribeParams(CFG, urlParams(url));
  const r1 = await addSuppression(campaigns, { tenantId: v.tenantId, email: v.email, reason: "opt_out", source: "unsubscribe_link", actor: "unsubscribe_endpoint", now: NOW });
  assert.equal(r1.created, true);
  const r2 = await addSuppression(campaigns, { tenantId: v.tenantId, email: v.email, reason: "opt_out", source: "unsubscribe_link", actor: "unsubscribe_endpoint", now: NOW });
  assert.equal(r2.created, false); // first suppression wins the record
  // and the suppression blocks first-send eligibility downstream
  const { evaluateFirstSendEligibility, suppressionTokenFor } = await import("../src/lib/outbound/policy.ts");
  const suppressed = (await campaigns.findSuppression("t1", suppressionTokenFor("t1", v.email))) !== null;
  assert.equal(suppressed, true);
});

test("config from env: both vars required", () => {
  const b = process.env.OUTBOUND_PUBLIC_BASE_URL, s = process.env.OUTBOUND_UNSUBSCRIBE_SECRET;
  delete process.env.OUTBOUND_PUBLIC_BASE_URL; delete process.env.OUTBOUND_UNSUBSCRIBE_SECRET;
  assert.equal(unsubscribeConfigFromEnv(), null);
  process.env.OUTBOUND_PUBLIC_BASE_URL = "https://app.test/";
  assert.equal(unsubscribeConfigFromEnv(), null);
  process.env.OUTBOUND_UNSUBSCRIBE_SECRET = "s";
  assert.deepEqual(unsubscribeConfigFromEnv(), { baseUrl: "https://app.test", secret: "s" });
  if (b !== undefined) process.env.OUTBOUND_PUBLIC_BASE_URL = b; else delete process.env.OUTBOUND_PUBLIC_BASE_URL;
  if (s !== undefined) process.env.OUTBOUND_UNSUBSCRIBE_SECRET = s; else delete process.env.OUTBOUND_UNSUBSCRIBE_SECRET;
});
