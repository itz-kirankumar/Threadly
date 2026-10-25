import { GEO_PROVIDERS, type ProviderKeyStatus } from "./types";
import type { KeySettings } from "./store";

// Masked, safe-to-render view of a workspace's provider key configuration.
export function providerKeyStatuses(settings: KeySettings): ProviderKeyStatus[] {
  const builtins: ProviderKeyStatus[] = GEO_PROVIDERS.map(({ id, label, envKey }) => {
    const userKey = settings.providers[id];
    return {
      id,
      label,
      kind: "builtin",
      source: userKey ? "user" : process.env[envKey] ? "platform" : "none",
      model: userKey?.model || undefined,
      lastFour: userKey?.lastFour,
    };
  });
  const customs: ProviderKeyStatus[] = Object.values(settings.custom)
    .sort((a, b) => a.createdAt.localeCompare(b.createdAt))
    .map((c) => ({
      id: c.id,
      label: c.name,
      kind: "custom",
      source: "user",
      model: c.model,
      baseUrl: c.baseUrl,
      lastFour: c.lastFour,
    }));
  return [...builtins, ...customs];
}
