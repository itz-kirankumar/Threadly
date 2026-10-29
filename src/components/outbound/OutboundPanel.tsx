"use client";

import { useCallback, useEffect, useState } from "react";

type Campaign = {
  campaignId: string; version: number; expiresAt: string;
  templates: { step: number; subject: string; body: string }[];
  followUpCount: number; dailyCapPerSender: number;
};
type Approval = { approvalId: string; campaignVersion: number } | null;
type Enrollment = { enrollmentId: string; contactId: string; status: string; currentStep: number };
type Attempt = { attemptId: string; dispatchedAt: string; outcome: string; synthetic: boolean; detail: string | null };
type Intent = { intentId: string; contactId: string; step: number; status: string; attempts?: Attempt[] };
type PlanResult = { plannedCount: number; skipped: { contactId: string; reasons: string[] }[]; blocked: string[] };
type Sender = { senderId: string; email: string; provider: string; status: string };
type Draft = { draftId: string; intentId: string; step: number; subject: string; body: string; engine: string; renderedAt: string };
type DraftRunResult = { renderedCount: number; rendered: string[]; skipped: { intentId: string; reason: string }[]; usageRecorded: string[] };
type DispatchResult = { dispatchedCount: number; dispatched: { intentId: string; outcome: string }[]; deferred: { intentId: string; reasons: string[] }[]; skipped: { intentId: string; reason: string }[] };
type UsageEvent = { usageId: string; kind: string; units: number; costMinorUnits: number | null; currency: string | null; synthetic?: boolean; createdAt: string };
type UsageSummary = { totalCostMinorUnits: number; costComplete: boolean; unpricedEvents: number; events: UsageEvent[] };
type Conversation = { conversationId: string; contactId: string; humanReplySeenAt: string | null; classification: string | null; classifiedBy: string | null };
type Meeting = { meetingId: string; startsAt: string; timezone: string; booked: boolean; attendeeAccepted: boolean | null; held: boolean | null; synthetic?: boolean };
type Experiment = { experimentId: string; campaignId: string; status: string; holdoutPercent: number; variants: { key: string; templates: { step: number; subject: string; body: string }[] }[]; variantsApprovedBy: string | null };
type ImportPreview = { validCount: number; invalidCount: number; invalid: { row: number; reason: string }[]; sample: { email: string }[] };
type ImportCommit = { importId: string; created: number; reconciled: number; invalid: { row: number; reason: string }[] };
type ConsentStart = { senderId: string; consentUrl?: string; expiresAt?: string; notice?: string; error?: string; requiredEnvs?: string[]; consentFirst?: boolean; purpose?: "send" | "calendar" };
type BookingLinkResult = { bookingLinkId: string; expiresAt: string; bookingUrl: string };
type IcpVersion = { icpVersionId: string; version: number; status: string; roles: string[]; regions: string[]; employeeBands: string[]; sectors: string[]; exclusions: string[]; approvedClaims: string[]; confirmedBy: string | null; source: { kind: string } };
type LicensedSource = { sourceId: string; sourceName: string; licensePermitsUse: boolean; termsUrl: string | null; revokedAt: string | null };
type FitScore = { scoreId: string; contactId: string; score: number | null; scoreVersion: string; coverage: { known: number; total: number }; computedAt: string; targetSource?: { kind: string; icpVersionId?: string }; reasons: { criterion: string; state: string; detail: string }[] };
type KillSwitch = { switchId: string; scope: string; target: string; reason: string; active: boolean };
type Preflight = { domain: string; state: string; spf: string; dkim: string; dmarc: string; checkedAt: string; failedChecks: string[] };
type RespPolicy = { policyId: string; version: number; status: string; rules: { intent: string; category: string; templateId: string }[] };

