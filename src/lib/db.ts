export type WaitlistStatus = "pending" | "approved" | "rejected";
export type WaitlistRequest = {
  id: string;
  uid: string;
  email: string;
  fullName: string;
  startupName: string;
  industry: string;
  url: string;
  challenge1: string;
  challenge2: string;
  status: WaitlistStatus;
  createdAt: string;
  reviewedAt?: string;
  reviewedBy?: string;
};

function databaseUrl() {
  const url = process.env.FIREBASE_DATABASE_URL
    || process.env.NEXT_PUBLIC_FIREBASE_DATABASE_URL
    || "https://wisentry-510811-default-rtdb.firebaseio.com";
  return url.replace(/\/+$/, "");
}

function databasePath(path: string, idToken: string) {
  const segments = path.split("/").filter(Boolean).map(encodeURIComponent);
  return `${databaseUrl()}/${segments.join("/")}.json?auth=${encodeURIComponent(idToken)}`;
}

async function databaseRequest<T>(path: string, idToken: string, init?: RequestInit): Promise<T | null> {
  const response = await fetch(databasePath(path, idToken), { ...init, cache: "no-store" });
  if (!response.ok) {
    const detail = response.status === 401 || response.status === 403
      ? "Firebase denied access. Check the Realtime Database rules and sign in again."
      : "Could not access Firebase Realtime Database.";
    throw new Error(detail);
  }
  return response.json();
}

export async function getWaitlistRequest(uid: string, idToken: string): Promise<WaitlistRequest | null> {
  const request = await databaseRequest<WaitlistRequest>(`betaWaitlist/${uid}`, idToken);
  return request ? { ...request, id: uid, uid } : null;
}

export async function insertWaitlist(data: {
  uid: string;
  email: string;
  fullName: string;
  startupName: string;
  industry: string;
  url?: string;
  challenge1: string;
  challenge2?: string;
}, idToken: string) {
  const previous = await getWaitlistRequest(data.uid, idToken);
  if (previous?.status === "approved") return;
  const request: WaitlistRequest = {
    id: data.uid,
    ...data,
    url: data.url || "",
    challenge2: data.challenge2 || "",
    status: "pending",
    createdAt: previous?.createdAt || new Date().toISOString(),
  };
  await databaseRequest(`betaWaitlist/${data.uid}`, idToken, {
    method: "PUT",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(request),
  });
}

export async function listWaitlistRequests(idToken: string): Promise<WaitlistRequest[]> {
  const requests = await databaseRequest<Record<string, Omit<WaitlistRequest, "id"> & { id?: string }>>("betaWaitlist", idToken);
  return Object.entries(requests || {})
    .filter(([, request]) => Boolean(request?.uid))
    .map(([uid, request]) => ({ ...request, id: uid, uid }))
    .sort((a, b) => b.createdAt.localeCompare(a.createdAt));
}

export async function reviewWaitlistRequest(id: string, status: WaitlistStatus, reviewedBy: string, idToken: string): Promise<boolean> {
  const existing = await getWaitlistRequest(id, idToken);
  if (!existing) return false;
  const reviewedAt = new Date().toISOString();
  await databaseRequest(`betaWaitlist/${id}`, idToken, {
    method: "PATCH",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ status, reviewedAt, reviewedBy }),
  });
  return true;
}

export async function insertCommunityMember(email: string, uid: string, idToken: string) {
  const existing = await databaseRequest<{ uid: string }>(`communityMembers/${uid}`, idToken);
  if (existing) return;
  await databaseRequest(`communityMembers/${uid}`, idToken, {
    method: "PUT",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ email: email.trim().toLowerCase(), uid, createdAt: new Date().toISOString() }),
  });
}
