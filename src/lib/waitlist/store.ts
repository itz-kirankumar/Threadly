// Beta waitlist storage. Applications and the approved list live in the
// Realtime Database under waitlist/ (server-only paths, admin SDK). Local
// development without a database keeps them in process memory.

import { createHash } from "node:crypto";

export interface WaitlistApplication {
  email: string;
  domain: string;
  role: string;
  useCase: string;
  score: number;
  reasons: string[];
  status: "invited" | "waitlisted";
  appliedAt: string;
  invitedAt?: string;
}

const memory = (globalThis as { __threadlyWaitlist?: Map<string, WaitlistApplication> }).__threadlyWaitlist ??= new Map();

export function emailKey(email: string): string {
  return createHash("sha256").update(email.trim().toLowerCase()).digest("hex").slice(0, 40);
}

async function database() {
  try {
    const { adminConfigured, getAdminDatabase } = await import("../geo/admin-store.ts");
    if (!adminConfigured()) return null;
    return await getAdminDatabase();
  } catch {
    return null;
  }
}

export async function loadApplication(email: string): Promise<WaitlistApplication | null> {
  const db = await database();
  if (!db) return memory.get(emailKey(email)) ?? null;
  const snap = await db.ref(`waitlist/applications/${emailKey(email)}`).get();
  return snap.exists() ? (snap.val() as WaitlistApplication) : null;
}

export async function saveApplication(app: WaitlistApplication): Promise<void> {
  const key = emailKey(app.email);
  const db = await database();
  if (!db) {
    memory.set(key, app);
    return;
  }
  const updates: Record<string, unknown> = { [`waitlist/applications/${key}`]: app };
  if (app.status === "invited") updates[`waitlist/approved/${key}`] = { email: app.email.toLowerCase(), at: app.invitedAt ?? app.appliedAt };
  await db.ref().update(updates);
}

// True when this email was invited from the waitlist (or approved by hand
// under waitlist/approved in the database).
export async function isEmailApproved(email: string | null | undefined): Promise<boolean> {
  if (!email) return false;
  const db = await database();
  if (!db) return memory.get(emailKey(email))?.status === "invited";
  return (await db.ref(`waitlist/approved/${emailKey(email)}`).get()).exists();
}
