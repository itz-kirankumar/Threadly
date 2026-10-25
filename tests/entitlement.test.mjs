import { test } from "node:test";
import assert from "node:assert/strict";
import { decideTransition } from "../src/lib/billing/entitlement.ts";

const base = {
  provider: "dodo",
  eventId: "evt1",
  eventAt: "2026-10-26T10:00:00.000Z",
  subscriptionId: "sub_1",
  customerId: "cus_1",
  customerEmail: "a@b.c",
  plan: "pro",
  interval: "annual",
  mode: "test",
};
const currentActive = {
  provider: "dodo",
  plan: "pro",
  interval: "annual",
  status: "active",
  subscriptionId: "sub_1",
  customerId: "cus_1",
  customerEmail: "a@b.c",
  mode: "test",
  updatedAt: "2026-10-26T09:00:00.000Z",
};

test("new active subscription upgrades", () => {
  const d = decideTransition(null, { ...base, status: "active" });
  assert.equal(d.action, "upgrade");
  assert.equal(d.plan, "pro");
});

test("cancel of the current subscription downgrades", () => {
  const d = decideTransition(currentActive, { ...base, status: "ended" });
  assert.equal(d.action, "downgrade");
});

test("cancel of a superseded subscription is ignored (stale cancel cannot clobber resubscribe)", () => {
  const d = decideTransition({ ...currentActive, subscriptionId: "sub_2" }, { ...base, status: "ended" });
  assert.equal(d.action, "ignore");
});

test("out-of-order event older than applied state is ignored", () => {
  const d = decideTransition(currentActive, { ...base, status: "ended", eventAt: "2026-10-26T08:00:00.000Z" });
  assert.equal(d.action, "ignore");
});

test("grace keeps current plan and records status", () => {
  const d = decideTransition(currentActive, { ...base, status: "grace", eventAt: "2026-10-26T11:00:00.000Z" });
  assert.equal(d.action, "keep");
  assert.equal(d.plan, "pro");
  assert.equal(d.record.status, "grace");
});

test("grace from no record keeps event plan", () => {
  const d = decideTransition(null, { ...base, status: "grace" });
  assert.equal(d.action, "keep");
  assert.equal(d.plan, "pro");
});

test("different subscription activating switches with cancel note", () => {
  const d = decideTransition(currentActive, { ...base, status: "active", subscriptionId: "sub_9", provider: "razorpay", eventAt: "2026-10-26T12:00:00.000Z" });
  assert.equal(d.action, "upgrade");
  assert.match(d.note, /cancel the old one/);
  assert.equal(d.record.provider, "razorpay");
});

test("unknown status ignored", () => {
  const d = decideTransition(currentActive, { ...base, status: "unknown" });
  assert.equal(d.action, "ignore");
});
