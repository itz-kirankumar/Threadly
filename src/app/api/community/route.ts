import { NextResponse } from "next/server";
import { insertCommunityMember } from "@/lib/db";
import { sendCommunityInvite } from "@/lib/mailer";
import { getFirebaseIdentity } from "@/lib/portal-db";
import { errorResponse, readJsonBody } from "@/lib/api-request";
import { checkRateLimit, rateLimitUnavailable, tooManyRequests } from "@/lib/rate-limit";

export const runtime = "nodejs";

export async function POST(request: Request) {
  try {
    const user = await getFirebaseIdentity(request);
    if (!user) return NextResponse.json({ error: "Sign in with Google to continue." }, { status: 401 });
    const limit = await checkRateLimit(`community:${user.uid}`, 5, 10 * 60, user);
    if (!limit) return rateLimitUnavailable();
    if (!limit.allowed) return tooManyRequests(limit.retryAfterSeconds);
    const body = await readJsonBody(request, 2 * 1024);
    const email = body && typeof body === "object" && !Array.isArray(body) ? (body as { email?: unknown }).email : null;
    if (typeof email !== "string" || email.length > 254 || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email.trim())) {
      return NextResponse.json({ error: "Enter a valid email address." }, { status: 400 });
    }
    if (email.trim().toLowerCase() !== user.email.trim().toLowerCase()) {
      return NextResponse.json({ error: "Use the email address on your Google account." }, { status: 400 });
    }

    // Insert into DB
    await insertCommunityMember(email.trim().toLowerCase(), user.uid, user.idToken);
    
    // Send email via SES or console fallback
    await sendCommunityInvite(email);

    return NextResponse.json({ success: true });
  } catch (error) {
    return errorResponse(error, "Community signup");
  }
}
