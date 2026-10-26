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

// Canonical E.164 normalization. A phone number only ever matches on its
// COMPLETE international form: country code + full national number. Inputs
// without an explicit country prefix ("+"/"00") are ambiguous - a bare
// national number could belong to any country - and return null so callers
// pause to pending instead of ever matching. Never strip or guess country
// codes: two different countries' numbers can share a trailing suffix.
export function normalizeE164(value: string | null | undefined): string | null {
  if (!value) return null;
  let v = value.trim().replace(/[\s().-]/g, "");
  if (v.startsWith("00")) v = `+${v.slice(2)}`;
  if (!v.startsWith("+")) return null;
  const digits = v.slice(1);
  // E.164: country code + national number, 8-15 digits total.
  if (!/^\d{8,15}$/.test(digits)) return null;
  return `+${digits}`;
}
