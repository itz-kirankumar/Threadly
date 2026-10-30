// Workspace credit balances. Each workspace has one account node, changed
// only by Realtime Database transactions from the server (creditAccounts/ is
// outside users/, so clients can neither read nor write it):
//   - charge() takes what the balance can cover, never going negative, and
//     returns how many units were paid for; callers keep only those results.
//   - grant() is idempotent by reference (a payment id), so a payment that
//     is verified twice, or by both the browser and a webhook, adds once.
// History is an append-only list beside the account. Local development
// without a database keeps both in process memory.

import { CREDIT_RATES, WELCOME_CREDITS, type CreditAction } from "./rates.ts";

export interface CreditAccount {
  balance: number;
  granted: number;
  spent: number;
  grants: Record<string, { credits: number; reason: string; at: string }>;
  updatedAt: string;
}

export interface CreditEntry {
  at: string;
  credits: number; // positive for grants and refunds, negative for charges
  kind: "grant" | "charge" | "refund";
  action: CreditAction | null;
  units: number;
  detail: string;
  balanceAfter: number;
}

export class InsufficientCredits extends Error {
  readonly status = 402;
  readonly needed: number;
  readonly balance: number;
  constructor(needed: number, balance: number) {
    super(`This needs at least ${needed} credit${needed === 1 ? "" : "s"} and the workspace has ${balance}. Buy a credit pack in Settings, Billing.`);
    this.needed = needed;
    this.balance = balance;
  }
}

type Memory = { accounts: Map<string, CreditAccount>; ledger: Map<string, CreditEntry[]> };
const memory = ((globalThis as { __threadlyCredits?: Memory }).__threadlyCredits ??= { accounts: new Map(), ledger: new Map() });

// Firebase keys cannot contain . # $ [ ] /
export function refKey(ref: string): string {
  return ref.replace(/[.#$[\]/]/g, "_").slice(0, 120);
}

function fresh(at: string): CreditAccount {
  return {
    balance: WELCOME_CREDITS,
    granted: WELCOME_CREDITS,
    spent: 0,
    grants: WELCOME_CREDITS > 0 ? { welcome: { credits: WELCOME_CREDITS, reason: "Welcome credits", at } } : {},
    updatedAt: at,
  };
}

function normalize(value: unknown, at: string): CreditAccount {
  if (!value || typeof value !== "object") return fresh(at);
  const v = value as Partial<CreditAccount>;
  return { balance: v.balance ?? 0, granted: v.granted ?? 0, spent: v.spent ?? 0, grants: v.grants ?? {}, updatedAt: v.updatedAt ?? at };
}

async function database() {
  const { adminConfigured, getAdminDatabase } = await import("../geo/admin-store.ts");
  if (!adminConfigured()) {
    if (process.env.NODE_ENV === "production") throw new Error("Credit storage is not configured.");
    return null;
  }
  return getAdminDatabase();
}

// Applies `change` to the account atomically. `change` returns the new
// account, or null to leave it untouched (the result then reports false).
async function transact(workspaceUid: string, change: (account: CreditAccount) => CreditAccount | null): Promise<{ applied: boolean; account: CreditAccount }> {
  const at = new Date().toISOString();
  const db = await database();
  if (!db) {
    const current = memory.accounts.get(workspaceUid) ?? fresh(at);
    const next = change(structuredClone(current));
    memory.accounts.set(workspaceUid, next ?? current);
    return { applied: Boolean(next), account: next ?? current };
  }
  let applied = false;
  const result = await db.ref(`creditAccounts/${workspaceUid}`).transaction((raw: unknown) => {
    const next = change(normalize(raw, at));
    applied = Boolean(next);
    // Returning undefined aborts; a brand-new account is still created so the
    // welcome grant is recorded even when the change itself is refused.
    if (!next) return raw === null ? fresh(at) : undefined;
    return next;
  });
  const account = normalize(result.snapshot.val(), at);
  return { applied: applied && result.committed, account };
}

async function record(workspaceUid: string, entry: CreditEntry): Promise<void> {
  try {
    const db = await database();
    if (!db) {
      const list = memory.ledger.get(workspaceUid) ?? [];
      list.push(entry);
      memory.ledger.set(workspaceUid, list.slice(-200));
      return;
    }
    await db.ref(`creditLedger/${workspaceUid}`).push(entry);
  } catch (error) {
    // History is best-effort; the balance itself is already committed.
    console.warn("[credits] ledger append failed", error);
  }
}

export async function getAccount(workspaceUid: string): Promise<CreditAccount> {
  return (await transact(workspaceUid, (a) => a)).account;
}

export async function getHistory(workspaceUid: string, limit = 50): Promise<CreditEntry[]> {
  const db = await database();
  if (!db) return [...(memory.ledger.get(workspaceUid) ?? [])].slice(-limit).reverse();
  const snap = await db.ref(`creditLedger/${workspaceUid}`).orderByKey().limitToLast(limit).get();
  return Object.values((snap.val() ?? {}) as Record<string, CreditEntry>).reverse();
}

// Throws InsufficientCredits unless one unit of `action` is affordable now.
export async function assertCanAfford(workspaceUid: string, action: CreditAction, units = 1): Promise<CreditAccount> {
  const account = await getAccount(workspaceUid);
  const needed = CREDIT_RATES[action] * Math.max(1, units);
  if (account.balance < needed) throw new InsufficientCredits(needed, account.balance);
  return account;
}

// Charges up to `units` of `action`, as many as the balance covers. Returns
// the units paid for (0 when none) and the balance after.
export async function charge(workspaceUid: string, action: CreditAction, units: number, detail: string): Promise<{ units: number; credits: number; balance: number }> {
  const rate = CREDIT_RATES[action];
  if (units <= 0) return { units: 0, credits: 0, balance: (await getAccount(workspaceUid)).balance };
  let paid = 0;
  const { account } = await transact(workspaceUid, (a) => {
    paid = Math.min(units, Math.floor(a.balance / rate));
    if (paid <= 0) return null;
    const at = new Date().toISOString();
    return { ...a, balance: a.balance - paid * rate, spent: a.spent + paid * rate, updatedAt: at };
  });
  if (paid > 0) {
    await record(workspaceUid, { at: new Date().toISOString(), credits: -paid * rate, kind: "charge", action, units: paid, detail, balanceAfter: account.balance });
  }
  return { units: paid, credits: paid * rate, balance: account.balance };
}

// Adds credits once per reference. Returns false when the reference was
// already granted (a repeat verification or webhook).
export async function grant(workspaceUid: string, credits: number, reason: string, ref: string, kind: "grant" | "refund" = "grant"): Promise<{ granted: boolean; balance: number }> {
  const key = refKey(ref);
  const { applied, account } = await transact(workspaceUid, (a) => {
    if (a.grants[key]) return null;
    const at = new Date().toISOString();
    return { ...a, balance: a.balance + credits, granted: a.granted + credits, grants: { ...a.grants, [key]: { credits, reason, at } }, updatedAt: at };
  });
  if (applied) {
    await record(workspaceUid, { at: new Date().toISOString(), credits, kind, action: null, units: 0, detail: reason, balanceAfter: account.balance });
  }
  return { granted: applied, balance: account.balance };
}
