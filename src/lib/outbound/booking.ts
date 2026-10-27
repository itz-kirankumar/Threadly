// Booking logic: slot computation under a booking policy and commit with a
// free/busy recheck immediately before event creation. A meeting is "booked"
// only when provider event creation is confirmed; with the mock calendar
// adapter the record is explicitly synthetic and never counts as a real
// meeting. No speculative invites: every commit comes from a recipient
// slot selection or an explicit rep action.

import type { BusyWindow, CalendarAdapter } from "./providers/calendar.ts";
import type { BookingPolicy, Meeting } from "./types.ts";

function tzOffsetMs(date: Date, timeZone: string): number {
  const dtf = new Intl.DateTimeFormat("en-US", {
    timeZone, year: "numeric", month: "2-digit", day: "2-digit",
    hour: "2-digit", minute: "2-digit", second: "2-digit", hour12: false,
  });
  const parts: Record<string, string> = {};
  for (const p of dtf.formatToParts(date)) parts[p.type] = p.value;
  const asUTC = Date.UTC(+parts.year, +parts.month - 1, +parts.day, +parts.hour % 24, +parts.minute, +parts.second);
  return asUTC - date.getTime();
}

// Wall-clock time in `timeZone` to a UTC instant (one refinement pass for DST).
export function zonedTimeToUtc(y: number, m: number, d: number, h: number, mi: number, timeZone: string): Date {
  const guess = Date.UTC(y, m - 1, d, h, mi);
  let utc = guess - tzOffsetMs(new Date(guess), timeZone);
  utc = guess - tzOffsetMs(new Date(utc), timeZone);
  return new Date(utc);
}

function localYMD(date: Date, timeZone: string): { y: number; m: number; d: number; dow: number } {
  const dtf = new Intl.DateTimeFormat("en-US", { timeZone, year: "numeric", month: "2-digit", day: "2-digit", weekday: "short" });
  const parts: Record<string, string> = {};
  for (const p of dtf.formatToParts(date)) parts[p.type] = p.value;
  const dow = ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"].indexOf(parts.weekday);
  return { y: +parts.year, m: +parts.month, d: +parts.day, dow };
}

function overlaps(aStart: number, aEnd: number, bStart: number, bEnd: number): boolean {
  return aStart < bEnd && aEnd > bStart;
}

// Candidate slot starts within working hours, honoring duration, buffer
// against existing busy windows, and not in the past.
export function computeSlots(
  policy: BookingPolicy,
  busy: BusyWindow[],
  now: Date,
  daysAhead: number
): { startISO: string; endISO: string }[] {
  const slots: { startISO: string; endISO: string }[] = [];
  const dur = policy.durationMinutes * 60_000;
  const buf = policy.bufferMinutes * 60_000;
  const tz = policy.workingHours.timezone;
  const startDay = localYMD(now, tz);
  for (let dayOffset = 0; dayOffset < daysAhead; dayOffset++) {
    const dayUtc = zonedTimeToUtc(startDay.y, startDay.m, startDay.d + dayOffset, 0, 0, tz);
    const { y, m, d, dow } = localYMD(dayUtc, tz);
    if (!policy.workingHours.days.includes(dow)) continue;
    const windowStart = zonedTimeToUtc(y, m, d, policy.workingHours.startHour, 0, tz).getTime();
    const windowEnd = zonedTimeToUtc(y, m, d, policy.workingHours.endHour, 0, tz).getTime();
    for (let t = windowStart; t + dur <= windowEnd; t += dur) {
      if (t < now.getTime()) continue;
      const blocked = busy.some((b) =>
        overlaps(t - buf, t + dur + buf, Date.parse(b.start), Date.parse(b.end))
      );
      if (!blocked) slots.push({ startISO: new Date(t).toISOString(), endISO: new Date(t + dur).toISOString() });
    }
  }
  return slots;
}

export interface CommitBookingInput {
  tenantId: string;
  policy: BookingPolicy;
  conversationId: string | null;
  contactId: string;
  contactEmail: string;
  organizerSenderId: string;
  startISO: string;
  actor: string;
}

export type CommitBookingResult =
  | { ok: true; meeting: Meeting; synthetic: boolean }
  | { ok: false; error: string };

// Commits a booking: rechecks free/busy for the exact window immediately
// before creating the provider event, then persists the meeting. booked=true
// only on confirmed creation. With the mock adapter the meeting is marked
// synthetic: no real calendar event exists.
export async function commitBooking(
  adapter: CalendarAdapter,
  accessToken: string | null,
  input: CommitBookingInput
): Promise<CommitBookingResult> {
  const start = Date.parse(input.startISO);
  const end = start + input.policy.durationMinutes * 60_000;
  const buf = input.policy.bufferMinutes * 60_000;
  // Recheck conflicts at commit time, never trust an earlier slot list.
  const busy = await adapter.getFreeBusy({
    accessToken,
    windowStartISO: new Date(start - buf).toISOString(),
    windowEndISO: new Date(end + buf).toISOString(),
  });
  const conflict = busy.some((b) => overlaps(start - buf, end + buf, Date.parse(b.start), Date.parse(b.end)));
  if (conflict) {
    return { ok: false, error: "slot_conflict: the slot is no longer free at commit time" };
  }
  const created = await adapter.createEvent({
    accessToken,
    event: {
      summary: "Threadly meeting",
      startISO: new Date(start).toISOString(),
      endISO: new Date(end).toISOString(),
      timezone: input.policy.workingHours.timezone,
      attendees: [input.contactEmail],
    },
  });
  const now = new Date().toISOString();
  const synthetic = adapter.name === "mock";
  const meeting: Meeting = {
    tenantId: input.tenantId,
    meetingId: `mtg_${crypto.randomUUID()}`,
    conversationId: input.conversationId ?? null,
    providerEventId: created.providerEventId,
    organizerSenderId: input.organizerSenderId,
    attendees: [input.contactEmail],
    timezone: input.policy.workingHours.timezone,
    startsAt: new Date(start).toISOString(),
    durationMinutes: input.policy.durationMinutes,
    booked: true,
    attendeeAccepted: null,
    held: null,
    cancelledAt: null,
    ...(synthetic ? { synthetic: true } : {}),
    createdAt: now,
    createdBy: input.actor,
  };
  return { ok: true, meeting, synthetic };
}
