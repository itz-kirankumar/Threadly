import { errorResponse } from "@/lib/api-request";
import { accessDecision } from "@/lib/geo/team";
import { getFirebaseIdentity } from "@/lib/portal-db";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

// GET /api/access - may this signed-in identity use the platform? The portal
// asks before showing anything. The API routes enforce the same decision.
export async function GET(request: Request) {
  try {
    const identity = await getFirebaseIdentity(request);
    if (!identity) return Response.json({ error: "Sign in to continue." }, { status: 401 });
    const decision = await accessDecision(identity);
    return Response.json({ allowed: decision === "allow", email: identity.email || null, emailVerified: identity.emailVerified === true }, { headers: { "Cache-Control": "no-store" } });
  } catch (error) {
    return errorResponse(error, "GET /api/access");
  }
}
