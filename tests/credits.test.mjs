import { test } from "node:test";
import assert from "node:assert/strict";

const ledger = await import("../src/lib/credits/ledger.ts");
const { stepBill, keepPaid } = await import("../src/lib/credits/prospecting.ts");
const { decideCreditGrant } = await import("../src/lib/credits/fulfil.ts");
const { CREDIT_PACKS, CREDIT_RATES, WELCOME_CREDITS } = await import("../src/lib/credits/rates.ts");

let n = 0;
const ws = () => `ws_test_${Date.now()}_${n++}`;

test("a new workspace starts with the welcome credits, once", async () => {
  const uid = ws();
  assert.equal((await ledger.getAccount(uid)).balance, WELCOME_CREDITS);
  assert.equal((await ledger.getAccount(uid)).balance, WELCOME_CREDITS);
  assert.ok((await ledger.getAccount(uid)).grants.welcome);
});

test("a charge takes only what the balance covers and never goes negative", async () => {
  const uid = ws();
  const scans = await ledger.charge(uid, "scan", 25, "scans");
  assert.equal(scans.units, Math.floor(WELCOME_CREDITS / CREDIT_RATES.scan));
  assert.equal(scans.balance, WELCOME_CREDITS - scans.units * CREDIT_RATES.scan);
  const none = await ledger.charge(uid, "scan", 1, "one more");
  assert.equal(none.units, 0);
  await assert.rejects(ledger.assertCanAfford(uid, "scan"), (e) => e instanceof ledger.InsufficientCredits && e.status === 402);
});

test("a payment grants credits once, however many times it is reported", async () => {
  const uid = ws();
  const first = await ledger.grant(uid, 1000, "Starter pack", "razorpay_pay_1");
  const again = await ledger.grant(uid, 1000, "Starter pack", "razorpay_pay_1");
  assert.equal(first.granted, true);
  assert.equal(again.granted, false);
  assert.equal(again.balance, WELCOME_CREDITS + 1000);
  const history = await ledger.getHistory(uid);
  assert.equal(history.filter((e) => e.kind === "grant").length, 1);
});

test("history records charges with the balance after", async () => {
  const uid = ws();
  await ledger.charge(uid, "company", 3, "Prospecting: companies");
  const [latest] = await ledger.getHistory(uid);
  assert.deepEqual([latest.kind, latest.credits, latest.units, latest.balanceAfter], ["charge", -3, 3, WELCOME_CREDITS - 3]);
});

const company = (domain) => ({ domain, name: domain, description: null, campaignId: "c", matchedTerms: [], selected: true, evidence: [] });
const contact = (domain, email) => ({ id: email, companyDomain: domain, name: email, firstName: null, title: null, email, confidence: null, verification: null, linkedinUrl: null, source: "hunter", evidence: [] });

test("prospecting steps bill only the results they add, and unpaid results are dropped", () => {
  const before = { version: 1, updatedAt: "", companies: { items: [company("a.com")], queries: [], skipped: [], ranAt: "" } };
  const after = { ...before, companies: { ...before.companies, items: [company("a.com"), company("b.com"), company("c.com"), company("d.com")] } };
  assert.deepEqual(stepBill("companies", before, after), { action: "company", units: 3 });
  const kept = keepPaid("companies", before, after, 1);
  assert.deepEqual(kept.companies.items.map((c) => c.domain), ["a.com", "b.com"]);

  const cBefore = { version: 1, updatedAt: "", contacts: { status: "found", provider: "Hunter", items: [contact("a.com", "x@a.com")], searchedDomains: 1, ranAt: "" } };
  const cAfter = { ...cBefore, contacts: { ...cBefore.contacts, items: [contact("a.com", "x@a.com"), contact("b.com", "y@b.com")] } };
  assert.deepEqual(stepBill("contacts", cBefore, cAfter), { action: "contact", units: 1 });
  assert.equal(stepBill("competitors", before, after), null, "competitors are part of the research run");
  assert.deepEqual(stepBill("research", before, after), { action: "research", units: 1 });
});

const paid = { provider: "razorpay", paymentId: "pay_1", status: "captured", amount: CREDIT_PACKS.starter.amount, currency: "USD", tags: { kind: "credits", pack: "starter", workspace_uid: "ws1" } };

test("a captured Razorpay pack payment at the pack price grants that pack", () => {
  const d = decideCreditGrant(paid);
  assert.equal(d.grant, true);
  assert.deepEqual([d.workspaceUid, d.credits, d.ref], ["ws1", CREDIT_PACKS.starter.credits, "razorpay_pay_1"]);
});

test("wrong amount, wrong status, missing workspace or a plan payment grant nothing", () => {
  assert.equal(decideCreditGrant({ ...paid, amount: 100 }).grant, false);
  assert.equal(decideCreditGrant({ ...paid, status: "failed" }).grant, false);
  assert.equal(decideCreditGrant({ ...paid, tags: { ...paid.tags, workspace_uid: "" } }).grant, false);
  assert.equal(decideCreditGrant({ ...paid, tags: { plan: "pro", workspace_uid: "ws1" } }).grant, false);
  assert.equal(decideCreditGrant({ ...paid, tags: { ...paid.tags, pack: "huge" } }).grant, false);
});

test("a Dodo pack payment is matched by product id, not the tax-inclusive total", () => {
  process.env.DODO_PRODUCT_CREDITS_GROWTH = "prod_growth";
  const dodo = { provider: "dodo", paymentId: "p_9", status: "succeeded", amount: 21890, currency: "USD", tags: { kind: "credits", pack: "growth", workspace_uid: "ws2" } };
  assert.equal(decideCreditGrant({ ...dodo, productIds: ["prod_growth"] }).grant, true);
  assert.equal(decideCreditGrant({ ...dodo, productIds: ["prod_other"] }).grant, false);
});

test("the first pack earns the bonus once; later packs do not", async () => {
  const { firstPackBonus } = await import("../src/lib/credits/rates.ts");
  const uid = ws();
  const first = await ledger.grantPack(uid, 1000, "Starter pack", "razorpay_pay_first");
  assert.equal(first.bonus, firstPackBonus(1000));
  const repeat = await ledger.grantPack(uid, 1000, "Starter pack", "razorpay_pay_first");
  assert.equal(repeat.granted, false);
  const second = await ledger.grantPack(uid, 1000, "Starter pack", "dodo_pay_second");
  assert.equal(second.bonus, 0);
  assert.equal(second.balance, WELCOME_CREDITS + 2000 + firstPackBonus(1000));
  assert.ok(firstPackBonus(20000) <= 5000, "bonus is capped");
});
