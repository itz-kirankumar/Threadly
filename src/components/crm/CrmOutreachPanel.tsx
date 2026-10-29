"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import type { CrmLead, CrmActivity, OutreachTemplate, CrmStats, LeadStage } from "@/lib/crm/types";

interface Props {
  authedFetch: (path: string, init?: RequestInit) => Promise<any>;
}

type ReplySentiment = "interested" | "question" | "not_interested" | "booked";

const STAGES: Array<{ id: LeadStage; label: string }> = [
  { id: "new", label: "New" },
  { id: "contacted", label: "Contacted" },
  { id: "in_sequence", label: "In sequence" },
  { id: "follow_up_due", label: "Follow-up due" },
  { id: "replied", label: "Replied" },
  { id: "qualified", label: "Qualified" },
  { id: "won", label: "Won" },
  { id: "lost", label: "Lost" },
];

const SOURCE_LABELS: Record<string, string> = {
  geo_gap_discovery: "Scan results",
  crawler_audit: "Crawler audit",
  competitor_analysis: "Competitor analysis",
  inbound: "Inbound",
  manual: "Added manually",
};

const inputCls = "w-full rounded-lg border border-white/10 bg-zinc-900 px-3 py-1.5 text-xs text-white placeholder-zinc-500 focus:outline-none focus:ring-1 focus:ring-blue-500";
const primaryBtn = "rounded-lg bg-blue-600 px-3.5 py-2 text-xs font-semibold text-white hover:bg-blue-500 transition-colors disabled:opacity-40";
const secondaryBtn = "rounded-lg border border-white/10 bg-white/[0.04] px-3 py-2 text-xs font-medium text-zinc-200 hover:bg-white/10 transition-colors disabled:opacity-40";

function stageLabel(stage: LeadStage): string {
  return STAGES.find((s) => s.id === stage)?.label ?? stage;
}

function errorMessage(e: unknown, fallback: string): string {
  return e instanceof Error && e.message ? e.message : fallback;
}

