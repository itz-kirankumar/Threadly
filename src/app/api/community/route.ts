import { NextResponse } from "next/server";
import { insertCommunityMember } from "@/lib/db";
import { sendCommunityInvite } from "@/lib/mailer";
import { errorResponse, readJsonBody } from "@/lib/api-request";
import { checkRateLimit, rateLimitUnavailable, requestAddressKey, tooManyRequests } from "@/lib/rate-limit";

export const runtime = "nodejs";

export async function POST(request: Request) {
  try {
    const limit = await checkRateLimit(`community:${requestAddressKey(request)}`, 5, 10 * 60);
    if (!limit) return rateLimitUnavailable();
    if (!limit.allowed) return tooManyRequests(limit.retryAfterSeconds);
    const body = await readJsonBody(request, 2 * 1024);
    const email = body && typeof body === "object" && !Array.isArray(body) ? (body as { email?: unknown }).email : null;
    if (typeof email !== "string" || email.length > 254 || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email.trim())) {
      return NextResponse.json({ error: "Enter a valid email address." }, { status: 400 });
    }

    // Insert into DB
    await insertCommunityMember(email.trim().toLowerCase());
    
    // Send email via SES or console fallback
    await sendCommunityInvite(email);

    return NextResponse.json({ success: true });
  } catch (error) {
    return errorResponse(error, "Community signup");
  }
}
