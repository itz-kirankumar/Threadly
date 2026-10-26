// Verified contact details on the caller's own Firebase account, via the REST
// lookup (the Admin SDK auth bundle does not run in this deployment).
export async function lookupVerifiedPhone(idToken: string): Promise<string | null> {
  try {
    const apiKey = process.env.FIREBASE_API_KEY || process.env.NEXT_PUBLIC_FIREBASE_API_KEY;
    if (!apiKey) return null;
    const res = await fetch(`https://identitytoolkit.googleapis.com/v1/accounts:lookup?key=${apiKey}`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ idToken }),
      cache: "no-store",
    });
    if (!res.ok) return null;
    const data = (await res.json()) as { users?: { phoneNumber?: string }[] };
    return data.users?.[0]?.phoneNumber ?? null;
  } catch {
    return null;
  }
}

export function normalizePhoneDigits(value: string | null | undefined): string {
  return (value || "").replace(/\D/g, "").slice(-10);
}
