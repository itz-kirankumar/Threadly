import { AsyncLocalStorage } from "node:async_hooks";

type FirebaseIdentity = { uid: string; email: string; name: string; idToken: string };
type WorkspaceAuth = { uid: string; idToken: string };
const workspaceAuth = new AsyncLocalStorage<WorkspaceAuth>();

// In-memory store for demo mode. It mirrors the Realtime Database's data
// model (one tree per user, nested paths, PATCH merges) and its storage
// rules (null, empty arrays and empty objects are not stored), so demo
// sessions exercise the same code paths and edge cases as real workspaces.
type DemoTree = Record<string, unknown>;
const demoTrees = new Map<string, DemoTree>();

function pathKeys(path: string) {
  return path.split("/").filter(Boolean);
}

function firebaseValue(value: unknown): unknown {
  if (value === null || value === undefined || typeof value === "function") return null;
  if (value instanceof Date) return value.toISOString();
  if (typeof value === "number" && !Number.isFinite(value)) return null;
  if (Array.isArray(value)) {
    const items = value.map(firebaseValue).filter(item => item !== null);
    return items.length ? items : null;
  }
  if (typeof value === "object") {
    const entries = Object.entries(value as Record<string, unknown>)
      .map(([key, item]) => [key, firebaseValue(item)] as const)
      .filter(([, item]) => item !== null);
    return entries.length ? Object.fromEntries(entries) : null;
  }
  return value;
}

function demoRead(uid: string, path: string): unknown {
  let node: unknown = demoTrees.get(uid) ?? null;
  for (const key of pathKeys(path)) {
    if (!node || typeof node !== "object") return null;
    node = (node as DemoTree)[key];
  }
  if (node === undefined || node === null) return null;
  if (typeof node === "object" && !Array.isArray(node) && !Object.keys(node).length) return null;
  return structuredClone(node);
}

function demoWrite(uid: string, path: string, value: unknown) {
  const keys = pathKeys(path);
  const stored = firebaseValue(value);
  if (!keys.length) {
    demoTrees.set(uid, stored && typeof stored === "object" && !Array.isArray(stored) ? stored as DemoTree : {});
    return;
  }
  let node = demoTrees.get(uid);
  if (!node) {
    node = {};
    demoTrees.set(uid, node);
  }
  for (const key of keys.slice(0, -1)) {
    if (!node[key] || typeof node[key] !== "object") node[key] = {};
    node = node[key] as DemoTree;
  }
  const last = keys[keys.length - 1];
  if (stored === null) delete node[last];
  else node[last] = stored;
}

function databaseUrl() {
  const url = process.env.FIREBASE_DATABASE_URL || process.env.NEXT_PUBLIC_FIREBASE_DATABASE_URL || "";
  if (!url) throw new Error("Firebase is not configured. Set FIREBASE_DATABASE_URL and restart the app.");
  return url.replace(/\/+$/, "");
}

export async function getFirebaseIdentity(request: Request, optional = false): Promise<FirebaseIdentity | null> {
  const authorization = request.headers.get("authorization") || "";
  const idToken = authorization.match(/^Bearer\s+(.+)$/i)?.[1];
  if (!idToken) {
    if (optional) return null;
    throw new Error("Sign in with Google to continue.");
  }

  // Demo mode: opt-in via ENABLE_DEMO_MODE=true. Read-only — demo
  // sessions use an in-memory store and never call paid providers.
  if (idToken === "demo-token") {
    if (process.env.ENABLE_DEMO_MODE !== "true") throw new Error("Demo mode is not enabled.");
    return {
      uid: "demo-founder-uid",
      email: "founder@demo.threadly.io",
      name: "Demo Founder",
      idToken: "demo-token",
    };
  }

  const apiKey = process.env.FIREBASE_API_KEY || process.env.NEXT_PUBLIC_FIREBASE_API_KEY;
  if (!apiKey) throw new Error("Firebase is not configured. Set FIREBASE_API_KEY and restart the app.");
  const response = await fetch(`https://identitytoolkit.googleapis.com/v1/accounts:lookup?key=${encodeURIComponent(apiKey)}`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ idToken }),
    cache: "no-store",
  });
  if (!response.ok) throw new Error("Your Google sign-in expired. Please sign in again.");
  const payload = await response.json();
  const user = payload.users?.[0];
  if (!user?.localId) throw new Error("Your Google sign-in could not be verified.");
  return { uid: user.localId, email: user.email || "", name: user.displayName || "Founder", idToken };
}

export async function withWorkspace<T>(uid: string, idToken: string, operation: () => Promise<T>): Promise<T> {
  return workspaceAuth.run({ uid, idToken }, operation);
}

function firebasePath(path: string) {
  const context = workspaceAuth.getStore();
  if (!context) throw new Error("Authenticated Firebase workspace is required.");
  const parts = ["users", context.uid, ...path.split("/").filter(Boolean)].map(encodeURIComponent);
  return `${databaseUrl()}/${parts.join("/")}.json?auth=${encodeURIComponent(context.idToken)}`;
}

export async function readData<T>(path: string): Promise<T | null> {
  const context = workspaceAuth.getStore();
  if (!context) throw new Error("Authenticated Firebase workspace is required.");

  if (context.idToken === "demo-token") {
    return demoRead(context.uid, path) as T | null;
  }

  const response = await fetch(firebasePath(path), { cache: "no-store" });
  if (!response.ok) throw new Error(response.status === 401 || response.status === 403
    ? "Firebase denied access. Check the Realtime Database rules and sign in again."
    : "Could not read the Firebase workspace.");
  return response.json();
}

export async function writeData(path: string, value: unknown): Promise<void> {
  const context = workspaceAuth.getStore();
  if (!context) throw new Error("Authenticated Firebase workspace is required.");

  if (context.idToken === "demo-token") {
    demoWrite(context.uid, path, value);
    return;
  }

  const response = await fetch(firebasePath(path), {
    method: "PUT",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(value),
    cache: "no-store",
  });
  if (!response.ok) throw new Error(response.status === 401 || response.status === 403
    ? "Firebase denied the write. Check the Realtime Database rules and sign in again."
    : "Could not save the Firebase workspace.");
}

export async function patchData(path: string, value: Record<string, unknown>): Promise<void> {
  const context = workspaceAuth.getStore();
  if (!context) throw new Error("Authenticated Firebase workspace is required.");

  if (context.idToken === "demo-token") {
    // PATCH semantics: each key is a child path; null deletes it.
    for (const [key, item] of Object.entries(value)) demoWrite(context.uid, `${path}/${key}`, item);
    return;
  }

  const response = await fetch(firebasePath(path), {
    method: "PATCH",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(value),
    cache: "no-store",
  });
  if (!response.ok) throw new Error(response.status === 401 || response.status === 403
    ? "Firebase denied the write. Check the Realtime Database rules and sign in again."
    : "Could not save the Firebase workspace.");
}
