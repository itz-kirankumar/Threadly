export const dynamic = "force-dynamic";

export function GET() {
  const firebase = Boolean(
    (process.env.NEXT_PUBLIC_FIREBASE_API_KEY || "AIzaSyBh_cw7QS00FX2ZwaGtNnuiNhXaVWbdYWM")
    && (process.env.NEXT_PUBLIC_FIREBASE_AUTH_DOMAIN || "wisentry-510811.firebaseapp.com")
    && (process.env.NEXT_PUBLIC_FIREBASE_DATABASE_URL || "https://wisentry-510811-default-rtdb.firebaseio.com")
    && (process.env.NEXT_PUBLIC_FIREBASE_PROJECT_ID || "wisentry-510811"),
  );
  const rateLimitStore = Boolean(process.env.UPSTASH_REDIS_REST_URL && process.env.UPSTASH_REDIS_REST_TOKEN);
  const persistentStorage = process.env.USE_DYNAMODB === "true"
    ? Boolean(process.env.APP_AWS_REGION || process.env.AWS_REGION)
    : process.env.NODE_ENV !== "production" || Boolean(process.env.WISENTRY_DB_PATH);
  const checks = { firebase, rateLimitStore: rateLimitStore || process.env.NODE_ENV !== "production", persistentStorage };
  const ready = Object.values(checks).every(Boolean);
  return Response.json({ status: ready ? "ready" : "not_ready", checks }, {
    status: ready ? 200 : 503,
    headers: { "Cache-Control": "no-store" },
  });
}
