// Shared plumbing for session-scoped outbound API routes.

import { auditEvent, type AuditEvent } from "./audit.ts";
import { RtdbAuditStore } from "./rtdb-audit-store.ts";

export const NO_STORE = { "Cache-Control": "no-store" } as const;

// Every outbound route returns 404 unless BOTH OUTBOUND_ENABLED=true AND an
// explicit OUTBOUND_DATA_ROOT are set. There is no implicit default root, so
// a stray flag can never silently target production tenant data.
export function outboundEnabled(): boolean {
  if (process.env.OUTBOUND_ENABLED !== "true") return false;
  return typeof process.env.OUTBOUND_DATA_ROOT === "string" && process.env.OUTBOUND_DATA_ROOT.length > 0;
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