export default function OutboundPanel({ authedFetch }: { authedFetch: (path: string, init?: RequestInit) => Promise<unknown> }) {
  const [campaigns, setCampaigns] = useState<Campaign[]>([]);
  const [selected, setSelected] = useState<string>("");
  const [approval, setApproval] = useState<Approval>(null);
  const [enrollments, setEnrollments] = useState<Enrollment[]>([]);
  const [intents, setIntents] = useState<Intent[]>([]);
  const [error, setError] = useState<string>("");
  const [busy, setBusy] = useState(false);
  const [planResult, setPlanResult] = useState<PlanResult | null>(null);
  const [draftResult, setDraftResult] = useState<DraftRunResult | null>(null);
  const [dispatchResult, setDispatchResult] = useState<DispatchResult | null>(null);
  const [usage, setUsage] = useState<UsageSummary | null>(null);
  const [drafts, setDrafts] = useState<Draft[]>([]);
  const [conversations, setConversations] = useState<Conversation[]>([]);
  const [meetings, setMeetings] = useState<Meeting[]>([]);
  const [senders, setSenders] = useState<Sender[]>([]);
  const [senderEmail, setSenderEmail] = useState("");
  const [form, setForm] = useState({ campaignId: "", subject: "", body: "", contactEmail: "", contactName: "" });
  const [consent, setConsent] = useState<ConsentStart | null>(null);
  const [experiments, setExperiments] = useState<Experiment[]>([]);
  const [expForm, setExpForm] = useState({ holdoutPercent: "10", variantKey: "b", subject: "", body: "" });
  const [importForm, setImportForm] = useState({ csv: "", sourceName: "", acquiredAt: "", country: "", subscriberClass: "corporate", rightsConfirmed: false });
  const [importPreview, setImportPreview] = useState<ImportPreview | null>(null);
  const [importResult, setImportResult] = useState<ImportCommit | null>(null);
  const [policyForm, setPolicyForm] = useState({ durationMinutes: "30", startHour: "9", endHour: "17", timezone: "Asia/Kolkata" });
  const [hostSenderId, setHostSenderId] = useState<string>("");
  const [auditNotice, setAuditNotice] = useState("");
  const [policyId, setPolicyId] = useState<string>("");
  const [bookingLink, setBookingLink] = useState<BookingLinkResult | null>(null);
  const [bookingContactId, setBookingContactId] = useState("");
  const [icp, setIcp] = useState<{ current: IcpVersion | null; versions: IcpVersion[] }>({ current: null, versions: [] });
  const [icpForm, setIcpForm] = useState({ roles: "", regions: "", employeeBands: "", sectors: "", exclusions: "", approvedClaims: "" });
  const [sources, setSources] = useState<LicensedSource[]>([]);
  const [sourceForm, setSourceForm] = useState({ sourceName: "", licensePermitsUse: false, termsUrl: "" });
  const [fitScores, setFitScores] = useState<FitScore[]>([]);
  const [fitContactId, setFitContactId] = useState("");
  const [verifyContactId, setVerifyContactId] = useState("");
  const [verifyResult, setVerifyResult] = useState<{ verification: { state: string }; detail: string } | null>(null);
  const [killSwitches, setKillSwitches] = useState<KillSwitch[]>([]);
  const [ksForm, setKsForm] = useState({ scope: "campaign", target: "", reason: "" });
  const [preflights, setPreflights] = useState<Preflight[]>([]);
  const [pfDomain, setPfDomain] = useState("");
  const [respPolicies, setRespPolicies] = useState<{ active: RespPolicy | null; policies: RespPolicy[] }>({ active: null, policies: [] });
  const [rpForm, setRpForm] = useState({ intent: "interested", category: "scheduling", templateId: "", templateText: "" });

  const refresh = useCallback(async () => {
    const data = (await authedFetch("/api/outbound/campaigns")) as { campaigns: Campaign[] };
    setCampaigns(data.campaigns);
    const snd = (await authedFetch("/api/outbound/senders")) as { senders: Sender[] };
    setSenders(snd.senders);
    const conv = (await authedFetch("/api/outbound/conversations")) as { conversations: Conversation[]; meetings: Meeting[] };
    setConversations(conv.conversations);
    setMeetings(conv.meetings);
    const usg = (await authedFetch("/api/outbound/usage")) as UsageSummary;
    setUsage(usg);
    authedFetch("/api/outbound/icp").then((x) => setIcp(x as { current: IcpVersion | null; versions: IcpVersion[] })).catch(() => setIcp({ current: null, versions: [] }));
    authedFetch("/api/outbound/sources").then((x) => setSources((x as { sources: LicensedSource[] }).sources)).catch(() => setSources([]));
    authedFetch("/api/outbound/killswitches").then((x) => setKillSwitches((x as { switches: KillSwitch[] }).switches)).catch(() => setKillSwitches([]));
    authedFetch("/api/outbound/preflight").then((x) => setPreflights((x as { domains: Preflight[] }).domains)).catch(() => setPreflights([]));
    authedFetch("/api/outbound/response-policies").then((x) => setRespPolicies(x as { active: RespPolicy | null; policies: RespPolicy[] })).catch(() => setRespPolicies({ active: null, policies: [] }));
    authedFetch("/api/outbound/fit-scores").then((x) => setFitScores((x as { scores: FitScore[] }).scores)).catch(() => setFitScores([]));
  }, [authedFetch]);

  const refreshDetail = useCallback(async (campaignId: string) => {
    const [detail, enr, ints, dr] = await Promise.all([
      authedFetch(`/api/outbound/campaigns?campaignId=${campaignId}`) as Promise<{ approval: Approval }>,
      authedFetch(`/api/outbound/enrollments?campaignId=${campaignId}`) as Promise<{ enrollments: Enrollment[] }>,
      authedFetch(`/api/outbound/intents?campaignId=${campaignId}`) as Promise<{ intents: Intent[] }>,
      authedFetch(`/api/outbound/drafts?campaignId=${campaignId}`) as Promise<{ drafts: Draft[] }>,
    ]);
    authedFetch(`/api/outbound/experiments?campaignId=${campaignId}`).then((x) => setExperiments((x as { experiments: Experiment[] }).experiments)).catch(() => setExperiments([]));
    setApproval(detail.approval);
    setEnrollments(enr.enrollments);
    setInts(ints.intents);
    setDrafts(dr.drafts);
  }, [authedFetch]);

  const setInts = (v: Intent[]) => setIntents(v);

  useEffect(() => {
    refresh().catch((e) => setError(e instanceof Error ? e.message : "Failed to load."));
  }, [refresh]);

  useEffect(() => {
    if (selected) refreshDetail(selected).catch((e) => setError(e instanceof Error ? e.message : "Failed to load."));
  }, [selected, refreshDetail]);

  const act = async (fn: () => Promise<void>) => {
    setBusy(true); setError("");
    try { await fn(); } catch (e) { setError(e instanceof Error ? e.message : "Action failed."); }
    finally { setBusy(false); }
  };

  const input = "w-full rounded-lg border border-white/10 bg-white/[0.03] px-3 py-2 text-sm text-zinc-200 placeholder-zinc-600 outline-none focus:border-teal-500/50";
  const btn = "rounded-lg bg-teal-600 px-3 py-2 text-sm font-medium text-white hover:bg-teal-500 disabled:opacity-40";
  const card = "rounded-xl border border-white/10 bg-white/[0.03] p-4";

  return (
    <div className="grid gap-4">
      <div className={card}>
        <h2 className="text-sm font-semibold text-zinc-200">Outbound (preview)</h2>
        <p className="mt-1 text-xs text-zinc-500">
          Approval-gated campaign workflow. Nothing is sent from this surface: planning creates drafted intents only.
        </p>
      </div>
      {error && <p className="rounded-lg border border-rose-500/40 bg-rose-500/10 p-3 text-sm text-rose-700 dark:text-rose-300">{error}</p>}

      <div className={card}>
        <h3 className="mb-2 text-xs font-semibold uppercase tracking-wide text-zinc-400">ICP (targeting profile)</h3>
        {icp.current ? (
          <p className="mb-2 text-xs text-zinc-400">Active v{icp.current.version}: roles [{icp.current.roles.join(", ") || "-"}] regions [{icp.current.regions.join(", ") || "-"}] sizes [{icp.current.employeeBands.join(", ") || "-"}] sectors [{icp.current.sectors.join(", ") || "-"}] exclusions [{icp.current.exclusions.join(", ") || "-"}] - confirmed by {icp.current.confirmedBy}. Nothing activates without your confirmation below.</p>
        ) : (
          <p className="mb-2 text-xs text-zinc-500">No active ICP. Create a draft, then confirm it explicitly. Drafts never apply on their own.</p>
        )}
        <div className="grid gap-2 sm:grid-cols-3">
          <input className={input} placeholder="roles, comma separated" value={icpForm.roles} onChange={(e) => setIcpForm({ ...icpForm, roles: e.target.value })} />
          <input className={input} placeholder="regions, comma separated" value={icpForm.regions} onChange={(e) => setIcpForm({ ...icpForm, regions: e.target.value })} />
          <input className={input} placeholder="size bands (e.g. 51-200)" value={icpForm.employeeBands} onChange={(e) => setIcpForm({ ...icpForm, employeeBands: e.target.value })} />
          <input className={input} placeholder="sectors" value={icpForm.sectors} onChange={(e) => setIcpForm({ ...icpForm, sectors: e.target.value })} />
          <input className={input} placeholder="exclusions (domains/keywords)" value={icpForm.exclusions} onChange={(e) => setIcpForm({ ...icpForm, exclusions: e.target.value })} />
          <input className={input} placeholder="approved product claims" value={icpForm.approvedClaims} onChange={(e) => setIcpForm({ ...icpForm, approvedClaims: e.target.value })} />
        </div>
        <div className="mt-2 flex gap-2">
          <button className={btn} disabled={busy} onClick={() => act(async () => {
            const list = (v: string) => v.split(",").map((x) => x.trim()).filter(Boolean);
            const draft = (await authedFetch("/api/outbound/icp", { method: "POST", body: JSON.stringify({
              action: "create", source: { kind: "manual" },
              roles: list(icpForm.roles), regions: list(icpForm.regions), employeeBands: list(icpForm.employeeBands),
              sectors: list(icpForm.sectors), exclusions: list(icpForm.exclusions), approvedClaims: list(icpForm.approvedClaims),
            }) })) as IcpVersion;
            await refresh();
            setError("");
            alert(`Draft v${draft.version} created. It is NOT active until confirmed.`);
          })}>Save draft</button>
          {icp.versions.filter((v) => v.status === "draft").map((v) => (
            <button key={v.icpVersionId} className={btn} disabled={busy} onClick={() => act(async () => {
              await authedFetch("/api/outbound/icp", { method: "POST", body: JSON.stringify({ action: "confirm", icpVersionId: v.icpVersionId }) });
              await refresh();
            })}>Confirm v{v.version}</button>
          ))}
        </div>
        {icp.versions.length > 0 && <p className="mt-2 text-xs text-zinc-500">Versions: {icp.versions.map((v) => `v${v.version} ${v.status}`).join(" · ")}</p>}
      </div>
      <div className={card}>
        <h3 className="mb-2 text-xs font-semibold uppercase tracking-wide text-zinc-400">Licensed sources</h3>
        <p className="mb-2 text-xs text-zinc-500">Registry only: registering a source records its license terms; it activates no provider and spends nothing. Imports naming a licensed API are blocked unless the source here permits it.</p>
        <div className="grid gap-2 sm:grid-cols-3">
          <input className={input} placeholder="source name" value={sourceForm.sourceName} onChange={(e) => setSourceForm({ ...sourceForm, sourceName: e.target.value })} />
          <input className={input} placeholder="terms URL (optional)" value={sourceForm.termsUrl} onChange={(e) => setSourceForm({ ...sourceForm, termsUrl: e.target.value })} />
          <label className="flex items-center gap-2 text-xs text-zinc-400">
            <input type="checkbox" checked={sourceForm.licensePermitsUse} onChange={(e) => setSourceForm({ ...sourceForm, licensePermitsUse: e.target.checked })} />
            License permits B2B marketing use
          </label>
        </div>
        <button className={`${btn} mt-2`} disabled={busy || !sourceForm.sourceName} onClick={() => act(async () => {
          await authedFetch("/api/outbound/sources", { method: "POST", body: JSON.stringify({ sourceName: sourceForm.sourceName, licensePermitsUse: sourceForm.licensePermitsUse, termsUrl: sourceForm.termsUrl || undefined }) });
          setSourceForm({ sourceName: "", licensePermitsUse: false, termsUrl: "" });
          await refresh();
        })}>Register source</button>
        {sources.length > 0 && (
          <ul className="mt-2 space-y-1 text-xs text-zinc-400">
            {sources.map((src) => (
              <li key={src.sourceId} className="flex items-center justify-between gap-2">
                <span>{src.sourceName} - {src.revokedAt ? `revoked ${src.revokedAt.slice(0, 10)}` : src.licensePermitsUse ? "permits use" : "does NOT permit use"}</span>
                {!src.revokedAt && <button className="text-red-400 hover:underline" disabled={busy} onClick={() => act(async () => {
                  await authedFetch("/api/outbound/sources", { method: "POST", body: JSON.stringify({ action: "revoke", sourceName: src.sourceName }) });
                  await refresh();
                })}>revoke</button>}
              </li>
            ))}
          </ul>
        )}
      </div>
      <div className={card}>
        <h3 className="mb-2 text-xs font-semibold uppercase tracking-wide text-zinc-400">New campaign</h3>
        <div className="grid gap-2 md:grid-cols-2">
          <input className={input} placeholder="Campaign id (letters, digits, -, _)" value={form.campaignId} onChange={(e) => setForm({ ...form, campaignId: e.target.value })} />
          <input className={input} placeholder="Step 1 subject" value={form.subject} onChange={(e) => setForm({ ...form, subject: e.target.value })} />
          <textarea className={input + " md:col-span-2"} rows={3} placeholder="Step 1 body" value={form.body} onChange={(e) => setForm({ ...form, body: e.target.value })} />
        </div>
        <button className={btn + " mt-2"} disabled={busy || !form.campaignId || !form.subject || !form.body} onClick={() => act(async () => {
          const expires = new Date(Date.now() + 14 * 86400000).toISOString();
          await authedFetch("/api/outbound/campaigns", { method: "POST", body: JSON.stringify({
            action: "create", campaignId: form.campaignId,
            spec: { templates: [{ step: 1, subject: form.subject, body: form.body }], followUpCount: 2, expiresAt: expires },
          })});
          setForm({ ...form, campaignId: "", subject: "", body: "" });
          await refresh();
        })}>Create version</button>
      </div>

      <div className={card}>
        <h3 className="mb-2 text-xs font-semibold uppercase tracking-wide text-zinc-400">Senders</h3>
        <p className="mb-2 text-xs text-zinc-500">Connect a Google account directly, or register a mailbox and start consent from its row. Mailboxes stay pending_consent until a real OAuth consent flow activates them. Nothing can dispatch without an active sender.</p>
        <button className="mb-2 rounded-lg bg-teal-600 px-3 py-1.5 text-xs font-semibold text-white hover:bg-teal-500 disabled:opacity-50" disabled={busy} onClick={() => act(async () => {
          try {
            const res = (await authedFetch("/api/outbound/senders/consent", { method: "POST", body: JSON.stringify({}) })) as ConsentStart;
            setConsent({ ...res, senderId: "(auto-detect)", consentFirst: true });
          } catch (e) {
            setConsent({ senderId: "(auto-detect)", consentFirst: true, error: e instanceof Error ? e.message : "Consent flow unavailable." });
          }
        })}>Connect Google</button>
        <button className="mb-2 ml-2 rounded-lg border border-teal-600 px-3 py-1.5 text-xs font-semibold text-teal-700 hover:bg-teal-600/10 disabled:opacity-50 dark:text-teal-300" disabled={busy} onClick={() => act(async () => {
          try {
            const res = (await authedFetch("/api/outbound/senders/consent", { method: "POST", body: JSON.stringify({ purpose: "calendar" }) })) as ConsentStart;
            setConsent({ ...res, senderId: "(auto-detect)", consentFirst: true, purpose: "calendar" });
          } catch (e) {
            setConsent({ senderId: "(auto-detect)", consentFirst: true, purpose: "calendar", error: e instanceof Error ? e.message : "Consent flow unavailable." });
          }
        })}>Connect calendar</button>
        {!senders.length && <p className="text-sm text-zinc-500">None registered.</p>}
        <ul className="mb-2 grid gap-1 text-sm text-zinc-300">
          {senders.map((sd) => (
            <li key={sd.senderId} className="flex items-center justify-between rounded-lg border border-white/10 px-3 py-2">
              <span>{sd.email} · {sd.provider} · {sd.status}</span>
              {sd.status === "pending_consent" && (
                <button className="text-xs text-teal-700 hover:underline dark:text-teal-300" disabled={busy} onClick={() => act(async () => {
                  try {
                    const res = (await authedFetch("/api/outbound/senders/consent", { method: "POST", body: JSON.stringify({ senderId: sd.senderId }) })) as ConsentStart;
                    setConsent({ ...res, senderId: sd.senderId });
                  } catch (e) {
                    setConsent({ senderId: sd.senderId, error: e instanceof Error ? e.message : "Consent flow unavailable." });
                  }
                })}>Start consent</button>
              )}
            </li>
          ))}
        </ul>
        {consent && (
          <div className="mb-2 rounded-lg border border-white/10 p-3 text-xs text-zinc-400">
            {consent.consentUrl ? (
              <>
                <p className="text-zinc-300">{consent.consentFirst ? (consent.purpose === "calendar" ? "Calendar connect link — grants free/busy time windows and the booking events Threadly creates; the approved Google account is verified by Google (expires " : "Connect link — the approved Google account becomes the sender (expires ") : `Consent link for sender ${consent.senderId.slice(0, 12)}... (expires `}{consent.expiresAt?.slice(0, 10)}):</p>
                <a className="mt-1 block break-all text-teal-700 underline dark:text-teal-300" href={consent.consentUrl} target="_blank" rel="noreferrer">{consent.consentUrl}</a>
                <p className="mt-1">{consent.notice}</p>
              </>
            ) : (
              <p className="text-amber-700 dark:text-amber-300/80">
                {consent.error ?? "Consent flow is not active on this deployment."}
                {consent.requiredEnvs ? ` Required configuration: ${consent.requiredEnvs.join(", ")}.` : ""}
              </p>
            )}
          </div>
        )}
        <div className="flex gap-2">
          <input className={input} placeholder="Sender mailbox" value={senderEmail} onChange={(e) => setSenderEmail(e.target.value)} />
          <button className={btn} disabled={busy || !senderEmail.includes("@")} onClick={() => act(async () => {
            await authedFetch("/api/outbound/senders", { method: "POST", body: JSON.stringify({ email: senderEmail, provider: "gmail" }) });
            setSenderEmail("");
            await refresh();
          })}>Register</button>
        </div>
      </div>

      <div className={card}>
        <h3 className="mb-2 text-xs font-semibold uppercase tracking-wide text-zinc-400">Import contacts (CSV)</h3>
        <p className="mb-2 text-xs text-zinc-500">
          Columns required: email, fullName, accountName, accountDomain. Commit is blocked unless you confirm the source permits B2B marketing use; suppressed and previously imported contacts are reconciled, never resurrected.
        </p>
        <textarea className={input} rows={4} placeholder={"email,fullName,accountName,accountDomain\nada@acme.com,Ada Lovelace,Acme,acme.com"} value={importForm.csv} onChange={(e) => setImportForm({ ...importForm, csv: e.target.value })} />
        <div className="mt-2 grid gap-2 md:grid-cols-2">
          <input className={input} placeholder="Source name (required for commit)" value={importForm.sourceName} onChange={(e) => setImportForm({ ...importForm, sourceName: e.target.value })} />
          <input className={input} placeholder="Acquired at (YYYY-MM-DD)" value={importForm.acquiredAt} onChange={(e) => setImportForm({ ...importForm, acquiredAt: e.target.value })} />
          <input className={input} placeholder="Country (optional)" value={importForm.country} onChange={(e) => setImportForm({ ...importForm, country: e.target.value })} />
          <select className={input} value={importForm.subscriberClass} onChange={(e) => setImportForm({ ...importForm, subscriberClass: e.target.value })}>
            <option value="corporate">Corporate subscriber</option>
            <option value="individual">Individual subscriber</option>
            <option value="unknown">Unknown</option>
          </select>
        </div>
        <label className="mt-2 flex items-start gap-2 text-xs text-zinc-400">
          <input type="checkbox" className="mt-0.5" checked={importForm.rightsConfirmed} onChange={(e) => setImportForm({ ...importForm, rightsConfirmed: e.target.checked })} />
          I confirm this source&apos;s license permits B2B marketing use of these contacts.
        </label>
        <div className="mt-2 flex gap-2">
          <button className={btn} disabled={busy || !importForm.csv.trim()} onClick={() => act(async () => {
            const res = (await authedFetch("/api/outbound/import", { method: "POST", body: JSON.stringify({
              action: "preview", csv: importForm.csv,
              mapping: { email: "email", fullName: "fullName", accountName: "accountName", accountDomain: "accountDomain" },
            })})) as ImportPreview;
            setImportPreview(res);
            setImportResult(null);
          })}>Preview</button>
          <button className={btn} disabled={busy || !importForm.csv.trim() || !importForm.sourceName.trim() || !importForm.acquiredAt.trim() || !importForm.rightsConfirmed} onClick={() => act(async () => {
            const res = (await authedFetch("/api/outbound/import", { method: "POST", body: JSON.stringify({
              action: "commit", csv: importForm.csv,
              mapping: { email: "email", fullName: "fullName", accountName: "accountName", accountDomain: "accountDomain" },
              sourceName: importForm.sourceName, acquiredAt: importForm.acquiredAt,
              country: importForm.country || undefined, subscriberClass: importForm.subscriberClass, rightsConfirmed: true,
            })})) as ImportCommit;
            setImportResult(res);
          })}>Commit import</button>
        </div>
        {importPreview && (
          <p className="mt-2 text-xs text-zinc-400">{importPreview.validCount} valid row(s), {importPreview.invalidCount} invalid.{importPreview.invalid.length > 0 ? ` First issues: ${importPreview.invalid.slice(0, 3).map((i) => `row ${i.row}: ${i.reason}`).join("; ")}` : ""}</p>
        )}
        {importResult && (
          <p className="mt-2 text-xs text-teal-700 dark:text-teal-300">Imported {importResult.created} contact(s), reconciled {importResult.reconciled}, {importResult.invalid.length} invalid (import {importResult.importId.slice(0, 12)}...).</p>
        )}
      </div>

      <div className={card}>
        <h3 className="mb-2 text-xs font-semibold uppercase tracking-wide text-zinc-400">Campaigns</h3>
        {!campaigns.length && <p className="text-sm text-zinc-500">None yet.</p>}
        <ul className="grid gap-1">
          {campaigns.map((c) => (
            <li key={c.campaignId}>
              <button className={"w-full rounded-lg border px-3 py-2 text-left text-sm " + (selected === c.campaignId ? "border-teal-500/50 bg-teal-500/10 text-zinc-100" : "border-white/10 text-zinc-300 hover:bg-white/[0.04]")}
                onClick={() => setSelected(c.campaignId)}>
                {c.campaignId} · v{c.version} · expires {c.expiresAt.slice(0, 10)}
              </button>
            </li>
          ))}
        </ul>
      </div>

      {selected && (
        <>
          <div className={card}>
            <h3 className="mb-2 text-xs font-semibold uppercase tracking-wide text-zinc-400">Approval</h3>
            {approval ? (
              <p className="text-sm text-teal-700 dark:text-teal-300">v{approval.campaignVersion} approved ({approval.approvalId.slice(0, 12)}...)</p>
            ) : (
              <button className={btn} disabled={busy} onClick={() => act(async () => {
                const c = campaigns.find((x) => x.campaignId === selected);
                await authedFetch("/api/outbound/campaigns", { method: "POST", body: JSON.stringify({ action: "approve", campaignId: selected, version: c?.version }) });
                await refreshDetail(selected);
              })}>Approve current version</button>
            )}
          </div>

          <div className={card}>
            <h3 className="mb-2 text-xs font-semibold uppercase tracking-wide text-zinc-400">Add contact and enroll</h3>
            <div className="grid gap-2 md:grid-cols-2">
              <input className={input} placeholder="Contact name" value={form.contactName} onChange={(e) => setForm({ ...form, contactName: e.target.value })} />
              <input className={input} placeholder="Contact email" value={form.contactEmail} onChange={(e) => setForm({ ...form, contactEmail: e.target.value })} />
            </div>
            <p className="mt-1 text-xs text-zinc-500">Contacts enter as unverified; the planner skips them until verification and a rights record exist. This form creates the record only.</p>
            <button className={btn + " mt-2"} disabled={busy || !form.contactEmail.includes("@") || !form.contactName || !approval} onClick={() => act(async () => {
              const created = (await authedFetch("/api/outbound/contacts", { method: "POST", body: JSON.stringify({ email: form.contactEmail, fullName: form.contactName }) })) as { contact: { contactId: string } };
              const c = campaigns.find((x) => x.campaignId === selected);
              await authedFetch("/api/outbound/enrollments", { method: "POST", body: JSON.stringify({
                campaignId: selected, version: c?.version, approvalId: approval?.approvalId,
                contactId: created.contact.contactId, exclusionGroup: created.contact.contactId,
              })});
              setForm({ ...form, contactEmail: "", contactName: "" });
              await refreshDetail(selected);
            })}>Create and enroll</button>
            {!approval && <p className="mt-1 text-xs text-zinc-500">Approve the campaign version before enrolling.</p>}
          </div>

          <div className={card}>
            <h3 className="mb-2 text-xs font-semibold uppercase tracking-wide text-zinc-400">Plan</h3>
            <button className={btn} disabled={busy} onClick={() => act(async () => {
              const res = (await authedFetch("/api/outbound/plan", { method: "POST", body: JSON.stringify({ campaignId: selected }) })) as PlanResult;
              setPlanResult(res);
              await refreshDetail(selected);
            })}>Run planner</button>
            {planResult && (
              <div className="mt-2 text-xs text-zinc-400">
                <p>{planResult.plannedCount} drafted intent(s).</p>
                {planResult.blocked.length > 0 && <p className="text-rose-700 dark:text-rose-300">Blocked: {planResult.blocked.join(", ")}</p>}
                {planResult.skipped.map((sk, i) => (
                  <p key={i} className="text-amber-700 dark:text-amber-300/80">{sk.contactId}: {sk.reasons.join(", ")}</p>
                ))}
              </div>
            )}
          </div>

          <div className={card}>
            <h3 className="mb-2 text-xs font-semibold uppercase tracking-wide text-zinc-400">Draft generation</h3>
            <button className={btn} disabled={busy} onClick={() => act(async () => {
              const res = (await authedFetch("/api/outbound/drafts", { method: "POST", body: JSON.stringify({ campaignId: selected }) })) as DraftRunResult;
              setDraftResult(res);
              await refreshDetail(selected);
            })}>Generate drafts</button>
            <p className="mt-1 text-xs text-zinc-500">Template rendering only; drafts are stored for review. Nothing is sent.</p>
            {draftResult && (
              <div className="mt-2 text-xs text-zinc-400">
                <p>{draftResult.renderedCount} draft(s) rendered.</p>
                {draftResult.skipped.map((sk, i) => (
                  <p key={i} className="text-amber-700 dark:text-amber-300/80">{sk.intentId}: {sk.reason}</p>
                ))}
              </div>
            )}
          </div>

          <div className="grid gap-4 md:grid-cols-2">
            <div className={card}>
              <h3 className="mb-2 text-xs font-semibold uppercase tracking-wide text-zinc-400">Enrollments</h3>
              {!enrollments.length && <p className="text-sm text-zinc-500">None.</p>}
              <ul className="grid gap-1 text-sm text-zinc-300">
                {enrollments.map((e) => (
                  <li key={e.enrollmentId} className="flex items-center justify-between rounded-lg border border-white/10 px-3 py-2">
                    <span>{e.contactId.slice(0, 14)}... · {e.status} · step {e.currentStep}</span>
                    {e.status === "active" && (
                      <button className="text-xs text-rose-700 hover:underline dark:text-rose-300" disabled={busy} onClick={() => act(async () => {
                        await authedFetch("/api/outbound/replies", { method: "POST", body: JSON.stringify({ campaignId: selected, enrollmentId: e.enrollmentId }) });
                        await refreshDetail(selected);
                      })}>Mark replied</button>
                    )}
                  </li>
                ))}
              </ul>
            </div>
            <div className={card}>
              <h3 className="mb-2 text-xs font-semibold uppercase tracking-wide text-zinc-400">Intents</h3>
              {!intents.length && <p className="text-sm text-zinc-500">None.</p>}
              <ul className="grid gap-1 text-sm text-zinc-300">
                {intents.map((i) => (
                  <li key={i.intentId} className="rounded-lg border border-white/10 px-3 py-2">
                    step {i.step} · {i.status} · {i.contactId.slice(0, 14)}...
                    {(i.attempts ?? []).map((a) => (
                      <p key={a.attemptId} className="mt-1 text-xs text-zinc-500">
                        {a.outcome}{a.synthetic ? " (synthetic - no external send)" : ""} · {a.dispatchedAt}
                      </p>
                    ))}
                  </li>
                ))}
              </ul>
            </div>
          </div>

          <div className={card}>
            <h3 className="mb-2 text-xs font-semibold uppercase tracking-wide text-zinc-400">Dispatch (mock)</h3>
            <button className={btn} disabled={busy} onClick={() => act(async () => {
              const res = (await authedFetch("/api/outbound/dispatch", { method: "POST", body: JSON.stringify({ campaignId: selected }) })) as DispatchResult;
              setDispatchResult(res);
              await refreshDetail(selected);
            })}>Run dispatch</button>
            <p className="mt-1 text-xs text-zinc-500">Mock provider only: no external send occurs. Gates still apply; senders stay pending_consent.</p>
            {dispatchResult && (
              <div className="mt-2 text-xs text-zinc-400">
                <p>{dispatchResult.dispatchedCount} dispatched (mock - synthetic, no external send).</p>
                {dispatchResult.deferred.map((df, i) => (
                  <p key={i} className="text-amber-700 dark:text-amber-300/80">{df.intentId}: {df.reasons.join(", ")}</p>
                ))}
              </div>
            )}
          </div>

          <div className={card}>
            <h3 className="mb-2 text-xs font-semibold uppercase tracking-wide text-zinc-400">Drafts</h3>
            {!drafts.length && <p className="text-sm text-zinc-500">None.</p>}
            <ul className="grid gap-1 text-sm text-zinc-300">
              {drafts.map((d) => {
                const intentStatus = intents.find((i) => i.intentId === d.intentId)?.status ?? "unknown";
                const approvable = intentStatus === "drafted";
                return (
                  <li key={d.draftId} className="rounded-lg border border-white/10 px-3 py-2">
                    <p className="font-medium text-zinc-200">{d.subject}</p>
                    <p className="mt-1 text-xs text-zinc-400">{d.body}</p>
                    <div className="mt-1 flex items-center justify-between">
                      <p className="text-xs text-zinc-500">step {d.step} · {d.engine} · intent {intentStatus}</p>
                      {approvable ? (
                        <button className="text-xs text-teal-700 hover:underline dark:text-teal-300" disabled={busy} onClick={() => act(async () => {
                          await authedFetch("/api/outbound/drafts", { method: "POST", body: JSON.stringify({ action: "approve", draftId: d.draftId }) });
                          await refreshDetail(selected);
                        })}>Approve draft</button>
                      ) : (
                        <span className="text-xs text-zinc-500">{intentStatus === "approved" || intentStatus === "scheduled" ? "Approved" : "Not approvable"}</span>
                      )}
                    </div>
                  </li>
                );
              })}
            </ul>
          </div>

          <div className={card}>
            <h3 className="mb-2 text-xs font-semibold uppercase tracking-wide text-zinc-400">Experiments and holdout</h3>
            {!experiments.length && <p className="text-sm text-zinc-500">None for this campaign.</p>}
            <ul className="mb-2 grid gap-2 text-sm text-zinc-300">
              {experiments.map((x) => (
                <li key={x.experimentId} className="rounded-lg border border-white/10 px-3 py-2">
                  <div>
                    {x.experimentId.slice(0, 14)}... · {x.status} · holdout {x.holdoutPercent}% · variants: a (campaign default){x.variants.map((v) => `, ${v.key}`).join("")} · {x.variantsApprovedBy ? `variants approved by ${x.variantsApprovedBy.slice(0, 10)}...` : "variants not approved"}
                  </div>
                  {x.variants.map((v) =>
                    v.templates.map((t, i) => (
                      <details key={`${v.key}-${i}`} className="mt-1 rounded border border-white/5 px-2 py-1 text-xs text-zinc-400">
                        <summary className="cursor-pointer select-none">variant {v.key} · step {t.step} · subject: {t.subject || "(empty)"} - expand to review the full template before approving</summary>
                        <p className="mt-1 whitespace-pre-wrap break-words">{"Subject: " + (t.subject || "(empty)") + "\n\nBody:\n" + (t.body || "(empty)")}</p>
                      </details>
                    ))
                  )}
                  {x.status === "draft" && (
                    <button className="mt-2 text-xs text-teal-700 hover:underline dark:text-teal-300" disabled={busy} onClick={() => act(async () => {
                      await authedFetch("/api/outbound/experiments", { method: "POST", body: JSON.stringify({ action: "activate", experimentId: x.experimentId }) });
                      await refreshDetail(selected);
                    })}>Approve the full variant templates above and activate</button>
                  )}
                  {x.status === "active" && (
                    <button className="mt-2 text-xs text-rose-600 hover:underline dark:text-rose-300" disabled={busy} onClick={() => act(async () => {
                      await authedFetch("/api/outbound/experiments", { method: "POST", body: JSON.stringify({ action: "end", experimentId: x.experimentId }) });
                      await refreshDetail(selected);
                    })}>End experiment (future planning stops assigning it; existing assignments keep their bucket)</button>
                  )}
                </li>
              ))}
            </ul>
            <p className="mb-2 text-xs text-zinc-500">Creates a draft experiment with variant b against the campaign default (variant a). Holdout contacts receive nothing.</p>
            <div className="grid gap-2 md:grid-cols-2">
              <label className="grid gap-1 text-xs text-zinc-400">Holdout percent (0-50; these contacts receive nothing)
                <input className={input} inputMode="numeric" value={expForm.holdoutPercent} onChange={(e) => setExpForm({ ...expForm, holdoutPercent: e.target.value })} />
              </label>
              <input className={input} placeholder="Variant b subject" value={expForm.subject} onChange={(e) => setExpForm({ ...expForm, subject: e.target.value })} />
              <textarea className={input + " md:col-span-2"} rows={2} placeholder="Variant b body" value={expForm.body} onChange={(e) => setExpForm({ ...expForm, body: e.target.value })} />
            </div>
            <button className={btn + " mt-2"} disabled={busy || !expForm.subject || !expForm.body} onClick={() => act(async () => {
              const c = campaigns.find((x) => x.campaignId === selected);
              const pct = Number(expForm.holdoutPercent);
              await authedFetch("/api/outbound/experiments", { method: "POST", body: JSON.stringify({
                campaignId: selected, campaignVersion: c?.version,
                holdoutPercent: Number.isFinite(pct) ? pct : 0,
                variants: [{ key: expForm.variantKey || "b", templates: [{ step: 1, subject: expForm.subject, body: expForm.body }] }],
              })});
              setExpForm({ ...expForm, subject: "", body: "" });
              await refreshDetail(selected);
            })}>Create draft experiment</button>
          </div>

          <div className={card}>
            <h3 className="mb-2 text-xs font-semibold uppercase tracking-wide text-zinc-400">Meeting booking</h3>
            <p className="mb-2 text-xs text-zinc-500">
              Step 1 saves a booking policy for the host sender you explicitly select below. Step 2 creates a single-use booking link for a contact. Slot claims are atomic; a provider timeout quarantines the claim instead of retrying. The mock calendar adapter confirms without creating a real event and says so.
            </p>
            <div className="grid gap-2 md:grid-cols-4">
              <label className="grid gap-1 text-xs text-zinc-400">Duration (minutes)
                <input className={input} inputMode="numeric" value={policyForm.durationMinutes} onChange={(e) => setPolicyForm({ ...policyForm, durationMinutes: e.target.value })} />
              </label>
              <label className="grid gap-1 text-xs text-zinc-400">Start hour (0-23)
                <input className={input} inputMode="numeric" value={policyForm.startHour} onChange={(e) => setPolicyForm({ ...policyForm, startHour: e.target.value })} />
              </label>
              <label className="grid gap-1 text-xs text-zinc-400">End hour (0-23)
                <input className={input} inputMode="numeric" value={policyForm.endHour} onChange={(e) => setPolicyForm({ ...policyForm, endHour: e.target.value })} />
              </label>
              <label className="grid gap-1 text-xs text-zinc-400">Timezone (IANA)
                <input className={input} value={policyForm.timezone} onChange={(e) => setPolicyForm({ ...policyForm, timezone: e.target.value })} />
              </label>
            </div>
            <label className="mt-2 grid gap-1 text-xs text-zinc-400">Host sender (deliberate selection - no default is assumed)
              <select className={input} value={hostSenderId} onChange={(e) => setHostSenderId(e.target.value)}>
                <option value="" disabled>Select host sender</option>
                {senders.map((snd) => (
                  <option key={snd.senderId} value={snd.senderId}>{snd.email} · {snd.status}</option>
                ))}
              </select>
            </label>
            <div className="mt-2 flex items-center gap-2">
              <button className={btn} disabled={busy || !hostSenderId} onClick={() => act(async () => {
                const res = (await authedFetch("/api/outbound/meetings", { method: "POST", body: JSON.stringify({
                  action: "save-policy",
                  hostPool: [hostSenderId],
                  durationMinutes: Number(policyForm.durationMinutes) || 30,
                  startHour: Number(policyForm.startHour) || 9,
                  endHour: Number(policyForm.endHour) || 17,
                  timezone: policyForm.timezone || "UTC",
                })})) as { policy: { policyId: string } };
                setPolicyId(res.policy.policyId);
              })}>Save policy</button>
              {policyId && <span className="text-xs text-teal-700 dark:text-teal-300">Policy {policyId.slice(0, 14)}...</span>}
            </div>
            <div className="mt-3 flex gap-2">
              <input className={input} placeholder="Contact id for the booking link" value={bookingContactId} onChange={(e) => setBookingContactId(e.target.value)} />
              <button className={btn} disabled={busy || !policyId || !bookingContactId.trim() || !hostSenderId} onClick={() => act(async () => {
                const res = (await authedFetch("/api/outbound/meetings", { method: "POST", body: JSON.stringify({
                  action: "create-booking-link",
                  contactId: bookingContactId.trim(),
                  organizerSenderId: hostSenderId,
                  policyId,
                })})) as BookingLinkResult;
                setBookingLink(res);
              })}>Create booking link</button>
            </div>
            {bookingLink && (
              <div className="mt-2 rounded-lg border border-white/10 p-3 text-xs text-zinc-400">
                <p className="text-zinc-300">Single-use link (expires {bookingLink.expiresAt.slice(0, 10)}):</p>
                <a className="mt-1 block break-all text-teal-700 underline dark:text-teal-300" href={bookingLink.bookingUrl} target="_blank" rel="noreferrer">{bookingLink.bookingUrl}</a>
              </div>
            )}
          </div>

          <div className={card}>
            <h3 className="mb-2 text-xs font-semibold uppercase tracking-wide text-zinc-400">Usage</h3>
            {!usage && <p className="text-sm text-zinc-500">Loading...</p>}
            {usage && (
              <>
                <p className="text-sm text-zinc-300">
                  {usage.costComplete
                    ? `Total: $${(usage.totalCostMinorUnits / 100).toFixed(2)}`
                    : `Total is a lower bound: $${(usage.totalCostMinorUnits / 100).toFixed(2)} - ${usage.unpricedEvents} event(s) have unknown cost. Dispatch is blocked while cost is unknown.`}
                </p>
                <ul className="mt-2 grid gap-1 text-xs text-zinc-400">
                  {usage.events.map((e) => (
                    <li key={e.usageId} className="rounded-lg border border-white/10 px-3 py-2">
                      {e.kind} · {e.units} unit(s) · {e.costMinorUnits === null ? "cost unknown" : `$${(e.costMinorUnits / 100).toFixed(2)} ${e.currency ?? ""}`}{e.synthetic ? " · synthetic" : ""}
                    </li>
                  ))}
                </ul>
              </>
            )}
          </div>

          <div className="grid gap-4 md:grid-cols-2">
            <div className={card}>
              <h3 className="mb-2 text-xs font-semibold uppercase tracking-wide text-zinc-400">Conversations</h3>
              {!conversations.length && <p className="text-sm text-zinc-500">None.</p>}
              <ul className="grid gap-1 text-sm text-zinc-300">
                {conversations.map((c) => (
                  <li key={c.conversationId} className="rounded-lg border border-white/10 px-3 py-2">
                    {c.contactId.slice(0, 14)}... · reply {c.humanReplySeenAt ? "seen" : "none"} · {c.classification ?? "unclassified"}
                  </li>
                ))}
              </ul>
            </div>
            <div className={card}>
              <h3 className="mb-2 text-xs font-semibold uppercase tracking-wide text-zinc-400">Meetings</h3>
              {!meetings.length && <p className="text-sm text-zinc-500">None.</p>}
              <ul className="grid gap-1 text-sm text-zinc-300">
                {meetings.map((m) => (
                  <li key={m.meetingId} className="rounded-lg border border-white/10 px-3 py-2">
                    {(() => { try { return new Date(m.startsAt).toLocaleString(undefined, { timeZone: m.timezone || "UTC", dateStyle: "medium", timeStyle: "short" }); } catch { return m.startsAt; } })()} ({m.timezone}) · {m.booked ? "booked" : "not booked"}{m.synthetic ? " · synthetic (mock calendar, no real event)" : ""} · held: {(m.held ?? null) === null ? "unknown" : m.held ? "yes" : "no"}
                  </li>
                ))}
              </ul>
            </div>
          </div>
          <div className="grid gap-4 md:grid-cols-2">
            <div className={card}>
              <h3 className="mb-2 text-xs font-semibold uppercase tracking-wide text-zinc-400">Fit scores</h3>
              <p className="mb-2 text-xs text-zinc-500">Evidence-based only: criteria without dated evidence are unknown, never zero. Scores inform review; nothing sends on a score.</p>
              <div className="flex gap-2">
                <input className={input} placeholder="contactId" value={fitContactId} onChange={(e) => setFitContactId(e.target.value)} />
                <button className={btn} disabled={busy || !fitContactId} onClick={() => act(async () => {
                  await authedFetch("/api/outbound/fit-scores", { method: "POST", body: JSON.stringify({ contactId: fitContactId, icpVersionId: "current" }) });
                  setFitContactId("");
                  await refresh();
                })}>Score vs active ICP</button>
              </div>
              <ul className="mt-2 space-y-1 text-xs text-zinc-400">
                {fitScores.slice(0, 10).map((f) => (
                  <li key={f.scoreId} className="rounded-lg border border-white/10 px-3 py-2">
                    <span className="text-zinc-200">{f.score === null ? "unknown" : f.score}</span> · {f.contactId.slice(0, 14)}... · {f.scoreVersion} · evidence {f.coverage.known}/{f.coverage.total} · {f.computedAt.slice(0, 16).replace("T", " ")}
                    <ul className="mt-1 space-y-0.5 text-zinc-500">
                      {f.reasons.map((r, i) => <li key={i}>[{r.state}] {r.detail}</li>)}
                    </ul>
                  </li>
                ))}
              </ul>
            </div>
            <div className={card}>
              <h3 className="mb-2 text-xs font-semibold uppercase tracking-wide text-zinc-400">Verification (domain MX)</h3>
              <p className="mb-2 text-xs text-zinc-500">Free domain-level check only: it can mark a domain that cannot receive mail as invalid. It can never prove a mailbox exists or mark one valid.</p>
              <div className="flex gap-2">
                <input className={input} placeholder="contactId" value={verifyContactId} onChange={(e) => setVerifyContactId(e.target.value)} />
                <button className={btn} disabled={busy || !verifyContactId} onClick={() => act(async () => {
                  const res = (await authedFetch("/api/outbound/verification", { method: "POST", body: JSON.stringify({ contactId: verifyContactId }) })) as { verification: { state: string }; detail: string };
                  setVerifyResult(res);
                })}>Run MX check</button>
              </div>
              {verifyResult && <p className="mt-2 text-xs text-zinc-400">State: {verifyResult.verification.state} - {verifyResult.detail}</p>}
            </div>
          </div>
          <div className={card}>
            <h3 className="mb-2 text-xs font-semibold uppercase tracking-wide text-zinc-400">Control center</h3>
            <div className="grid gap-4 md:grid-cols-2">
              <div>
                <h4 className="mb-1 text-xs font-semibold text-zinc-300">Kill switches (pause without redeploy)</h4>
                <div className="grid gap-2 sm:grid-cols-3">
                  <select className={input} value={ksForm.scope} onChange={(e) => setKsForm({ ...ksForm, scope: e.target.value })}>
                    <option value="tenant">tenant (everything)</option>
                    <option value="campaign">campaign</option>
                    <option value="domain">domain</option>
                    <option value="sender">sender</option>
                  </select>
                  <input className={input} placeholder={ksForm.scope === "tenant" ? "(not needed)" : "target id/domain"} value={ksForm.target} onChange={(e) => setKsForm({ ...ksForm, target: e.target.value })} disabled={ksForm.scope === "tenant"} />
                  <input className={input} placeholder="visible reason" value={ksForm.reason} onChange={(e) => setKsForm({ ...ksForm, reason: e.target.value })} />
                </div>
                <button className={`${btn} mt-2`} disabled={busy || !ksForm.reason || (ksForm.scope !== "tenant" && !ksForm.target)} onClick={() => act(async () => {
                  await authedFetch("/api/outbound/killswitches", { method: "POST", body: JSON.stringify({ scope: ksForm.scope, target: ksForm.target, reason: ksForm.reason }) });
                  setKsForm({ ...ksForm, reason: "" });
                  await refresh();
                })}>Engage switch</button>
                <ul className="mt-2 space-y-1 text-xs text-zinc-400">
                  {killSwitches.map((k) => (
                    <li key={k.switchId} className="flex items-center justify-between gap-2 rounded-lg border border-white/10 px-3 py-2">
                      <span className={k.active ? "text-amber-300" : "text-zinc-500"}>{k.active ? "ACTIVE" : "lifted"} · {k.scope}:{k.target} - {k.reason}</span>
                      {k.active && <button className="text-teal-400 hover:underline" disabled={busy} onClick={() => act(async () => {
                        await authedFetch("/api/outbound/killswitches", { method: "POST", body: JSON.stringify({ action: "lift", switchId: k.switchId }) });
                        await refresh();
                      })}>lift</button>}
                    </li>
                  ))}
                </ul>
              </div>
              <div>
                <h4 className="mb-1 text-xs font-semibold text-zinc-300">Domain preflight (SPF/DKIM/DMARC)</h4>
                <p className="mb-2 text-xs text-zinc-500">Live DNS check of sending identity. No inbox-placement promise; dispatch blocks domains without a passing fresh record.</p>
                <div className="flex gap-2">
                  <input className={input} placeholder="domain (e.g. example.com)" value={pfDomain} onChange={(e) => setPfDomain(e.target.value)} />
                  <button className={btn} disabled={busy || !pfDomain} onClick={() => act(async () => {
                    await authedFetch("/api/outbound/preflight", { method: "POST", body: JSON.stringify({ domain: pfDomain }) });
                    setPfDomain("");
                    await refresh();
                  })}>Run preflight</button>
                </div>
                <ul className="mt-2 space-y-1 text-xs text-zinc-400">
                  {preflights.map((pf) => (
                    <li key={pf.domain} className="rounded-lg border border-white/10 px-3 py-2">
                      <span className={pf.state === "pass" ? "text-teal-300" : "text-amber-300"}>{pf.state}</span> · {pf.domain} · spf {pf.spf} dkim {pf.dkim} dmarc {pf.dmarc} · checked {pf.checkedAt.slice(0, 16).replace("T", " ")}
                    </li>
                  ))}
                </ul>
              </div>
            </div>
          </div>
          <div className={card}>
            <h3 className="mb-2 text-xs font-semibold uppercase tracking-wide text-zinc-400">Automated response policy</h3>
            <p className="mb-2 text-xs text-zinc-500">Approved factual/scheduling replies only. Legal, security, pricing and uncertain replies always reach a person. Creating a policy approves nothing to send by itself; automatic acting on decisions stays off.</p>
            {respPolicies.active ? (
              <p className="mb-2 text-xs text-zinc-400">Active policy v{respPolicies.active.version}: {respPolicies.active.rules.map((r) => `${r.intent} -> ${r.templateId} (${r.category})`).join(" · ")}</p>
            ) : (
              <p className="mb-2 text-xs text-zinc-500">No active policy.</p>
            )}
            <div className="grid gap-2 sm:grid-cols-4">
              <select className={input} value={rpForm.intent} onChange={(e) => setRpForm({ ...rpForm, intent: e.target.value })}>
                <option value="interested">interested</option>
                <option value="not_now">not_now</option>
                <option value="wrong_person">wrong_person</option>
                <option value="out_of_office">out_of_office</option>
              </select>
              <select className={input} value={rpForm.category} onChange={(e) => setRpForm({ ...rpForm, category: e.target.value })}>
                <option value="scheduling">scheduling</option>
                <option value="factual">factual</option>
              </select>
              <input className={input} placeholder="template id" value={rpForm.templateId} onChange={(e) => setRpForm({ ...rpForm, templateId: e.target.value })} />
              <input className={input} placeholder="frozen template text" value={rpForm.templateText} onChange={(e) => setRpForm({ ...rpForm, templateText: e.target.value })} />
            </div>
            <button className={`${btn} mt-2`} disabled={busy || !rpForm.templateId || !rpForm.templateText} onClick={() => act(async () => {
              const existing = respPolicies.active ? respPolicies.active.rules.map((r) => ({ ...r })) : [];
              await authedFetch("/api/outbound/response-policies", { method: "POST", body: JSON.stringify({ rules: [...existing, { intent: rpForm.intent, category: rpForm.category, templateId: rpForm.templateId, templateText: rpForm.templateText }] }) });
              setRpForm({ ...rpForm, templateId: "", templateText: "" });
              await refresh();
            })}>Save as new policy version</button>
            {respPolicies.active && <button className="ml-2 mt-2 text-xs text-red-400 hover:underline" disabled={busy} onClick={() => act(async () => {
              await authedFetch("/api/outbound/response-policies", { method: "POST", body: JSON.stringify({ action: "retire", policyId: respPolicies.active!.policyId }) });
              await refresh();
            })}>retire active policy</button>}
          </div>
        </>
      )}
      <div className={card}>
        <h3 className="mb-2 text-xs font-semibold uppercase tracking-wide text-zinc-400">Audit log</h3>
        <p className="mb-2 text-xs text-zinc-500">
          Append-only record of outbound actions: actor, action, target, outcome and time. Owners and admins can export it. Each export is itself recorded.
        </p>
        <div className="flex flex-wrap items-center gap-2">
          <button className={btn} disabled={busy} onClick={() => act(async () => {
            const res = (await authedFetch("/api/outbound/audit?format=json")) as { count: number; truncated: boolean; generatedAt: string };
            const blob = new Blob([JSON.stringify(res, null, 2)], { type: "application/json" });
            const url = URL.createObjectURL(blob);
            const a = document.createElement("a");
            a.href = url;
            a.download = `threadly-audit-${res.generatedAt.slice(0, 10)}.json`;
            a.click();
            URL.revokeObjectURL(url);
            setAuditNotice(`Exported ${res.count} event${res.count === 1 ? "" : "s"}${res.truncated ? " (limit reached; narrow the date range through the API for the rest)" : ""}.`);
          })}>Export audit log</button>
          {auditNotice && <span className="text-xs text-zinc-400">{auditNotice}</span>}
        </div>
      </div>
    </div>
  );
}
