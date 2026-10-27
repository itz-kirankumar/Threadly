// Calendar provider adapters. Same activation contract as mail: real
// adapters are unreachable without an active sender whose consent trace
// includes calendar scopes AND OUTBOUND_PROVIDERS_LIVE=true. The mock
// adapter confirms nothing real; its events are synthetic.

import type { FetchImpl } from "./types.ts";

export interface BusyWindow {
  start: string; // ISO
  end: string; // ISO
}

export interface CalendarEventInput {
  summary: string;
  startISO: string;
  endISO: string;
  timezone: string;
  attendees: string[];
}

export interface CalendarAdapter {
  readonly name: string;
  getFreeBusy(input: { accessToken: string | null; windowStartISO: string; windowEndISO: string }): Promise<BusyWindow[]>;
  createEvent(input: { accessToken: string | null; event: CalendarEventInput }): Promise<{ providerEventId: string }>;
  cancelEvent(input: { accessToken: string | null; providerEventId: string }): Promise<void>;
}

// No external calendar: configurable busy windows, locally minted event ids.
export class MockCalendarAdapter implements CalendarAdapter {
  readonly name = "mock";
  private busy: BusyWindow[];

  constructor(busy: BusyWindow[] = []) {
    this.busy = busy;
  }

  async getFreeBusy(input: { windowStartISO: string; windowEndISO: string }): Promise<BusyWindow[]> {
    return this.busy.filter(
      (b) => Date.parse(b.start) < Date.parse(input.windowEndISO) && Date.parse(b.end) > Date.parse(input.windowStartISO)
    );
  }

  async createEvent(): Promise<{ providerEventId: string }> {
    return { providerEventId: `mockcal_${crypto.randomUUID()}` };
  }

  async cancelEvent(): Promise<void> {}
}

// Google Calendar: freeBusy.query + events.insert. Real implementation,
// unreachable without calendar-scope consent + the live flag.
export class GoogleCalendarAdapter implements CalendarAdapter {
  readonly name = "google";
  private readonly fetchImpl: FetchImpl;

  constructor(fetchImpl: FetchImpl = (url, init) => fetch(url, init)) {
    this.fetchImpl = fetchImpl;
  }

  async getFreeBusy(input: { accessToken: string | null; windowStartISO: string; windowEndISO: string }): Promise<BusyWindow[]> {
    const res = await this.fetchImpl("https://www.googleapis.com/calendar/v3/freeBusy", {
      method: "POST",
      headers: { Authorization: `Bearer ${input.accessToken}`, "Content-Type": "application/json" },
      body: JSON.stringify({ timeMin: input.windowStartISO, timeMax: input.windowEndISO, items: [{ id: "primary" }] }),
      signal: AbortSignal.timeout(15000),
    });
    if (!res.ok) throw new Error(`google freeBusy failed: HTTP ${res.status}`);
    const data = (await res.json()) as { calendars?: { primary?: { busy?: { start: string; end: string }[] } } };
    return data.calendars?.primary?.busy ?? [];
  }

  async createEvent(input: { accessToken: string | null; event: CalendarEventInput }): Promise<{ providerEventId: string }> {
    const res = await this.fetchImpl("https://www.googleapis.com/calendar/v3/calendars/primary/events?sendUpdates=all", {
      method: "POST",
      headers: { Authorization: `Bearer ${input.accessToken}`, "Content-Type": "application/json" },
      body: JSON.stringify({
        summary: input.event.summary,
        start: { dateTime: input.event.startISO, timeZone: input.event.timezone },
        end: { dateTime: input.event.endISO, timeZone: input.event.timezone },
        attendees: input.event.attendees.map((email) => ({ email })),
      }),
      signal: AbortSignal.timeout(15000),
    });
    if (!res.ok) throw new Error(`google event insert failed: HTTP ${res.status}`);
    const data = (await res.json()) as { id?: string };
    if (!data.id) throw new Error("google event insert returned no id");
    return { providerEventId: data.id };
  }

  async cancelEvent(input: { accessToken: string | null; providerEventId: string }): Promise<void> {
    const res = await this.fetchImpl(
      `https://www.googleapis.com/calendar/v3/calendars/primary/events/${encodeURIComponent(input.providerEventId)}?sendUpdates=all`,
      { method: "DELETE", headers: { Authorization: `Bearer ${input.accessToken}` }, signal: AbortSignal.timeout(15000) }
    );
    if (!res.ok && res.status !== 404 && res.status !== 410) {
      throw new Error(`google event delete failed: HTTP ${res.status}`);
    }
  }
}

// Microsoft Graph: getSchedule + events POST.
export class MicrosoftCalendarAdapter implements CalendarAdapter {
  readonly name = "microsoft";
  private readonly fetchImpl: FetchImpl;

  constructor(fetchImpl: FetchImpl = (url, init) => fetch(url, init)) {
    this.fetchImpl = fetchImpl;
  }

  async getFreeBusy(input: { accessToken: string | null; windowStartISO: string; windowEndISO: string }): Promise<BusyWindow[]> {
    const res = await this.fetchImpl("https://graph.microsoft.com/v1.0/me/calendar/getSchedule", {
      method: "POST",
      headers: { Authorization: `Bearer ${input.accessToken}`, "Content-Type": "application/json" },
      body: JSON.stringify({
        schedules: ["me"],
        startTime: { dateTime: input.windowStartISO, timeZone: "UTC" },
        endTime: { dateTime: input.windowEndISO, timeZone: "UTC" },
        availabilityViewInterval: 30,
      }),
      signal: AbortSignal.timeout(15000),
    });
    if (!res.ok) throw new Error(`microsoft getSchedule failed: HTTP ${res.status}`);
    const data = (await res.json()) as { value?: { scheduleItems?: { start?: { dateTime: string }; end?: { dateTime: string }; status?: string }[] }[] };
    const items = data.value?.[0]?.scheduleItems ?? [];
    return items
      .filter((i) => i.status !== "free" && i.start && i.end)
      .map((i) => ({ start: new Date(i.start!.dateTime + "Z").toISOString(), end: new Date(i.end!.dateTime + "Z").toISOString() }));
  }

  async createEvent(input: { accessToken: string | null; event: CalendarEventInput }): Promise<{ providerEventId: string }> {
    const res = await this.fetchImpl("https://graph.microsoft.com/v1.0/me/events", {
      method: "POST",
      headers: { Authorization: `Bearer ${input.accessToken}`, "Content-Type": "application/json" },
      body: JSON.stringify({
        subject: input.event.summary,
        start: { dateTime: input.event.startISO, timeZone: input.event.timezone },
        end: { dateTime: input.event.endISO, timeZone: input.event.timezone },
        attendees: input.event.attendees.map((email) => ({ emailAddress: { address: email }, type: "required" })),
      }),
      signal: AbortSignal.timeout(15000),
    });
    if (!res.ok) throw new Error(`microsoft event insert failed: HTTP ${res.status}`);
    const data = (await res.json()) as { id?: string };
    if (!data.id) throw new Error("microsoft event insert returned no id");
    return { providerEventId: data.id };
  }

  async cancelEvent(input: { accessToken: string | null; providerEventId: string }): Promise<void> {
    const res = await this.fetchImpl(`https://graph.microsoft.com/v1.0/me/events/${encodeURIComponent(input.providerEventId)}`, {
      method: "DELETE",
      headers: { Authorization: `Bearer ${input.accessToken}` },
      signal: AbortSignal.timeout(15000),
    });
    if (!res.ok && res.status !== 404) throw new Error(`microsoft event delete failed: HTTP ${res.status}`);
  }
}
