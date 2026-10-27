"use client";

import { useCallback, useEffect, useState } from "react";

type Campaign = {
  campaignId: string; version: number; expiresAt: string;
  templates: { step: number; subject: string; body: string }[];
  followUpCount: number; dailyCapPerSender: number;
};
type Approval = { approvalId: string; campaignVersion: number } | null;
type Enrollment = { enrollmentId: string; contactId: string; status: string; currentStep: number };
type Intent = { intentId: string; contactId: string; step: number; status: string };
type PlanResult = { plannedCount: number; skipped: { contactId: string; reasons: string[] }[]; blocked: string[] };
type Sender = { senderId: string; email: string; provider: string; status: string };
type Draft = { draftId: string; intentId: string; step: number; subject: string; body: string; engine: string; renderedAt: string };
type DraftRunResult = { renderedCount: number; rendered: string[]; skipped: { intentId: string; reason: string }[]; usageRecorded: string[] };
type Conversation = { conversationId: string; contactId: string; humanReplySeenAt: string | null; classification: string | null; classifiedBy: string | null };
type Meeting = { meetingId: string; startsAt: string; timezone: string; booked: boolean; attendeeAccepted: boolean | null; held: boolean | null };

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
  const [drafts, setDrafts] = useState<Draft[]>([]);
  const [conversations, setConversations] = useState<Conversation[]>([]);
  const [meetings, setMeetings] = useState<Meeting[]>([]);
  const [senders, setSenders] = useState<Sender[]>([]);
  const [senderEmail, setSenderEmail] = useState("");
  const [form, setForm] = useState({ campaignId: "", subject: "", body: "", contactEmail: "", contactName: "" });

  const refresh = useCallback(async () => {
    const data = (await authedFetch("/api/outbound/campaigns")) as { campaigns: Campaign[] };
    setCampaigns(data.campaigns);
    const snd = (await authedFetch("/api/outbound/senders")) as { senders: Sender[] };
    setSenders(snd.senders);
    const conv = (await authedFetch("/api/outbound/conversations")) as { conversations: Conversation[]; meetings: Meeting[] };
    setConversations(conv.conversations);
    setMeetings(conv.meetings);
  }, [authedFetch]);

  const refreshDetail = useCallback(async (campaignId: string) => {
    const [detail, enr, ints, dr] = await Promise.all([
      authedFetch(`/api/outbound/campaigns?campaignId=${campaignId}`) as Promise<{ approval: Approval }>,
      authedFetch(`/api/outbound/enrollments?campaignId=${campaignId}`) as Promise<{ enrollments: Enrollment[] }>,
      authedFetch(`/api/outbound/intents?campaignId=${campaignId}`) as Promise<{ intents: Intent[] }>,
      authedFetch(`/api/outbound/drafts?campaignId=${campaignId}`) as Promise<{ drafts: Draft[] }>,
    ]);
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
            <li key={sd.senderId} className="rounded-lg border border-white/10 px-3 py-2">{sd.email} · {sd.provider} · {sd.status}</li>
          ))}
        </ul>
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
                  </li>
                ))}
              </ul>
            </div>
          </div>

          <div className={card}>
            <h3 className="mb-2 text-xs font-semibold uppercase tracking-wide text-zinc-400">Drafts</h3>
            {!drafts.length && <p className="text-sm text-zinc-500">None.</p>}
            <ul className="grid gap-1 text-sm text-zinc-300">
              {drafts.map((d) => (
                <li key={d.draftId} className="rounded-lg border border-white/10 px-3 py-2">
                  <p className="font-medium text-zinc-200">{d.subject}</p>
                  <p className="mt-1 text-xs text-zinc-400">{d.body}</p>
                  <p className="mt-1 text-xs text-zinc-500">step {d.step} · {d.engine}</p>
                </li>
              ))}
            </ul>
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
                    {m.startsAt} ({m.timezone}) · {m.booked ? "booked" : "not booked"} · held: {m.held === null ? "unknown" : m.held ? "yes" : "no"}
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
