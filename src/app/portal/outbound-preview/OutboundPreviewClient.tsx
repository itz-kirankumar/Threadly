"use client";

import { useCallback } from "react";
import OutboundPanel from "@/components/outbound/OutboundPanel";

// Synthetic fixtures for the demo preview. Every value is invented mock
// data (".example" domains, fake ids) and labeled as such on the page.
const mock = {
  campaigns: { campaigns: [{ campaignId: "camp_demo1", version: 1, expiresAt: "2026-12-31T00:00:00Z", templates: [{ step: 1, subject: "Quick question, {{first_name}}", body: "Hi {{first_name}}, ..." }], followUpCount: 2, dailyCapPerSender: 20 }] },
  senders: { senders: [{ senderId: "snd_demo1", email: "rep@demo.example", provider: "gmail", status: "pending_consent" }] },
  conversations: {
    conversations: [{ conversationId: "cv_demo1", contactId: "ct_demo1", humanReplySeenAt: "2026-10-27T10:00:00Z", classification: "interested", classifiedBy: "auto" }],
    meetings: [{ meetingId: "mtg_demo1", startsAt: "2026-10-30T10:00:00Z", timezone: "Asia/Kolkata", booked: true, attendeeAccepted: null, held: null, synthetic: true }],
  },
  usage: { totalCostMinorUnits: 0, costComplete: false, unpricedEvents: 1, events: [{ usageId: "use_demo1", kind: "draft_render", units: 1, costMinorUnits: null, currency: null, synthetic: true, createdAt: "2026-10-27T10:00:00Z" }] },
  icp: {
    current: { icpVersionId: "icp_demo1", version: 2, status: "confirmed", roles: ["sales", "growth"], regions: ["IN"], employeeBands: ["51-200"], sectors: ["saas"], exclusions: ["competitor.example"], approvedClaims: ["Cuts prospecting time"], confirmedBy: "demo-user", source: { kind: "manual" } },
    versions: [
      { icpVersionId: "icp_demo1", version: 2, status: "confirmed", roles: ["sales", "growth"], regions: ["IN"], employeeBands: ["51-200"], sectors: ["saas"], exclusions: ["competitor.example"], approvedClaims: ["Cuts prospecting time"], confirmedBy: "demo-user", source: { kind: "manual" } },
      { icpVersionId: "icp_demo0", version: 1, status: "superseded", roles: ["sales"], regions: [], employeeBands: [], sectors: [], exclusions: [], approvedClaims: [], confirmedBy: "demo-user", source: { kind: "manual" } },
    ],
  },
  sources: { sources: [{ sourceId: "ls_demo1", sourceName: "acmedata", licensePermitsUse: true, termsUrl: "https://acme.example/terms", revokedAt: null }] },
  killswitches: { switches: [{ switchId: "ks_demo1", scope: "campaign", target: "camp_demo1", reason: "Demo pause reason visible here", active: true }] },
  preflight: { domains: [{ domain: "demo.example", state: "pass", spf: "pass", dkim: "pass", dmarc: "pass", checkedAt: "2026-10-27T09:00:00Z", failedChecks: [] }] },
  "response-policies": { active: { policyId: "rp_demo1", version: 1, status: "active", rules: [{ intent: "interested", category: "scheduling", templateId: "tmpl_book" }] }, policies: [] },
  "fit-scores": {
    scores: [{
      scoreId: "fs_demo1", contactId: "ct_demo1", score: 0.75, scoreVersion: "f04.v1",
      coverage: { known: 3, total: 4 }, computedAt: "2026-10-27T09:30:00Z", targetSource: { kind: "icp", icpVersionId: "icp_demo1" },
      reasons: [
        { criterion: "role", state: "matched", detail: 'title "Head of Sales" matches target; evidence acmedata observed 2026-10-01 (fact)' },
        { criterion: "region", state: "matched", detail: 'region "IN" matches target; evidence csv_import observed 2026-10-01 (fact)' },
        { criterion: "size", state: "matched", detail: 'employeeBand "51-200" matches target; evidence csv_import observed 2026-10-01 (fact)' },
        { criterion: "sector", state: "unknown", detail: "no dated evidence for sector; treated as unknown, not zero" },
      ],
    }],
  },
};

export default function OutboundPreviewClient() {
  const authedFetch = useCallback(async (path: string) => {
    const key = path.replace("/api/outbound/", "").split("?")[0] as keyof typeof mock;
    if (key in mock) return mock[key];
    if (key === "campaigns") return mock.campaigns;
    return new Proxy({}, { get: () => [] });
  }, []);
  return <OutboundPanel authedFetch={authedFetch} />;
}
