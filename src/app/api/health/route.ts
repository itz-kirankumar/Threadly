export const dynamic = "force-dynamic";

import { getDecisionModelStatus } from "@/lib/decision-models";

export function GET() {
  const firebase = Boolean(
    process.env.NEXT_PUBLIC_FIREBASE_API_KEY
    && process.env.NEXT_PUBLIC_FIREBASE_AUTH_DOMAIN
    && (process.env.FIREBASE_DATABASE_URL || process.env.NEXT_PUBLIC_FIREBASE_DATABASE_URL)
    && process.env.NEXT_PUBLIC_FIREBASE_PROJECT_ID,
  );
  const resend = Boolean(process.env.RESEND_API_KEY && process.env.RESEND_FROM_EMAIL);
  const checks = {
    firebase,
    firebaseWaitlistStorage: firebase,
    authenticatedRateLimiting: firebase,
    betaEmailDelivery: resend,
    anonymousRateLimitStore: Boolean(process.env.UPSTASH_REDIS_REST_URL && process.env.UPSTASH_REDIS_REST_TOKEN),
    prospectQualification: getDecisionModelStatus(),
  };
  const ready = checks.firebase && checks.firebaseWaitlistStorage && checks.authenticatedRateLimiting && checks.betaEmailDelivery;
  return Response.json({ status: ready ? "ready" : "not_ready", checks }, {
    status: ready ? 200 : 503,
    headers: { "Cache-Control": "no-store" },
  });
}
