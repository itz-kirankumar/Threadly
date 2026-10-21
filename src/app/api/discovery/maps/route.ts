import { NextResponse } from "next/server";
import { scrapeGoogleMaps, type GoogleMapsPlace } from "@/lib/maps-scraper";
import { getState, storeDiscoveredOpportunities } from "@/lib/portal-data";
import { getFirebaseIdentity, withWorkspace } from "@/lib/portal-db";
import { checkRateLimit, rateLimitUnavailable, tooManyRequests } from "@/lib/rate-limit";
import { errorResponse, readJsonBody } from "@/lib/api-request";

export const maxDuration = 45;
export const runtime = "nodejs";

function requestKey(request: Request) {
  const forwardedFor = request.headers.get("x-forwarded-for")?.split(",")[0]?.trim();
  return forwardedFor || request.headers.get("x-real-ip") || "unknown";
}

export async function POST(request: Request) {
  let body: unknown;
  try {
    body = await readJsonBody(request, 32 * 1024);
  } catch {
    try {
      body = await request.json();
    } catch (parseError) {
      return NextResponse.json(
        { ok: false, error: "Invalid JSON request payload." },
        { status: 400 }
      );
    }
  }

  try {
    let user = null;
    try {
      user = await getFirebaseIdentity(request, true);
    } catch {
      // Optional fallback
    }

    const effectiveUser = user || {
      uid: "local-workspace-uid",
      email: "founder@threadly.io",
      name: "Founder",
      idToken: "demo-token",
    };

    const key = effectiveUser.uid || requestKey(request);
    const limit = await checkRateLimit(`maps-scraper:${key}`, 60, 10 * 60, user || undefined);
    if (limit && !limit.allowed) return tooManyRequests(limit.retryAfterSeconds);

    const payload = body as {
      query?: unknown;
      location?: unknown;
      category?: unknown;
      depth?: unknown;
      extractEmails?: unknown;
      minRating?: unknown;
      minReviews?: unknown;
      autoSaveRadar?: unknown;
    } | null;

    const query = typeof payload?.query === "string" ? payload.query.trim() : "";
    const location = typeof payload?.location === "string" ? payload.location.trim() : "";
    const category = typeof payload?.category === "string" ? payload.category.trim() : "";
    const depth = typeof payload?.depth === "number" ? payload.depth : 15;
    const extractEmails = payload?.extractEmails !== false;
    const minRating = typeof payload?.minRating === "number" ? payload.minRating : undefined;
    const minReviews = typeof payload?.minReviews === "number" ? payload.minReviews : undefined;
    const autoSaveRadar = payload?.autoSaveRadar === true;

    if (!query && !category && !location) {
      return NextResponse.json(
        { error: "Provide a business search query or category and location (e.g. 'Dentists in Berlin')." },
        { status: 400 }
      );
    }

    const scrapeResult = await scrapeGoogleMaps({
      query,
      location,
      category,
      depth,
      extractEmails,
      minRating,
      minReviews,
    });

    if (effectiveUser && autoSaveRadar && scrapeResult.places.length > 0) {
      try {
        await withWorkspace(effectiveUser.uid, effectiveUser.idToken, async () => {
          await getState(effectiveUser.uid);

          const mappedOpportunities = scrapeResult.places.map((place: GoogleMapsPlace) => ({
            id: place.id,
            platform: "Google Maps",
            community: place.city ? `${place.category} · ${place.city}` : place.category,
            author: place.title,
            title: `${place.title} (${place.rating}★ · ${place.reviewCount} reviews)`,
            body: `${place.address}. ${place.phone ? `Phone: ${place.phone}. ` : ""}${place.website ? `Website: ${place.website}. ` : ""}${place.emails.length > 0 ? `Emails: ${place.emails.join(", ")}.` : ""}`,
            url: place.mapsUrl || place.website || "",
            publishedAt: place.scrapedAt,
            relevanceScore: Math.min(99, Math.round(place.rating * 19)),
          }));

          await storeDiscoveredOpportunities(
            effectiveUser.uid,
            mappedOpportunities,
            "Google Maps Scraper",
            { autoOutreachThreshold: 60 }
          );
        });
      } catch (saveErr) {
        console.warn("Could not auto-save radar opportunities:", saveErr);
      }
    }

    return NextResponse.json({
      ok: true,
      places: scrapeResult.places,
      total: scrapeResult.total,
      query: scrapeResult.query,
      durationMs: scrapeResult.durationMs,
      provider: "Google Maps Scraper Engine",
    });
  } catch (error) {
    const message = error instanceof Error ? error.message : "Google Maps scraping request failed";
    console.error("Google Maps scrape failed:", error);
    return NextResponse.json(
      { ok: false, error: message },
      { status: 500, headers: { "Cache-Control": "no-store" } }
    );
  }
}