export default function CrmOutreachPanel({ authedFetch }: Props) {
  const [leads, setLeads] = useState<CrmLead[]>([]);
  const [stats, setStats] = useState<CrmStats | null>(null);
  const [loading, setLoading] = useState(true);
  const [loadError, setLoadError] = useState("");
  const [notice, setNotice] = useState("");
  const [view, setView] = useState<"leads" | "board" | "templates">("leads");
  const [filterStage, setFilterStage] = useState<string>("all");
  const [searchQuery, setSearchQuery] = useState("");
  const [discovering, setDiscovering] = useState(false);

  const [selectedLead, setSelectedLead] = useState<CrmLead | null>(null);
  const [activities, setActivities] = useState<CrmActivity[]>([]);
  const [detailLoading, setDetailLoading] = useState(false);
  const [detailNotice, setDetailNotice] = useState("");
  const [draft, setDraft] = useState<{ subject: string; body: string; missingVariables: string[] } | null>(null);
  const [draftStep, setDraftStep] = useState(1);

  const [templates, setTemplates] = useState<OutreachTemplate[]>([]);
  const [templateDraft, setTemplateDraft] = useState<OutreachTemplate[]>([]);
  const [savingTemplates, setSavingTemplates] = useState(false);

  const [showAdd, setShowAdd] = useState(false);
  const [addForm, setAddForm] = useState({ name: "", email: "", company: "", domain: "", title: "", dealValue: "" });
  const [adding, setAdding] = useState(false);

  const [showReply, setShowReply] = useState(false);
  const [replyText, setReplyText] = useState("");
  const [replySentiment, setReplySentiment] = useState<ReplySentiment>("interested");
  const [savingReply, setSavingReply] = useState(false);

  const refreshData = useCallback(async () => {
    try {
      setLoading(true);
      setLoadError("");
      const res = await authedFetch("/api/crm/leads");
      setLeads(res.leads || []);
      setStats(res.stats || null);
    } catch (e) {
      setLoadError(errorMessage(e, "Leads could not be loaded. Retry, or contact hello@gothreadly.live if this continues."));
    } finally {
      setLoading(false);
    }
  }, [authedFetch]);

  const loadTemplates = useCallback(async () => {
    try {
      const res = await authedFetch("/api/crm/outreach");
      setTemplates(res.templates || []);
      setTemplateDraft(res.templates || []);
    } catch {
      // Templates are optional for the directory view; the tab shows its own state.
    }
  }, [authedFetch]);

  useEffect(() => {
    refreshData();
    loadTemplates();
  }, [refreshData, loadTemplates]);

  const loadDraft = useCallback(async (lead: CrmLead, step: number) => {
    try {
      const res = await authedFetch("/api/crm/outreach", {
        method: "POST",
        body: JSON.stringify({ action: "preview", leadId: lead.id, step }),
      });
      setDraft({ subject: res.subject, body: res.body, missingVariables: res.missingVariables || [] });
    } catch (e) {
      setDraft(null);
      setDetailNotice(errorMessage(e, "The draft could not be prepared."));
    }
  }, [authedFetch]);

  const openLead = useCallback(async (lead: CrmLead) => {
    setSelectedLead(lead);
    setDetailNotice("");
    setDraft(null);
    setDetailLoading(true);
    const step = Math.min(Math.max(lead.sequenceStep + 1, 1), Math.max(templates.length, 1));
    setDraftStep(step);
    try {
      const res = await authedFetch(`/api/crm/leads/${lead.id}`);
      setActivities(res.activities || []);
      if (res.lead) setSelectedLead(res.lead);
      await loadDraft(lead, step);
    } catch (e) {
      setDetailNotice(errorMessage(e, "Lead details could not be loaded."));
    } finally {
      setDetailLoading(false);
    }
  }, [authedFetch, loadDraft, templates.length]);

  async function discover() {
    setDiscovering(true);
    setNotice("");
    try {
      const res = await authedFetch("/api/crm/discover", { method: "POST" });
      const n = res.discovered || 0;
      setNotice(n
        ? `${n} lead${n === 1 ? "" : "s"} added from scan results. Each lead records what was observed; add a verified contact before outreach.`
        : "No new leads found. Leads are added only for tracked competitors or web results that appear in completed scans.");
      await refreshData();
    } catch (e) {
      setNotice(errorMessage(e, "Lead discovery failed. Retry, or contact hello@gothreadly.live."));
    } finally {
      setDiscovering(false);
    }
  }

  async function createLead(e: React.FormEvent) {
    e.preventDefault();
    setAdding(true);
    try {
      await authedFetch("/api/crm/leads", {
        method: "POST",
        body: JSON.stringify({
          name: addForm.name,
          email: addForm.email,
          company: addForm.company,
          domain: addForm.domain,
          title: addForm.title || undefined,
          dealValue: addForm.dealValue ? Number(addForm.dealValue) : undefined,
          source: "manual",
        }),
      });
      setShowAdd(false);
      setAddForm({ name: "", email: "", company: "", domain: "", title: "", dealValue: "" });
      setNotice("Lead added.");
      await refreshData();
    } catch (err) {
      setNotice(errorMessage(err, "The lead could not be added."));
    } finally {
      setAdding(false);
    }
  }

  async function updateStage(leadId: string, stage: LeadStage) {
    try {
      const res = await authedFetch(`/api/crm/leads/${leadId}`, { method: "PATCH", body: JSON.stringify({ stage }) });
      if (selectedLead?.id === leadId && res.lead) setSelectedLead(res.lead);
      await refreshData();
    } catch (e) {
      setDetailNotice(errorMessage(e, "The stage could not be updated."));
    }
  }

  async function deleteLead(leadId: string) {
    if (!confirm("Delete this lead and its activity history? This cannot be undone.")) return;
    try {
      await authedFetch(`/api/crm/leads/${leadId}`, { method: "DELETE" });
      setSelectedLead(null);
      setNotice("Lead deleted.");
      await refreshData();
    } catch (e) {
      setNotice(errorMessage(e, "The lead could not be deleted."));
    }
  }

  async function saveReply() {
    if (!selectedLead || !replyText.trim()) return;
    setSavingReply(true);
    try {
      const res = await authedFetch("/api/crm/outreach", {
        method: "POST",
        body: JSON.stringify({ action: "reply", leadId: selectedLead.id, replyText, sentiment: replySentiment }),
      });
      setShowReply(false);
      setReplyText("");
      if (res.lead) await openLead(res.lead);
      setDetailNotice("Reply recorded. Any scheduled follow-up for this lead was cleared.");
      await refreshData();
    } catch (e) {
      setDetailNotice(errorMessage(e, "The reply could not be recorded."));
    } finally {
      setSavingReply(false);
    }
  }

  async function saveTemplates() {
    setSavingTemplates(true);
    setNotice("");
    try {
      const res = await authedFetch("/api/crm/outreach", { method: "PUT", body: JSON.stringify({ templates: templateDraft }) });
      setTemplates(res.templates || templateDraft);
      setTemplateDraft(res.templates || templateDraft);
      setNotice("Templates saved.");
    } catch (e) {
      setNotice(errorMessage(e, "Templates could not be saved."));
    } finally {
      setSavingTemplates(false);
    }
  }

  async function copyDraft() {
    if (!draft) return;
    try {
      await navigator.clipboard.writeText(`Subject: ${draft.subject}\n\n${draft.body}`);
      setDetailNotice("Draft copied.");
    } catch {
      setDetailNotice("Copy is not available in this browser. Select the text to copy it.");
    }
  }

  const filteredLeads = useMemo(() => {
    const q = searchQuery.trim().toLowerCase();
    return leads.filter((lead) => {
      if (filterStage !== "all" && lead.stage !== filterStage) return false;
      if (!q) return true;
      return [lead.name, lead.company, lead.domain, lead.email].some((v) => (v || "").toLowerCase().includes(q));
    });
  }, [leads, filterStage, searchQuery]);

  const templatesDirty = JSON.stringify(templates) !== JSON.stringify(templateDraft);
  const qualifiedCount = leads.filter((l) => l.stage === "qualified").length;

  return (
    <div className="space-y-6">
      <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
        <div>
          <h2 className="text-xl font-semibold tracking-tight text-white">Leads</h2>
          <p className="mt-1 text-sm text-zinc-400">
            Candidate accounts and their history. Drafts here are for review; sending runs through approved Outbound campaigns.
          </p>
        </div>
        <div className="flex flex-wrap items-center gap-2">
          <button onClick={discover} disabled={discovering} className={secondaryBtn}>
            {discovering ? "Searching scan results..." : "Find leads in scan results"}
          </button>
          <button onClick={() => setShowAdd(true)} className={primaryBtn}>Add lead</button>
        </div>
      </div>

      {notice && (
        <p role="status" className="rounded-lg border border-white/10 bg-white/[0.03] px-3 py-2 text-sm text-zinc-300">{notice}</p>
      )}

      {stats && (
        <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
          {[
            { label: "Leads", value: String(stats.totalLeads), hint: "In this workspace" },
            { label: "Replied", value: String(stats.repliedCount), hint: `Of ${stats.totalLeads} leads` },
            { label: "Qualified", value: String(qualifiedCount), hint: `Of ${stats.totalLeads} leads` },
            { label: "Entered deal value", value: `$${stats.totalPipelineValue.toLocaleString()}`, hint: "Sum of values entered on leads" },
          ].map((card) => (
            <div key={card.label} className="rounded-xl border border-white/10 bg-white/[0.03] p-3.5">
              <p className="text-xs font-medium uppercase text-zinc-400">{card.label}</p>
              <p className="mt-1 text-2xl font-bold text-white">{card.value}</p>
              <p className="mt-0.5 text-xs text-zinc-500">{card.hint}</p>
            </div>
          ))}
        </div>
      )}

      <div className="flex flex-col gap-3 border-b border-white/10 pb-3 sm:flex-row sm:items-center sm:justify-between">
        <div className="flex items-center gap-1" role="tablist" aria-label="Leads views">
          {([
            ["leads", `Directory (${filteredLeads.length})`],
            ["board", "Pipeline"],
            ["templates", `Templates (${templates.length})`],
          ] as const).map(([id, label]) => (
            <button
              key={id}
              role="tab"
              aria-selected={view === id}
              onClick={() => setView(id)}
              className={`rounded-lg px-3 py-1.5 text-xs font-semibold transition-colors ${view === id ? "bg-white/15 text-white" : "text-zinc-400 hover:text-white"}`}
            >
              {label}
            </button>
          ))}
        </div>
        {view !== "templates" && (
          <div className="flex items-center gap-2">
            <input
              type="search"
              aria-label="Search leads"
              placeholder="Search company, domain or email"
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              className="w-52 rounded-lg border border-white/10 bg-white/[0.04] px-3 py-1.5 text-xs text-white placeholder-zinc-500 focus:outline-none focus:ring-1 focus:ring-blue-500"
            />
            <select
              aria-label="Filter by stage"
              value={filterStage}
              onChange={(e) => setFilterStage(e.target.value)}
              className="rounded-lg border border-white/10 bg-zinc-900 px-2.5 py-1.5 text-xs text-zinc-300 focus:outline-none"
            >
              <option value="all">All stages</option>
              {STAGES.map((s) => <option key={s.id} value={s.id}>{s.label}</option>)}
            </select>
          </div>
        )}
      </div>

      {loading ? (
        <p className="py-16 text-center text-sm text-zinc-500">Loading leads...</p>
      ) : loadError ? (
        <div className="rounded-xl border border-rose-500/20 bg-rose-500/10 p-4 text-sm text-rose-300">
          <p>{loadError}</p>
          <button onClick={refreshData} className={`${secondaryBtn} mt-3`}>Retry</button>
        </div>
      ) : view === "templates" ? (
        <div className="space-y-4">
          <p className="text-xs text-zinc-400">
            Available fields: {"{{firstName}}"}, {"{{fullName}}"}, {"{{company}}"}, {"{{domain}}"}, {"{{title}}"}, {"{{competitorName}}"}, {"{{queryText}}"}, {"{{category}}"}, {"{{senderCompany}}"}.
            A field with no recorded value stays visible in the draft so nothing is filled in by guesswork.
          </p>
          <div className="grid gap-4 md:grid-cols-2">
            {templateDraft.map((tpl, index) => (
              <div key={index} className="space-y-2 rounded-xl border border-white/10 bg-white/[0.03] p-4">
                <div className="flex items-center justify-between gap-2">
                  <span className="text-xs font-semibold text-zinc-300">Step {index + 1}</span>
                  <label className="flex items-center gap-2 text-xs text-zinc-400">
                    Wait (days)
                    <input
                      type="number"
                      min={0}
                      max={60}
                      value={tpl.delayDays}
                      onChange={(e) => setTemplateDraft(templateDraft.map((t, i) => i === index ? { ...t, delayDays: Number(e.target.value) } : t))}
                      className="w-16 rounded-lg border border-white/10 bg-zinc-900 px-2 py-1 text-xs text-white"
                    />
                  </label>
                </div>
                <input aria-label={`Step ${index + 1} name`} className={inputCls} value={tpl.name}
                  onChange={(e) => setTemplateDraft(templateDraft.map((t, i) => i === index ? { ...t, name: e.target.value } : t))} />
                <input aria-label={`Step ${index + 1} subject`} className={inputCls} value={tpl.subject}
                  onChange={(e) => setTemplateDraft(templateDraft.map((t, i) => i === index ? { ...t, subject: e.target.value } : t))} />
                <textarea aria-label={`Step ${index + 1} body`} rows={8} className={inputCls} value={tpl.body}
                  onChange={(e) => setTemplateDraft(templateDraft.map((t, i) => i === index ? { ...t, body: e.target.value } : t))} />
              </div>
            ))}
          </div>
          <div className="flex items-center justify-end gap-2">
            <button className={secondaryBtn} disabled={!templatesDirty || savingTemplates} onClick={() => setTemplateDraft(templates)}>Discard changes</button>
            <button className={primaryBtn} disabled={!templatesDirty || savingTemplates} onClick={saveTemplates}>
              {savingTemplates ? "Saving..." : "Save templates"}
            </button>
          </div>
        </div>
      ) : view === "board" ? (
        <div className="grid grid-cols-1 gap-3 overflow-x-auto pb-4 md:grid-cols-4 xl:grid-cols-8">
          {STAGES.map((col) => {
            const colLeads = filteredLeads.filter((l) => l.stage === col.id);
            return (
              <div key={col.id} className="flex min-w-[180px] flex-col rounded-xl border border-white/10 bg-zinc-950/60 p-3">
                <div className="flex items-center justify-between border-b border-white/5 pb-2">
                  <span className="text-xs font-semibold text-zinc-200">{col.label}</span>
                  <span className="font-mono text-xs text-zinc-500">{colLeads.length}</span>
                </div>
                <div className="mt-3 flex-1 space-y-2">
                  {colLeads.map((lead) => (
                    <button
                      key={lead.id}
                      onClick={() => openLead(lead)}
                      className="w-full rounded-lg border border-white/10 bg-white/[0.03] p-3 text-left transition-colors hover:border-blue-500/50"
                    >
                      <p className="truncate text-xs font-semibold text-white">{lead.company}</p>
                      <p className="mt-0.5 truncate text-[11px] text-zinc-400">{lead.email || "No contact yet"}</p>
                      {lead.dealValue ? <p className="mt-1 text-xs text-zinc-300">${lead.dealValue.toLocaleString()}</p> : null}
                    </button>
                  ))}
                  {colLeads.length === 0 && <p className="py-4 text-center text-[11px] text-zinc-600">None</p>}
                </div>
              </div>
            );
          })}
        </div>
      ) : (
        <div className="overflow-x-auto rounded-xl border border-white/10 bg-white/[0.02]">
          <table className="w-full text-left text-xs text-zinc-300">
            <thead className="border-b border-white/10 bg-white/[0.03] text-[11px] uppercase tracking-wider text-zinc-400">
              <tr>
                <th scope="col" className="px-4 py-3">Company and contact</th>
                <th scope="col" className="px-3 py-3">Stage</th>
                <th scope="col" className="px-3 py-3">Source</th>
                <th scope="col" className="px-3 py-3">Last updated</th>
                <th scope="col" className="px-3 py-3">Deal value</th>
                <th scope="col" className="px-4 py-3 text-right">Actions</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-white/5">
              {filteredLeads.map((lead) => (
                <tr key={lead.id} className="hover:bg-white/[0.03]">
                  <td className="px-4 py-3">
                    <div className="font-semibold text-white">{lead.company}</div>
                    <div className="text-[11px] text-zinc-400">
                      {lead.domain}{lead.email ? ` · ${lead.email}` : " · No contact yet"}
                    </div>
                  </td>
                  <td className="px-3 py-3">{stageLabel(lead.stage)}</td>
                  <td className="px-3 py-3 text-zinc-400">{SOURCE_LABELS[lead.source] ?? lead.source}</td>
                  <td className="px-3 py-3 text-zinc-400">{new Date(lead.updatedAt).toLocaleDateString()}</td>
                  <td className="px-3 py-3 font-mono">{lead.dealValue ? `$${lead.dealValue.toLocaleString()}` : "Not set"}</td>
                  <td className="px-4 py-3 text-right">
                    <button onClick={() => openLead(lead)} className="mr-1.5 rounded bg-white/10 px-2 py-1 text-[11px] font-medium text-white hover:bg-white/20">Open</button>
                    <button onClick={() => deleteLead(lead.id)} className="rounded px-2 py-1 text-[11px] text-zinc-400 hover:text-rose-400">Delete</button>
                  </td>
                </tr>
              ))}
              {filteredLeads.length === 0 && (
                <tr>
                  <td colSpan={6} className="px-4 py-12 text-center text-zinc-500">
                    {leads.length ? "No leads match these filters." : "No leads yet. Add a lead, or find leads in completed scan results."}
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </div>
      )}

      {selectedLead && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/80 p-4 backdrop-blur-sm" role="dialog" aria-modal="true" aria-label={`Lead: ${selectedLead.company}`}>
          <div className="relative max-h-[90vh] w-full max-w-4xl overflow-y-auto rounded-2xl border border-white/15 bg-zinc-950 p-6 shadow-2xl">
            <div className="flex flex-wrap items-start justify-between gap-3 border-b border-white/10 pb-4">
              <div>
                <h3 className="text-lg font-bold text-white">{selectedLead.company}</h3>
                <p className="mt-1 text-xs text-zinc-400">
                  {selectedLead.domain}
                  {selectedLead.email ? ` · ${selectedLead.name}${selectedLead.title ? `, ${selectedLead.title}` : ""} · ${selectedLead.email}` : " · No verified contact recorded"}
                </p>
              </div>
              <div className="flex items-center gap-2">
                <select
                  aria-label="Lead stage"
                  value={selectedLead.stage}
                  onChange={(e) => updateStage(selectedLead.id, e.target.value as LeadStage)}
                  className="rounded-lg border border-white/10 bg-zinc-900 px-2.5 py-1.5 text-xs text-zinc-200"
                >
                  {STAGES.map((s) => <option key={s.id} value={s.id}>{s.label}</option>)}
                </select>
                <button onClick={() => setShowReply(true)} className={secondaryBtn}>Record reply</button>
                <button onClick={() => setSelectedLead(null)} className={secondaryBtn}>Close</button>
              </div>
            </div>

            {detailNotice && <p role="status" className="mt-4 rounded-lg border border-white/10 bg-white/[0.03] px-3 py-2 text-xs text-zinc-300">{detailNotice}</p>}

            <div className="mt-6 grid grid-cols-1 gap-6 lg:grid-cols-2">
              <section className="space-y-3 rounded-xl border border-white/10 bg-white/[0.02] p-4">
                <div className="flex items-center justify-between gap-2">
                  <h4 className="text-xs font-bold uppercase tracking-wider text-zinc-400">Draft</h4>
                  <select
                    aria-label="Template step"
                    value={draftStep}
                    onChange={(e) => { const s = Number(e.target.value); setDraftStep(s); loadDraft(selectedLead, s); }}
                    className="rounded-lg border border-white/10 bg-zinc-900 px-2 py-1 text-xs text-zinc-200"
                  >
                    {templates.map((t, i) => <option key={i} value={i + 1}>Step {i + 1}: {t.name}</option>)}
                  </select>
                </div>
                {detailLoading && !draft ? (
                  <p className="text-xs text-zinc-500">Preparing draft...</p>
                ) : draft ? (
                  <>
                    <p className="rounded border border-white/5 bg-black/30 p-2 font-mono text-xs text-zinc-200">Subject: {draft.subject}</p>
                    <pre className="max-h-64 overflow-y-auto whitespace-pre-wrap rounded border border-white/5 bg-black/20 p-2.5 font-sans text-xs text-zinc-300">{draft.body}</pre>
                    {draft.missingVariables.length > 0 && (
                      <p className="text-xs text-amber-300">
                        Not recorded for this lead: {draft.missingVariables.join(", ")}. Add the information or edit the template before using this draft.
                      </p>
                    )}
                    <div className="flex items-center justify-between gap-2 pt-1">
                      <p className="text-[11px] text-zinc-500">To send, enroll this contact in an approved Outbound campaign.</p>
                      <button onClick={copyDraft} className={secondaryBtn}>Copy draft</button>
                    </div>
                  </>
                ) : (
                  <p className="text-xs text-zinc-500">No draft available.</p>
                )}
              </section>

              <div className="space-y-4">
                {selectedLead.geoGap?.identifiedGap && (
                  <section className="space-y-1 rounded-xl border border-white/10 bg-white/[0.02] p-3.5">
                    <h4 className="text-xs font-bold uppercase tracking-wider text-zinc-400">Scan observation</h4>
                    {selectedLead.geoGap.queryText && <p className="text-xs text-zinc-300">Question: &ldquo;{selectedLead.geoGap.queryText}&rdquo;</p>}
                    <p className="text-xs text-zinc-400">{selectedLead.geoGap.identifiedGap}</p>
                  </section>
                )}
                {selectedLead.notes && (
                  <section className="space-y-1 rounded-xl border border-white/10 bg-white/[0.02] p-3.5">
                    <h4 className="text-xs font-bold uppercase tracking-wider text-zinc-400">Notes</h4>
                    <p className="whitespace-pre-wrap text-xs text-zinc-300">{selectedLead.notes}</p>
                  </section>
                )}
                <section className="space-y-3 rounded-xl border border-white/10 bg-white/[0.02] p-4">
                  <h4 className="text-xs font-bold uppercase tracking-wider text-zinc-400">Activity</h4>
                  {detailLoading ? (
                    <p className="text-xs text-zinc-500">Loading activity...</p>
                  ) : (
                    <ol className="max-h-56 space-y-2.5 overflow-y-auto">
                      {activities.map((act) => (
                        <li key={act.id} className="border-l-2 border-white/15 py-1 pl-3 text-xs">
                          <div className="flex items-center justify-between gap-2">
                            <span className="font-semibold text-white">{act.title}</span>
                            <time className="shrink-0 text-[10px] text-zinc-500" dateTime={act.timestamp}>{new Date(act.timestamp).toLocaleString()}</time>
                          </div>
                          <p className="mt-0.5 text-[11px] text-zinc-400">{act.detail}</p>
                          <p className="text-[10px] text-zinc-600">{act.actor}</p>
                        </li>
                      ))}
                      {activities.length === 0 && <p className="text-xs text-zinc-600">No activity recorded yet.</p>}
                    </ol>
                  )}
                </section>
              </div>
            </div>
          </div>
        </div>
      )}

      {showAdd && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/80 p-4 backdrop-blur-sm" role="dialog" aria-modal="true" aria-label="Add lead">
          <div className="w-full max-w-md rounded-2xl border border-white/15 bg-zinc-950 p-6 shadow-2xl">
            <h3 className="text-base font-bold text-white">Add lead</h3>
            <p className="mt-1 text-xs text-zinc-400">Adding a lead does not contact anyone.</p>
            <form onSubmit={createLead} className="mt-4 space-y-3">
              {([
                ["company", "Company name", "text", true],
                ["domain", "Website domain", "text", true],
                ["name", "Contact name", "text", true],
                ["email", "Contact email", "email", false],
                ["title", "Job title", "text", false],
                ["dealValue", "Deal value (USD)", "number", false],
              ] as const).map(([key, label, type, required]) => (
                <label key={key} className="block">
                  <span className="mb-1 block text-[11px] text-zinc-400">{label}{required ? "" : " (optional)"}</span>
                  <input
                    type={type}
                    required={required}
                    min={type === "number" ? 0 : undefined}
                    value={addForm[key]}
                    onChange={(e) => setAddForm({ ...addForm, [key]: e.target.value })}
                    className={inputCls}
                  />
                </label>
              ))}
              <div className="flex items-center justify-end gap-2 pt-3">
                <button type="button" onClick={() => setShowAdd(false)} className={secondaryBtn}>Cancel</button>
                <button type="submit" disabled={adding} className={primaryBtn}>{adding ? "Adding..." : "Add lead"}</button>
              </div>
            </form>
          </div>
        </div>
      )}

      {showReply && selectedLead && (
        <div className="fixed inset-0 z-[60] flex items-center justify-center bg-black/80 p-4 backdrop-blur-sm" role="dialog" aria-modal="true" aria-label="Record reply">
          <div className="w-full max-w-md rounded-2xl border border-white/15 bg-zinc-950 p-6 shadow-2xl">
            <h3 className="text-base font-bold text-white">Record reply</h3>
            <p className="mt-1 text-xs text-zinc-400">Record a reply received outside Threadly. Recording a reply clears any scheduled follow-up.</p>
            <div className="mt-4 space-y-3">
              <label className="block">
                <span className="mb-1 block text-[11px] text-zinc-400">Outcome</span>
                <select value={replySentiment} onChange={(e) => setReplySentiment(e.target.value as ReplySentiment)} className={inputCls}>
                  <option value="interested">Interested</option>
                  <option value="question">Asked a question</option>
                  <option value="booked">Meeting booked</option>
                  <option value="not_interested">Not interested</option>
                </select>
              </label>
              <label className="block">
                <span className="mb-1 block text-[11px] text-zinc-400">Reply text</span>
                <textarea rows={5} required value={replyText} onChange={(e) => setReplyText(e.target.value)} className={inputCls} />
              </label>
              {replySentiment === "not_interested" && (
                <p className="text-xs text-zinc-400">If they asked not to be contacted, also add their address to Outbound suppressions.</p>
              )}
              <div className="flex items-center justify-end gap-2 pt-2">
                <button type="button" onClick={() => setShowReply(false)} className={secondaryBtn}>Cancel</button>
                <button type="button" onClick={saveReply} disabled={savingReply || !replyText.trim()} className={primaryBtn}>
                  {savingReply ? "Saving..." : "Save reply"}
                </button>
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
