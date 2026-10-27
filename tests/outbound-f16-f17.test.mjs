import { test } from "node:test";
import assert from "node:assert/strict";

const { reclassifyConversation, assignConversationOwner, routeUncertain, MemoryConversationStore } = await import("../src/lib/outbound/conversations.ts");
const { createResponsePolicy, evaluateAutoResponse, activePolicy, MemoryResponsePolicyStore } = await import("../src/lib/outbound/auto-responses.ts");

const NOW = new Date("2026-10-28T12:00:00Z");
const mkConv = (over) => ({
  tenantId: "t1", conversationId: "cv1", contactId: "ct1", enrollmentId: "enr1",
  humanReplySeenAt: NOW.toISOString(), classification: "uncertain", classifiedBy: "auto", ownerUserId: null,
  createdAt: NOW.toISOString(), createdBy: "u1", ...over,
});

test("F16: human reclassification is authoritative and editable; never touches humanReplySeenAt", async () => {
  const store = new MemoryConversationStore();
  await store.saveConversation(mkConv({}));
  const updated = await reclassifyConversation(store, { tenantId: "t1", conversationId: "cv1", intent: "interested", actor: "admin1" });
  assert.equal(updated.classification, "interested");
  assert.equal(updated.classifiedBy, "human");
  assert.equal(updated.humanReplySeenAt, NOW.toISOString()); // unchanged - no follow-up resurrection
  const again = await reclassifyConversation(store, { tenantId: "t1", conversationId: "cv1", intent: "not_now", actor: "admin1" });
  assert.equal(again.classification, "not_now"); // editable repeatedly
});

test("F16: owner routing assigns; uncertain+unowned reaches the fallback person", async () => {
  const store = new MemoryConversationStore();
  await store.saveConversation(mkConv({}));
  const routed = await routeUncertain(store, { tenantId: "t1", conversationId: "cv1", fallbackOwnerUserId: "owner1" });
  assert.equal(routed.assigned, true);
  assert.equal(routed.conversation.ownerUserId, "owner1");
  // already-owned uncertain: no reassignment
  const routed2 = await routeUncertain(store, { tenantId: "t1", conversationId: "cv1", fallbackOwnerUserId: "other" });
  assert.equal(routed2.assigned, false);
  assert.equal(routed2.conversation.ownerUserId, "owner1");
  // classified (not uncertain): no forced routing
  await store.saveConversation(mkConv({ conversationId: "cv2", classification: "interested" }));
  assert.equal((await routeUncertain(store, { tenantId: "t1", conversationId: "cv2", fallbackOwnerUserId: "owner1" })).assigned, false);
  // explicit assignment works regardless
  const owned = await assignConversationOwner(store, { tenantId: "t1", conversationId: "cv2", ownerUserId: "rep7", actor: "a" });
  assert.equal(owned.ownerUserId, "rep7");
});

const policyInput = {
  tenantId: "t1", version: 1, actor: "u1", now: NOW,
  rules: [{ intent: "interested", category: "scheduling", templateId: "tmpl_book", templateText: "Thanks! Here is my booking link: ..." }],
};

test("F17: approved factual/scheduling rule auto-sends frozen template text", () => {
  const policy = createResponsePolicy(policyInput);
  const d = evaluateAutoResponse(policy, { intent: "interested", replyText: "Sounds good, let's talk" });
  assert.equal(d.action, "auto_send_template");
  assert.equal(d.templateText, "Thanks! Here is my booking link: ...");
});

test("F17: legal, security and pricing content escalates ALWAYS, overriding a matching rule", () => {
  const policy = createResponsePolicy(policyInput);
  for (const [text, why] of [
    ["Interested, but please send your DPA and legal terms", "legal"],
    ["Sounds good - also, any SOC 2 or breach history?", "security"],
    ["Let's talk - what is the pricing and can we get a discount?", "pricing"],
  ]) {
    const d = evaluateAutoResponse(policy, { intent: "interested", replyText: text });
    assert.equal(d.action, "escalate", text);
    assert.match(d.reason, new RegExp(why));
  }
});

test("F17: uncertain always escalates; no rule, no policy and retired policy escalate", () => {
  const policy = createResponsePolicy(policyInput);
  assert.equal(evaluateAutoResponse(policy, { intent: "uncertain", replyText: "hmm" }).reason, "uncertain_reaches_a_person");
  assert.equal(evaluateAutoResponse(policy, { intent: "negative", replyText: "no thanks" }).reason, "no_rule_for_negative");
  assert.equal(evaluateAutoResponse(null, { intent: "interested", replyText: "yes" }).reason, "no_active_policy");
  assert.equal(evaluateAutoResponse({ ...policy, status: "retired" }, { intent: "interested", replyText: "yes" }).reason, "no_active_policy");
});

test("F17: policy creation freezes rules; non-factual/scheduling or empty text rejected", () => {
  assert.throws(() => createResponsePolicy({ ...policyInput, rules: [{ intent: "interested", category: "opinion", templateId: "x", templateText: "y" }] }), /factual or scheduling/);
  assert.throws(() => createResponsePolicy({ ...policyInput, rules: [{ intent: "interested", category: "factual", templateId: "x", templateText: " " }] }), /templateText is required/);
});

test("F17: store + activePolicy resolves the highest active version", async () => {
  const store = new MemoryResponsePolicyStore();
  const v1 = createResponsePolicy(policyInput);
  const v2 = createResponsePolicy({ ...policyInput, version: 2, now: new Date(NOW.getTime() + 1000) });
  await store.save(v1); await store.save(v2);
  assert.equal(activePolicy(await store.list("t1")).policyId, v2.policyId);
  await store.save({ ...v2, status: "retired" });
  assert.equal(activePolicy(await store.list("t1")).policyId, v1.policyId);
  assert.equal((await store.list("t2")).length, 0);
});
