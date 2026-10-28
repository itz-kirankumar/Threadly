import {
  acceptTeamInvite,
  approveDraft,
  cancelSchedule,
  createCustomWorkflow,
  deleteWorkflow,
  duplicateDraft,
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
  storeDiscoveredOpportunities,
  toggleWorkflow,
  updateContext,
  updateLeadEmail,
  updateMemberAvailability,
  updateMemberProfile,
  updateOpportunity,
  updateTeamRole,
  saveCompany,
  saveContact,
  saveDeal,
  updateDealStage,
  saveActivity,
  type Deal,
} from "@/lib/portal-data";
import { withWorkspace } from "@/lib/portal-db";
import { requireApprovedIdentity } from "@/lib/admin-auth";
import { sendFounderOutreachEmail } from "@/lib/mailer";
import { errorResponse, readJsonBody } from "@/lib/api-request";
import { checkRateLimit, rateLimitUnavailable, tooManyRequests } from "@/lib/rate-limit";
import { auditPublicWebsite } from "@/lib/seo-audit";
import { analyzeOutreachWebsite } from "@/lib/outreach-website";
import { syncOnMapsImport } from "@/lib/insights-sync-engine";
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
      seoAudit: { limit: 15, windowSeconds: 60 * 60 },
      analyzeWebsite: { limit: 10, windowSeconds: 60 * 60 },
      scoreRefresh: { limit: 60, windowSeconds: 60 * 60 },
    };
    const quota = costlyActions[action];
    if (quota && user.idToken !== "demo-token") {
      const limit = await checkRateLimit(`action:${action}:${user.uid}`, quota.limit, quota.windowSeconds, user);
      if (!limit) return rateLimitUnavailable();
      if (!limit.allowed) return tooManyRequests(limit.retryAfterSeconds);
    }
    const allowedPlatforms = new Set(["X", "Reddit", "Hacker News", "Indie Hackers", "GitHub", "Quora", "Web", "Google Maps"]);
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
        case "analyzeWebsite": {
          const result = await analyzeOutreachWebsite(text(body, "websiteUrl", 2048)!);
          return Response.json({
            ok: true,
            analysis: {
              company: { name: result.companyName, description: result.description, targetAudience: result.customer },
              productSummary: result.description,
              icp: result.icp,
              discoveryKeywords: result.searchPhrases.split(/[,;\n]/).map((phrase) => phrase.trim()).filter(Boolean),
              source: result.extractor,
            },
          });
        }
        case "onboardCompany": {
          const name = text(body, "name", 160)!;
          const websiteInput = text(body, "website", 2048, true) || "";
          let website = "";
          let domain = "";
          if (websiteInput) {
            let parsed: URL;
            try { parsed = new URL(/^https?:\/\//i.test(websiteInput) ? websiteInput : `https://${websiteInput}`); }
            catch { throw new Error("Enter a valid company website URL."); }
            if (parsed.protocol !== "https:" || parsed.username || parsed.password) throw new Error("Use a public HTTPS company website URL.");
            parsed.hash = "";
            website = parsed.toString();
            domain = parsed.hostname.replace(/^www\./i, "");
          }
          const description = text(body, "description", 3000, true) || "";
          const customer = text(body, "customer", 1200, true) || "";
          const icp = text(body, "icp", 2000, true) || "";
          const keywords = Array.isArray(body.keywords)
            ? body.keywords.filter((value): value is string => typeof value === "string").map((value) => value.trim().slice(0, 120)).filter(Boolean).slice(0, 30)
            : [];
          const painPoints = Array.isArray(body.painPoints)
            ? body.painPoints.filter((value): value is string => typeof value === "string").map((value) => value.trim().slice(0, 300)).filter(Boolean).slice(0, 20)
            : [];
          const current = await getState(user.uid);
          const context = {
            ...current.workspace.context,
            ...(description ? { description } : {}),
            ...(customer ? { customer } : {}),
            ...(icp ? { icp } : {}),
            ...(painPoints.length ? { painPoints: painPoints.join("\n") } : {}),
            ...(keywords.length ? { outreachSearchPhrases: keywords.join(", ") } : {}),
          };
          await updateContext(user.uid, context, name, undefined, domain || undefined, {
            website: website || current.workspace.website || "",
          });
          return Response.json({ ok: true, companyName: name, website: website || current.workspace.website || "" });
        }
        case "seoAudit": {
          const report = await auditPublicWebsite(text(body, "url", 2048)!);
          return Response.json({ ok: true, audit: report });
        }
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
        case "scrapeOpportunitySave": {
          const oppId = text(body, "id", 160)!;
          await storeDiscoveredOpportunities(
            user.uid,
            [{
              id: oppId,
              platform: typeof body.platform === "string" ? body.platform : "Google Maps",
              community: text(body, "community", 120, true) || "Local Business",
              author: text(body, "author", 160, true) || "Business",
              title: text(body, "title", 250)!,
              body: text(body, "body", 2000, true) || "",
              url: text(body, "url", 500, true) || "",
              publishedAt: text(body, "publishedAt", 80, true) || new Date().toISOString(),
              relevanceScore: typeof body.relevanceScore === "number" ? body.relevanceScore : 90,
            }],
            "Google Maps Scraper",
            { autoOutreachThreshold: 60 }
          );
          return Response.json({ ok: true });
        }
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
        case "lead": {
          const leadPlatform = (typeof body.platform === "string" && body.platform) ? body.platform : "X";
          await saveLead(user.uid, {
            opportunityId: text(body, "opportunityId", 160, true),
            name: text(body, "name", 160)!,
            email: text(body, "email", 254, true),
            company: text(body, "company", 160, true),
            role: text(body, "role", 120, true),
            platform: leadPlatform,
            pain: text(body, "pain", 5000, true),
            notes: text(body, "notes", 4000, true),
          }, user.email);
          break;
        }
        case "importMapsLeads": {
          const rawPlaces = Array.isArray(body.places) ? (body.places as any[]) : [];
          let imported = 0;
          const leadIds: string[] = [];
          for (const p of rawPlaces) {
            if (!p || typeof p.title !== "string") continue;
            const companyName = p.title.trim();
            const contactEmail = Array.isArray(p.emails) && p.emails.length > 0 ? p.emails[0] : (typeof p.email === "string" ? p.email : undefined);
            const phoneStr = typeof p.phone === "string" ? p.phone : "";
            const websiteStr = typeof p.website === "string" ? p.website : "";
            const ratingStr = typeof p.rating === "number" ? `${p.rating}★ (${p.reviewCount || 0} reviews)` : "";

            const saved = await saveLead(user.uid, {
              opportunityId: p.id || null,
              name: p.ownerName || `${companyName} Owner`,
              email: contactEmail,
              company: companyName,
              role: p.category || "Business Owner",
              platform: "Google Maps",
              pain: `Local business listing: ${p.address || ""}. Rating: ${ratingStr}`,
              notes: `Scraped via Google Maps Scraper.\nCategory: ${p.category || ""}\nAddress: ${p.address || ""}\nPhone: ${phoneStr}\nWebsite: ${websiteStr}\nRating: ${ratingStr}\nMaps: ${p.mapsUrl || ""}`,
            }, user.email);
            if (saved?.id) leadIds.push(saved.id);
            imported++;
          }
          if (leadIds.length > 0 && rawPlaces.length > 0) {
            const firstPlace = rawPlaces[0] || {};
            await syncOnMapsImport(user.uid, firstPlace.category || "Local Business", firstPlace.city || firstPlace.location || "", leadIds).catch(() => undefined);
          }
          return Response.json({ ok: true, imported });
        }
        case "leadEmail":
          await updateLeadEmail(user.uid, text(body, "id", 160)!, text(body, "email", 254)!);
          break;
        case "moveLead":
          await moveLead(user.uid, text(body, "id", 160)!, text(body, "stage", 40)!);
          break;
        case "crmCompany":
          await saveCompany(user.uid, {
            id: text(body, "id", 160, true),
            name: text(body, "name", 200)!,
            domain: text(body, "domain", 240, true),
            industry: text(body, "industry", 160, true),
            status: (text(body, "status", 30, true) || "prospect") as "prospect" | "customer" | "inactive",
            owner: user.email,
            source: text(body, "source", 120, true),
          });
          break;
        case "crmContact":
          await saveContact(user.uid, {
            id: text(body, "id", 160, true),
            companyId: text(body, "companyId", 160, true),
            leadId: text(body, "leadId", 160, true),
            name: text(body, "name", 200)!,
            email: text(body, "email", 254, true),
            title: text(body, "title", 160, true),
            owner: user.email,
          });
          break;
        case "crmDeal":
          await saveDeal(user.uid, {
            id: text(body, "id", 160, true),
            companyId: text(body, "companyId", 160, true),
            contactId: text(body, "contactId", 160, true),
            name: text(body, "name", 200)!,
            value: typeof body.value === "number" ? body.value : Number(body.value || 0),
            currency: text(body, "currency", 6, true),
            stage: (text(body, "stage", 30, true) || "qualification") as Deal["stage"],
            probability: typeof body.probability === "number" ? body.probability : Number(body.probability || 20),
            expectedClose: text(body, "expectedClose", 40, true),
            owner: user.email,
          });
          break;
        case "crmDealStage":
          await updateDealStage(user.uid, text(body, "id", 160)!, text(body, "stage", 30)! as Deal["stage"]);
          break;
        case "crmActivity":
          await saveActivity(user.uid, {
            type: (text(body, "type", 20, true) || "note") as "note" | "task" | "meeting" | "email",
            subject: text(body, "subject", 240)!,
            body: text(body, "body", 4000, true),
            companyId: text(body, "companyId", 160, true),
            contactId: text(body, "contactId", 160, true),
            dealId: text(body, "dealId", 160, true),
            dueAt: text(body, "dueAt", 80, true),
            owner: user.email,
          });
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
          return Response.json({ error: "Automatic workflow execution is not connected yet. Run this step from its workspace page." }, { status: 409 });
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
