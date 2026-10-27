// Fail-closed policy gates for outbound eligibility and dispatch.
// Pure functions: no I/O, no provider calls. Unknown always blocks.

import type {
  Approval,
  CampaignVersion,
  Contact,
  MessageIntent,
  RightsRecord,
  Sender,
} from "./types";
import { createHash } from "node:crypto";

export function normalizeEmail(email: string): string {
  return email.trim().toLowerCase();
}

export function suppressionTokenFor(tenantId: string, email: string): string {
  return createHash("sha256").update(`${tenantId}:${normalizeEmail(email)}`).digest("hex");
}

export interface Decision {
  allow: boolean;
  reasons: string[];
}

function deny(reasons: string[]): Decision {
  return { allow: false, reasons };
}

function allow(): Decision {
  return { allow: true, reasons: [] };
}

export const RE_VERIFY_WITHIN_DAYS = 30;

export interface EligibilityInput {
  contact: Contact | null;
  rights: RightsRecord | null;
  suppressed: boolean;
  now: Date;
}

// First-send eligibility fails closed: any missing or unknown input blocks.
export function evaluateFirstSendEligibility(input: EligibilityInput): Decision {
  const { contact, rights, suppressed, now } = input;
  if (!contact) return deny(["contact_missing"]);
  if (suppressed) return deny(["contact_suppressed"]);
  if (contact.employerChangedAt) return deny(["employer_changed_invalidates_record"]);

  const v = contact.verification;
  if (v.state === "invalid") return deny(["verification_invalid"]);
  if (v.state === "unknown") return deny(["verification_unknown"]);
  if (v.state === "catch_all") return deny(["verification_catch_all"]);
  if (v.state === "stale") return deny(["verification_stale"]);
  if (!v.verifiedAt) return deny(["verification_missing_timestamp"]);
  const ageMs = now.getTime() - Date.parse(v.verifiedAt);
  if (ageMs > RE_VERIFY_WITHIN_DAYS * 24 * 60 * 60 * 1000) return deny(["verification_older_than_30_days"]);

  if (!rights) return deny(["rights_record_missing"]);
  if (!rights.licensePermitsUse) return deny(["unlicensed_source_blocked"]);
  if (rights.subscriberClass !== "corporate") return deny(["subscriber_class_not_corporate"]);
  if (!rights.lawfulBasis) return deny(["lawful_basis_missing"]);
  if (!rights.country) return deny(["country_unknown"]);

  return allow();
}

export interface DispatchInput {
  intent: MessageIntent;
  campaign: CampaignVersion | null;
  approval: Approval | null;
  sender: Sender | null;
  contactSuppressed: boolean;
  enrollmentStatus: string;
  humanReplySeen: boolean;
  senderAcceptedToday: number; // provider-accepted sends by this sender today
  tenantCostToDate: number; // minor units
  now: Date;
}

// Dispatch recheck, run by the worker immediately before calling the adapter.
// Every gate is independent and fail-closed.
export function checkDispatch(input: DispatchInput): Decision {
  const reasons: string[] = [];
  const { intent, campaign, approval, sender, now } = input;

  if (!campaign) reasons.push("campaign_version_missing");
  if (!approval) reasons.push("approval_missing");
  if (approval && approval.revokedAt) reasons.push("approval_revoked");
  if (campaign && now.getTime() > Date.parse(campaign.expiresAt)) reasons.push("campaign_expired");
  if (approval && campaign && approval.campaignVersion !== campaign.version) reasons.push("approval_version_mismatch");

  if (!sender) reasons.push("sender_missing");
  if (sender && sender.status !== "active") reasons.push(`sender_not_active:${sender.status}`);
  if (campaign && sender && !campaign.senderAllowlist.includes(sender.senderId)) reasons.push("sender_not_in_allowlist");
  if (campaign && sender && input.senderAcceptedToday >= campaign.dailyCapPerSender) reasons.push("sender_daily_cap_reached");

  if (input.contactSuppressed) reasons.push("contact_suppressed");
  if (input.enrollmentStatus !== "active") reasons.push(`enrollment_not_active:${input.enrollmentStatus}`);
  if (input.humanReplySeen) reasons.push("human_reply_seen_stops_followups");

  if (campaign && input.tenantCostToDate >= campaign.costCeiling.amount) reasons.push("tenant_cost_ceiling_reached");

  if (campaign && campaign.sendWindows.length > 0) {
    const inWindow = campaign.sendWindows.some((w) => {
      const parts = new Intl.DateTimeFormat("en-US", {
        timeZone: w.timezone,
        hour: "numeric",
        hour12: false,
        weekday: "short",
      }).formatToParts(now);
      const hour = Number(parts.find((p) => p.type === "hour")?.value ?? "-1");
      const weekday = ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"].indexOf(
        parts.find((p) => p.type === "weekday")?.value ?? ""
      );
      return w.days.includes(weekday) && hour >= w.startHour && hour < w.endHour;
    });
    if (!inWindow) reasons.push("outside_send_window");
  }

  if (intent.status !== "reserved") reasons.push(`intent_not_reserved:${intent.status}`);

  return reasons.length ? deny(reasons) : allow();
}

// Fields whose change invalidates an existing approval (new version required).
const MATERIAL_FIELDS: (keyof CampaignVersion)[] = [
  "senderAllowlist",
  "audienceQueryVersion",
  "exclusions",
  "templates",
  "allowedPersonalization",
  "followUpCount",
  "countries",
  "sendWindows",
  "dailyCapPerSender",
  "costCeiling",
  "bookingPolicy",
  "expiresAt",
];

export function isMaterialChange(prev: CampaignVersion, next: CampaignVersion): boolean {
  if (prev.campaignId !== next.campaignId) return true;
  return MATERIAL_FIELDS.some((f) => JSON.stringify(prev[f]) !== JSON.stringify(next[f]));
}
