import { createSign } from "node:crypto";

// Checks whether a Firebase Auth user still exists, using the project's
// service account over the Identity Toolkit admin REST API. firebase-admin's
// auth module cannot run in this serverless bundle (ESM-only transitive
// deps), so the service-account OAuth token is minted by hand with
// node:crypto - no new dependencies.
//
// Returns true (user exists), false (user is gone), or null (could not
// determine - callers must treat null as "do not touch anything").

function adminCreds() {
  const clientEmail = process.env.FIREBASE_ADMIN_CLIENT_EMAIL;
  const privateKey = process.env.FIREBASE_ADMIN_PRIVATE_KEY?.replace(/\\n/g, "\n");
  const projectId = process.env.FIREBASE_PROJECT_ID || process.env.NEXT_PUBLIC_FIREBASE_PROJECT_ID;
  if (!clientEmail || !privateKey || !projectId) return null;
  return { clientEmail, privateKey, projectId };
}

async function serviceAccountAccessToken(clientEmail: string, privateKey: string): Promise<string> {
  const now = Math.floor(Date.now() / 1000);
  const header = Buffer.from(JSON.stringify({ alg: "RS256", typ: "JWT" })).toString("base64url");
  const claims = Buffer.from(
    JSON.stringify({
      iss: clientEmail,
      scope: "https://www.googleapis.com/auth/identitytoolkit",
      aud: "https://oauth2.googleapis.com/token",
      iat: now,
      exp: now + 3600,
    }),
  ).toString("base64url");
  const unsigned = `${header}.${claims}`;
  const signer = createSign("RSA-SHA256");
  signer.update(unsigned);
  const signature = signer.sign(privateKey, "base64url");
  const response = await fetch("https://oauth2.googleapis.com/token", {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded" },
    body: `grant_type=urn%3Aietf%3Aparams%3Aoauth%3Agrant-type%3Ajwt-bearer&assertion=${unsigned}.${signature}`,
    cache: "no-store",
  });
  if (!response.ok) throw new Error(`token exchange failed: ${response.status}`);
  const data = (await response.json()) as { access_token?: string };
  if (!data.access_token) throw new Error("token exchange returned no access_token");
  return data.access_token;
}

export async function authUserExists(uid: string): Promise<boolean | null> {
  const creds = adminCreds();
  if (!creds) return null;
  try {
    const token = await serviceAccountAccessToken(creds.clientEmail, creds.privateKey);
    const response = await fetch(
      `https://identitytoolkit.googleapis.com/v1/projects/${encodeURIComponent(creds.projectId)}/accounts:batchGet?localId=${encodeURIComponent(uid)}`,
      { headers: { Authorization: `Bearer ${token}` }, cache: "no-store" },
    );
    if (!response.ok) return null;
    const data = (await response.json()) as { users?: unknown[] };
    return Array.isArray(data.users) && data.users.length > 0;
  } catch {
    return null;
  }
}
