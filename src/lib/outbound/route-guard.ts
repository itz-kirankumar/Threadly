// Audience guard for session-scoped outbound API routes. The unsubscribe and
// provider webhook routes deliberately do NOT use this: they are public
// capability endpoints with no session (HMAC URL / provider token).
//
// OUTBOUND_ALLOWED_UIDS (comma-separated Firebase uids) restricts who the
// outbound API serves when set. Use it to expose a functional isolated
// preview to exactly the owner on a branch deployment: every other
// authenticated user gets the same 404 as a disabled deployment, so the
// audience can never widen silently. Unset keeps the default behavior
// (any resolved workspace member), which local development relies on.
export function outboundUidAllowed(uid: string): boolean {
  const raw = process.env.OUTBOUND_ALLOWED_UIDS;
  if (!raw) return true;
  return raw
    .split(",")
    .map((s) => s.trim())
    .filter(Boolean)
    .includes(uid);
}

// 404, identical to a disabled deployment: no existence leak.
export function outboundAudienceDeny(): Response {
  return Response.json({ error: "Not found." }, { status: 404, headers: { "Cache-Control": "no-store" } });
}
