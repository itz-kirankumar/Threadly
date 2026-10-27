import { errorResponse, readJsonBody } from "@/lib/api-request";
import { resolveWorkspaceAccess } from "@/lib/geo/team";
import { RtdbSenderStore } from "@/lib/outbound/rtdb-sender-store";
import { RtdbSubscriptionStore } from "@/lib/outbound/rtdb-subscription-store";
import { SubscriptionConflictError, renewalState } from "@/lib/outbound/subscriptions";
import type { MailboxSubscription } from "@/lib/outbound/subscriptions";
import { auditEvent } from "@/lib/outbound/audit";
import { RtdbAuditStore } from "@/lib/outbound/rtdb-audit-store";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const NO_STORE = { "Cache-Control": "no-store" } as const;

function enabled(): boolean {
  if (process.env.OUTBOUND_ENABLED !== "true") return false;
  return typeof process.env.OUTBOUND_DATA_ROOT === "string" && process.env.OUTBOUND_DATA_ROOT.length > 0;
}

// Subscription registry admin surface. POST records a provider subscription
// that was created out-of-band (today: manually; eventually by the consent
// flow after OAuth). This route never calls the provider - it only records
// the binding the operator asserts exists. Integrity checks: the sender must
// exist, belong to the tenant, and use the matching provider; expiry must be
// in the future. Create-or-identical: a conflicting binding for the same
// subscription id is a 409, never a silent rebind.

async function audit(tenantId: string, actor: string, action: string, target: string, outcome: "success" | "denied" | "error", detail: string | null = null): Promise<void> {
  await new RtdbAuditStore().append(auditEvent({ tenantId, actor, action, target, outcome, detail }));
}

export async function GET(request: Request) {
  try {
    if (!enabled()) {
      return Response.json({ error: "Outbound is not enabled on this deployment." }, { status: 404, headers: NO_STORE });
    }
    const access = await resolveWorkspaceAccess(request, "view");
    const subs = await new RtdbSubscriptionStore().listForTenant(access.workspaceUid);
    const now = new Date();
    return Response.json(
      {
        subscriptions: subs.map((s) => ({
          senderId: s.senderId,
          provider: s.provider,
          subscriptionId: s.subscriptionId,
          resource: s.resource,
          expiresAt: s.expiresAt,
          renewedAt: s.renewedAt,
          renewalState: renewalState(s, now),
        })),
      },
      { headers: NO_STORE },
    );
  } catch (error) {
    return errorResponse(error, "outbound subscriptions");
  }
}

export async function POST(request: Request) {
  try {
    if (!enabled()) {
      return Response.json({ error: "Outbound is not enabled on this deployment." }, { status: 404, headers: NO_STORE });
    }
    const access = await resolveWorkspaceAccess(request, "manageTeam");
    if (access.role !== "owner" && access.role !== "admin") {
      return Response.json({ error: "Only workspace admins can register subscriptions." }, { status: 403, headers: NO_STORE });
    }
    const body = (await readJsonBody(request, 4 * 1024)) as Record<string, unknown>;
    const senderId = typeof body.senderId === "string" ? body.senderId : "";
    const provider = body.provider === "gmail" || body.provider === "microsoft" ? body.provider : null;
    const subscriptionId = typeof body.subscriptionId === "string" ? body.subscriptionId : "";
    const resource = typeof body.resource === "string" ? body.resource : null;
    const expiresAt = typeof body.expiresAt === "string" ? body.expiresAt : "";
    if (!senderId || !provider || !subscriptionId || !expiresAt || Number.isNaN(Date.parse(expiresAt))) {
      return Response.json({ error: "senderId, provider, subscriptionId and a valid expiresAt are required." }, { status: 400, headers: NO_STORE });
    }
    if (Date.parse(expiresAt) <= Date.now()) {
      return Response.json({ error: "expiresAt must be in the future; renew the provider subscription first." }, { status: 400, headers: NO_STORE });
    }
    const sender = await new RtdbSenderStore().getSender(access.workspaceUid, senderId);
    if (!sender) {
      return Response.json({ error: "Sender not found in this workspace." }, { status: 404, headers: NO_STORE });
    }
    if (sender.provider !== provider) {
      return Response.json({ error: `Sender uses ${sender.provider}; cannot bind a ${provider} subscription.` }, { status: 400, headers: NO_STORE });
    }
    const record: MailboxSubscription = {
      tenantId: access.workspaceUid,
      senderId,
      provider,
      subscriptionId,
      resource,
      expiresAt: new Date(expiresAt).toISOString(),
      createdAt: new Date().toISOString(),
      createdBy: access.identity.uid,
      renewedAt: null,
    };
    try {
      const result = await new RtdbSubscriptionStore().register(record);
      await audit(access.workspaceUid, access.identity.uid, "subscription.registered", `subscription:${provider}:${subscriptionId}`, "success", `sender=${senderId} created=${result.created}`);
      return Response.json({ ...result, renewalState: renewalState(record, new Date()) }, { status: result.created ? 201 : 200, headers: NO_STORE });
    } catch (error) {
      if (error instanceof SubscriptionConflictError) {
        await audit(access.workspaceUid, access.identity.uid, "subscription.registered", `subscription:${provider}:${subscriptionId}`, "denied", "conflicting binding");
        return Response.json({ error: "That subscription id is already bound to a different tenant or sender." }, { status: 409, headers: NO_STORE });
      }
      throw error;
    }
  } catch (error) {
    return errorResponse(error, "outbound subscriptions");
  }
}
