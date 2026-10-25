import { randomUUID } from "node:crypto";
import { errorResponse, readJsonBody } from "@/lib/api-request";
import { getFirebaseIdentity, withWorkspace } from "@/lib/portal-db";
import { encryptSecret, keyEncryptionReady, lastFour } from "@/lib/geo/crypto";
import { providerKeyStatuses } from "@/lib/geo/keys";
import {
  deleteBuiltinKey,
  deleteCustomProvider,
  loadKeySettings,
  saveBuiltinKey,
  saveCustomProvider,
} from "@/lib/geo/store";
import { GEO_PROVIDERS } from "@/lib/geo/types";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const BUILTIN_IDS = new Set(GEO_PROVIDERS.map((p) => p.id));

// GET: masked view of this workspace's provider key configuration.
export async function GET(request: Request) {
  try {
    const user = await getFirebaseIdentity(request);
    return await withWorkspace(user!.uid, user!.idToken, async () => {
      const settings = await loadKeySettings();
      return Response.json({ providers: providerKeyStatuses(settings), keyEncryption: keyEncryptionReady() });
    });
  } catch (error) {
    return errorResponse(error, "GEO keys");
  }
}

// PUT: save a built-in provider key or a custom OpenAI-compatible provider.
export async function PUT(request: Request) {
  try {
    const user = await getFirebaseIdentity(request);
    if (user!.idToken === "demo-token") {
      return Response.json({ error: "The demo identity cannot store keys. Sign in with Google." }, { status: 403 });
    }
    if (!keyEncryptionReady()) {
      return Response.json({ error: "Key storage is not available on this deployment yet." }, { status: 503 });
    }
    const body = (await readJsonBody(request, 8 * 1024)) as {
      provider?: unknown;
      apiKey?: unknown;
      model?: unknown;
      custom?: { name?: unknown; baseUrl?: unknown; model?: unknown; apiKey?: unknown };
    };
    return await withWorkspace(user!.uid, user!.idToken, async () => {
      if (body.custom && typeof body.custom === "object") {
        const { name, baseUrl, model, apiKey } = body.custom;
        if (typeof name !== "string" || !name.trim()) throw new Error("Name the provider.");
        if (typeof baseUrl !== "string" || !/^https:\/\/[^\s/]+/.test(baseUrl.trim())) {
          throw new Error("Base URL must be an https:// OpenAI-compatible endpoint (e.g. https://api.groq.com/openai/v1).");
        }
        if (typeof model !== "string" || !model.trim()) throw new Error("Set the model name.");
        if (typeof apiKey !== "string" || apiKey.trim().length < 8) throw new Error("Paste the API key.");
        const id = `custom-${randomUUID().slice(0, 8)}`;
        await saveCustomProvider({
          id,
          name: name.trim().slice(0, 40),
          baseUrl: baseUrl.trim(),
          model: model.trim(),
          apiKeyEnc: encryptSecret(apiKey.trim()),
          lastFour: lastFour(apiKey),
          createdAt: new Date().toISOString(),
        });
      } else {
        if (typeof body.provider !== "string" || !BUILTIN_IDS.has(body.provider)) throw new Error("Unknown provider.");
        if (typeof body.apiKey !== "string" || body.apiKey.trim().length < 8) throw new Error("Paste the API key.");
        await saveBuiltinKey(body.provider, {
          apiKeyEnc: encryptSecret(body.apiKey.trim()),
          lastFour: lastFour(body.apiKey),
          model: typeof body.model === "string" && body.model.trim() ? body.model.trim() : undefined,
          updatedAt: new Date().toISOString(),
        });
      }
      const settings = await loadKeySettings();
      return Response.json({ providers: providerKeyStatuses(settings) });
    });
  } catch (error) {
    return errorResponse(error, "GEO keys");
  }
}

// DELETE: remove a built-in override or a custom provider.
export async function DELETE(request: Request) {
  try {
    const user = await getFirebaseIdentity(request);
    const body = (await readJsonBody(request, 4 * 1024)) as { provider?: unknown; customId?: unknown };
    return await withWorkspace(user!.uid, user!.idToken, async () => {
      if (typeof body.customId === "string") {
        await deleteCustomProvider(body.customId);
      } else if (typeof body.provider === "string" && BUILTIN_IDS.has(body.provider)) {
        await deleteBuiltinKey(body.provider);
      } else {
        throw new Error("Say which key to remove.");
      }
      const settings = await loadKeySettings();
      return Response.json({ providers: providerKeyStatuses(settings) });
    });
  } catch (error) {
    return errorResponse(error, "GEO keys");
  }
}
