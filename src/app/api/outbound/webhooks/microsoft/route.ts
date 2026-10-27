import { readJsonBody } from "@/lib/api-request";
import { parseGraphNotifications } from "@/lib/outbound/webhooks";

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
// configured secret (fail closed). Resource strings name Graph user ids, not
// mailbox addresses, and no subscription-to-sender mapping exists yet, so
// notifications are acknowledged but not bound: recording a sync request
// against the wrong tenant is worse than ignoring one.
export async function POST(request: Request) {
  if (!active()) return Response.json({ error: "Not found." }, { status: 404 });
  const body = await readJsonBody(request, 64 * 1024);
  const resources = parseGraphNotifications(body, process.env.OUTBOUND_MICROSOFT_WEBHOOK_SECRET as string);
  if (!resources) return Response.json({ error: "Not found." }, { status: 404 });
  return Response.json({ status: "acknowledged_unbound" }, { status: 202 });
}
