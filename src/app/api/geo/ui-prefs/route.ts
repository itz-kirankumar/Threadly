import { errorResponse, readJsonBody } from "@/lib/api-request";
import { resolveWorkspaceAccess } from "@/lib/geo/team";
import { withWorkspace, readData, writeData } from "@/lib/portal-db";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

type Theme = "light" | "dark";

// Per-user dashboard theme preference. Stored under the caller's OWN uid (not
// the shared workspace) so each user's choice is personal and preserved. The
// demo workspace keeps its default dark theme without persistence.
export async function GET(request: Request) {
  try {
    const access = await resolveWorkspaceAccess(request, "view");
    if (access.identity.idToken === "demo-token") {
      return Response.json({ theme: "dark" }, { headers: { "Cache-Control": "no-store" } });
    }
    const prefs = await withWorkspace(access.identity.uid, access.identity.idToken, () =>
      readData<{ theme?: unknown }>("ui")
    );
    const theme: Theme = prefs?.theme === "light" ? "light" : "dark";
    return Response.json({ theme }, { headers: { "Cache-Control": "no-store" } });
  } catch (error) {
    return errorResponse(error, "UI preferences");
  }
}

export async function PUT(request: Request) {
  try {
    const access = await resolveWorkspaceAccess(request, "view");
    const body = (await readJsonBody(request, 1024)) as { theme?: unknown };
    if (body.theme !== "light" && body.theme !== "dark") {
      return Response.json({ error: "Theme must be light or dark." }, { status: 400, headers: { "Cache-Control": "no-store" } });
    }
    if (access.identity.idToken !== "demo-token") {
      await withWorkspace(access.identity.uid, access.identity.idToken, () =>
        writeData("ui", { theme: body.theme })
      );
    }
    return Response.json({ theme: body.theme }, { headers: { "Cache-Control": "no-store" } });
  } catch (error) {
    return errorResponse(error, "UI preferences");
  }
}
