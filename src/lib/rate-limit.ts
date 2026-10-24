import { createHash } from "node:crypto";

type Bucket = { count: number; expiresAt: number };
export type RateLimitResult = { allowed: boolean; retryAfterSeconds: number };
type FirebaseIdentity = { uid: string; idToken: string };

const localBuckets = new Map<string, Bucket>();
const RATE_LIMIT_SCRIPT = `local count = redis.call('INCR', KEYS[1]); if count == 1 then redis.call('PEXPIRE', KEYS[1], ARGV[1]); end; return count`;

function hashedKey(key: string) {
  return createHash("sha256").update(key).digest("hex");
}

/**
 * Authenticated production requests use an atomic Firebase Realtime Database
 * counter scoped to the signed-in UID. Anonymous production requests require
 * shared Upstash Redis. Local development uses a bounded in-process bucket.
 */
export async function checkRateLimit(key: string, limit: number, windowSeconds: number, identity?: FirebaseIdentity): Promise<RateLimitResult | null> {
  if (identity && !(identity.idToken === "demo-token" && process.env.ENABLE_DEMO_MODE === "true")) {
    try {
      const databaseUrl = (process.env.FIREBASE_DATABASE_URL || process.env.NEXT_PUBLIC_FIREBASE_DATABASE_URL || "").replace(/\/+$/, "");
      if (databaseUrl) {
        const bucketKey = hashedKey(key);
        const endpoint = `${databaseUrl}/apiRateLimits/${encodeURIComponent(identity.uid)}/${bucketKey}.json?auth=${encodeURIComponent(identity.idToken)}`;
        for (let attempt = 0; attempt < 3; attempt += 1) {
          const currentResponse = await fetch(endpoint, {
            headers: { "X-Firebase-ETag": "true" }, cache: "no-store", signal: AbortSignal.timeout(3000),
          });
          if (!currentResponse.ok) break;
          const current = await currentResponse.json() as { count?: number; resetAt?: number } | null;
          const etag = currentResponse.headers.get("ETag") || "null_etag";
          const now = Date.now();
          const active = current && typeof current.count === "number" && typeof current.resetAt === "number" && current.resetAt > now;
          const count = active ? Number(current?.count) + 1 : 1;
          const resetAt = active ? Number(current?.resetAt) : now + windowSeconds * 1000;
          const writeResponse = await fetch(endpoint, {
            method: "PUT",
            headers: { "Content-Type": "application/json", "If-Match": etag },
            body: JSON.stringify({ count, resetAt }),
            cache: "no-store", signal: AbortSignal.timeout(3000),
          });
          if (writeResponse.status === 412) continue;
          if (!writeResponse.ok) break;
          return { allowed: count <= limit, retryAfterSeconds: Math.max(1, Math.ceil((resetAt - now) / 1000)) };
        }
      }
    } catch {
      // Try Upstash if the Firebase counter is temporarily unavailable.
    }
  }

  const redisUrl = process.env.UPSTASH_REDIS_REST_URL?.trim().replace(/\/$/, "");
  const redisToken = process.env.UPSTASH_REDIS_REST_TOKEN?.trim();

  if (redisUrl && redisToken) {
    try {
      const response = await fetch(redisUrl, {
        method: "POST",
        headers: { Authorization: `Bearer ${redisToken}`, "Content-Type": "application/json" },
        body: JSON.stringify(["EVAL", RATE_LIMIT_SCRIPT, "1", `threadly:limit:${hashedKey(key)}`, String(windowSeconds * 1000)]),
        cache: "no-store",
        signal: AbortSignal.timeout(3000),
      });
      if (response.ok) {
        const result = await response.json() as { result?: unknown; error?: unknown };
        if (!result.error && typeof result.result === "number") {
          return { allowed: result.result <= limit, retryAfterSeconds: windowSeconds };
        }
      }
    } catch {
      // Production requests fail closed below if no shared store is available.
    }
  }

  // Serverless instances do not share memory. Falling back to a local bucket
  // in production would make quotas easy to bypass and could expose paid
  // providers to unbounded requests when a shared store is unavailable.
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
