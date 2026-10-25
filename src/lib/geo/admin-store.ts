import type { App } from "firebase-admin/app";
import type { BrandProfile, MetricsSnapshot, QueryResult, ScanRun, TrackedQuery } from "./types";
import type { KeySettings } from "./store";

// Scheduled scans run with a Firebase service account instead of a user
// session. Credentials come from FIREBASE_ADMIN_CLIENT_EMAIL and
// FIREBASE_ADMIN_PRIVATE_KEY; the feature is off when they are absent.

let appPromise: Promise<App | null> | null = null;

async function getAdminApp(): Promise<App | null> {
  if (appPromise) return appPromise;
  appPromise = (async () => {
    const clientEmail = process.env.FIREBASE_ADMIN_CLIENT_EMAIL;
    const privateKey = process.env.FIREBASE_ADMIN_PRIVATE_KEY?.replace(/\\n/g, "\n");
    const databaseURL = process.env.FIREBASE_DATABASE_URL || process.env.NEXT_PUBLIC_FIREBASE_DATABASE_URL;
    const projectId = process.env.FIREBASE_PROJECT_ID || process.env.NEXT_PUBLIC_FIREBASE_PROJECT_ID;
    if (!clientEmail || !privateKey || !databaseURL || !projectId) return null;
    const { cert, getApps, initializeApp } = await import("firebase-admin/app");
    if (getApps().length) return getApps()[0];
    return initializeApp({ credential: cert({ clientEmail, privateKey, projectId }), databaseURL });
  })();
  return appPromise;
}

export function adminConfigured(): boolean {
  return Boolean(
    process.env.FIREBASE_ADMIN_CLIENT_EMAIL &&
      process.env.FIREBASE_ADMIN_PRIVATE_KEY &&
      (process.env.FIREBASE_DATABASE_URL || process.env.NEXT_PUBLIC_FIREBASE_DATABASE_URL),
  );
}

export async function getAdminAuth() {
  const app = await getAdminApp();
  if (!app) throw new Error("Firebase Admin is not configured.");
  const { getAuth } = await import("firebase-admin/auth");
  return getAuth(app);
}

export async function getAdminDatabase() {
  const app = await getAdminApp();
  if (!app) throw new Error("Firebase Admin is not configured.");
  const { getDatabase } = await import("firebase-admin/database");
  return getDatabase(app);
}

async function db() {
  return getAdminDatabase();
}

function toArray<T>(value: unknown): T[] {
  if (!value || typeof value !== "object") return [];
  return Object.values(value as Record<string, T>).filter(Boolean);
}

export async function listWorkspaceIds(limit = 100): Promise<string[]> {
  const database = await db();
  const snapshot = await database.ref("users").orderByKey().limitToFirst(limit).get();
  const value = snapshot.val() as Record<string, { geo?: { brand?: unknown } }> | null;
  if (!value) return [];
  return Object.entries(value)
    .filter(([, tree]) => Boolean(tree?.geo?.brand))
    .map(([uid]) => uid);
}

export async function adminLoadKeySettings(uid: string): Promise<KeySettings> {
  const database = await db();
  const snapshot = await database.ref(`users/${uid}/geo/settings/keys`).get();
  const raw = snapshot.val() as Partial<KeySettings> | null;
  return {
    providers: raw?.providers && typeof raw.providers === "object" ? raw.providers : {},
    custom: raw?.custom && typeof raw.custom === "object" ? raw.custom : {},
  };
}

export async function adminLoadWorkspace(uid: string): Promise<{ brand: BrandProfile | null; queries: TrackedQuery[] }> {
  const database = await db();
  const snapshot = await database.ref(`users/${uid}/geo`).get();
  const geo = snapshot.val() as { brand?: BrandProfile; queries?: Record<string, TrackedQuery> } | null;
  return {
    brand: geo?.brand ?? null,
    queries: toArray<TrackedQuery>(geo?.queries).sort((a, b) => a.createdAt.localeCompare(b.createdAt)),
  };
}

export async function adminSaveApiKey(uid: string, record: import("./types").ApiKeyRecord): Promise<void> {
  const database = await db();
  await database.ref(`users/${uid}/geo/apiKeys/${record.id}`).set(record);
  await database.ref(`apiKeyIndex/${record.hash}`).set({ uid, id: record.id });
}

export async function adminLoadApiKeys(uid: string): Promise<import("./types").ApiKeyRecord[]> {
  const database = await db();
  const snapshot = await database.ref(`users/${uid}/geo/apiKeys`).get();
  return toArray<import("./types").ApiKeyRecord>(snapshot.val()).sort((a, b) => a.createdAt.localeCompare(b.createdAt));
}

export async function adminDeleteApiKey(uid: string, id: string, hash: string): Promise<void> {
  const database = await db();
  await database.ref(`users/${uid}/geo/apiKeys/${id}`).remove();
  await database.ref(`apiKeyIndex/${hash}`).remove();
}

export async function adminResolveApiKey(hash: string): Promise<{ uid: string; id: string } | null> {
  const database = await db();
  const snapshot = await database.ref(`apiKeyIndex/${hash}`).get();
  const value = snapshot.val() as { uid?: string; id?: string } | null;
  if (!value?.uid || !value.id) return null;
  await database.ref(`users/${value.uid}/geo/apiKeys/${value.id}/lastUsedAt`).set(new Date().toISOString());
  return { uid: value.uid, id: value.id };
}

export async function adminLoadLatestSummary(uid: string) {
  const database = await db();
  const snapshot = await database.ref(`users/${uid}/geo`).get();
  const geo = snapshot.val() as {
    brand?: BrandProfile;
    latestRun?: string;
    runs?: Record<string, ScanRun>;
    snapshots?: Record<string, MetricsSnapshot>;
  } | null;
  const latestRunId = geo?.latestRun ?? null;
  return {
    brand: geo?.brand ?? null,
    latestRun: latestRunId ? geo?.runs?.[latestRunId] ?? null : null,
    snapshot: latestRunId ? geo?.snapshots?.[latestRunId] ?? null : null,
  };
}

export async function adminSaveRun(uid: string, run: ScanRun, results: QueryResult[], snapshot: MetricsSnapshot, queries?: TrackedQuery[]): Promise<void> {
  const database = await db();
  const resultMap = Object.fromEntries(results.map((r) => [r.queryId, r]));
  await database.ref(`users/${uid}/geo`).update({
    [`runs/${run.id}`]: run,
    [`results/${run.id}`]: resultMap,
    [`snapshots/${run.id}`]: snapshot,
    latestRun: run.id,
  });
  if (queries?.length) {
    await database.ref(`users/${uid}/geo/runQueries/${run.id}`).set(Object.fromEntries(queries.map((q) => [q.id, q])));
  }
}
