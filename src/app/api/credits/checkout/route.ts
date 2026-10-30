import { errorResponse, readJsonBody } from "@/lib/api-request";
import { resolveWorkspaceAccess } from "@/lib/geo/team";
import { appendAudit } from "@/lib/geo/store";
import { inWorkspace } from "@/lib/geo/team";
import { billingConfigured, billingTestMode, canCheckout, dodoClient } from "@/lib/billing/dodo";
import { lookupVerifiedPhone } from "@/lib/billing/identity";
import { razorpayCheckoutAllowed, razorpayCreateCreditOrder, razorpayKeyId, razorpayOperational, razorpayTestMode } from "@/lib/billing/razorpay";
import { routeProviderForRegion } from "@/lib/billing/region-routing";
import { CREDIT_PACKS, isCreditPack } from "@/lib/credits/rates";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const noStore = { "Cache-Control": "no-store" };

// POST /api/credits/checkout - start paying for a credit pack. The billing
// country picks the provider (India: Razorpay order, elsewhere: Dodo
// checkout). Prices come from CREDIT_PACKS; the client sends a pack id only.
// Credits are added by /api/credits/verify or the provider webhook, never here.
export async function POST(request: Request) {
  try {
    const access = await resolveWorkspaceAccess(request, "manageTeam");
    if (access.role !== "owner") return Response.json({ error: "Only the workspace owner can buy credits." }, { status: 403, headers: noStore });
    if (access.identity.idToken === "demo-token") return Response.json({ error: "The demo workspace cannot buy credits." }, { status: 403, headers: noStore });
    const body = (await readJsonBody(request, 2 * 1024)) as { pack?: unknown; billingCountry?: unknown };
    if (!isCreditPack(body.pack)) return Response.json({ error: "Choose a credit pack." }, { status: 400, headers: noStore });
    const pack = CREDIT_PACKS[body.pack];

    const route = routeProviderForRegion({
      billingCountry: typeof body.billingCountry === "string" ? body.billingCountry : null,
      dodoOperational: billingConfigured() && Boolean(process.env[pack.dodoProductEnv]),
      razorpayOperational: razorpayOperational(),
    });
    if (!route.ok) {
      return Response.json(
        { error: route.reason === "missing_country" ? "Choose your billing country." : "Credit packs are not on sale in your region yet.", code: route.reason },
        { status: route.reason === "missing_country" ? 400 : 503, headers: noStore },
      );
    }
    const email = access.identity.email;
    const audit = (detail: string) => inWorkspace(access, () => appendAudit({ actor: email || access.identity.uid, action: "billing.credits_checkout", detail })).catch(() => undefined);

    if (route.provider === "razorpay") {
      if (!razorpayCheckoutAllowed(email)) return Response.json({ error: "Checkout is not open yet." }, { status: 403, headers: noStore });
      const order = await razorpayCreateCreditOrder({ pack: body.pack, amount: pack.amount, currency: pack.currency, workspaceUid: access.workspaceUid, email });
      await audit(`${pack.name} pack, order ${order.id}${razorpayTestMode() ? " - test mode" : ""}`);
      return Response.json(
        {
          provider: "razorpay",
          orderId: order.id,
          amount: pack.amount,
          currency: pack.currency,
          keyId: razorpayKeyId(),
          testMode: razorpayTestMode(),
          prefill: { email: email || null, contact: await lookupVerifiedPhone(access.identity.idToken).catch(() => null) },
        },
        { headers: noStore },
      );
    }

    if (billingTestMode() && !canCheckout(email)) return Response.json({ error: "Checkout is not open yet." }, { status: 403, headers: noStore });
    const origin = process.env.NEXT_PUBLIC_SITE_URL?.replace(/\/+$/, "") || "https://www.gothreadly.live";
    const session = await dodoClient().checkoutSessions.create({
      product_cart: [{ product_id: process.env[pack.dodoProductEnv] as string, quantity: 1 }],
      customer: { email, name: access.identity.name || undefined },
      return_url: `${origin}/portal?credits=success`,
      metadata: { kind: "credits", pack: body.pack, workspace_uid: access.workspaceUid },
    });
    if (!session.checkout_url) throw new Error("Dodo did not return a checkout link.");
    await audit(`${pack.name} pack via dodo${billingTestMode() ? " - test mode" : ""}`);
    return Response.json({ provider: "dodo", checkoutUrl: session.checkout_url, testMode: billingTestMode() }, { headers: noStore });
  } catch (error) {
    return errorResponse(error, "POST /api/credits/checkout");
  }
}
