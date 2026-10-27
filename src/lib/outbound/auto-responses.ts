// Policy-scoped automated responses (PRD F17). A tenant's ResponsePolicy
// maps conversation intents to APPROVED response templates whose text is
// captured, human-approved and versioned inside the policy itself - the
// template text cannot drift after approval. Only factual/scheduling
// responses may be auto-sent; legal, security and pricing content escalates
// to a person ALWAYS, overriding any rule, as does "uncertain" and every
// intent without a matching rule.
//
// This module DECIDES only. Nothing here sends: an auto_send decision must
// still pass campaign approval, eligibility, kill switches and dispatch -
// and wiring ingestion to act on these decisions automatically is an owner
// activation decision, not done here.

import { createHash } from "node:crypto";
import type { ConversationIntent } from "./types.ts";
import type { CreationMeta, ISODate } from "./types.ts";

export interface ResponseRule {
  intent: ConversationIntent;
  templateId: string;
  templateText: string; // frozen at approval time; sent verbatim
  category: "factual" | "scheduling";
}

export interface ResponsePolicy extends CreationMeta {
  tenantId: string;
  policyId: string;
  version: number;
  status: "active" | "retired";
  rules: ResponseRule[];
}

const ESCALATION_PATTERNS: { category: "legal" | "security" | "pricing"; pattern: RegExp }[] = [
  { category: "legal", pattern: /\b(lawyer|attorney|lawsuit|sue|legal action|gdpr|dpa|contract terms|indemnif)\b/i },
  { category: "security", pattern: /\b(security|breach|vulnerability|penetration|soc\s?2|iso\s?27001|data leak|compromise)\b/i },
  { category: "pricing", pattern: /\b(price|pricing|cost|discount|quote|invoice|refund|how much)\b/i },
];

export type AutoResponseDecision =
  | { action: "auto_send_template"; templateId: string; templateText: string; ruleIntent: ConversationIntent }
  | { action: "escalate"; reason: string };

// The decision is a pure function of the ACTIVE policy, the classified
// intent and the reply text. Escalation categories override rules; missing
// rules escalate; "uncertain" always escalates.
export function evaluateAutoResponse(
  policy: ResponsePolicy | null,
  input: { intent: ConversationIntent; replyText: string },
): AutoResponseDecision {
  for (const { category, pattern } of ESCALATION_PATTERNS) {
    if (pattern.test(input.replyText)) {
      return { action: "escalate", reason: `${category}_content_always_escalates` };
    }
  }
  if (input.intent === "uncertain") return { action: "escalate", reason: "uncertain_reaches_a_person" };
  if (!policy || policy.status !== "active") return { action: "escalate", reason: "no_active_policy" };
  const rule = policy.rules.find((r) => r.intent === input.intent);
  if (!rule) return { action: "escalate", reason: `no_rule_for_${input.intent}` };
  return { action: "auto_send_template", templateId: rule.templateId, templateText: rule.templateText, ruleIntent: rule.intent };
}

export function createResponsePolicy(input: {
  tenantId: string;
  version: number;
  rules: ResponseRule[];
  actor: string;
  now: Date;
}): ResponsePolicy {
  const now = input.now.toISOString();
  for (const rule of input.rules) {
    if (rule.category !== "factual" && rule.category !== "scheduling") {
      throw new Error("auto-respond rules must be factual or scheduling");
    }
    if (!rule.templateText.trim()) throw new Error("templateText is required and frozen at approval");
  }
  return {
    tenantId: input.tenantId,
    policyId: "rp_" + createHash("sha256").update(`${input.tenantId}|${input.version}|${now}`).digest("hex").slice(0, 16),
    version: input.version,
    status: "active",
    rules: input.rules.map((r) => ({ ...r, templateId: r.templateId.trim(), templateText: r.templateText })),
    createdAt: now,
    createdBy: input.actor,
  };
}

export interface ResponsePolicyStore {
  save(policy: ResponsePolicy): Promise<void>;
  list(tenantId: string): Promise<ResponsePolicy[]>;
}

export function activePolicy(policies: ResponsePolicy[]): ResponsePolicy | null {
  const active = policies.filter((p) => p.status === "active");
  if (active.length === 0) return null;
  active.sort((a, b) => b.version - a.version);
  return active[0];
}

export class MemoryResponsePolicyStore implements ResponsePolicyStore {
  policies = new Map<string, ResponsePolicy>();
  async save(policy: ResponsePolicy): Promise<void> {
    this.policies.set(`${policy.tenantId}:${policy.policyId}`, policy);
  }
  async list(tenantId: string): Promise<ResponsePolicy[]> {
    return [...this.policies.values()].filter((p) => p.tenantId === tenantId);
  }
}
