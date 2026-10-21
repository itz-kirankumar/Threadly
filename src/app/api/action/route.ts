import {
  acceptTeamInvite,
  approveDraft,
  cancelSchedule,
  createCustomWorkflow,
  deleteWorkflow,
  duplicateDraft,
  executeWorkflow,
  generateDrafts,
  generateOutreachEmail,
  getOutreachEmailForDelivery,
  getState,
  inviteTeamMember,
  markPublished,
  moveLead,
  qualifyLead,
  recordOutreachSent,
  removeTeamMember,
  revokeTeamInvite,
  saveDraft,
  saveLead,
  saveOutreachEmail,
  scheduleDraft,
  scheduleLeadMeeting,
  toggleWorkflow,
  updateContext,
  updateLeadEmail,
  updateMemberAvailability,
  updateMemberProfile,
  updateOpportunity,
  updateTeamRole,
} from "@/lib/portal-data";
import { withWorkspace } from "@/lib/portal-db";
import { requireApprovedIdentity } from "@/lib/admin-auth";
import { sendFounderOutreachEmail } from "@/lib/mailer";
import { errorResponse, readJsonBody } from "@/lib/api-request";
import { checkRateLimit, rateLimitUnavailable, tooManyRequests } from "@/lib/rate-limit";
import {
  addGeoQuery,
  advanceSequence,
  createCampaign,
  createSegment,
  createSequence,
  enrollLeadsInSequence,
  optimizeCampaign,
  recordAdSpend,
  refreshLeadScores,
  refreshSegments,
  removeContentSlot,
  scanGeo,
  suggestContentSlots,
  toggleCampaign,
  toggleSequence,
  updateContentSlot,
  type Campaign,
  type CampaignChannel,
  type ContentSlot,
  type GeoQuery,
  type SegmentRule,
  type Sequence,
} from "@/lib/threadly-engine";

export const runtime = "nodejs";

function text(body: Record<string, unknown>, key: string, max = 8000, optional = false) {
  const value = body[key];
  if (optional && value === undefined) return undefined;
  if (typeof value !== "string" || value.length > max) throw new Error(`Enter a valid ${key}.`);
  return value.trim();
}

function companyContext(value: unknown): Record<string, string> {
  const allowed = new Set([
    "website", "description", "industry", "customer", "icp", "titles",
    "painPoints", "competitors", "voice", "objective", "bookingUrl", "outreachSearchPhrases",
  ]);
  if (!value || typeof value !== "object" || Array.isArray(value)) throw new Error("Enter valid company context.");
  const context = value as Record<string, unknown>;
  if (Object.entries(context).some(([key, item]) => !allowed.has(key) || typeof item !== "string" || item.length > 3000)) {
    throw new Error("Company context contains an invalid or oversized field.");
  }
  return context as Record<string, string>;
}

