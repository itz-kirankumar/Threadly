import { RequestError } from "@/lib/api-request";
import type { LeadSource, LeadStage } from "./types";

export const LEAD_STAGES: readonly LeadStage[] = ["new", "contacted", "in_sequence", "follow_up_due", "replied", "qualified", "won", "lost"];
const USER_SOURCES: readonly LeadSource[] = ["manual", "inbound"];

// Lead ids are used as database path segments, so only the generated shape
// is accepted.
export function parseLeadId(value: unknown): string {
  if (typeof value !== "string" || !/^lead-[A-Za-z0-9_-]{1,64}$/.test(value)) throw new RequestError("Lead not found.", 404);
  return value;
}

export function isLeadStage(value: unknown): value is LeadStage {
  return typeof value === "string" && (LEAD_STAGES as readonly string[]).includes(value);
}

export function parseStage(value: unknown): LeadStage {
  if (!isLeadStage(value)) throw new RequestError("Choose a valid stage.", 400);
  return value;
}

export function parseUserSource(value: unknown): LeadSource {
  if (value === undefined) return "manual";
  if (typeof value !== "string" || !(USER_SOURCES as readonly string[]).includes(value)) throw new RequestError("Choose a valid lead source.", 400);
  return value as LeadSource;
}

export function requiredText(value: unknown, label: string, max: number): string {
  if (typeof value !== "string" || !value.trim()) throw new RequestError(`Enter ${label}.`, 400);
  return optionalText(value, label, max) as string;
}

export function optionalText(value: unknown, label: string, max: number): string | undefined {
  if (value === undefined || value === null) return undefined;
  if (typeof value !== "string") throw new RequestError(`Enter ${label} as text.`, 400);
  const trimmed = value.trim();
  if (trimmed.length > max) throw new RequestError(`Keep ${label} to ${max} characters or fewer.`, 400);
  return trimmed || undefined;
}

export function parseEmail(value: unknown): string {
  if (value === undefined || value === null || value === "") return "";
  if (typeof value !== "string") throw new RequestError("Enter a valid email address.", 400);
  const email = value.trim().toLowerCase();
  if (email.length > 254 || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) throw new RequestError("Enter a valid email address.", 400);
  return email;
}

export function parseDomain(value: unknown): string {
  if (typeof value !== "string") throw new RequestError("Enter the company website domain.", 400);
  const domain = value.trim().toLowerCase().replace(/^https?:\/\//, "").replace(/^www\./, "").replace(/\/.*$/, "");
  if (!/^[a-z0-9.-]+\.[a-z]{2,}$/.test(domain) || domain.length > 253) throw new RequestError("Enter a valid domain, like example.com.", 400);
  return domain;
}

export function parseDealValue(value: unknown): number | undefined {
  if (value === undefined || value === null || value === "") return undefined;
  const n = typeof value === "number" ? value : Number(value);
  if (!Number.isFinite(n) || n < 0 || n > 1e12) throw new RequestError("Enter a deal value of zero or more.", 400);
  return Math.round(n * 100) / 100;
}

export function parseTags(value: unknown): string[] {
  if (value === undefined) return [];
  if (!Array.isArray(value)) throw new RequestError("Tags must be a list.", 400);
  return value
    .filter((t): t is string => typeof t === "string")
    .map((t) => t.trim().slice(0, 40))
    .filter(Boolean)
    .slice(0, 10);
}
