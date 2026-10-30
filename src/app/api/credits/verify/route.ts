import { errorResponse, readJsonBody } from "@/lib/api-request";
import { resolveWorkspaceAccess } from "@/lib/geo/team";
import { razorpayFetchPayment, verifyPaymentSignature } from "@/lib/billing/razorpay";
import { grant } from "@/lib/credits/ledger";
import { decideCreditGrant } from "@/lib/credits/fulfil";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const noStore = { "Cache-Control": "no-store" };

// POST /api/credits/verify - confirm a Razorpay credit pack payment. Credits
// are added only after the signature check AND a server-side fetch of the
// payment confirms it is paid, for this workspace, at the pack price.
export async function POST(request: Request) {
  try {
    const access = await resolveWorkspaceAccess(request, "manageTeam");
    const body = (await readJsonBody(request, 4 * 1024)) as { orderId?: unknown; paymentId?: unknown; signature?: unknown };
    const { orderId, paymentId, signature } = body;
    if (typeof orderId !== "string" || typeof paymentId !== "string" || typeof signature !== "string" || !orderId || !paymentId || !signature) {
      return Response.json({ error: "Missing payment verification fields." }, { status: 400, headers: noStore });
    }
    if (!verifyPaymentSignature(orderId, paymentId, signature)) {
      return Response.json({ error: "Payment verification failed." }, { status: 400, headers: noStore });
    }
    let payment: Awaited<ReturnType<typeof razorpayFetchPayment>>;
    try {
      payment = await razorpayFetchPayment(paymentId);
    } catch {
      return Response.json({ error: "Could not confirm the payment yet. Your credits will appear once Razorpay confirms it." }, { status: 503, headers: noStore });
    }
    if (payment.order_id !== orderId) return Response.json({ error: "Payment does not belong to this order." }, { status: 400, headers: noStore });
    const decision = decideCreditGrant({ provider: "razorpay", paymentId: payment.id, status: payment.status, amount: payment.amount, currency: payment.currency, tags: payment.notes });
    if (!decision.grant) return Response.json({ error: `No credits added: ${decision.why}.` }, { status: 402, headers: noStore });
    if (decision.workspaceUid !== access.workspaceUid) return Response.json({ error: "Payment is not bound to this workspace." }, { status: 400, headers: noStore });
    const result = await grant(decision.workspaceUid, decision.credits, decision.reason, decision.ref);
    return Response.json({ added: result.granted ? decision.credits : 0, balance: result.balance }, { headers: noStore });
  } catch (error) {
    return errorResponse(error, "POST /api/credits/verify");
  }
}
