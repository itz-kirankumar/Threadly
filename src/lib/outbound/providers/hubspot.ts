// HubSpot CRM adapter (PRD F19: one proposed adapter plus CSV export).
// Real implementation, reachable only when OUTBOUND_HUBSPOT_TOKEN is set on
// the deployment (absent everywhere now). Field ownership: Threadly owns
// contact identity fields; external IDs are recorded in CRMMapping with a
// retry log. Duplicate-free handoff: upsert by email search before create.

import type { FetchImpl } from "./types.ts";

const BASE = "https://api.hubapi.com";

export interface CrmPushResult {
  externalId: string;
  created: boolean; // false = matched existing external record
}

export class HubSpotNotConfiguredError extends Error {
  constructor() {
    super("OUTBOUND_HUBSPOT_TOKEN is not configured on this deployment; CRM push unavailable");
  }
}

export class HubSpotAdapter {
  readonly provider = "hubspot" as const;
  private readonly token: string;
  private readonly fetchImpl: FetchImpl;

  constructor(fetchImpl?: FetchImpl) {
    const token = process.env.OUTBOUND_HUBSPOT_TOKEN;
    if (!token) throw new HubSpotNotConfiguredError();
    this.token = token;
    this.fetchImpl = fetchImpl ?? ((url, init) => fetch(url, init));
  }

  private headers() {
    return { Authorization: `Bearer ${this.token}`, "Content-Type": "application/json" };
  }

  async upsertContact(input: { email: string; fullName: string; title?: string; companyDomain: string }): Promise<CrmPushResult> {
    const search = await this.fetchImpl(`${BASE}/crm/v3/objects/contacts/search`, {
      method: "POST",
      headers: this.headers(),
      body: JSON.stringify({
        filterGroups: [{ filters: [{ propertyName: "email", operator: "EQ", value: input.email }] }],
        properties: ["email"],
        limit: 1,
      }),
      signal: AbortSignal.timeout(15000),
    });
    if (!search.ok) throw new Error(`hubspot contact search failed: HTTP ${search.status}`);
    const found = (await search.json()) as { results?: { id: string }[] };
    const [firstName, ...rest] = input.fullName.split(" ");
    const properties: Record<string, string> = {
      email: input.email,
      firstname: firstName ?? "",
      lastname: rest.join(" "),
      ...(input.title ? { jobtitle: input.title } : {}),
    };
    if (found.results && found.results.length > 0) {
      const id = found.results[0].id;
      const update = await this.fetchImpl(`${BASE}/crm/v3/objects/contacts/${id}`, {
        method: "PATCH",
        headers: this.headers(),
        body: JSON.stringify({ properties }),
        signal: AbortSignal.timeout(15000),
      });
      if (!update.ok) throw new Error(`hubspot contact update failed: HTTP ${update.status}`);
      return { externalId: id, created: false };
    }
    const create = await this.fetchImpl(`${BASE}/crm/v3/objects/contacts`, {
      method: "POST",
      headers: this.headers(),
      body: JSON.stringify({ properties }),
      signal: AbortSignal.timeout(15000),
    });
    if (!create.ok) throw new Error(`hubspot contact create failed: HTTP ${create.status}`);
    const data = (await create.json()) as { id?: string };
    if (!data.id) throw new Error("hubspot contact create returned no id");
    return { externalId: data.id, created: true };
  }

  async logActivity(input: { contactExternalId: string; subject: string; body: string; occurredAt: string }): Promise<{ externalId: string }> {
    const res = await this.fetchImpl(`${BASE}/crm/v3/objects/notes`, {
      method: "POST",
      headers: this.headers(),
      body: JSON.stringify({
        properties: { hs_note_body: input.body, hs_timestamp: input.occurredAt },
        associations: [{ to: { id: input.contactExternalId }, types: [{ associationCategory: "HUBSPOT_DEFINED", associationTypeId: 202 }] }],
      }),
      signal: AbortSignal.timeout(15000),
    });
    if (!res.ok) throw new Error(`hubspot note create failed: HTTP ${res.status}`);
    const data = (await res.json()) as { id?: string };
    if (!data.id) throw new Error("hubspot note create returned no id");
    return { externalId: data.id };
  }
}
