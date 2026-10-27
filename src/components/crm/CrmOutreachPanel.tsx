"use client";

import { useEffect, useState, useMemo } from "react";
import type { CrmLead, CrmActivity, OutreachTemplate, CrmStats, LeadStage } from "@/lib/crm/types";

interface Props {
  authedFetch: (path: string, init?: RequestInit) => Promise<any>;
}

const STAGES: Array<{ id: LeadStage; label: string; color: string }> = [
  { id: "new", label: "New Lead", color: "bg-blue-500/10 text-blue-400 border-blue-500/20" },
  { id: "in_sequence", label: "In Sequence", color: "bg-amber-500/10 text-amber-400 border-amber-500/20" },
  { id: "follow_up_due", label: "Follow-Up Due", color: "bg-rose-500/10 text-rose-400 border-rose-500/20" },
  { id: "replied", label: "Replied", color: "bg-purple-500/10 text-purple-400 border-purple-500/20" },
  { id: "qualified", label: "Qualified", color: "bg-emerald-500/10 text-emerald-400 border-emerald-500/20" },
  { id: "won", label: "Won", color: "bg-teal-500/10 text-teal-300 border-teal-500/20" },
  { id: "lost", label: "Lost", color: "bg-zinc-500/10 text-zinc-400 border-zinc-500/20" },
];

