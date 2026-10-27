// Threadly enterprise outbound: core domain records.
// Every tenant-owned record carries tenantId plus immutable creation metadata.
// Nothing in this module sends email, calls a provider, or mutates billing.

export type ISODate = string;

export interface CreationMeta {
  createdAt: ISODate;
  createdBy: string; // user id or system actor id
}

export type RoleId = "owner" | "admin" | "campaign_approver" | "operator" | "rep" | "analyst" | "auditor" | "billing";

export interface Tenant extends CreationMeta {
  tenantId: string;
  name: string;
  status: "active" | "suspended";
}

export interface User extends CreationMeta {
  tenantId: string;
  userId: string;
  email: string;
  displayName: string;
  roles: RoleId[];
  disabledAt: ISODate | null;
}

export type SenderProvider = "gmail" | "microsoft";

export interface Sender extends CreationMeta {
  tenantId: string;
  senderId: string;
  provider: SenderProvider;
  email: string;
  status: "pending_consent" | "active" | "paused" | "revoked" | "unhealthy";
  // OAuth tokens never live here. Only consent trace metadata.
  consentTraceId: string | null;
  scopes: string[];
  dailyCap: number;
  localTimezone: string; // IANA
}

export interface Account extends CreationMeta {
  tenantId: string;
  accountId: string;
  name: string;
  domain: string;
  employeeBand?: string;
  region?: string;
}

export type ContactVerificationState = "valid" | "invalid" | "unknown" | "stale" | "catch_all";

export interface Contact extends CreationMeta {
  tenantId: string;
  contactId: string;
  accountId: string;
  email: string; // normalized lowercase
  fullName: string;
  title?: string;
  verification: {
    state: ContactVerificationState;
    verifiedAt: ISODate | null;
    verifier: string | null;
  };
  employerChangedAt: ISODate | null; // set when employer/domain change invalidates the record
}

export interface SourceEvidence extends CreationMeta {
  tenantId: string;
  evidenceId: string;
  contactId?: string;
  accountId?: string;
  kind: "licensed_api" | "csv_import" | "public_site" | "signal";
  sourceName: string;
  acquiredAt: ISODate;
  observedAt: ISODate; // freshness
  inference: string; // what we infer, kept separate from fact
  uncertainty: "fact" | "inferred" | "unknown";
  uri?: string;
}

export interface RightsRecord extends CreationMeta {
  tenantId: string;
  rightsId: string;
  contactId: string;
  sourceEvidenceId: string;
  intendedUse: "b2b_marketing";
  licensePermitsUse: boolean;
  subscriberClass: "corporate" | "individual" | "unknown";
  lawfulBasis: string | null;
  country: string | null;
}

export type SuppressionReason = "opt_out" | "hard_bounce" | "complaint" | "manual" | "legal";

export interface Suppression extends CreationMeta {
  tenantId: string;
  suppressionId: string;
  emailToken: string; // sha256 of normalized email, never raw email at rest in lists
  reason: SuppressionReason;
  source: string;
}

export type ReviewMode = "review" | "campaign";

// Immutable once approved. Any material change requires a new version.
export interface CampaignVersion extends CreationMeta {
  tenantId: string;
  campaignId: string;
  version: number;
  senderAllowlist: string[]; // senderIds
  audienceQueryVersion: string;
  exclusions: string[];
  templates: { step: number; subject: string; body: string }[];
  allowedPersonalization: string[]; // variable names with evidence backing
  followUpCount: number; // pilot default max 2
  countries: string[];
  sendWindows: { timezone: string; days: number[]; startHour: number; endHour: number }[];
  dailyCapPerSender: number; // pilot default 25
  costCeiling: { currency: string; amount: number };
  bookingPolicy: { directBooking: boolean; hostPool: string[] };
  expiresAt: ISODate;
}

export interface Approval extends CreationMeta {
  tenantId: string;
  approvalId: string;
  campaignId: string;
  campaignVersion: number;
  approverUserId: string;
  approverRole: RoleId;
  approvedAt: ISODate;
  revokedAt: ISODate | null;
  revokedBy: string | null;
}

export type EnrollmentStatus = "active" | "paused" | "completed" | "cancelled" | "replied" | "suppressed";

export interface Enrollment extends CreationMeta {
  tenantId: string;
  enrollmentId: string;
  campaignId: string;
  campaignVersion: number;
  contactId: string;
  exclusionGroup: string; // one active enrollment per exclusion group
  status: EnrollmentStatus;
  currentStep: number; // 0 = not started
}

export type MessageStatus =
  | "drafted"
  | "approved"
  | "scheduled"
  | "reserved"
  | "dispatching"
  | "provider_accepted"
  | "provider_rejected"
  | "provider_unknown"
  | "cancelled"
  | "bounced"
  | "delivered_if_reported";

