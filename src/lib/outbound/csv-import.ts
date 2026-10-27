// CSV import with mapping, preview and validation (PRD F02/F03). Every
// imported contact gets a SourceEvidence record (kind csv_import) and a
// RightsRecord. A commit without an explicit rights confirmation is blocked:
// the importer must declare that the source permits the intended marketing
// use. Repeated imports reconcile with existing tenant records (normalize +
// match on email, then domain+name) instead of re-enrolling duplicates.

import type { Account, Contact, RightsRecord, SourceEvidence } from "./types.ts";

export interface CsvMapping {
  email: string;
  fullName: string;
  title?: string;
  accountName: string;
  accountDomain: string;
}

export interface ImportRow {
  email: string;
  fullName: string;
  title?: string;
  accountName: string;
  accountDomain: string;
}

export function parseCsv(text: string): string[][] {
  const rows: string[][] = [];
  let row: string[] = [];
  let field = "";
  let inQuotes = false;
  for (let i = 0; i < text.length; i++) {
    const c = text[i];
    if (inQuotes) {
      if (c === '"') {
        if (text[i + 1] === '"') { field += '"'; i++; } else { inQuotes = false; }
      } else {
        field += c;
      }
    } else if (c === '"') {
      inQuotes = true;
    } else if (c === ",") {
      row.push(field); field = "";
    } else if (c === "\n" || c === "\r") {
      if (c === "\r" && text[i + 1] === "\n") i++;
      row.push(field); field = "";
      if (row.length > 1 || row[0] !== "") rows.push(row);
      row = [];
    } else {
      field += c;
    }
  }
  if (field !== "" || row.length > 0) { row.push(field); rows.push(row); }
  return rows;
}

export function normalizeEmail(email: string): string {
  return email.trim().toLowerCase();
}

export function normalizeDomain(domain: string): string {
  return domain.trim().toLowerCase().replace(/^https?:\/\//, "").replace(/\/.*$/, "").replace(/^www\./, "");
}

export function mapRows(rows: string[][], mapping: CsvMapping): { valid: ImportRow[]; invalid: { row: number; reason: string }[] } {
  if (!rows.length) return { valid: [], invalid: [{ row: 0, reason: "empty file" }] };
  const header = rows[0].map((h) => h.trim());
  const col = (name: string) => header.indexOf(name);
  const needed = [mapping.email, mapping.fullName, mapping.accountName, mapping.accountDomain];
  const missing = needed.filter((n) => col(n) === -1);
  if (missing.length) return { valid: [], invalid: [{ row: 0, reason: `missing columns: ${missing.join(", ")}` }] };
  const valid: ImportRow[] = [];
  const invalid: { row: number; reason: string }[] = [];
  const seen = new Set<string>();
  for (let i = 1; i < rows.length; i++) {
    const r = rows[i];
    const email = normalizeEmail(r[col(mapping.email)] ?? "");
    const fullName = (r[col(mapping.fullName)] ?? "").trim();
    const accountName = (r[col(mapping.accountName)] ?? "").trim();
    const accountDomain = normalizeDomain(r[col(mapping.accountDomain)] ?? "");
    if (!/^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(email)) { invalid.push({ row: i + 1, reason: "invalid email" }); continue; }
    if (!fullName) { invalid.push({ row: i + 1, reason: "missing name" }); continue; }
    if (!accountDomain) { invalid.push({ row: i + 1, reason: "missing account domain" }); continue; }
    if (seen.has(email)) { invalid.push({ row: i + 1, reason: "duplicate email within file" }); continue; }
    seen.add(email);
    valid.push({ email, fullName, title: mapping.title ? (r[col(mapping.title)] ?? "").trim() : undefined, accountName, accountDomain });
  }
  return { valid, invalid };
}

export interface ImportStores {
  accounts: {
    findByDomain(tenantId: string, domain: string): Promise<Account | null>;
    saveAccount(a: Account): Promise<void>;
  };
  contacts: {
    findByEmail(tenantId: string, email: string): Promise<Contact | null>;
    saveContact(c: Contact): Promise<void>;
  };
  evidence: { saveEvidence(e: SourceEvidence): Promise<void> };
  rights: { saveRights(r: RightsRecord): Promise<void> };
}

export interface CommitResult {
  created: number;
  reconciled: number; // matched existing tenant records, not re-enrolled
  accountsCreated: number;
  invalid: { row: number; reason: string }[];
  importId: string;
}

export async function commitImport(
  stores: ImportStores,
  input: {
    tenantId: string;
    rows: ImportRow[];
    invalid: { row: number; reason: string }[];
    sourceName: string;
    acquiredAt: string; // ISO, when the tenant acquired this file
    rightsConfirmed: boolean; // explicit declaration the source permits b2b marketing use
    subscriberClass: "corporate" | "individual" | "unknown";
    country: string | null;
    actor: string;
    now: Date;
  }
): Promise<CommitResult> {
  if (!input.rightsConfirmed) {
    throw new Error("unlicensed_source: rightsConfirmed is required; importing without a declared marketing-use right is blocked");
  }
  const nowISO = input.now.toISOString();
  const importId = `imp_${crypto.randomUUID()}`;
  let created = 0;
  let reconciled = 0;
  let accountsCreated = 0;
  for (const row of input.rows) {
    let account = await stores.accounts.findByDomain(input.tenantId, row.accountDomain);
    if (!account) {
      account = {
        tenantId: input.tenantId, accountId: `acc_${crypto.randomUUID()}`,
        name: row.accountName || row.accountDomain, domain: row.accountDomain,
        createdAt: nowISO, createdBy: input.actor,
      };
      await stores.accounts.saveAccount(account);
      accountsCreated++;
    }
    const evidence: SourceEvidence = {
      tenantId: input.tenantId,
      evidenceId: `ev_${crypto.randomUUID()}`,
      kind: "csv_import",
      sourceName: input.sourceName,
      acquiredAt: input.acquiredAt,
      observedAt: input.acquiredAt,
      inference: `imported in ${importId}`,
      uncertainty: "fact",
      createdAt: nowISO,
      createdBy: input.actor,
    };
    await stores.evidence.saveEvidence(evidence);
    const existing = await stores.contacts.findByEmail(input.tenantId, row.email);
    if (existing) {
      // Reconcile: refresh name/title against the same record, never re-enroll.
      await stores.contacts.saveContact({ ...existing, fullName: row.fullName, ...(row.title ? { title: row.title } : {}) });
      reconciled++;
    } else {
      const contact: Contact = {
        tenantId: input.tenantId,
        contactId: `ct_${crypto.randomUUID()}`,
        accountId: account.accountId,
        email: row.email,
        fullName: row.fullName,
        ...(row.title ? { title: row.title } : {}),
        verification: { state: "unknown", verifiedAt: null, verifier: null },
        employerChangedAt: null,
        createdAt: nowISO,
        createdBy: input.actor,
      };
      await stores.contacts.saveContact(contact);
      const rights: RightsRecord = {
        tenantId: input.tenantId,
        rightsId: `rr_${crypto.randomUUID()}`,
        contactId: contact.contactId,
        sourceEvidenceId: evidence.evidenceId,
        intendedUse: "b2b_marketing",
        licensePermitsUse: true,
        subscriberClass: input.subscriberClass,
        lawfulBasis: "declared_by_importer",
        country: input.country,
        createdAt: nowISO,
        createdBy: input.actor,
      };
      await stores.rights.saveRights(rights);
      created++;
    }
  }
  return { created, reconciled, accountsCreated, invalid: input.invalid, importId };
}