export default function CrmOutreachPanel({ authedFetch }: Props) {
  const [leads, setLeads] = useState<CrmLead[]>([]);
  const [stats, setStats] = useState<CrmStats | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [activeTab, setActiveTab] = useState<"leads" | "kanban" | "templates">("leads");
  const [selectedLead, setSelectedLead] = useState<CrmLead | null>(null);
  const [activities, setActivities] = useState<CrmActivity[]>([]);
  const [loadingActivities, setLoadingActivities] = useState(false);

  // Email composer / preview state
  const [emailPreview, setEmailPreview] = useState<{ subject: string; body: string } | null>(null);
  const [customSubject, setCustomSubject] = useState("");
  const [customBody, setCustomBody] = useState("");
  const [sendingEmail, setSendingEmail] = useState(false);
  const [templates, setTemplates] = useState<OutreachTemplate[]>([]);

  // Discovery / Batch follow-up state
  const [discovering, setDiscovering] = useState(false);
  const [runningFollowUps, setRunningFollowUps] = useState(false);
  const [filterStage, setFilterStage] = useState<string>("all");
  const [searchQuery, setSearchQuery] = useState("");

  // New Lead Modal state
  const [showAddModal, setShowAddModal] = useState(false);
  const [newLeadName, setNewLeadName] = useState("");
  const [newLeadEmail, setNewLeadEmail] = useState("");
  const [newLeadCompany, setNewLeadCompany] = useState("");
  const [newLeadDomain, setNewLeadDomain] = useState("");
  const [newLeadTitle, setNewLeadTitle] = useState("");
  const [newLeadDealValue, setNewLeadDealValue] = useState("");

  // Reply Logger Modal state
  const [showReplyModal, setShowReplyModal] = useState(false);
  const [replyText, setReplyText] = useState("");
  const [replySentiment, setReplySentiment] = useState<"interested" | "question" | "not_interested" | "booked">("interested");
  const [suggestedReply, setSuggestedReply] = useState("");

  const refreshData = async () => {
    try {
      setLoading(true);
      setError("");
      const res = await authedFetch("/api/crm/leads");
      setLeads(res.leads || []);
      setStats(res.stats || null);
    } catch (e: any) {
      setError(e.message || "Failed to load CRM data.");
    } finally {
      setLoading(false);
    }
  };

  const loadTemplates = async () => {
    try {
      const res = await authedFetch("/api/crm/outreach");
      setTemplates(res.templates || []);
    } catch {
      // non-fatal
    }
  };

  useEffect(() => {
    refreshData();
    loadTemplates();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const openLeadDetail = async (lead: CrmLead) => {
    setSelectedLead(lead);
    setLoadingActivities(true);
    setEmailPreview(null);
    setSuggestedReply("");
    try {
      const res = await authedFetch(`/api/crm/leads/${lead.id}`);
      setActivities(res.activities || []);
      // Load preview of next step
      const nextStep = lead.sequenceStep < 4 ? lead.sequenceStep + 1 : 1;
      const previewRes = await authedFetch("/api/crm/outreach", {
        method: "POST",
        body: JSON.stringify({ action: "preview", leadId: lead.id, step: nextStep }),
      });
      setEmailPreview({ subject: previewRes.subject, body: previewRes.body });
      setCustomSubject(previewRes.subject);
      setCustomBody(previewRes.body);
    } catch (e: any) {
      console.warn("Error loading lead activities:", e);
    } finally {
      setLoadingActivities(false);
    }
  };

  const handleDispatchStep = async () => {
    if (!selectedLead) return;
    setSendingEmail(true);
    try {
      const nextStep = selectedLead.sequenceStep < 4 ? selectedLead.sequenceStep + 1 : 1;
      const res = await authedFetch("/api/crm/outreach", {
        method: "POST",
        body: JSON.stringify({
          action: "dispatch",
          leadId: selectedLead.id,
          step: nextStep,
          subject: customSubject,
          body: customBody,
        }),
      });
      if (res.lead) {
        setSelectedLead(res.lead);
        await openLeadDetail(res.lead);
        await refreshData();
      }
    } catch (e: any) {
      alert(e.message || "Failed to dispatch email.");
    } finally {
      setSendingEmail(false);
    }
  };

  const handleRecordReply = async () => {
    if (!selectedLead || !replyText.trim()) return;
    try {
      const res = await authedFetch("/api/crm/outreach", {
        method: "POST",
        body: JSON.stringify({
          action: "reply",
          leadId: selectedLead.id,
          replyText,
          sentiment: replySentiment,
        }),
      });
      setShowReplyModal(false);
      setReplyText("");
      setSuggestedReply(res.suggestedReply || "");
      if (res.lead) {
        setSelectedLead(res.lead);
        await openLeadDetail(res.lead);
        await refreshData();
      }
    } catch (e: any) {
      alert(e.message || "Failed to log reply.");
    }
  };

  const handleDiscoverLeads = async () => {
    setDiscovering(true);
    try {
      const res = await authedFetch("/api/crm/discover", { method: "POST" });
      alert(`Discovered and enrolled ${res.discovered || 0} target lead(s) from GEO query citations!`);
      await refreshData();
    } catch (e: any) {
      alert(e.message || "Failed to discover leads.");
    } finally {
      setDiscovering(false);
    }
  };

  const handleRunBatchFollowUps = async () => {
    setRunningFollowUps(true);
    try {
      const res = await authedFetch("/api/crm/cron", { method: "POST" });
      alert(`Processed ${res.processed || 0} due follow-up touchpoint(s).`);
      await refreshData();
    } catch (e: any) {
      alert(e.message || "Failed to run follow-ups.");
    } finally {
      setRunningFollowUps(false);
    }
  };

  const handleCreateLead = async (e: React.FormEvent) => {
    e.preventDefault();
    try {
      await authedFetch("/api/crm/leads", {
        method: "POST",
        body: JSON.stringify({
          name: newLeadName,
          email: newLeadEmail,
          company: newLeadCompany,
          domain: newLeadDomain,
          title: newLeadTitle,
          dealValue: newLeadDealValue ? Number(newLeadDealValue) : undefined,
          source: "manual",
        }),
      });
      setShowAddModal(false);
      setNewLeadName("");
      setNewLeadEmail("");
      setNewLeadCompany("");
      setNewLeadDomain("");
      setNewLeadTitle("");
      setNewLeadDealValue("");
      await refreshData();
    } catch (err: any) {
      alert(err.message || "Failed to create lead.");
    }
  };

  const handleUpdateStage = async (leadId: string, stage: LeadStage) => {
    try {
      await authedFetch(`/api/crm/leads/${leadId}`, {
        method: "PATCH",
        body: JSON.stringify({ stage }),
      });
      await refreshData();
      if (selectedLead && selectedLead.id === leadId) {
        setSelectedLead({ ...selectedLead, stage });
      }
    } catch (e: any) {
      alert(e.message || "Failed to update stage.");
    }
  };

  const handleDeleteLead = async (leadId: string) => {
    if (!confirm("Are you sure you want to delete this lead?")) return;
    try {
      await authedFetch(`/api/crm/leads/${leadId}`, { method: "DELETE" });
      setSelectedLead(null);
      await refreshData();
    } catch (e: any) {
      alert(e.message || "Failed to delete lead.");
    }
  };

  const filteredLeads = useMemo(() => {
    return leads.filter((lead) => {
      if (filterStage !== "all" && lead.stage !== filterStage) return false;
      if (searchQuery.trim()) {
        const q = searchQuery.toLowerCase();
        return (
          lead.name.toLowerCase().includes(q) ||
          lead.company.toLowerCase().includes(q) ||
          lead.domain.toLowerCase().includes(q) ||
          lead.email.toLowerCase().includes(q)
        );
      }
      return true;
    });
  }, [leads, filterStage, searchQuery]);

  return (
    <div className="space-y-6">
      {/* Header and Top Actions */}
      <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
        <div>
          <h2 className="text-xl font-semibold tracking-tight text-white">
            <span>Leads &amp; Outreach</span>
          </h2>
          <p className="mt-1 text-sm text-zinc-400">
            Track leads, sequences and follow-ups for your outreach pipeline.
          </p>
        </div>

        <div className="flex flex-wrap items-center gap-2.5">
          <button
            onClick={handleDiscoverLeads}
            disabled={discovering}
            className="flex items-center gap-2 rounded-lg border border-purple-500/30 bg-purple-500/10 px-3 py-2 text-xs font-medium text-purple-300 hover:bg-purple-500/20 transition-colors"
          >
            <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
              <circle cx="11" cy="11" r="8" />
              <path d="m21 21-4.3-4.3" />
              <path d="M11 8v6M8 11h6" />
            </svg>
            <span>{discovering ? "Scanning..." : "Discover Targets from Citations"}</span>
          </button>

          <button
            onClick={handleRunBatchFollowUps}
            disabled={runningFollowUps}
            className="flex items-center gap-2 rounded-lg border border-emerald-500/30 bg-emerald-500/10 px-3 py-2 text-xs font-medium text-emerald-300 hover:bg-emerald-500/20 transition-colors"
          >
            <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
              <path d="m22 2-7 20-4-9-9-4Z" />
              <path d="M22 2 11 13" />
            </svg>
            <span>{runningFollowUps ? "Dispatching..." : `Execute Due Follow-ups (${stats?.followUpsDue || 0})`}</span>
          </button>

          <button
            onClick={() => setShowAddModal(true)}
            className="flex items-center gap-1.5 rounded-lg bg-blue-600 px-3.5 py-2 text-xs font-semibold text-white shadow-sm hover:bg-blue-500 transition-colors"
          >
            <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
              <path d="M12 5v14M5 12h14" />
            </svg>
            <span>Add Target</span>
          </button>
        </div>
      </div>

      {/* KPI Stats Cards */}
      {stats && (
        <div className="grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-6">
          <div className="rounded-xl border border-white/10 bg-white/[0.03] p-3.5">
            <p className="text-xs font-medium text-zinc-400 uppercase">Total Leads</p>
            <p className="mt-1 text-2xl font-bold text-white">{stats.totalLeads}</p>
          </div>
          <div className="rounded-xl border border-white/10 bg-white/[0.03] p-3.5">
            <p className="text-xs font-medium text-amber-400 uppercase">In Sequence</p>
            <p className="mt-1 text-2xl font-bold text-amber-300">{stats.activeInSequence}</p>
          </div>
          <div className="rounded-xl border border-white/10 bg-white/[0.03] p-3.5">
            <p className="text-xs font-medium text-rose-400 uppercase">Follow-Ups Due</p>
            <p className="mt-1 text-2xl font-bold text-rose-400">{stats.followUpsDue}</p>
          </div>
          <div className="rounded-xl border border-white/10 bg-white/[0.03] p-3.5">
            <p className="text-xs font-medium text-purple-400 uppercase">Replied</p>
            <p className="mt-1 text-2xl font-bold text-purple-300">{stats.repliedCount}</p>
          </div>
          <div className="rounded-xl border border-white/10 bg-white/[0.03] p-3.5">
            <p className="text-xs font-medium text-teal-400 uppercase">Deals Won</p>
            <p className="mt-1 text-2xl font-bold text-teal-300">{stats.wonCount}</p>
          </div>
          <div className="rounded-xl border border-white/10 bg-white/[0.03] p-3.5">
            <p className="text-xs font-medium text-zinc-400 uppercase">Pipeline Value</p>
            <p className="mt-1 text-2xl font-bold text-emerald-400">${stats.totalPipelineValue.toLocaleString()}</p>
          </div>
        </div>
      )}

      {/* View Switcher and Filters */}
      <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between border-b border-white/10 pb-3">
        <div className="flex items-center gap-2">
          <button
            onClick={() => setActiveTab("leads")}
            className={`flex items-center gap-1.5 rounded-lg px-3 py-1.5 text-xs font-semibold transition-colors ${
              activeTab === "leads" ? "bg-white/15 text-white" : "text-zinc-400 hover:text-white"
            }`}
          >
            <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
              <path d="M8 6h13M8 12h13M8 18h13M3 6h.01M3 12h.01M3 18h.01" />
            </svg>
            <span>Lead Directory ({filteredLeads.length})</span>
          </button>
          <button
            onClick={() => setActiveTab("kanban")}
            className={`flex items-center gap-1.5 rounded-lg px-3 py-1.5 text-xs font-semibold transition-colors ${
              activeTab === "kanban" ? "bg-white/15 text-white" : "text-zinc-400 hover:text-white"
            }`}
          >
            <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
              <rect width="18" height="18" x="3" y="3" rx="2" />
              <path d="M9 3v18M15 3v18" />
            </svg>
            <span>Pipeline Board</span>
          </button>
          <button
            onClick={() => setActiveTab("templates")}
            className={`flex items-center gap-1.5 rounded-lg px-3 py-1.5 text-xs font-semibold transition-colors ${
              activeTab === "templates" ? "bg-white/15 text-white" : "text-zinc-400 hover:text-white"
            }`}
          >
            <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
              <rect width="20" height="16" x="2" y="4" rx="2" />
              <path d="m22 7-8.97 5.7a1.94 1.94 0 0 1-2.06 0L2 7" />
            </svg>
            <span>Sequence Cadence ({templates.length} Steps)</span>
          </button>
        </div>

        {activeTab !== "templates" && (
          <div className="flex items-center gap-2">
            <input
              type="text"
              placeholder="Search company or email..."
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              className="rounded-lg border border-white/10 bg-white/[0.04] px-3 py-1.5 text-xs text-white placeholder-zinc-500 focus:outline-none focus:ring-1 focus:ring-blue-500 w-44"
            />
            <select
              value={filterStage}
              onChange={(e) => setFilterStage(e.target.value)}
              className="rounded-lg border border-white/10 bg-zinc-900 px-2.5 py-1.5 text-xs text-zinc-300 focus:outline-none"
            >
              <option value="all">All Stages</option>
              {STAGES.map((s) => (
                <option key={s.id} value={s.id}>
                  {s.label}
                </option>
              ))}
            </select>
          </div>
        )}
      </div>

      {/* Main Content Area */}
      {loading ? (
        <div className="py-16 text-center text-sm text-zinc-500">Loading CRM leads and outreach status...</div>
      ) : error ? (
        <div className="rounded-xl border border-rose-500/20 bg-rose-500/10 p-4 text-xs text-rose-300">{error}</div>
      ) : activeTab === "templates" ? (
        <div className="space-y-4">
          <div className="rounded-xl border border-white/10 bg-white/[0.02] p-4">
            <h3 className="text-sm font-semibold text-white">Automated 4-Step GEO Outreach Sequence</h3>
            <p className="mt-1 text-xs text-zinc-400">
              Each step delivers high-converting personalization variables: <code className="text-blue-400">{"{{firstName}}"}</code>, <code className="text-blue-400">{"{{company}}"}</code>, <code className="text-blue-400">{"{{competitorName}}"}</code>, <code className="text-blue-400">{"{{queryText}}"}</code>, and <code className="text-blue-400">{"{{geoScore}}"}</code>.
            </p>
          </div>

          <div className="grid gap-4 md:grid-cols-2">
            {templates.map((tpl) => (
              <div key={tpl.step} className="rounded-xl border border-white/10 bg-white/[0.03] p-4 flex flex-col justify-between">
                <div>
                  <div className="flex items-center justify-between">
                    <span className="rounded-md bg-blue-500/15 px-2 py-0.5 text-xs font-bold text-blue-300">
                      Step {tpl.step}
                    </span>
                    <span className="text-xs text-zinc-400">
                      {tpl.delayDays === 0 ? "Immediate on enrollment" : `Wait ${tpl.delayDays} days`}
                    </span>
                  </div>
                  <h4 className="mt-2 text-sm font-medium text-white">{tpl.name}</h4>
                  <p className="mt-1 text-xs font-mono text-zinc-300 bg-black/40 rounded p-1.5 border border-white/5">
                    Subject: {tpl.subject}
                  </p>
                  <pre className="mt-2 text-xs text-zinc-400 whitespace-pre-wrap font-sans bg-black/20 p-2.5 rounded border border-white/5 max-h-48 overflow-y-auto">
                    {tpl.body}
                  </pre>
                </div>
              </div>
            ))}
          </div>
        </div>
      ) : activeTab === "kanban" ? (
        /* Kanban Board View */
        <div className="grid grid-cols-1 md:grid-cols-4 lg:grid-cols-7 gap-3 overflow-x-auto pb-4">
          {STAGES.map((col) => {
            const colLeads = filteredLeads.filter((l) => l.stage === col.id);
            return (
              <div key={col.id} className="rounded-xl border border-white/10 bg-zinc-950/60 p-3 min-w-[210px] flex flex-col">
                <div className="flex items-center justify-between pb-2 border-b border-white/5">
                  <span className={`text-xs font-semibold px-2 py-0.5 rounded border ${col.color}`}>
                    {col.label}
                  </span>
                  <span className="text-xs text-zinc-500 font-mono">{colLeads.length}</span>
                </div>

                <div className="mt-3 space-y-2.5 flex-1">
                  {colLeads.map((lead) => (
                    <div
                      key={lead.id}
                      onClick={() => openLeadDetail(lead)}
                      className="cursor-pointer rounded-lg border border-white/10 bg-white/[0.03] p-3 hover:border-blue-500/50 hover:bg-white/[0.05] transition-all shadow-sm"
                    >
                      <div className="flex items-center justify-between">
                        <p className="text-xs font-semibold text-white truncate">{lead.company}</p>
                        <span className="text-[10px] font-mono text-zinc-400 bg-white/5 px-1.5 py-0.5 rounded">
                          {lead.score} GEO
                        </span>
                      </div>
                      <p className="text-[11px] text-zinc-400 truncate mt-0.5">{lead.name}</p>
                      {lead.dealValue && (
                        <p className="mt-2 text-xs font-semibold text-emerald-400">
                          ${lead.dealValue.toLocaleString()}
                        </p>
                      )}
                      <div className="mt-2 flex items-center justify-between text-[10px] text-zinc-500">
                        <span>Step {lead.sequenceStep}/4</span>
                        {lead.nextFollowUpAt && (
                          <span className="text-amber-400/80">
                            Due {new Date(lead.nextFollowUpAt).toLocaleDateString(undefined, { month: "short", day: "numeric" })}
                          </span>
                        )}
                      </div>
                    </div>
                  ))}
                  {colLeads.length === 0 && (
                    <p className="text-[11px] text-zinc-600 italic text-center py-4">No leads</p>
                  )}
                </div>
              </div>
            );
          })}
        </div>
      ) : (
        /* Table View */
        <div className="overflow-hidden rounded-xl border border-white/10 bg-white/[0.02]">
          <table className="w-full text-left text-xs text-zinc-300">
            <thead className="border-b border-white/10 bg-white/[0.03] text-[11px] uppercase tracking-wider text-zinc-400">
              <tr>
                <th className="px-4 py-3">Company & Contact</th>
                <th className="px-3 py-3">Stage</th>
                <th className="px-3 py-3">GEO Score / Gap</th>
                <th className="px-3 py-3">Outreach Cadence</th>
                <th className="px-3 py-3">Next Touchpoint</th>
                <th className="px-3 py-3">Deal Value</th>
                <th className="px-4 py-3 text-right">Actions</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-white/5">
              {filteredLeads.map((lead) => {
                const stageObj = STAGES.find((s) => s.id === lead.stage) || STAGES[0];
                return (
                  <tr
                    key={lead.id}
                    className="hover:bg-white/[0.03] transition-colors cursor-pointer"
                    onClick={() => openLeadDetail(lead)}
                  >
                    <td className="px-4 py-3">
                      <div className="font-semibold text-white">{lead.company}</div>
                      <div className="text-[11px] text-zinc-400">
                        {lead.name} • <span className="font-mono text-zinc-500">{lead.email}</span>
                      </div>
                    </td>
                    <td className="px-3 py-3">
                      <span className={`rounded-md px-2 py-0.5 text-[10px] font-semibold border ${stageObj.color}`}>
                        {stageObj.label}
                      </span>
                    </td>
                    <td className="px-3 py-3">
                      <div className="flex items-center gap-1.5">
                        <span className="font-semibold text-white">{lead.score}/100</span>
                        {lead.geoGap?.citationShare !== undefined && (
                          <span className="text-[10px] text-zinc-500">
                            ({lead.geoGap.citationShare}% cited)
                          </span>
                        )}
                      </div>
                      <p className="text-[10px] text-zinc-500 truncate max-w-[180px]">
                        {lead.geoGap?.queryText || lead.domain}
                      </p>
                    </td>
                    <td className="px-3 py-3 font-mono text-[11px]">
                      Step {lead.sequenceStep} of 4
                    </td>
                    <td className="px-3 py-3 text-[11px]">
                      {lead.nextFollowUpAt ? (
                        <span className={new Date(lead.nextFollowUpAt) <= new Date() ? "text-rose-400 font-semibold" : "text-zinc-400"}>
                          {new Date(lead.nextFollowUpAt).toLocaleDateString()}
                        </span>
                      ) : (
                        <span className="text-zinc-600">—</span>
                      )}
                    </td>
                    <td className="px-3 py-3 font-mono font-medium text-emerald-400">
                      {lead.dealValue ? `$${lead.dealValue.toLocaleString()}` : "—"}
                    </td>
                    <td className="px-4 py-3 text-right" onClick={(e) => e.stopPropagation()}>
                      <button
                        onClick={() => openLeadDetail(lead)}
                        className="rounded bg-white/10 px-2 py-1 text-[11px] font-medium text-white hover:bg-white/20 transition-colors mr-1.5"
                      >
                        Outreach
                      </button>
                      <button
                        onClick={() => handleDeleteLead(lead.id)}
                        className="rounded p-1 text-zinc-500 hover:text-rose-400 transition-colors"
                        title="Delete lead"
                      >
                        <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                          <path d="M18 6 6 18M6 6l12 12" />
                        </svg>
                      </button>
                    </td>
                  </tr>
                );
              })}
              {filteredLeads.length === 0 && (
                <tr>
                  <td colSpan={7} className="px-4 py-12 text-center text-zinc-500">
                    No leads yet. Use <strong>"Discover Targets from Citations"</strong> or <strong>"+ Add Target"</strong> to get started.
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </div>
      )}

      {/* Lead Detail & Outreach Modal / Drawer */}
      {selectedLead && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/80 backdrop-blur-sm p-4">
          <div className="relative w-full max-w-4xl max-h-[90vh] overflow-y-auto rounded-2xl border border-white/15 bg-zinc-950 p-6 shadow-2xl">
            {/* Header */}
            <div className="flex items-start justify-between border-b border-white/10 pb-4">
              <div>
                <div className="flex items-center gap-2">
                  <h3 className="text-lg font-bold text-white">{selectedLead.company}</h3>
                  <span className="text-xs text-zinc-400 font-mono">({selectedLead.domain})</span>
                  <select
                    value={selectedLead.stage}
                    onChange={(e) => handleUpdateStage(selectedLead.id, e.target.value as LeadStage)}
                    className="ml-2 rounded-lg border border-white/10 bg-zinc-900 px-2.5 py-1 text-xs text-zinc-200"
                  >
                    {STAGES.map((s) => (
                      <option key={s.id} value={s.id}>
                        {s.label}
                      </option>
                    ))}
                  </select>
                </div>
                <p className="mt-1 text-xs text-zinc-400">
                  Contact: <span className="text-white font-medium">{selectedLead.name}</span> ({selectedLead.title || "Leader"}) • {selectedLead.email}
                </p>
              </div>

              <div className="flex items-center gap-2">
                <button
                  onClick={() => setShowReplyModal(true)}
                  className="flex items-center gap-1.5 rounded-lg border border-purple-500/30 bg-purple-500/10 px-3 py-1.5 text-xs font-semibold text-purple-300 hover:bg-purple-500/20"
                >
                  <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                    <path d="M21 15a2 2 0 0 1-2 2H7l-4 4V5a2 2 0 0 1 2-2h14a2 2 0 0 1 2 2z" />
                  </svg>
                  <span>Log Response</span>
                </button>
                <button
                  onClick={() => setSelectedLead(null)}
                  className="rounded-lg p-1.5 text-zinc-400 hover:bg-white/10 hover:text-white"
                  title="Close"
                >
                  <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                    <path d="M18 6 6 18M6 6l12 12" />
                  </svg>
                </button>
              </div>
            </div>

            {/* Suggested Reply Banner if available */}
            {suggestedReply && (
              <div className="mt-4 rounded-xl border border-purple-500/30 bg-purple-500/10 p-3.5">
                <div className="flex items-center justify-between">
                  <span className="flex items-center gap-1.5 text-xs font-bold text-purple-300">
                    <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                      <circle cx="12" cy="12" r="10" />
                      <path d="M12 16v-4M12 8h.01" />
                    </svg>
                    <span>Suggested Response</span>
                  </span>
                  <button
                    onClick={() => {
                      navigator.clipboard.writeText(suggestedReply);
                      alert("Copied suggested reply to clipboard!");
                    }}
                    className="text-[11px] text-purple-400 hover:underline"
                  >
                    Copy
                  </button>
                </div>
                <pre className="mt-1 text-xs text-zinc-300 whitespace-pre-wrap font-sans bg-black/30 p-2 rounded">
                  {suggestedReply}
                </pre>
              </div>
            )}

            {/* 2-Column Layout: Left = Outreach Action, Right = Timeline & Gaps */}
            <div className="mt-6 grid grid-cols-1 lg:grid-cols-2 gap-6">
              {/* Left Column: Email Composer & Step Dispatcher */}
              <div className="space-y-4 rounded-xl border border-white/10 bg-white/[0.02] p-4">
                <div className="flex items-center justify-between">
                  <h4 className="text-xs font-bold uppercase tracking-wider text-zinc-400">
                    Next Touchpoint (Step {selectedLead.sequenceStep < 4 ? selectedLead.sequenceStep + 1 : 4} of 4)
                  </h4>
                  <span className="text-xs text-zinc-500 font-mono">
                    Cadence: {selectedLead.sequenceStep === 0 ? "Initial" : `Follow-up ${selectedLead.sequenceStep}`}
                  </span>
                </div>

                {emailPreview && (
                  <div className="space-y-3">
                    <div>
                      <label className="text-[11px] text-zinc-400 block mb-1">Subject</label>
                      <input
                        type="text"
                        value={customSubject}
                        onChange={(e) => setCustomSubject(e.target.value)}
                        className="w-full rounded-lg border border-white/10 bg-zinc-900 px-3 py-1.5 text-xs text-white focus:outline-none focus:ring-1 focus:ring-blue-500"
                      />
                    </div>
                    <div>
                      <label className="text-[11px] text-zinc-400 block mb-1">Email Body (AI-Personalized)</label>
                      <textarea
                        rows={8}
                        value={customBody}
                        onChange={(e) => setCustomBody(e.target.value)}
                        className="w-full rounded-lg border border-white/10 bg-zinc-900 p-2.5 text-xs text-zinc-200 font-sans focus:outline-none focus:ring-1 focus:ring-blue-500 whitespace-pre-wrap"
                      />
                    </div>

                    <div className="flex items-center justify-between pt-2">
                      <span className="text-[11px] text-zinc-500">
                        {selectedLead.nextFollowUpAt
                          ? `Scheduled: ${new Date(selectedLead.nextFollowUpAt).toLocaleDateString()}`
                          : "Ready to dispatch"}
                      </span>
                      <button
                        onClick={handleDispatchStep}
                        disabled={sendingEmail}
                        className="rounded-lg bg-blue-600 px-4 py-2 text-xs font-semibold text-white shadow-sm hover:bg-blue-500 transition-colors"
                      >
                        {sendingEmail ? "Dispatching..." : `Send Step ${selectedLead.sequenceStep < 4 ? selectedLead.sequenceStep + 1 : 1}`}
                      </button>
                    </div>
                  </div>
                )}
              </div>

              {/* Right Column: GEO Gaps & Activity Timeline */}
              <div className="space-y-4">
                {/* GEO Gap Summary Card */}
                {selectedLead.geoGap && (
                  <div className="rounded-xl border border-blue-500/20 bg-blue-500/[0.04] p-3.5 space-y-1.5">
                    <p className="flex items-center gap-1.5 text-xs font-bold text-blue-400">
                      <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                        <circle cx="12" cy="12" r="10" />
                        <line x1="12" y1="8" x2="12" y2="12" />
                        <line x1="12" y1="16" x2="12.01" y2="16" />
                      </svg>
                      <span>Visibility Gap Identified</span>
                    </p>
                    <p className="text-xs text-zinc-300">
                      Query: <span className="font-semibold text-white">"{selectedLead.geoGap.queryText}"</span>
                    </p>
                    <p className="text-[11px] text-zinc-400">
                      Target is currently <strong className="text-rose-400">{selectedLead.geoGap.citationShare || 0}% cited</strong> in generative engines, while competitors like <strong className="text-amber-300">{selectedLead.geoGap.competitorsCited?.join(", ") || "Market Leaders"}</strong> dominate.
                    </p>
                  </div>
                )}

                {/* Timeline */}
                <div className="rounded-xl border border-white/10 bg-white/[0.02] p-4 space-y-3">
                  <h4 className="text-xs font-bold uppercase tracking-wider text-zinc-400">Activity Timeline</h4>
                  {loadingActivities ? (
                    <p className="text-xs text-zinc-500">Loading activities...</p>
                  ) : (
                    <div className="space-y-2.5 max-h-56 overflow-y-auto">
                      {activities.map((act) => (
                        <div key={act.id} className="border-l-2 border-white/15 pl-3 py-1 text-xs">
                          <div className="flex items-center justify-between">
                            <span className="font-semibold text-white">{act.title}</span>
                            <span className="text-[10px] text-zinc-500">
                              {new Date(act.timestamp).toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" })}
                            </span>
                          </div>
                          <p className="text-[11px] text-zinc-400 mt-0.5">{act.detail}</p>
                        </div>
                      ))}
                      {activities.length === 0 && (
                        <p className="text-xs text-zinc-600 italic">No activity recorded yet.</p>
                      )}
                    </div>
                  )}
                </div>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* Add Lead Modal */}
      {showAddModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/80 backdrop-blur-sm p-4">
          <div className="w-full max-w-md rounded-2xl border border-white/15 bg-zinc-950 p-6 shadow-2xl">
            <h3 className="text-base font-bold text-white">Add New Target Lead</h3>
            <p className="mt-1 text-xs text-zinc-400">Enroll a prospect into the automated GEO outreach cadence.</p>

            <form onSubmit={handleCreateLead} className="mt-4 space-y-3">
              <div>
                <label className="text-[11px] text-zinc-400 block mb-1">Company Name</label>
                <input
                  type="text"
                  required
                  placeholder="Acme Corp"
                  value={newLeadCompany}
                  onChange={(e) => setNewLeadCompany(e.target.value)}
                  className="w-full rounded-lg border border-white/10 bg-zinc-900 px-3 py-1.5 text-xs text-white"
                />
              </div>

              <div>
                <label className="text-[11px] text-zinc-400 block mb-1">Website Domain</label>
                <input
                  type="text"
                  required
                  placeholder="acme.com"
                  value={newLeadDomain}
                  onChange={(e) => setNewLeadDomain(e.target.value)}
                  className="w-full rounded-lg border border-white/10 bg-zinc-900 px-3 py-1.5 text-xs text-white"
                />
              </div>

              <div className="grid grid-cols-2 gap-2">
                <div>
                  <label className="text-[11px] text-zinc-400 block mb-1">Contact Name</label>
                  <input
                    type="text"
                    required
                    placeholder="Jane Doe"
                    value={newLeadName}
                    onChange={(e) => setNewLeadName(e.target.value)}
                    className="w-full rounded-lg border border-white/10 bg-zinc-900 px-3 py-1.5 text-xs text-white"
                  />
                </div>
                <div>
                  <label className="text-[11px] text-zinc-400 block mb-1">Email</label>
                  <input
                    type="email"
                    required
                    placeholder="jane@acme.com"
                    value={newLeadEmail}
                    onChange={(e) => setNewLeadEmail(e.target.value)}
                    className="w-full rounded-lg border border-white/10 bg-zinc-900 px-3 py-1.5 text-xs text-white"
                  />
                </div>
              </div>

              <div className="grid grid-cols-2 gap-2">
                <div>
                  <label className="text-[11px] text-zinc-400 block mb-1">Job Title</label>
                  <input
                    type="text"
                    placeholder="Head of Growth"
                    value={newLeadTitle}
                    onChange={(e) => setNewLeadTitle(e.target.value)}
                    className="w-full rounded-lg border border-white/10 bg-zinc-900 px-3 py-1.5 text-xs text-white"
                  />
                </div>
                <div>
                  <label className="text-[11px] text-zinc-400 block mb-1">Deal Value ($)</label>
                  <input
                    type="number"
                    placeholder="2500"
                    value={newLeadDealValue}
                    onChange={(e) => setNewLeadDealValue(e.target.value)}
                    className="w-full rounded-lg border border-white/10 bg-zinc-900 px-3 py-1.5 text-xs text-white"
                  />
                </div>
              </div>

              <div className="flex items-center justify-end gap-2 pt-3">
                <button
                  type="button"
                  onClick={() => setShowAddModal(false)}
                  className="rounded-lg px-3 py-1.5 text-xs text-zinc-400 hover:text-white"
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  className="rounded-lg bg-blue-600 px-4 py-1.5 text-xs font-semibold text-white hover:bg-blue-500"
                >
                  Create & Enroll
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* Log Reply Modal */}
      {showReplyModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/80 backdrop-blur-sm p-4">
          <div className="w-full max-w-md rounded-2xl border border-white/15 bg-zinc-950 p-6 shadow-2xl">
            <h3 className="text-base font-bold text-white">Log Prospect Reply</h3>
            <p className="mt-1 text-xs text-zinc-400">
              Record the inbound response to pause outreach cadence and get an AI recommended reply.
            </p>

            <div className="mt-4 space-y-3">
              <div>
                <label className="text-[11px] text-zinc-400 block mb-1">Reply Sentiment</label>
                <select
                  value={replySentiment}
                  onChange={(e) => setReplySentiment(e.target.value as any)}
                  className="w-full rounded-lg border border-white/10 bg-zinc-900 px-3 py-1.5 text-xs text-white"
                >
                  <option value="interested">Interested / Wants Demo</option>
                  <option value="question">Asked Technical / Pricing Question</option>
                  <option value="booked">Meeting Booked</option>
                  <option value="not_interested">Not Interested / Unsubscribe</option>
                </select>
              </div>

              <div>
                <label className="text-[11px] text-zinc-400 block mb-1">Prospect Message / Notes</label>
                <textarea
                  rows={4}
                  required
                  placeholder="Paste what the prospect said..."
                  value={replyText}
                  onChange={(e) => setReplyText(e.target.value)}
                  className="w-full rounded-lg border border-white/10 bg-zinc-900 p-2 text-xs text-white"
                />
              </div>

              <div className="flex items-center justify-end gap-2 pt-2">
                <button
                  type="button"
                  onClick={() => setShowReplyModal(false)}
                  className="rounded-lg px-3 py-1.5 text-xs text-zinc-400 hover:text-white"
                >
                  Cancel
                </button>
                <button
                  type="button"
                  onClick={handleRecordReply}
                  className="rounded-lg bg-purple-600 px-4 py-1.5 text-xs font-semibold text-white hover:bg-purple-500"
                >
                  Save & Generate Answer
                </button>
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
