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
type Meeting = { meetingId: string; startsAt: string; timezone: string; booked: boolean; attendeeAccepted: boolean | null; held: boolean | null };
type Experiment = { experimentId: string; campaignId: string; status: string; holdoutPercent: number; variants: { key: string }[]; variantsApprovedBy: string | null };
type ImportPreview = { validCount: number; invalidCount: number; invalid: { row: number; reason: string }[]; sample: { email: string }[] };
type ImportCommit = { importId: string; created: number; reconciled: number; invalid: { row: number; reason: string }[] };
type ConsentStart = { senderId: string; consentUrl?: string; expiresAt?: string; notice?: string; error?: string; requiredEnvs?: string[] };
type BookingLinkResult = { bookingLinkId: string; expiresAt: string; bookingUrl: string };

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
  const [policyId, setPolicyId] = useState<string>("");
  const [bookingLink, setBookingLink] = useState<BookingLinkResult | null>(null);
  const [bookingContactId, setBookingContactId] = useState("");

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
        <h2 className="text-sm font-semibold text-zinc-200">Enterprise outbound (preview)</h2>
        <p className="mt-1 text-xs text-zinc-500">
          Approval-gated campaign workflow. Nothing is sent from this surface: planning creates drafted intents only.
        </p>
      </div>
      {error && <p className="rounded-lg border border-rose-500/40 bg-rose-500/10 p-3 text-sm text-rose-700 dark:text-rose-300">{error}</p>}

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
        <p className="mb-2 text-xs text-zinc-500">Registered mailboxes stay pending_consent until a real OAuth consent flow activates them. Nothing can dispatch without an active sender.</p>
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
                <p className="text-zinc-300">Consent link for sender {consent.senderId.slice(0, 12)}... (expires {consent.expiresAt?.slice(0, 10)}):</p>
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
            <ul className="mb-2 grid gap-1 text-sm text-zinc-300">
              {experiments.map((x) => (
                <li key={x.experimentId} className="rounded-lg border border-white/10 px-3 py-2">
                  {x.experimentId.slice(0, 14)}... · {x.status} · holdout {x.holdoutPercent}% · variants: a (campaign default){x.variants.map((v) => `, ${v.key}`).join("")} · {x.variantsApprovedBy ? "variants approved" : "variants not approved"}
                </li>
              ))}
            </ul>
            <p className="mb-2 text-xs text-zinc-500">Creates a draft experiment with variant b against the campaign default (variant a). Holdout contacts receive nothing.</p>
            <div className="grid gap-2 md:grid-cols-2">
              <input className={input} placeholder="Holdout percent (0-50)" value={expForm.holdoutPercent} onChange={(e) => setExpForm({ ...expForm, holdoutPercent: e.target.value })} />
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
              Step 1 saves a booking policy whose host pool is the first registered sender. Step 2 creates a single-use booking link for a contact. Slot claims are atomic; a provider timeout quarantines the claim instead of retrying. The mock calendar adapter confirms without creating a real event and says so.
            </p>
            <div className="grid gap-2 md:grid-cols-4">
              <input className={input} placeholder="Minutes" value={policyForm.durationMinutes} onChange={(e) => setPolicyForm({ ...policyForm, durationMinutes: e.target.value })} />
              <input className={input} placeholder="Start hour" value={policyForm.startHour} onChange={(e) => setPolicyForm({ ...policyForm, startHour: e.target.value })} />
              <input className={input} placeholder="End hour" value={policyForm.endHour} onChange={(e) => setPolicyForm({ ...policyForm, endHour: e.target.value })} />
              <input className={input} placeholder="Timezone" value={policyForm.timezone} onChange={(e) => setPolicyForm({ ...policyForm, timezone: e.target.value })} />
            </div>
            <div className="mt-2 flex items-center gap-2">
              <button className={btn} disabled={busy || !senders.length} onClick={() => act(async () => {
                const res = (await authedFetch("/api/outbound/meetings", { method: "POST", body: JSON.stringify({
                  action: "save-policy",
                  hostPool: [senders[0].senderId],
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
              <button className={btn} disabled={busy || !policyId || !bookingContactId.trim() || !senders.length} onClick={() => act(async () => {
                const res = (await authedFetch("/api/outbound/meetings", { method: "POST", body: JSON.stringify({
                  action: "create-booking-link",
                  contactId: bookingContactId.trim(),
                  organizerSenderId: senders[0].senderId,
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
                    {m.startsAt} ({m.timezone}) · {m.booked ? "booked" : "not booked"} · held: {(m.held ?? null) === null ? "unknown" : m.held ? "yes" : "no"}
                  </li>
                ))}
              </ul>
            </div>
          </div>
        </>
      )}
    </div>
  );
}