export interface MessageIntent extends CreationMeta {
  tenantId: string;
  intentId: string;
  uniqueKey: string; // tenant + enrollment + sequence version + step
  enrollmentId: string;
  campaignId: string;
  campaignVersion: number;
  contactId: string;
  senderId: string;
  step: number;
  status: MessageStatus;
  statusUpdatedAt: ISODate;
  cancelReason: string | null;
  leaseOwner: string | null;
  leaseExpiresAt: ISODate | null;
  reconciledAt: ISODate | null; // set when a provider_unknown outcome is resolved
  // F10: variant key when this intent belongs to an experiment. Deterministic
  // per tenant+contact+experiment, so no contact ever crosses variants.
  experimentVariant?: string;
}

export interface DeliveryAttempt extends CreationMeta {
  tenantId: string;
  attemptId: string;
  intentId: string;
  dispatchedAt: ISODate;
  provider: SenderProvider;
  providerCorrelationId: string | null;
  outcome: "accepted" | "rejected" | "unknown";
  providerStatusCode: number | null;
  detail: string | null;
  // True when the outcome came from the mock adapter: no external send ever
  // happened. Synthetic attempts must be excluded from any real sent or
  // provider delivery counts.
  synthetic: boolean;
}

export type ConversationIntent =
  | "interested"
  | "not_now"
  | "negative"
  | "opt_out"
  | "wrong_person"
  | "out_of_office"
  | "uncertain";

export interface Conversation extends CreationMeta {
  tenantId: string;
  conversationId: string;
  contactId: string;
  enrollmentId: string | null;
  humanReplySeenAt: ISODate | null; // set before classification; stops follow-ups
  classification: ConversationIntent | null;
  classifiedBy: "auto" | "human" | null;
  ownerUserId: string | null;
}

export interface Meeting extends CreationMeta {
  tenantId: string;
  meetingId: string;
  conversationId: string | null;
  providerEventId: string | null;
  organizerSenderId: string;
  attendees: string[];
  timezone: string;
  startsAt: ISODate;
  durationMinutes: number;
  booked: boolean; // provider event creation confirmed only
  attendeeAccepted: boolean | null; // observed response, separate outcome
  held: boolean | null; // meeting actually occurred, separate outcome
  cancelledAt: ISODate | null;
  // True when the confirming provider was the mock calendar adapter: no real
  // calendar event exists. Never count toward real meeting metrics.
  synthetic?: boolean;
}

export interface BookingPolicy extends CreationMeta {
  tenantId: string;
  policyId: string;
  hostPool: string[]; // senderIds eligible to host
  durationMinutes: number;
  bufferMinutes: number; // gap required around existing events
  workingHours: { timezone: string; days: number[]; startHour: number; endHour: number }; // days: 0=Sun
  directBooking: boolean; // false = booking links only
}

// Public recipient-facing booking link. Only a sha256 token hash is stored.
export interface BookingLink extends CreationMeta {
  tenantId: string;
  bookingLinkId: string;
  tokenHash: string;
  conversationId: string | null;
  contactId: string;
  organizerSenderId: string;
  policyId: string;
  expiresAt: ISODate;
  usedAt: ISODate | null;
  meetingId: string | null;
}

export interface CRMMapping extends CreationMeta {
  tenantId: string;
  mappingId: string;
  provider: "hubspot";
  externalObjectType: string;
  externalId: string;
  internalRef: { kind: "contact" | "activity"; id: string };
  lastSyncAt: ISODate | null;
}


export interface ConsentTrace extends CreationMeta {
  tenantId: string;
  consentTraceId: string;
  senderId: string;
  provider: SenderProvider;
  scopes: string[];
  consentedAt: ISODate;
  consentorIdentity: string; // provider-verified mailbox identity
  revokedAt: ISODate | null;
}

// F10: stable experiment assignment and holdouts. Variants carry their own
// templates and must each be approved before activation.
export interface ExperimentVariant {
  key: string;
  templates: { step: number; subject: string; body: string }[];
}

export interface Experiment extends CreationMeta {
  tenantId: string;
  experimentId: string;
  campaignId: string;
  campaignVersion: number;
  variants: ExperimentVariant[];
  holdoutPercent: number; // 0-100; holdout contacts are never enrolled into sends
  status: "draft" | "active" | "ended";
  variantsApprovedBy: string | null; // approver identity; required before activation
}

export interface UsageEvent extends CreationMeta {
  tenantId: string;
  usageId: string;
  kind: "enrichment" | "verification" | "generation" | "send";
  units: number;
  idempotencyKey: string;
  costMinorUnits: number | null;
  currency: string | null;
  // Present and true only for mock-adapter events: excluded from real
  // spend/delivery accounting. Absent (never undefined) otherwise - RTDB
  // drops undefined values on write.
  synthetic?: boolean;
}
