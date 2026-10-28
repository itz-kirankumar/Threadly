// Audience guard for session-scoped outbound API routes. The unsubscribe and
// provider webhook routes deliberately do NOT use this: they are public
// capability endpoints with no session (HMAC URL / provider token).
//
// OUTBOUND_OWNER_ONLY=true marks an owner-only preview posture. In that
// posture OUTBOUND_ALLOWED_UIDS (comma-separated Firebase uids) MUST be set
// and non-empty: a missing or malformed allowlist fails CLOSED (every uid
// denied, same 404 as a disabled deployment) rather than silently opening
// the API to all signed-in users. Outside the owner-only posture the
// allowlist, when set, still restricts; unset means no audience restriction
// (local development and any deliberate future rollout).
export function outboundUidAllowed(uid: string): boolean {
  const raw = process.env.OUTBOUND_ALLOWED_UIDS;
  const list = (raw ?? "")
    .split(",")
    .map((s) => s.trim())
    .filter(Boolean);
  if (process.env.OUTBOUND_OWNER_ONLY === "true") {
    if (list.length === 0) return false; // fail closed: owner-only without a valid list denies everyone
    return list.includes(uid);
  }
  if (!raw) return true;
  return list.includes(uid);
}

// 404, identical to a disabled deployment: no existence leak.
export function outboundAudienceDeny(): Response {
  return Response.json({ error: "Not found." }, { status: 404, headers: { "Cache-Control": "no-store" } });
}
