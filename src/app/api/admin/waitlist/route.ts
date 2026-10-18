import { NextResponse } from "next/server";
import { listWaitlistRequests, reviewWaitlistRequest, type WaitlistStatus } from "@/lib/db";
import { requireAdmin } from "@/lib/admin-auth";
import { errorResponse, readJsonBody } from "@/lib/api-request";
import { sendBetaEmail } from "@/lib/resend";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET(request: Request) {
  try {
    const admin = await requireAdmin(request);
    const applications = await listWaitlistRequests(admin.idToken);
    return NextResponse.json({ applications }, { headers: { "Cache-Control": "no-store" } });
  } catch (error) {
    return errorResponse(error, "Admin waitlist list");
  }
}

export async function PATCH(request: Request) {
  try {
    const admin = await requireAdmin(request);
    const parsed = await readJsonBody(request, 4 * 1024);
    if (!parsed || typeof parsed !== "object" || Array.isArray(parsed)) {
      return NextResponse.json({ error: "Choose an application and status." }, { status: 400 });
    }
    const { id, status } = parsed as Record<string, unknown>;
    if ((typeof id !== "string" && typeof id !== "number") || !["approved", "rejected", "pending"].includes(String(status))) {
      return NextResponse.json({ error: "Choose a valid application and status." }, { status: 400 });
    }
    const application = (await listWaitlistRequests(admin.idToken)).find(item => String(item.id) === String(id));
    if (!application) return NextResponse.json({ error: "That application could not be found." }, { status: 404 });
    const shouldSendApproval = status === "approved" && application.status !== "approved";
    const updated = await reviewWaitlistRequest(String(id), status as WaitlistStatus, admin.email, admin.idToken);
    if (!updated) return NextResponse.json({ error: "That application could not be found." }, { status: 404 });
    let emailSent: boolean | undefined;
    if (shouldSendApproval && application.email) {
      try {
        await sendBetaEmail({ to: application.email, name: application.fullName, kind: "approved" });
        emailSent = true;
      } catch (error) {
        emailSent = false;
        console.error("Beta approval email failed", error instanceof Error ? error.message : "Unknown Resend error");
      }
    }
    return NextResponse.json({ success: true, emailSent });
  } catch (error) {
    return errorResponse(error, "Admin waitlist review");
  }
}
