import { getFirebaseIdentity } from "@/lib/portal-db";
import { RequestError } from "@/lib/api-request";
import { getWaitlistRequest } from "@/lib/db";

const DEFAULT_ADMIN_EMAIL = "kiran160703kumar@gmail.com";

export function isAdminEmail(email: string) {
  const configured = process.env.THREADLY_ADMIN_EMAILS || "";
  const admins = [DEFAULT_ADMIN_EMAIL, ...configured.split(",")]
    .map(value => value.trim().toLowerCase()).filter(Boolean);
  return admins.includes(email.trim().toLowerCase());
}

export async function requireAdmin(request: Request) {
  const identity = await getFirebaseIdentity(request);
  if (!identity || !isAdminEmail(identity.email)) {
    throw new RequestError("Admin access is restricted to authorized accounts.", identity ? 403 : 401);
  }
  return identity;
}

export async function requireApprovedIdentity(request: Request) {
  const identity = await getFirebaseIdentity(request);
  if (!identity) throw new RequestError("Sign in with Google to continue.", 401);
  if (isAdminEmail(identity.email)) return identity;
  const application = await getWaitlistRequest(identity.uid);
  if (!application || application.status !== "approved") {
    throw new RequestError("Threadly 2.0 workspace access requires an approved beta request.", 403);
  }
  return identity;
}
