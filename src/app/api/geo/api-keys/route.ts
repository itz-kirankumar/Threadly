import { createHash, randomBytes, randomUUID } from "node:crypto";
import { errorResponse, readJsonBody, RequestError } from "@/lib/api-request";
import { loadPlan, planAtLeast, planBlockResponse } from "@/lib/geo/plan";
import { hasPurchasedCredits } from "@/lib/credits/ledger";
import { inWorkspace, resolveWorkspaceAccess } from "@/lib/geo/team";
import { appendAudit } from "@/lib/geo/store";
import { adminDeleteApiKey, adminLoadApiKeys, adminSaveApiKey } from "@/lib/geo/admin-store";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const MAX_KEYS = 10;

function hashSecret(secret: string): string {
  return createHash("sha256").update(secret).digest("hex");
}

export async function GET(request: Request) {
  try {
    const access = await resolveWorkspaceAccess(request, "manageKeys");
    const plan = await inWorkspace(access, () => loadPlan(access.identity.email));
    if (!planAtLeast(plan, "growth") && !(await hasPurchasedCredits(access.workspaceUid))) {
      return planBlockResponse("API access opens after your first credit pack, or on Growth and above.", plan);
    }
    const keys = (await adminLoadApiKeys(access.workspaceUid)).map(({ hash: _hash, ...rest }) => rest);
    return Response.json({ keys });
  } catch (error) {
    return errorResponse(error, "List API keys");
  }
}

export async function POST(request: Request) {
  try {
    const access = await resolveWorkspaceAccess(request, "manageKeys");
    const plan = await inWorkspace(access, () => loadPlan(access.identity.email));
    if (!planAtLeast(plan, "growth") && !(await hasPurchasedCredits(access.workspaceUid))) {
      return planBlockResponse("API access opens after your first credit pack, or on Growth and above.", plan);
    }
    const body = (await readJsonBody(request, 2 * 1024)) as { name?: unknown };
    const name = typeof body.name === "string" && body.name.trim() ? body.name.trim().slice(0, 40) : "Default key";
    const existing = await adminLoadApiKeys(access.workspaceUid);
    if (existing.length >= MAX_KEYS) throw new RequestError(`Keep at most ${MAX_KEYS} API keys.`, 400);
    const secret = `thly_${randomBytes(24).toString("hex")}`;
    const record = {
      id: `key-${randomUUID().slice(0, 8)}`,
      name,
      hash: hashSecret(secret),
      lastFour: secret.slice(-4),
      createdAt: new Date().toISOString(),
    };
    await adminSaveApiKey(access.workspaceUid, record);
    await inWorkspace(access, () =>
      appendAudit({ actor: access.identity.email, action: "api_key.created", detail: name }),
    );
    // The plaintext secret is returned exactly once; only its hash is stored.
    return Response.json({ key: { ...record, hash: undefined }, secret });
  } catch (error) {
    return errorResponse(error, "Create API key");
  }
}

export async function DELETE(request: Request) {
  try {
    const access = await resolveWorkspaceAccess(request, "manageKeys");
    const plan = await inWorkspace(access, () => loadPlan(access.identity.email));
    if (!planAtLeast(plan, "growth") && !(await hasPurchasedCredits(access.workspaceUid))) {
      return planBlockResponse("API access opens after your first credit pack, or on Growth and above.", plan);
    }
    const body = (await readJsonBody(request, 2 * 1024)) as { id?: unknown };
    if (typeof body.id !== "string" || !body.id) throw new RequestError("Missing key id.", 400);
    const existing = await adminLoadApiKeys(access.workspaceUid);
    const target = existing.find((key) => key.id === body.id);
    if (!target) throw new RequestError("API key not found.", 404);
    await adminDeleteApiKey(access.workspaceUid, target.id, target.hash);
    await inWorkspace(access, () =>
      appendAudit({ actor: access.identity.email, action: "api_key.revoked", detail: body.id as string }),
    );
    return Response.json({ ok: true });
  } catch (error) {
    return errorResponse(error, "Revoke API key");
  }
}
