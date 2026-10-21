export const dynamic = "force-dynamic";

export function GET() {
  const firebase = Boolean(
    (process.env.NEXT_PUBLIC_FIREBASE_API_KEY || "AIzaSyBh_cw7QS00FX2ZwaGtNnuiNhXaVWbdYWM")
    && (process.env.NEXT_PUBLIC_FIREBASE_AUTH_DOMAIN || "wisentry-510811.firebaseapp.com")
    && (process.env.FIREBASE_DATABASE_URL || process.env.NEXT_PUBLIC_FIREBASE_DATABASE_URL || "https://wisentry-510811-default-rtdb.firebaseio.com")
    && (process.env.NEXT_PUBLIC_FIREBASE_PROJECT_ID || "wisentry-510811"),
  );
  const resend = Boolean(process.env.RESEND_API_KEY && process.env.RESEND_FROM_EMAIL);
  const checks = {
    firebase,
    firebaseWaitlistStorage: firebase,
    authenticatedRateLimiting: firebase,
    betaEmailDelivery: resend,
    anonymousRateLimitStore: Boolean(process.env.UPSTASH_REDIS_REST_URL && process.env.UPSTASH_REDIS_REST_TOKEN),
  };
  const ready = checks.firebase && checks.firebaseWaitlistStorage && checks.authenticatedRateLimiting && checks.betaEmailDelivery;
  return Response.json({ status: ready ? "ready" : "not_ready", checks }, {
    status: ready ? 200 : 503,
    headers: { "Cache-Control": "no-store" },
  });
}
