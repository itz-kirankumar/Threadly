import { errorResponse, readJsonBody } from "@/lib/api-request";
import { resolveWorkspaceAccess } from "@/lib/geo/team";
import { cancelMeeting, createBookingLink } from "@/lib/outbound/booking-flow";
import { resolveCalendarRuntime } from "@/lib/outbound/calendar-runtime";
import { RtdbBookingStore } from "@/lib/outbound/rtdb-booking-store";
import { RtdbConsentStore } from "@/lib/outbound/rtdb-consent-store";
import { RtdbContactStore } from "@/lib/outbound/rtdb-contact-store";
import { RtdbConversationStore } from "@/lib/outbound/rtdb-conversation-store";
import { RtdbSenderStore } from "@/lib/outbound/rtdb-sender-store";
import type { BookingPolicy } from "@/lib/outbound/types";
import { auditEvent } from "@/lib/outbound/audit";
import { RtdbAuditStore } from "@/lib/outbound/rtdb-audit-store";

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

// Booking policies and booking links. Link creation and policy management
// are admin actions; the recipient-facing slot flow is the public booking
// route. Direct calendar booking (PRD F18) stays off unless the policy sets
// directBooking and the sender has calendar-scope consent.

async function audit(tenantId: string, actor: string, action: string, target: string, outcome: "success" | "denied" | "error", detail: string | null = null): Promise<void> {
  await new RtdbAuditStore().append(auditEvent({ tenantId, actor, action, target, outcome, detail }));
}

export async function POST(request: Request) {
  try {
    if (!enabled()) {
      return Response.json({ error: "Outbound is not enabled on this deployment." }, { status: 404, headers: NO_STORE });
    }
    const access = await resolveWorkspaceAccess(request, "manageTeam");
    if (access.role !== "owner" && access.role !== "admin") {
      return Response.json({ error: "Only workspace admins can manage meetings." }, { status: 403, headers: NO_STORE });
    }
    const body = (await readJsonBody(request, 16 * 1024)) as Record<string, unknown>;
    const action = typeof body.action === "string" ? body.action : "";
    const bookingStore = new RtdbBookingStore();

    if (action === "save-policy") {
      const hostPool = Array.isArray(body.hostPool) ? body.hostPool.filter((s): s is string => typeof s === "string") : [];
      if (!hostPool.length) return Response.json({ error: "hostPool must name at least one senderId." }, { status: 400 });
      const now = new Date().toISOString();
      const policy: BookingPolicy = {
        tenantId: access.workspaceUid,
        policyId: typeof body.policyId === "string" && body.policyId ? body.policyId : `bpo_${crypto.randomUUID()}`,
        hostPool,
        durationMinutes: typeof body.durationMinutes === "number" && body.durationMinutes >= 5 && body.durationMinutes <= 480 ? body.durationMinutes : 30,
        bufferMinutes: typeof body.bufferMinutes === "number" && body.bufferMinutes >= 0 && body.bufferMinutes <= 120 ? body.bufferMinutes : 10,
        workingHours: {
          timezone: typeof body.timezone === "string" ? body.timezone : "UTC",
          days: Array.isArray(body.days) ? body.days.filter((d): d is number => typeof d === "number" && d >= 0 && d <= 6) : [1, 2, 3, 4, 5],
          startHour: typeof body.startHour === "number" ? body.startHour : 9,
          endHour: typeof body.endHour === "number" ? body.endHour : 17,
        },
        directBooking: body.directBooking === true,
        createdAt: now,
        createdBy: access.identity.uid,
      };
      if (policy.workingHours.startHour >= policy.workingHours.endHour) {
        return Response.json({ error: "startHour must be before endHour." }, { status: 400 });
      }
      await bookingStore.savePolicy(policy);
      await audit(access.workspaceUid, access.identity.uid, "booking_policy.saved", `policy:${policy.policyId}`, "success");
      return Response.json({ policy }, { status: 200, headers: NO_STORE });
    }

    if (action === "create-booking-link") {
      const input = {
        tenantId: access.workspaceUid,
        conversationId: typeof body.conversationId === "string" ? body.conversationId : null,
        contactId: typeof body.contactId === "string" ? body.contactId : "",
        organizerSenderId: typeof body.organizerSenderId === "string" ? body.organizerSenderId : "",
        policyId: typeof body.policyId === "string" ? body.policyId : "",
        actor: access.identity.uid,
      };
      if (!input.contactId || !input.organizerSenderId || !input.policyId) {
        return Response.json({ error: "contactId, organizerSenderId and policyId are required." }, { status: 400 });
      }
      const result = await createBookingLink(stores(), input);
      if (!result.ok) {
        await audit(access.workspaceUid, access.identity.uid, "booking_link.created", `contact:${input.contactId}`, "denied", result.error);
        return Response.json({ error: result.error }, { status: result.status, headers: NO_STORE });
      }
      await audit(access.workspaceUid, access.identity.uid, "booking_link.created", `booking_link:${result.bookingLinkId}`, "success", `contact=${input.contactId} organizer=${input.organizerSenderId}`);
      const url = new URL(request.url);
      return Response.json(
        { bookingLinkId: result.bookingLinkId, expiresAt: result.expiresAt, bookingUrl: `${url.origin}/api/outbound/booking/${result.token}` },
        { status: 201, headers: NO_STORE }
      );
    }

    if (action === "cancel-meeting") {
      const meetingId = typeof body.meetingId === "string" ? body.meetingId : "";
      if (!meetingId) return Response.json({ error: "meetingId is required." }, { status: 400 });
      const senderStore = new RtdbSenderStore();
      const meeting = await new RtdbConversationStore().getMeeting(access.workspaceUid, meetingId);
      const sender = meeting ? await senderStore.getSender(access.workspaceUid, meeting.organizerSenderId) : null;
      const calendar = await resolveCalendarRuntime(new RtdbConsentStore(), sender);
      const result = await cancelMeeting(stores(), calendar, { tenantId: access.workspaceUid, meetingId, actor: access.identity.uid });
      if (!result.ok) {
        await audit(access.workspaceUid, access.identity.uid, "meeting.cancelled", `meeting:${meetingId}`, "denied", result.error);
        return Response.json({ error: result.error }, { status: result.status, headers: NO_STORE });
      }
      await audit(access.workspaceUid, access.identity.uid, "meeting.cancelled", `meeting:${meetingId}`, "success");
      return Response.json({ meetingId, cancelled: true }, { status: 200, headers: NO_STORE });
    }

    return Response.json({ error: "Unknown action." }, { status: 400 });
  } catch (error) {
    return errorResponse(error, "outbound meetings");
  }
}

export async function GET(request: Request) {
  try {
    if (!enabled()) {
      return Response.json({ error: "Outbound is not enabled on this deployment." }, { status: 404, headers: NO_STORE });
    }
    const access = await resolveWorkspaceAccess(request, "view");
    const policies = await new RtdbBookingStore().listPolicies(access.workspaceUid);
    return Response.json({ policies }, { headers: NO_STORE });
  } catch (error) {
    return errorResponse(error, "outbound meetings");
  }
}
