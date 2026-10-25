import { errorResponse, readJsonBody } from "@/lib/api-request";
import { resolveWorkspaceAccess } from "@/lib/geo/team";
import { appendAudit } from "@/lib/geo/store";
import { billingConfigured, billingTestMode, canCheckout, dodoClient, isInterval, isPaidPlan, productFor } from "@/lib/billing/dodo";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function POST(request: Request) {
  try {
    if (!billingConfigured()) {
      return Response.json(
        { error: "Billing is not available yet." },
        { status: 503, headers: { "Cache-Control": "no-store" } },
      );
    }
    const access = await resolveWorkspaceAccess(request, "manageTeam");
    if (access.role !== "owner") {
      return Response.json(
        { error: "Only the workspace owner can manage billing." },
        { status: 403, headers: { "Cache-Control": "no-store" } },
      );
    }
    if (!canCheckout(access.identity.email)) {
      return Response.json(
        { error: "Billing is in test mode while launch is prepared - checkout is not open yet." },
        { status: 403, headers: { "Cache-Control": "no-store" } },
      );
    }
    if (access.identity.idToken === "demo-token") {
      return Response.json(
        { error: "The demo workspace cannot check out. Sign in with Google to subscribe." },
        { status: 403, headers: { "Cache-Control": "no-store" } },
      );
    }
    const body = (await readJsonBody(request, 4 * 1024)) as { plan?: unknown; interval?: unknown };
    if (!isPaidPlan(body.plan) || !isInterval(body.interval)) {
      return Response.json(
        { error: "Choose a plan (pro or growth) and interval (monthly or annual)." },
        { status: 400, headers: { "Cache-Control": "no-store" } },
      );
    }
    const client = dodoClient();
    const origin = process.env.NEXT_PUBLIC_SITE_URL?.replace(/\/+$/, "") || "https://www.gothreadly.live";
    const session = await client.checkoutSessions.create({
      product_cart: [{ product_id: productFor(body.plan, body.interval), quantity: 1 }],
      customer: { email: access.identity.email, name: access.identity.name || undefined },
      return_url: `${origin}/portal?billing=success`,
      metadata: {
        workspace_uid: access.workspaceUid,
        plan: body.plan,
        interval: body.interval,
      },
    });
    try {
      await appendAudit({
        actor: access.identity.email || access.identity.uid,
        action: "billing.checkout_started",
        detail: `${body.plan} (${body.interval})${billingTestMode() ? " - test mode" : ""}`,
      });
    } catch {
      // audit is best-effort
    }
    return Response.json(
      { checkoutUrl: session.checkout_url, testMode: billingTestMode() },
      { headers: { "Cache-Control": "no-store" } },
    );
  } catch (error) {
    return errorResponse(error, "Billing checkout");
  }
}
