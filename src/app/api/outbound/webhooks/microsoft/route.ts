import { readJsonBody } from "@/lib/api-request";
import { parseGraphNotifications } from "@/lib/outbound/webhooks";
import { RtdbSubscriptionStore } from "@/lib/outbound/rtdb-subscription-store";
import { RtdbIngestionStore } from "@/lib/outbound/rtdb-ingestion-store";
import { renewalState } from "@/lib/outbound/subscriptions";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

function active(): boolean {
  if (process.env.OUTBOUND_ENABLED !== "true") return false;
  if (!process.env.OUTBOUND_DATA_ROOT) return false;
  return typeof process.env.OUTBOUND_MICROSOFT_WEBHOOK_SECRET === "string" && process.env.OUTBOUND_MICROSOFT_WEBHOOK_SECRET.length > 0;
}

// Microsoft Graph subscription validation handshake: echo the token as
// text/plain. Only answered when the route is active.
export async function GET(request: Request) {
  if (!active()) return Response.json({ error: "Not found." }, { status: 404 });
  const token = new URL(request.url).searchParams.get("validationToken");
  if (!token) return Response.json({ error: "Not found." }, { status: 404 });
  return new Response(token, { status: 200, headers: { "Content-Type": "text/plain" } });
}

// Graph change notifications: every entry's clientState must match the
// configured secret (fail closed). Each verified entry is then bound through
// the subscription registry: a known subscription id routes a sync request
// to its tenant+sender; an unknown id is counted and ignored (recording a
// sync request against the wrong tenant is worse than ignoring one). A
// notification on an EXPIRED subscription still records the sync request
// (the provider is demonstrably still delivering) and is counted separately
// so the renewal gap is visible. Sync requests never advance the sync
// cursor; only a completed pull does.
export async function POST(request: Request) {
  if (!active()) return Response.json({ error: "Not found." }, { status: 404 });
  const body = await readJsonBody(request, 64 * 1024);
  const entries = parseGraphNotifications(body, process.env.OUTBOUND_MICROSOFT_WEBHOOK_SECRET as string);
  if (!entries) return Response.json({ error: "Not found." }, { status: 404 });
  const subs = new RtdbSubscriptionStore();
  const ingestion = new RtdbIngestionStore();
  let bound = 0;
  let expired = 0;
  let unbound = 0;
  for (const entry of entries) {
    const sub = entry.subscriptionId ? await subs.getBySubscriptionId("microsoft", entry.subscriptionId) : null;
    if (!sub) {
      unbound++;
      continue;
    }
    await ingestion.markSyncRequested(sub.tenantId, sub.senderId, `graph:${entry.resource ?? entry.subscriptionId}`);
    if (renewalState(sub, new Date()) === "expired") expired++;
    else bound++;
  }
  return Response.json({ status: "processed", bound, expired, unbound }, { status: 202 });
}
