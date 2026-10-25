import { errorResponse, readJsonBody, RequestError } from "@/lib/api-request";
import { inWorkspace, resolveWorkspaceAccess } from "@/lib/geo/team";
import { readData, writeData } from "@/lib/portal-db";
import { sendLifecycleEmail, type LifecycleKind } from "@/lib/email";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

// Client-triggerable kinds. Server-side flows (scan completion, plan changes)
// call sendLifecycleEmail directly - they are not reachable here.
const CLIENT_KINDS: LifecycleKind[] = ["welcome-trial"];

export async function POST(request: Request) {
  try {
    const access = await resolveWorkspaceAccess(request, "view");
    const body = (await readJsonBody(request, 4 * 1024).catch(() => ({}))) as { kind?: unknown };
    const kind = body.kind as LifecycleKind;
    if (!CLIENT_KINDS.includes(kind)) throw new RequestError("Unsupported lifecycle email.", 400);
    const email = access.identity.email;
    if (!email) throw new RequestError("Your account has no email address to send to.", 400);
    return await inWorkspace(access, async () => {
      const flagPath = `lifecycle/${kind}`;
      const already = await readData<{ sentAt: string }>(flagPath);
      if (already?.sentAt) {
        return Response.json({ ok: true, alreadySent: true }, { headers: { "Cache-Control": "no-store" } });
      }
      const result = await sendLifecycleEmail(kind, email, { name: access.identity.name });
      if (result.sent) await writeData(flagPath, { sentAt: new Date().toISOString() });
      return Response.json(
        { ok: result.sent, alreadySent: false, ...(result.error ? { error: result.error } : {}) },
        { status: result.sent ? 200 : 502, headers: { "Cache-Control": "no-store" } },
      );
    });
  } catch (error) {
    return errorResponse(error, "lifecycle email");
  }
}
