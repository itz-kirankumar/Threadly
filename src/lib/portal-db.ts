import { AsyncLocalStorage } from "node:async_hooks";

type FirebaseIdentity = { uid: string; email: string; name: string; idToken: string };
type WorkspaceAuth = { uid: string; idToken: string };
const workspaceAuth = new AsyncLocalStorage<WorkspaceAuth>();

// In-memory fallback store for demo mode & offline development
const demoStore = new Map<string, unknown>();

function getDemoPath(uid: string, path: string) {
  const cleanPath = path.split("/").filter(Boolean).join("/");
  return `${uid}:${cleanPath}`;
}

function databaseUrl() {
  const url = process.env.FIREBASE_DATABASE_URL || process.env.NEXT_PUBLIC_FIREBASE_DATABASE_URL || "https://wisentry-510811-default-rtdb.firebaseio.com";
  return url.replace(/\/+$/, "");
}

export async function getFirebaseIdentity(request: Request, optional = false): Promise<FirebaseIdentity | null> {
  const authorization = request.headers.get("authorization") || "";
  const idToken = authorization.match(/^Bearer\s+(.+)$/i)?.[1];
  if (!idToken) {
    if (optional) return null;
    throw new Error("Sign in with Google to continue.");
  }

  // Handle Demo Mode safely without external network call
  if (idToken === "demo-token") {
    return {
      uid: "demo-founder-uid",
      email: "founder@demo.wisentry.io",
      name: "Demo Founder",
      idToken: "demo-token",
    };
  }

  const apiKey = process.env.FIREBASE_API_KEY || process.env.NEXT_PUBLIC_FIREBASE_API_KEY || "AIzaSyBh_cw7QS00FX2ZwaGtNnuiNhXaVWbdYWM";
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
    const key = getDemoPath(context.uid, path);
    if (!path || path === "") {
      // return full tree
      const full: Record<string, unknown> = {};
      for (const [storeKey, val] of demoStore.entries()) {
        if (storeKey.startsWith(`${context.uid}:`)) {
          const subKey = storeKey.slice(`${context.uid}:`.length);
          if (!subKey.includes("/")) {
            full[subKey] = val;
          }
        }
      }
      return (Object.keys(full).length ? full : null) as T | null;
    }
    const val = demoStore.get(key);
    return (val !== undefined ? val : null) as T | null;
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
    const key = getDemoPath(context.uid, path);
    demoStore.set(key, value);
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
    const key = getDemoPath(context.uid, path);
    const existing = (demoStore.get(key) as Record<string, unknown>) || {};
    demoStore.set(key, { ...existing, ...value });
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
