import { errorResponse, readJsonBody } from "@/lib/api-request";
import { getBookingOffer, selectSlot } from "@/lib/outbound/booking-flow";
import { resolveCalendarRuntime } from "@/lib/outbound/calendar-runtime";
import { hashBookingToken } from "@/lib/outbound/booking-flow";
import { RtdbAuditStore } from "@/lib/outbound/rtdb-audit-store";
import { RtdbBookingStore } from "@/lib/outbound/rtdb-booking-store";
import { RtdbConsentStore } from "@/lib/outbound/rtdb-consent-store";
import { RtdbContactStore } from "@/lib/outbound/rtdb-contact-store";
import { RtdbConversationStore } from "@/lib/outbound/rtdb-conversation-store";
import { RtdbSenderStore } from "@/lib/outbound/rtdb-sender-store";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const NO_STORE = { "Cache-Control": "no-store" } as const;

function enabled(): boolean {
  if (process.env.OUTBOUND_ENABLED !== "true") return false;
  return typeof process.env.OUTBOUND_DATA_ROOT === "string" && process.env.OUTBOUND_DATA_ROOT.length > 0;
}

function stores() {
  return {
    policies: new RtdbBookingStore(),
    links: new RtdbBookingStore(),
    conversations: new RtdbConversationStore(),
    contacts: new RtdbContactStore(),
    senders: new RtdbSenderStore(),
  };
}

async function calendarForToken(token: string) {
  const link = await new RtdbBookingStore().getLinkByTokenHash(hashBookingToken(token));
  const sender = link ? await new RtdbSenderStore().getSender(link.tenantId, link.organizerSenderId) : null;
  return resolveCalendarRuntime(new RtdbConsentStore(), sender);
}

// Public recipient-facing booking endpoint. No workspace auth: the link
// token is the capability, stored only as a hash. Slot commits recheck
// free/busy immediately before creating the calendar event.
export async function GET(request: Request, { params }: { params: Promise<{ token: string }> }) {
  try {
    if (!enabled()) {
      return Response.json({ error: "Not found." }, { status: 404, headers: NO_STORE });
    }
    const { token } = await params;
    const offer = await getBookingOffer(stores(), await calendarForToken(token), token, new Date());
    if (!offer.ok) return Response.json({ error: offer.error }, { status: offer.status, headers: NO_STORE });
    return Response.json(offer, { headers: NO_STORE });
  } catch (error) {
    return errorResponse(error, "outbound booking");
  }
}

export async function POST(request: Request, { params }: { params: Promise<{ token: string }> }) {
  try {
    if (!enabled()) {
      return Response.json({ error: "Not found." }, { status: 404, headers: NO_STORE });
    }
    const { token } = await params;
    const body = (await readJsonBody(request, 4 * 1024)) as Record<string, unknown>;
    const startISO = typeof body.startISO === "string" ? body.startISO : "";
    if (!startISO) return Response.json({ error: "startISO is required." }, { status: 400 });
    const result = await selectSlot(stores(), await calendarForToken(token), {
      token,
      startISO,
      actor: "recipient",
      now: new Date(),
      audit: new RtdbAuditStore(),
    });
    if (!result.ok) return Response.json({ error: result.error }, { status: result.status, headers: NO_STORE });
    return Response.json(
      {
        meetingId: result.meeting.meetingId,
        startsAt: result.meeting.startsAt,
        durationMinutes: result.meeting.durationMinutes,
        timezone: result.meeting.timezone,
        booked: true,
        ...(result.synthetic ? { synthetic: true, notice: "Confirmed by the mock calendar adapter: no real calendar event was created." } : {}),
      },
      { status: 201, headers: NO_STORE }
    );
  } catch (error) {
    return errorResponse(error, "outbound booking");
  }
}
