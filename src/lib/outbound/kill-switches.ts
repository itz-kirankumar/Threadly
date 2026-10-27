// Control-center kill switches (PRD F09): tenant/campaign/domain/sender
// pause controls that take effect WITHOUT a redeploy and surface a visible
// pause reason. Engaging never deletes anything; lifting sets liftedAt so
// the record stays as an audit trail. One active switch per scope+target:
// a second engage for the same target is refused so pause reasons stay
// unambiguous. Enforcement is additive deny: absence of switches changes
// nothing, a present switch always blocks its scope.

import type { CreationMeta, ISODate } from "./types.ts";

export type KillSwitchScope = "tenant" | "campaign" | "domain" | "sender";

export interface KillSwitch extends CreationMeta {
  tenantId: string;
  switchId: string;
  scope: KillSwitchScope;
  target: string; // "*" for tenant; campaignId; senderId; lowercase domain
  reason: string; // shown verbatim in skip/defer reasons
  liftedAt: ISODate | null;
}

export interface KillSwitchStore {
  save(s: KillSwitch): Promise<void>;
  get(tenantId: string, switchId: string): Promise<KillSwitch | null>;
  list(tenantId: string): Promise<KillSwitch[]>;
  lift(tenantId: string, switchId: string, liftedAt: ISODate): Promise<void>;
}

export class MemoryKillSwitchStore implements KillSwitchStore {
  items = new Map<string, KillSwitch>();
  async save(s: KillSwitch): Promise<void> {
    this.items.set(`${s.tenantId}:${s.switchId}`, s);
  }
  async get(tenantId: string, switchId: string): Promise<KillSwitch | null> {
    const s = this.items.get(`${tenantId}:${switchId}`);
    return s && s.tenantId === tenantId ? s : null;
  }
  async list(tenantId: string): Promise<KillSwitch[]> {
    return [...this.items.values()].filter((s) => s.tenantId === tenantId);
  }
  async lift(tenantId: string, switchId: string, liftedAt: ISODate): Promise<void> {
    const s = await this.get(tenantId, switchId);
    if (!s) throw new Error(`kill switch ${switchId} not found`);
    this.items.set(`${tenantId}:${switchId}`, { ...s, liftedAt });
  }
}

export class KillSwitchError extends Error {}

// Engage with duplicate protection: exactly one ACTIVE switch per
// scope+target. Lifting and re-engaging creates a new record.
export async function engageKillSwitch(
  store: KillSwitchStore,
  input: Omit<KillSwitch, "switchId" | "liftedAt">
): Promise<{ created: boolean; switch: KillSwitch }> {
  const existing = (await store.list(input.tenantId)).find(
    (s) => s.scope === input.scope && s.target === input.target && s.liftedAt === null
  );
  if (existing) return { created: false, switch: existing };
  const record: KillSwitch = { ...input, switchId: `ks_${crypto.randomUUID()}`, liftedAt: null };
  await store.save(record);
  return { created: true, switch: record };
}

// Matches active switches against a concrete dispatch/planning context.
// tenant scope always matches its tenant's operations.
export function activeKillSwitches(
  switches: KillSwitch[],
  ctx: { campaignId?: string; senderId?: string; senderDomain?: string }
): KillSwitch[] {
  return switches.filter((s) => {
    if (s.liftedAt !== null) return false;
    switch (s.scope) {
      case "tenant":
        return true;
      case "campaign":
        return ctx.campaignId !== undefined && s.target === ctx.campaignId;
      case "sender":
        return ctx.senderId !== undefined && s.target === ctx.senderId;
      case "domain":
        return ctx.senderDomain !== undefined && s.target === ctx.senderDomain.toLowerCase();
    }
  });
}

export function killSwitchReasons(matches: KillSwitch[]): string[] {
  return matches.map((s) => `kill_switch_${s.scope}:${s.reason}`);
}
