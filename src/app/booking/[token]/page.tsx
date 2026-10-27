"use client";

import { use, useCallback, useEffect, useState } from "react";

type Offer = {
  organizerEmail: string;
  durationMinutes: number;
  timezone: string;
  expiresAt: string;
  slots: { startISO: string; endISO: string }[];
};

type Confirmation = {
  meetingId: string;
  startsAt: string;
  durationMinutes: number;
  timezone: string;
  booked: boolean;
  synthetic?: boolean;
  notice?: string;
};

// Public recipient-facing booking page. The link token is the only credential;
// the API enforces single-use, expiry and atomic slot claims.
export default function BookingPage({ params }: { params: Promise<{ token: string }> }) {
  const { token } = use(params);
  const [offer, setOffer] = useState<Offer | null>(null);
  const [error, setError] = useState<string>("");
  const [busy, setBusy] = useState(false);
  const [confirmation, setConfirmation] = useState<Confirmation | null>(null);

  const load = useCallback(async () => {
    const res = await fetch(`/api/outbound/booking/${encodeURIComponent(token)}`, { cache: "no-store" });
    const data = (await res.json()) as Offer & { error?: string };
    if (!res.ok) {
      setError(data.error ?? "This booking link is not available.");
      return;
    }
    setOffer(data);
  }, [token]);

  useEffect(() => {
    load().catch(() => setError("This booking link is not available."));
  }, [load]);

  const book = async (startISO: string) => {
    setBusy(true);
    setError("");
    try {
      const res = await fetch(`/api/outbound/booking/${encodeURIComponent(token)}`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ startISO }),
      });
      const data = (await res.json()) as Confirmation & { error?: string };
      if (!res.ok) {
        setError(data.error ?? "That slot could not be booked. Please pick another.");
        await load();
        return;
      }
      setConfirmation(data);
    } catch {
      setError("Something went wrong. Please try again.");
    } finally {
      setBusy(false);
    }
  };

  return (
    <main className="mx-auto max-w-lg px-4 py-12">
      <h1 className="text-xl font-semibold text-zinc-100">Book a meeting</h1>
      {error && <p className="mt-4 rounded-lg border border-rose-500/40 bg-rose-500/10 p-3 text-sm text-rose-300">{error}</p>}
      {confirmation ? (
        <div className="mt-6 rounded-xl border border-teal-500/40 bg-teal-500/10 p-4">
          <p className="text-sm font-medium text-teal-300">{confirmation.synthetic ? "Test booking confirmed" : "Confirmed"}</p>
          <p className="mt-1 text-sm text-zinc-300">
            {new Date(confirmation.startsAt).toLocaleString(undefined, { timeZone: confirmation.timezone, dateStyle: "full", timeStyle: "short" })} ({confirmation.timezone}), {confirmation.durationMinutes} minutes.
          </p>
          {confirmation.synthetic && (
            <p className="mt-2 text-xs text-amber-300">{confirmation.notice ?? "Confirmed by the mock calendar adapter: no real calendar event was created."}</p>
          )}
        </div>
      ) : offer ? (
        <div className="mt-6">
          <p className="text-sm text-zinc-400">
            {offer.organizerEmail} · {offer.durationMinutes} minutes · times shown in {offer.timezone}. Link expires {new Date(offer.expiresAt).toLocaleString()}.
          </p>
          {!offer.slots.length && <p className="mt-4 text-sm text-zinc-500">No available slots remain on this link.</p>}
          <ul className="mt-4 grid gap-2">
            {offer.slots.map((s) => (
              <li key={s.startISO}>
                <button
                  className="w-full rounded-lg border border-white/10 bg-white/[0.03] px-3 py-2 text-left text-sm text-zinc-200 hover:border-teal-500/50 disabled:opacity-40"
                  disabled={busy}
                  onClick={() => book(s.startISO)}
                >
                  {new Date(s.startISO).toLocaleString(undefined, { timeZone: offer.timezone, weekday: "short", month: "short", day: "numeric", hour: "2-digit", minute: "2-digit" })}
                </button>
              </li>
            ))}
          </ul>
        </div>
      ) : (
        !error && <p className="mt-6 text-sm text-zinc-500">Loading available times...</p>
      )}
    </main>
  );
}
