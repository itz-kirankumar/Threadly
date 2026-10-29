import { errorResponse, readJsonBody } from "@/lib/api-request";
import { resolveWorkspaceAccess } from "@/lib/geo/team";
import { outboundAudienceDeny, outboundUidAllowed } from "@/lib/outbound/route-guard";
import { activePolicy, createResponsePolicy, evaluateAutoResponse } from "@/lib/outbound/auto-responses";
import type { ResponseRule } from "@/lib/outbound/auto-responses";
import { RtdbResponsePolicyStore } from "@/lib/outbound/rtdb-response-policy-store";
import { INTENTS } from "@/lib/outbound/conversations";
import type { ConversationIntent } from "@/lib/outbound/types";
import { NO_STORE, outboundEnabled, recordAudit } from "@/lib/outbound/route-support";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

// Policy-scoped automated responses (PRD F17). Policies freeze approved
// factual/scheduling template text at creation (audited human approval);
// evaluation escalates legal/security/pricing/uncertain always. The
// "evaluate" action DECIDES only - nothing sends; auto-acting on decisions
// is an owner activation decision and remains unwired.

function parseRules(v: unknown): ResponseRule[] | null {
  if (!Array.isArray(v)) return null;
  const rules: ResponseRule[] = [];
  for (const r of v) {
    if (typeof r !== "object" || r === null) return null;
    const o = r as Record<string, unknown>;
    const intent = INTENTS.find((i) => i === o.intent) as ConversationIntent | undefined;
    if (!intent || intent === "uncertain") return null; // uncertain can never carry an auto rule
    if (o.category !== "factual" && o.category !== "scheduling") return null;
    if (typeof o.templateId !== "string" || !o.templateId.trim()) return null;
    if (typeof o.templateText !== "string" || !o.templateText.trim()) return null;
    rules.push({ intent, category: o.category, templateId: o.templateId.trim().slice(0, 64), templateText: o.templateText.slice(0, 4000) });
  }
  return rules;
}

export async function GET(request: Request) {
  try {
    if (!outboundEnabled()) {
      return Response.json({ error: "Outbound is not enabled on this deployment." }, { status: 404, headers: NO_STORE });
    }
    const access = await resolveWorkspaceAccess(request, "view");
    if (!outboundUidAllowed(access.identity.uid)) return outboundAudienceDeny();
    const policies = await new RtdbResponsePolicyStore().list(access.workspaceUid);
    return Response.json({ active: activePolicy(policies), policies: policies.slice(0, 50) }, { headers: NO_STORE });
  } catch (error) {
    return errorResponse(error, "outbound response-policies");
  }
}

export async function POST(request: Request) {
  try {
    if (!outboundEnabled()) {
      return Response.json({ error: "Outbound is not enabled on this deployment." }, { status: 404, headers: NO_STORE });
    }
    const access = await resolveWorkspaceAccess(request, "manageTeam");
    if (!outboundUidAllowed(access.identity.uid)) return outboundAudienceDeny();
    if (access.role !== "owner" && access.role !== "admin") {
      return Response.json({ error: "Only workspace admins can manage response policies." }, { status: 403, headers: NO_STORE });
    }
    const body = (await readJsonBody(request, 32 * 1024)) as Record<string, unknown>;
    const store = new RtdbResponsePolicyStore();

    if (body.action === "evaluate") {
      const intent = INTENTS.find((i) => i === body.intent) as ConversationIntent | undefined;
      const replyText = typeof body.replyText === "string" ? body.replyText : "";
      if (!intent || !replyText) return Response.json({ error: "intent and replyText are required." }, { status: 400, headers: NO_STORE });
      const decision = evaluateAutoResponse(activePolicy(await store.list(access.workspaceUid)), { intent, replyText });
      return Response.json({ decision }, { headers: NO_STORE });
    }

    if (body.action === "retire") {
      const policyId = typeof body.policyId === "string" ? body.policyId : "";
      const found = (await store.list(access.workspaceUid)).find((p) => p.policyId === policyId);
      if (!found) return Response.json({ error: "Policy not found." }, { status: 404, headers: NO_STORE });
      const retired = { ...found, status: "retired" as const };
      await store.save(retired);
      await recordAudit(access.workspaceUid, access.identity.uid, "response_policy.retired", `policy:${policyId}`, "success", null);
      return Response.json(retired, { headers: NO_STORE });
    }

    const rules = parseRules(body.rules);
    if (!rules) {
      return Response.json({ error: "rules must be [{intent (not uncertain), category factual|scheduling, templateId, templateText}]." }, { status: 400, headers: NO_STORE });
    }
    const existing = await store.list(access.workspaceUid);
    const version = existing.reduce((max, p) => Math.max(max, p.version), 0) + 1;
    const policy = createResponsePolicy({ tenantId: access.workspaceUid, version, rules, actor: access.identity.uid, now: new Date() });
    await store.save(policy);
    await recordAudit(access.workspaceUid, access.identity.uid, "response_policy.created", `policy:${policy.policyId}`, "success", `version=${version} rules=${rules.length}`);
    return Response.json(policy, { status: 201, headers: NO_STORE });
  } catch (error) {
    return errorResponse(error, "outbound response-policies");
  }
}
