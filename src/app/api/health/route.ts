export const dynamic = "force-dynamic";

import { GEO_PROVIDERS } from "@/lib/geo/types";
import { adminConfigured } from "@/lib/geo/admin-store";

export function GET() {
  const firebase = Boolean(
    process.env.NEXT_PUBLIC_FIREBASE_API_KEY
    && process.env.NEXT_PUBLIC_FIREBASE_AUTH_DOMAIN
    && (process.env.FIREBASE_DATABASE_URL || process.env.NEXT_PUBLIC_FIREBASE_DATABASE_URL)
    && process.env.NEXT_PUBLIC_FIREBASE_PROJECT_ID,
  );
  const providers = Object.fromEntries(
    GEO_PROVIDERS.map(({ id, envKey }) => [id, Boolean(process.env[envKey])]),
  );
  const checks = {
    firebase,
    providers,
    providerCount: Object.values(providers).filter(Boolean).length,
    anonymousRateLimitStore: Boolean(process.env.UPSTASH_REDIS_REST_URL && process.env.UPSTASH_REDIS_REST_TOKEN),
    scheduledScans: adminConfigured() && Boolean(process.env.CRON_SECRET),
  };
  const ready = checks.firebase && checks.providerCount > 0;
  return Response.json({ status: ready ? "ready" : "not_ready", checks }, {
    status: ready ? 200 : 503,
    headers: { "Cache-Control": "no-store" },
  });
}
