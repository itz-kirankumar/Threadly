// Shared plumbing for session-scoped outbound API routes.

import { auditEvent, type AuditEvent } from "./audit.ts";
import { RtdbAuditStore } from "./rtdb-audit-store.ts";

export const NO_STORE = { "Cache-Control": "no-store" } as const;

// Outbound is on for the production deployment, at the default data root
// ("outbound"), unless OUTBOUND_ENABLED=false turns it off. Anywhere else
// (preview deployments, tests, local runs) it stays off unless BOTH
// OUTBOUND_ENABLED=true AND an explicit OUTBOUND_DATA_ROOT are set, so a
// preview can never silently write into production tenant data.
export function outboundEnabled(): boolean {
  if (process.env.OUTBOUND_ENABLED === "false") return false;
  const root = process.env.OUTBOUND_DATA_ROOT;
  if (process.env.OUTBOUND_ENABLED === "true") return typeof root === "string" && root.length > 0;
  return process.env.VERCEL_ENV === "production" && (root === undefined || root.length > 0);
}

export async function recordAudit(
  tenantId: string,
  actor: string,
  action: string,
  target: string,
  outcome: AuditEvent["outcome"],
  detail: string | null = null
): Promise<void> {
  await new RtdbAuditStore().append(auditEvent({ tenantId, actor, action, target, outcome, detail }));
}

// RFC 4180 cell encoding plus spreadsheet formula neutralisation: exported
// prospect data is untrusted input, so a cell that a spreadsheet would
// evaluate as a formula is prefixed with an apostrophe.
export function csvCell(value: string | number | undefined | null): string {
  let v = value === undefined || value === null ? "" : String(value);
  if (/^[=+\-@\t\r]/.test(v)) v = `'${v}`;
  return /[",\n\r]/.test(v) ? `"${v.replace(/"/g, '""')}"` : v;
}