export async function POST(request: Request) {
  try {
    const user = await requireApprovedIdentity(request);
    const parsedBody = await readJsonBody(request);
    if (!parsedBody || typeof parsedBody !== "object" || Array.isArray(parsedBody) || typeof (parsedBody as { action?: unknown }).action !== "string") {
      return Response.json({ error: "Choose a valid workspace action." }, { status: 400 });
    }
    const body = parsedBody as Record<string, unknown>;
    const action = body.action as string;

    const costlyActions: Record<string, { limit: number; windowSeconds: number }> = {
      generate: { limit: 20, windowSeconds: 60 * 60 },
      qualifyLead: { limit: 30, windowSeconds: 60 * 60 },
      outreachGenerate: { limit: 30, windowSeconds: 60 * 60 },
      outreachSend: { limit: 30, windowSeconds: 60 * 60 },
      campaignOptimize: { limit: 60, windowSeconds: 60 * 60 },
      sequenceAdvance: { limit: 120, windowSeconds: 60 * 60 },
      geoScan: { limit: 60, windowSeconds: 60 * 60 },
      scoreRefresh: { limit: 60, windowSeconds: 60 * 60 },
    };
    const quota = costlyActions[action];
    if (quota && user.idToken !== "demo-token") {
      const limit = await checkRateLimit(`action:${action}:${user.uid}`, quota.limit, quota.windowSeconds, user);
      if (!limit) return rateLimitUnavailable();
      if (!limit.allowed) return tooManyRequests(limit.retryAfterSeconds);
    }
    const allowedPlatforms = new Set(["X", "Reddit", "Hacker News", "Indie Hackers", "GitHub", "Quora", "Web"]);
    if (["draft", "lead", "generate"].includes(action) && typeof body.platform === "string" && !allowedPlatforms.has(body.platform)) {
      return Response.json({ error: "Platform not supported." }, { status: 400 });
    }

    return await withWorkspace(user.uid, user.idToken, async () => {
      await getState(user.uid);
      if (action === "generate") {
        await generateDrafts(user.uid, text(body, "opportunityId", 160)!, (typeof body.platform === "string" ? body.platform : "X"), text(body, "tone", 60, true) || "Conversational");
        return Response.json({ ok: true });
      }

      switch (action) {
        case "outreachGenerate": {
          const email = await generateOutreachEmail(user.uid, text(body, "leadId", 160)!);
          return Response.json({ ok: true, email });
        }
        case "qualifyLead": {
          const qualification = await qualifyLead(user.uid, text(body, "leadId", 160)!);
          return Response.json({ ok: true, qualification });
        }
        case "outreachSave":
          await saveOutreachEmail(user.uid, text(body, "id", 160)!, text(body, "subject", 180)!, text(body, "body", 8000)!);
          break;
        case "outreachSend": {
          if (body.confirmSend !== true) return Response.json({ error: "Confirm the reviewed recipient and message before sending." }, { status: 400 });
          const email = await getOutreachEmailForDelivery(user.uid, text(body, "id", 160)!);
          const messageId = user.idToken === "demo-token"
            ? "demo-ses-msg-12345"
            : await sendFounderOutreachEmail({ to: email.recipient, subject: email.subject, body: email.body });
          await recordOutreachSent(user.uid, email.id, messageId);
          return Response.json({ ok: true });
        }
        case "context":
          await updateContext(
            user.uid,
            companyContext(body.context),
            text(body, "name", 160)!,
            text(body, "logoUrl", 500, true),
            text(body, "domain", 200, true),
            {
              legalName: text(body, "legalName", 160, true),
              website: text(body, "website", 300, true),
              industry: text(body, "industry", 160, true),
              stage: text(body, "stage", 80, true),
              country: text(body, "country", 80, true),
              region: text(body, "region", 100, true),
              defaultTimezone: text(body, "defaultTimezone", 80, true),
            }
          );
          break;
        case "opportunity":
          await updateOpportunity(user.uid, text(body, "id", 160)!, text(body, "status", 20)!);
          break;
        case "draft":
          await saveDraft(user.uid, { id: text(body, "id", 160, true), opportunityId: text(body, "opportunityId", 160, true), platform: "X", kind: text(body, "kind", 80)!, text: text(body, "text", 8000)! });
          break;
        case "approve":
          await approveDraft(user.uid, text(body, "id", 160)!);
          break;
        case "schedule":
          await scheduleDraft(user.uid, text(body, "id", 160)!, text(body, "date", 80)!);
          break;
        case "cancelSchedule":
          await cancelSchedule(user.uid, text(body, "id", 160)!);
          break;
        case "duplicate":
          await duplicateDraft(user.uid, text(body, "id", 160)!);
          break;
        case "published":
          await markPublished(user.uid, text(body, "id", 160)!);
          break;
        case "lead":
          await saveLead(user.uid, { opportunityId: text(body, "opportunityId", 160, true), name: text(body, "name", 160)!, email: text(body, "email", 254, true), company: text(body, "company", 160, true), role: text(body, "role", 120, true), platform: "X", pain: text(body, "pain", 5000, true), notes: text(body, "notes", 4000, true) }, user.email);
          break;
        case "leadEmail":
          await updateLeadEmail(user.uid, text(body, "id", 160)!, text(body, "email", 254)!);
          break;
        case "moveLead":
          await moveLead(user.uid, text(body, "id", 160)!, text(body, "stage", 40)!);
          break;
        case "scheduleLeadMeeting":
          await scheduleLeadMeeting(user.uid, text(body, "leadId", 160)!, {
            meetingStart: text(body, "meetingStart", 80)!,
            meetingEnd: text(body, "meetingEnd", 80)!,
            meetingUrl: text(body, "meetingUrl", 500, true),
            calendarEventUrl: text(body, "calendarEventUrl", 500, true),
            googleCalendarEventId: text(body, "googleCalendarEventId", 160, true),
          });
          break;

        // Workflow automation actions
        case "workflowToggle":
          await toggleWorkflow(user.uid, text(body, "id", 160)!, Boolean(body.enabled));
          break;
        case "workflowExecute": {
          const res = await executeWorkflow(user.uid, text(body, "id", 160)!);
          return Response.json(res);
        }
        case "workflowCreate": {
          const wfAction = (body.workflowAction as any) || (body.actionType as any) || (body.wfAction as any) || "priority_alert";
          const wf = await createCustomWorkflow(user.uid, {
            name: text(body, "name", 160)!,
            description: text(body, "description", 500, true) || "",
            trigger: (body.trigger as any) || "new_signal",
            action: wfAction,
            category: (body.category as any) || "outreach",
          });
          return Response.json({ ok: true, workflow: wf });
        }
        case "workflowDelete":
          await deleteWorkflow(user.uid, text(body, "id", 160)!);
          break;

        // Team collaboration actions
        case "teamInvite": {
          const inv = await inviteTeamMember(
            user.uid,
            { email: text(body, "email", 254)!, role: (body.role as any) || "Member" },
            user.email
          );
          return Response.json({ ok: true, invite: inv });
        }
        case "teamAcceptInvite": {
          const result = await acceptTeamInvite(
            text(body, "token", 160)!,
            {
              email: user.email,
              name: text(body, "name", 120, true) || user.email.split("@")[0],
              timezone: text(body, "timezone", 80, true) || "UTC",
            }
          );
          return Response.json(result);
        }
        case "teamRole":
          await updateTeamRole(user.uid, text(body, "memberId", 160)!, (body.role as any) || "Member");
          break;
        case "teamRemove":
          await removeTeamMember(user.uid, text(body, "memberId", 160)!);
          break;
        case "teamRevokeInvite":
          await revokeTeamInvite(user.uid, text(body, "inviteId", 160)!);
          break;
        case "teamAvailability":
          await updateMemberAvailability(user.uid, text(body, "memberId", 160)!, {
            workdayStart: text(body, "workdayStart", 10, true),
            workdayEnd: text(body, "workdayEnd", 10, true),
            workingDays: Array.isArray(body.workingDays) ? (body.workingDays as number[]) : undefined,
            availabilityStatus: text(body, "availabilityStatus", 40, true),
            timezone: text(body, "timezone", 80, true),
          });
          break;
        case "teamMemberProfile":
          await updateMemberProfile(user.uid, text(body, "memberId", 160)!, {
            title: text(body, "title", 100, true),
            country: text(body, "country", 80, true),
            region: text(body, "region", 100, true),
            name: text(body, "name", 120, true),
          });
          break;

        // --- Threadly growth engine: campaigns -----------------
        case "campaignCreate": {
          const { leads } = await getState(user.uid);
          const campaign = await createCampaign(user.uid, leads, {
            name: text(body, "name", 160)!,
            objective: text(body, "objective", 300, true),
            budget: Number(body.budget),
            targetRoas: body.targetRoas === undefined ? undefined : Number(body.targetRoas),
            channels: Array.isArray(body.channels) ? (body.channels as CampaignChannel[]) : undefined,
          });
          return Response.json({ ok: true, campaign });
        }
        case "campaignOptimize": {
          const { leads } = await getState(user.uid);
          const result = await optimizeCampaign(user.uid, leads, text(body, "campaignId", 160)!);
          return Response.json({ ok: true, ...result });
        }
        case "campaignToggle": {
          const { leads } = await getState(user.uid);
          await toggleCampaign(
            user.uid,
            leads,
            text(body, "campaignId", 160)!,
            (body.status as Campaign["status"]) || "active",
          );
          break;
        }
        case "campaignSpend": {
          const { leads } = await getState(user.uid);
          const record = await recordAdSpend(user.uid, leads, {
            campaignId: text(body, "campaignId", 160)!,
            channel: (body.channel as CampaignChannel) || "google_search",
            amount: Number(body.amount),
            revenue: body.revenue === undefined ? undefined : Number(body.revenue),
            conversions: body.conversions === undefined ? undefined : Number(body.conversions),
          });
          return Response.json({ ok: true, record });
        }

        // --- Threadly growth engine: sequences -----------------
        case "sequenceCreate": {
          const { leads } = await getState(user.uid);
          const sequence = await createSequence(user.uid, leads, {
            name: text(body, "name", 160)!,
            description: text(body, "description", 500, true),
          });
          return Response.json({ ok: true, sequence });
        }
        case "sequenceToggle": {
          const { leads } = await getState(user.uid);
          await toggleSequence(
            user.uid,
            leads,
            text(body, "sequenceId", 160)!,
            (body.status as Sequence["status"]) || "active",
          );
          break;
        }
        case "sequenceEnroll": {
          const { leads } = await getState(user.uid);
          const leadIds = Array.isArray(body.leadIds)
            ? (body.leadIds as unknown[]).filter((value): value is string => typeof value === "string")
            : [];
          const enrolled = await enrollLeadsInSequence(
            user.uid,
            leads,
            text(body, "sequenceId", 160)!,
            leadIds,
          );
          return Response.json({ ok: true, enrolled });
        }
        case "sequenceAdvance": {
          const { leads } = await getState(user.uid);
          const result = await advanceSequence(user.uid, leads, text(body, "sequenceId", 160)!);
          return Response.json({ ok: true, ...result });
        }

        // --- Threadly growth engine: segments ------------------
        case "segmentCreate": {
          const { leads } = await getState(user.uid);
          const rules = Array.isArray(body.rules) ? (body.rules as SegmentRule[]) : [];
          const segment = await createSegment(user.uid, leads, {
            name: text(body, "name", 160)!,
            description: text(body, "description", 300, true),
            rules,
            color: body.color as "orange" | "violet" | "ink" | undefined,
          });
          return Response.json({ ok: true, segment });
        }
        case "segmentRefresh": {
          const { leads } = await getState(user.uid);
          const segments = await refreshSegments(user.uid, leads);
          return Response.json({ ok: true, segments });
        }

        // --- Threadly growth engine: best-time slots -----------
        case "slotSuggest": {
          const { leads } = await getState(user.uid);
          const slot = await suggestContentSlots(user.uid, leads, {
            channel: body.channel as ContentSlot["channel"] | undefined,
            title: text(body, "title", 200, true),
            group: text(body, "group", 120, true),
          });
          return Response.json({ ok: true, slot });
        }
        case "slotUpdate": {
          const { leads } = await getState(user.uid);
          const slot = await updateContentSlot(user.uid, leads, text(body, "slotId", 160)!, {
            status: body.status as ContentSlot["status"] | undefined,
            title: text(body, "title", 200, true),
            scheduledFor: text(body, "scheduledFor", 80, true),
          });
          return Response.json({ ok: true, slot });
        }
        case "slotRemove": {
          const { leads } = await getState(user.uid);
          await removeContentSlot(user.uid, leads, text(body, "slotId", 160)!);
          break;
        }

        // --- Threadly growth engine: GEO visibility ------------
        case "geoScan": {
          const { leads } = await getState(user.uid);
          const geo = await scanGeo(user.uid, leads, text(body, "queryId", 160, true));
          return Response.json({ ok: true, geo });
        }
        case "geoAdd": {
          const { leads } = await getState(user.uid);
          const query = await addGeoQuery(user.uid, leads, {
            query: text(body, "query", 240)!,
            intent: body.intent as GeoQuery["intent"] | undefined,
            volume: body.volume === undefined ? undefined : Number(body.volume),
          });
          return Response.json({ ok: true, query });
        }

        // --- Threadly growth engine: lead scoring --------------
        case "scoreRefresh": {
          const { leads } = await getState(user.uid);
          const scores = await refreshLeadScores(user.uid, leads);
          return Response.json({ ok: true, scores });
        }

        default:
          return Response.json({ error: "Unknown action" }, { status: 400 });
      }
      return Response.json({ ok: true });
    });
  } catch (error) {
    return errorResponse(error, "Portal action", 400);
  }
}
