import { errorResponse, readJsonBody, RequestError } from "@/lib/api-request";
import { acceptInvite } from "@/lib/geo/team";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

// POST: accept an invite link as the signed-in user.
export async function POST(request: Request) {
  try {
    const body = (await readJsonBody(request, 4 * 1024)) as { token?: unknown };
    if (typeof body.token !== "string" || !/^[a-f0-9]{20,64}$/.test(body.token)) {
      throw new RequestError("This invite link is invalid.", 400);
    }
    const result = await acceptInvite(request, body.token);
    return Response.json(result);
  } catch (error) {
    return errorResponse(error, "Accept invite");
  }
}
