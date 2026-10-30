import { parseAuditDomain } from "@/lib/geo/openseo-engine";
import { checkRateLimit, requestAddressKey } from "@/lib/rate-limit";
import { FetchRefused, fetchPreview } from "@/lib/prospecting/web";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

// Type-ahead preview for the landing-page demo: the site's name and icon.
// Reads one public page (robots.txt respected), no search or paid API.
export async function GET(request: Request) {
  const raw = new URL(request.url).searchParams.get("domain") ?? "";
  const domain = parseAuditDomain(raw);
  if (!domain) return Response.json({ error: "Enter a website, like example.com." }, { status: 400, headers: { "Cache-Control": "no-store" } });
  const limit = await checkRateLimit(`demo-preview:${requestAddressKey(request)}`, 60, 3600);
  if (limit && !limit.allowed) {
    return Response.json({ error: "Too many lookups. Try again shortly." }, { status: 429, headers: { "Retry-After": String(limit.retryAfterSeconds) } });
  }
  try {
    const preview = await fetchPreview(domain);
    return Response.json(preview, { headers: { "Cache-Control": "public, max-age=600" } });
  } catch (error) {
    const message = error instanceof FetchRefused ? `That site ${error.message}.` : "That site could not be reached.";
    return Response.json({ error: message, domain }, { status: 422, headers: { "Cache-Control": "no-store" } });
  }
}
