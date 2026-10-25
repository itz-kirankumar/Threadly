import { errorResponse } from "@/lib/api-request";
import { adminConfigured } from "@/lib/geo/admin-store";
import { previewInvite } from "@/lib/geo/team";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

// GET ?token=...: public preview of an invite (workspace name + role only).
export async function GET(request: Request) {
  try {
    if (!adminConfigured()) return Response.json({ error: "Team invites are not enabled yet." }, { status: 503 });
    const token = new URL(request.url).searchParams.get("token") ?? "";
    if (!/^[a-f0-9]{20,64}$/.test(token)) return Response.json({ error: "Invalid invite link." }, { status: 400 });
    const preview = await previewInvite(token);
    if (!preview) return Response.json({ error: "This invite link is invalid or was revoked." }, { status: 404 });
    return Response.json(preview);
  } catch (error) {
    return errorResponse(error, "Invite preview");
  }
}
