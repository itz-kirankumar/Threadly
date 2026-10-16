import { NextResponse } from "next/server";
import { insertWaitlist } from "@/lib/db";
import { errorResponse, readJsonBody } from "@/lib/api-request";
import { checkRateLimit, rateLimitUnavailable, requestAddressKey, tooManyRequests } from "@/lib/rate-limit";

export const runtime = "nodejs";

export async function POST(request: Request) {
  try {
    const limit = await checkRateLimit(`waitlist:${requestAddressKey(request)}`, 3, 10 * 60);
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

    await insertWaitlist({
      fullName: String(form.fullName).trim(),
      startupName: String(form.startupName).trim(),
      industry: String(form.industry).trim(),
      url: typeof form.url === "string" ? form.url.trim() : "",
      challenge1: String(form.challenge1).trim(),
      challenge2: typeof form.challenge2 === "string" ? form.challenge2.trim() : "",
    });

    return NextResponse.json({ success: true });
  } catch (error) {
    return errorResponse(error, "Waitlist submission");
  }
}
