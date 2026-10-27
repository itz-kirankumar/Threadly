import { test } from "node:test";
import assert from "node:assert/strict";

const { MemoryConversationStore, classifyReplyText } = await import("../src/lib/outbound/conversations.ts");

test("reply classification maps clear signals, defaults to uncertain", () => {
  assert.equal(classifyReplyText("Please unsubscribe me"), "opt_out");
  assert.equal(classifyReplyText("I am out of office until Monday"), "out_of_office");
  assert.equal(classifyReplyText("Not interested, thanks"), "negative");
  assert.equal(classifyReplyText("Try my colleague, I'm not the right person"), "wrong_person");
  assert.equal(classifyReplyText("Circle back next quarter"), "not_now");
  assert.equal(classifyReplyText("Sounds good, let's talk"), "interested");
  assert.equal(classifyReplyText("hmm"), "uncertain");
});

test("conversation store tenant isolation", async () => {
  const s = new MemoryConversationStore();
  const now = new Date().toISOString();
  await s.saveConversation({
    tenantId: "t1", conversationId: "cv1", contactId: "k1", enrollmentId: null,
    humanReplySeenAt: now, classification: "interested", classifiedBy: "auto",
    ownerUserId: null, createdAt: now, createdBy: "u1",
  });
  assert.equal(await s.getConversation("t2", "cv1"), null);
  assert.notEqual(await s.getConversation("t1", "cv1"), null);
  assert.equal((await s.listConversations("t2")).length, 0);
});
