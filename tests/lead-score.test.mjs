import { test } from "node:test";
import assert from "node:assert/strict";

const score = await import("../src/lib/leads/score.ts");

test("one score for the demo and saved leads: fit, intent and reach", () => {
  const rival = score.companyFitIntent("Customer of Cognism", []);
  assert.deepEqual({ fit: rival.fit, intent: rival.intent }, { fit: 80, intent: 45 });
  const match = score.companyFitIntent("Matches B2B Teams", ["b2b"]);
  assert.deepEqual({ fit: match.fit, intent: match.intent }, { fit: 60, intent: 25 });
  assert.equal(score.combineScore(80, 55, 95), 71, "a competitor's customer with an emailable decision maker is Warm");
  assert.equal(score.priorityOf(score.combineScore(80, 55, 95)), "Warm");
  assert.equal(score.priorityOf(score.combineScore(60, 25, 30)), "Cold");
});

test("the right role is the campaign's, or a founder or chief executive", () => {
  assert.ok(score.rightRole("VP of Sales", ["Head of Sales", "VP Sales"]));
  assert.ok(score.rightRole("Co-founder & CEO", ["Head of Sales"]));
  assert.equal(score.rightRole("Chief Technology Officer", ["Head of Sales"]), false);
  assert.equal(score.rightRole(undefined, ["Head of Sales"]), false);
});
