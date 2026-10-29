import { unsubscribeConfigFromEnv, verifyUnsubscribeParams } from "@/lib/outbound/unsubscribe";
import { addSuppression } from "@/lib/outbound/campaign";
import { RtdbCampaignStore } from "@/lib/outbound/rtdb-campaign-store";
import { auditEvent } from "@/lib/outbound/audit";
import { RtdbAuditStore } from "@/lib/outbound/rtdb-audit-store";
import { NO_STORE } from "@/lib/outbound/route-support";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

// Opt-outs must stay functional even when outbound SENDING is disabled:
// recipients of messages already delivered keep a working opt-out path.
// Disabling sends (OUTBOUND_ENABLED off) and disabling opt-outs are separate
// controls; this route needs only a data root and unsubscribe config.
function active(): boolean {
  if (!process.env.OUTBOUND_DATA_ROOT) return false;
  return unsubscribeConfigFromEnv() !== null;
}

function page(inner: string): Response {
  return new Response(
    `<!doctype html><html><head><meta charset="utf-8"><title>Unsubscribe</title></head><body style="font-family:system-ui;max-width:32rem;margin:4rem auto">${inner}</body></html>`,
    { headers: { ...NO_STORE, "Content-Type": "text/html; charset=utf-8" } },
  );
}

// Public opt-out endpoint (PRD F14). The HMAC capability URL is the only
// credential; no session exists here. GET performs NO state change (link
// scanners prefetch URLs): it renders a confirmation form. POST - from that
// form or an RFC 8058 receiver's one-click POST - creates the suppression.
// Responses never reveal whether the address was known.

export async function GET(request: Request) {
  if (!active()) return Response.json({ error: "Not found." }, { status: 404 });
  const cfg = unsubscribeConfigFromEnv()!;
  const url = new URL(request.url);
  const params = { t: url.searchParams.get("t"), e: url.searchParams.get("e"), c: url.searchParams.get("c"), sig: url.searchParams.get("sig") };
  const verified = verifyUnsubscribeParams(cfg, params);
  if (!verified) return page("<p>This unsubscribe link is invalid or has been altered.</p>");
  const postUrl = url.pathname + url.search;
  return page(
    `<p>Unsubscribe <strong>${verified.email.replace(/</g, "&lt;")}</strong> from these emails?</p>` +
      `<form method="POST" action="${postUrl}"><button type="submit" style="padding:0.5rem 1rem">Confirm unsubscribe</button></form>`,
  );
}

export async function POST(request: Request) {
  if (!active()) return Response.json({ error: "Not found." }, { status: 404 });
  const cfg = unsubscribeConfigFromEnv()!;
  const url = new URL(request.url);
  const params = { t: url.searchParams.get("t"), e: url.searchParams.get("e"), c: url.searchParams.get("c"), sig: url.searchParams.get("sig") };
  const verified = verifyUnsubscribeParams(cfg, params);
  if (!verified) return page("<p>This unsubscribe link is invalid or has been altered.</p>");
  const store = new RtdbCampaignStore();
  const result = await addSuppression(store, {
    tenantId: verified.tenantId,
    email: verified.email,
    reason: "opt_out",
    source: "unsubscribe_link",
    actor: "unsubscribe_endpoint",
    now: new Date(),
  });
  await new RtdbAuditStore().append(
    auditEvent({
      tenantId: verified.tenantId,
      actor: "unsubscribe_endpoint",
      action: "suppression.added",
      target: `suppression:${result.suppression.suppressionId}`,
      outcome: "success",
      detail: `reason=opt_out source=unsubscribe_link created=${result.created} campaign=${verified.campaignId}`,
    }),
  );
  return page("<p>You have been unsubscribed. You will not receive further emails from this sender.</p>");
}
