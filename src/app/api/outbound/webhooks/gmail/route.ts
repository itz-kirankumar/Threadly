import { readJsonBody } from "@/lib/api-request";
import { RtdbIngestionStore } from "@/lib/outbound/rtdb-ingestion-store";
import { RtdbSenderStore } from "@/lib/outbound/rtdb-sender-store";
import { parseGmailPush, secretMatches } from "@/lib/outbound/webhooks";
import { NO_STORE } from "@/lib/outbound/route-support";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

function active(): boolean {
  if (process.env.OUTBOUND_ENABLED !== "true") return false;
  if (!process.env.OUTBOUND_DATA_ROOT) return false;
  // No configured webhook secret: the route does not exist.
  return typeof process.env.OUTBOUND_GMAIL_WEBHOOK_TOKEN === "string" && process.env.OUTBOUND_GMAIL_WEBHOOK_TOKEN.length > 0;
}

// Gmail Pub/Sub push receiver. Verification and binding are fail-closed:
// wrong/missing token or an unbound mailbox = ignored, no side effects. The
// receiver records a sync request only; pulling history requires the Gmail
// adapter with sender consent, which no deployment is authorized to run.
export async function POST(request: Request) {
  if (!active()) return Response.json({ error: "Not found." }, { status: 404, headers: NO_STORE });
  const url = new URL(request.url);
  const token = url.searchParams.get("token") ?? "";
  if (!secretMatches(token, process.env.OUTBOUND_GMAIL_WEBHOOK_TOKEN as string)) {
    return Response.json({ error: "Not found." }, { status: 404, headers: NO_STORE });
  }
  const body = await readJsonBody(request, 16 * 1024);
  const parsed = parseGmailPush(body);
  if (!parsed) return Response.json({ status: "ignored_malformed" }, { status: 202, headers: NO_STORE });
  const binding = await new RtdbSenderStore().findByEmail(parsed.emailAddress);
  if (!binding) return Response.json({ status: "ignored_unbound" }, { status: 202, headers: NO_STORE });
  await new RtdbIngestionStore().markSyncRequested(binding.tenantId, binding.senderId, `gmail:historyId:${parsed.historyId}`);
  return Response.json({ status: "sync_requested" }, { status: 202, headers: NO_STORE });
}
