import { NextResponse } from "next/server";
import { getWaitlistRequest, insertWaitlist } from "@/lib/db";
import { getFirebaseIdentity } from "@/lib/portal-db";
import { errorResponse, readJsonBody } from "@/lib/api-request";
import { checkRateLimit, rateLimitUnavailable, tooManyRequests } from "@/lib/rate-limit";
import { isAdminEmail } from "@/lib/admin-auth";
import { sendBetaEmail } from "@/lib/resend";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET(request: Request) {
  try {
    const user = await getFirebaseIdentity(request);
    if (!user) return NextResponse.json({ error: "Sign in with Google to continue." }, { status: 401 });
    if (isAdminEmail(user.email)) {
      return NextResponse.json({ application: null, accessGranted: true, role: "admin" }, { headers: { "Cache-Control": "no-store" } });
    }
    const application = await getWaitlistRequest(user.uid);
    return NextResponse.json({ accessGranted: application?.status === "approved", application: application ? {
      status: application.status || "pending",
      createdAt: application.createdAt,
      reviewedAt: application.reviewedAt || null,
    } : null }, { headers: { "Cache-Control": "no-store" } });
  } catch (error) {
    return errorResponse(error, "Waitlist status");
  }
}

export async function POST(request: Request) {
  try {
    const user = await getFirebaseIdentity(request);
    if (!user) return NextResponse.json({ error: "Sign in with Google to join the waitlist." }, { status: 401 });
    const limit = await checkRateLimit(`waitlist:${user.uid}`, 3, 10 * 60);
    if (!limit) return rateLimitUnavailable();
    if (!limit.allowed) return tooManyRequests(limit.retryAfterSeconds);

    const data = await readJsonBody(request, 16 * 1024);
    if (!data || typeof data !== "object" || Array.isArray(data)) {
      return NextResponse.json({ error: "Complete the required fields." }, { status: 400 });
    }
    const form = data as Record<string, unknown>;
    const required = ["fullName", "startupName", "industry", "challenge1"];
    if (required.some(key => typeof form[key] !== "string" || !String(form[key]).trim())) {
      return NextResponse.json({ error: "Missing required fields" }, { status: 400 });
    }
    const limits: Record<string, number> = { fullName: 120, startupName: 160, industry: 120, url: 2048, challenge1: 5000, challenge2: 5000 };
    if (Object.entries(limits).some(([key, max]) => form[key] !== undefined && (typeof form[key] !== "string" || form[key].length > max))) {
      return NextResponse.json({ error: "One or more fields are too long." }, { status: 400 });
    }
    if (form.url && typeof form.url === "string") {
      try { if (new URL(form.url).protocol !== "https:") throw new Error(); }
      catch { return NextResponse.json({ error: "Use a valid HTTPS website address." }, { status: 400 }); }
    }
    if (!user.email) return NextResponse.json({ error: "Your Google account needs a verified email address." }, { status: 400 });

    const previous = await getWaitlistRequest(user.uid);
    await insertWaitlist({
      uid: user.uid,
      email: user.email.trim().toLowerCase(),
      fullName: String(form.fullName).trim(),
      startupName: String(form.startupName).trim(),
      industry: String(form.industry).trim(),
      url: typeof form.url === "string" ? form.url.trim() : "",
      challenge1: String(form.challenge1).trim(),
      challenge2: typeof form.challenge2 === "string" ? form.challenge2.trim() : "",
    });

    const application = await getWaitlistRequest(user.uid);
    let emailSent: boolean | undefined;
    if (!previous || previous.status === "rejected") {
      try {
        await sendBetaEmail({ to: user.email, name: String(form.fullName).trim(), kind: "waitlist" });
        emailSent = true;
      } catch (error) {
        emailSent = false;
        console.error("Waitlist confirmation email failed", error instanceof Error ? error.message : "Unknown Resend error");
      }
    }
    return NextResponse.json({ success: true, status: application?.status || "pending", emailSent });
  } catch (error) {
    return errorResponse(error, "Waitlist submission");
  }
}
