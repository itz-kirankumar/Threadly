import { createHash } from "node:crypto";

type Bucket = { count: number; expiresAt: number };
export type RateLimitResult = { allowed: boolean; retryAfterSeconds: number };

const localBuckets = new Map<string, Bucket>();
const RATE_LIMIT_SCRIPT = `local count = redis.call('INCR', KEYS[1]); if count == 1 then redis.call('PEXPIRE', KEYS[1], ARGV[1]); end; return count`;

function hashedKey(key: string) {
  return createHash("sha256").update(key).digest("hex");
}

/**
 * Shared production rate limiting via Upstash Redis. Local development uses a
 * bounded in-process bucket; production fails closed when Redis is not set up.
 */
export async function checkRateLimit(key: string, limit: number, windowSeconds: number): Promise<RateLimitResult | null> {
  const redisUrl = process.env.UPSTASH_REDIS_REST_URL?.trim().replace(/\/$/, "");
  const redisToken = process.env.UPSTASH_REDIS_REST_TOKEN?.trim();

  if (redisUrl && redisToken) {
    let response: Response;
    try {
      response = await fetch(redisUrl, {
        method: "POST",
        headers: { Authorization: `Bearer ${redisToken}`, "Content-Type": "application/json" },
        body: JSON.stringify(["EVAL", RATE_LIMIT_SCRIPT, "1", `wisentry:limit:${hashedKey(key)}`, String(windowSeconds * 1000)]),
        cache: "no-store",
        signal: AbortSignal.timeout(4000),
      });
    } catch {
      throw new Error("Rate limit service is unavailable.");
    }
    if (!response.ok) throw new Error("Rate limit service is unavailable.");
    const result = await response.json() as { result?: unknown; error?: unknown };
    if (result.error || typeof result.result !== "number") throw new Error("Rate limit service returned an invalid response.");
    return { allowed: result.result <= limit, retryAfterSeconds: windowSeconds };
  }

  if (process.env.NODE_ENV === "production") return null;

  const now = Date.now();
  const id = hashedKey(key);
  const bucket = localBuckets.get(id);
  const active = bucket && bucket.expiresAt > now ? bucket : { count: 0, expiresAt: now + windowSeconds * 1000 };
  active.count += 1;
  localBuckets.set(id, active);
  if (localBuckets.size > 5000) {
    for (const [bucketKey, value] of localBuckets) if (value.expiresAt <= now) localBuckets.delete(bucketKey);
  }
  return { allowed: active.count <= limit, retryAfterSeconds: Math.max(1, Math.ceil((active.expiresAt - now) / 1000)) };
}

export function rateLimitUnavailable() {
  return Response.json({ error: "This service is temporarily unavailable." }, { status: 503 });
}

export function tooManyRequests(retryAfterSeconds: number) {
  return Response.json(
    { error: "Rate limit reached. Please wait before trying again." },
    { status: 429, headers: { "Retry-After": String(retryAfterSeconds), "Cache-Control": "no-store" } },
  );
}

export function requestAddressKey(request: Request) {
  const forwarded = request.headers.get("x-forwarded-for")?.split(",")[0]?.trim();
  const address = request.headers.get("x-real-ip")?.trim() || forwarded || "unknown";
  return hashedKey(address);
}
