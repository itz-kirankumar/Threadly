"use client";

import { useCallback, useEffect, useState } from "react";
import type { Company, CrmContact, Deal, WorkspaceActivity, CrmAccountsState, DealStage } from "@/lib/crm/types";

const STAGES: DealStage[] = ["qualification", "discovery", "proposal", "negotiation", "won", "lost"];

const inputCls = "rounded-lg border border-white/10 bg-white/[0.04] px-3 py-2 text-sm text-white placeholder-zinc-500 focus:border-violet-400/50 focus:outline-none";
const btnCls = "rounded-lg bg-blue-600 px-3.5 py-2 text-xs font-semibold text-white shadow-sm hover:bg-blue-500 transition-colors disabled:opacity-40";

export default function CrmAccountsPanel({ authedFetch }: { authedFetch: (path: string, init?: RequestInit) => Promise<unknown> }) {
  const [state, setState] = useState<CrmAccountsState>({ companies: [], contacts: [], deals: [], activities: [] });
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState(false);
  const [notice, setNotice] = useState("");

  const [companyForm, setCompanyForm] = useState({ name: "", domain: "", industry: "" });
  const [contactForm, setContactForm] = useState({ name: "", email: "", title: "", companyId: "" });
  const [dealForm, setDealForm] = useState({ name: "", value: "", companyId: "", stage: "qualification" as DealStage });
  const [activityForm, setActivityForm] = useState({ subject: "", type: "note", dueAt: "" });

  const refresh = useCallback(async () => {
    setLoading(true);
    try {
      setState(await authedFetch("/api/crm/accounts") as CrmAccountsState);
    } catch {
      setNotice("Could not load the CRM workspace.");
    } finally {
      setLoading(false);
    }
  }, [authedFetch]);

  useEffect(() => { refresh(); }, [refresh]);

  async function act(payload: Record<string, unknown>, okMessage: string): Promise<boolean> {
    setBusy(true);
    setNotice("");
    try {
      await authedFetch("/api/crm/accounts", { method: "POST", body: JSON.stringify(payload) });
      setNotice(okMessage);
      await refresh();
      return true;
    } catch (error) {
      setNotice(error instanceof Error ? error.message : "Action failed.");
      return false;
    } finally {
      setBusy(false);
    }
  }

  const openDeals = state.deals.filter(d => !["won", "lost"].includes(d.stage));
  const openActions = state.activities.filter(a => !a.completedAt);

  return (
    <div className="space-y-6">
      <div>
        <h2 className="text-xl font-semibold tracking-tight text-white">Relationship CRM</h2>
        <p className="mt-1 text-sm text-zinc-400">Companies, people, deals and next actions connected to every saved lead.</p>
      </div>

      {notice && <p className="rounded-lg border border-white/10 bg-white/[0.03] px-3 py-2 text-sm text-zinc-300">{notice}</p>}

      <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
        {[
          { label: "Companies", value: state.companies.length, hint: "Accounts in workspace" },
          { label: "Contacts", value: state.contacts.length, hint: "Known people" },
          { label: "Open pipeline", value: openDeals.length, hint: "Active opportunities" },
          { label: "Next actions", value: openActions.length, hint: "Tasks and notes" },
        ].map(card => (
          <div key={card.label} className="rounded-xl border border-white/10 bg-white/[0.03] p-3.5">
            <p className="text-xs font-medium text-zinc-400 uppercase">{card.label}</p>
            <p className="mt-1 text-2xl font-bold text-white">{card.value}</p>
            <p className="mt-0.5 text-xs text-zinc-500">{card.hint}</p>
          </div>
        ))}
      </div>

      {loading ? <p className="text-sm text-zinc-500">Loading…</p> : (
        <div className="grid gap-6 lg:grid-cols-2">
          <section className="rounded-xl border border-white/10 bg-white/[0.03] p-4 space-y-3">
            <h3 className="text-sm font-semibold text-white">Companies <span className="text-zinc-500">{state.companies.length}</span></h3>
            <div className="flex flex-wrap gap-2">
              <input className={inputCls} placeholder="Company name" value={companyForm.name} onChange={e => setCompanyForm({ ...companyForm, name: e.target.value })} />
              <input className={inputCls} placeholder="Domain" value={companyForm.domain} onChange={e => setCompanyForm({ ...companyForm, domain: e.target.value })} />
              <input className={inputCls} placeholder="Industry" value={companyForm.industry} onChange={e => setCompanyForm({ ...companyForm, industry: e.target.value })} />
              <button className={btnCls} disabled={busy || !companyForm.name.trim()} onClick={async () => {
                if (await act({ entity: "company", ...companyForm }, "Company added.")) setCompanyForm({ name: "", domain: "", industry: "" });
              }}>Add</button>
            </div>
            <div className="space-y-2">
              {state.companies.slice(0, 8).map((company: Company) => (
                <div key={company.id} className="flex items-center justify-between rounded-lg border border-white/5 bg-white/[0.02] px-3 py-2">
                  <div><p className="text-sm font-medium text-white">{company.name}</p>
                    <p className="text-xs text-zinc-500">{company.domain || company.industry || "Prospect account"}</p></div>
                  <span className="rounded-full border border-violet-400/30 bg-violet-500/10 px-2 py-0.5 text-xs text-violet-300">{company.status}</span>
                </div>
              ))}
              {!state.companies.length && <p className="text-sm text-zinc-500">Save a lead with a company name to create the first account.</p>}
            </div>
          </section>

          <section className="rounded-xl border border-white/10 bg-white/[0.03] p-4 space-y-3">
            <h3 className="text-sm font-semibold text-white">Contacts <span className="text-zinc-500">{state.contacts.length}</span></h3>
            <div className="flex flex-wrap gap-2">
              <input className={inputCls} placeholder="Full name" value={contactForm.name} onChange={e => setContactForm({ ...contactForm, name: e.target.value })} />
              <input className={inputCls} placeholder="Email" type="email" value={contactForm.email} onChange={e => setContactForm({ ...contactForm, email: e.target.value })} />
              <input className={inputCls} placeholder="Title" value={contactForm.title} onChange={e => setContactForm({ ...contactForm, title: e.target.value })} />
              <select className={inputCls} value={contactForm.companyId} onChange={e => setContactForm({ ...contactForm, companyId: e.target.value })}>
                <option value="">No company</option>
                {state.companies.map(c => <option key={c.id} value={c.id}>{c.name}</option>)}
              </select>
              <button className={btnCls} disabled={busy || !contactForm.name.trim()} onClick={async () => {
                if (await act({ entity: "contact", ...contactForm }, "Contact added.")) setContactForm({ name: "", email: "", title: "", companyId: "" });
              }}>Add</button>
            </div>
            <div className="space-y-2">
              {state.contacts.slice(0, 8).map((contact: CrmContact) => (
                <div key={contact.id} className="rounded-lg border border-white/5 bg-white/[0.02] px-3 py-2">
                  <p className="text-sm font-medium text-white">{contact.name}</p>
                  <p className="text-xs text-zinc-500">{contact.title || "Contact"}{contact.email ? ` · ${contact.email}` : ""}</p>
                </div>
              ))}
              {!state.contacts.length && <p className="text-sm text-zinc-500">Contacts created from saved leads appear here.</p>}
            </div>
          </section>

          <section className="rounded-xl border border-white/10 bg-white/[0.03] p-4 space-y-3">
            <h3 className="text-sm font-semibold text-white">Deals <span className="text-zinc-500">{state.deals.length}</span></h3>
            <div className="flex flex-wrap gap-2">
              <input className={inputCls} placeholder="Deal name" value={dealForm.name} onChange={e => setDealForm({ ...dealForm, name: e.target.value })} />
              <input className={inputCls} placeholder="Value" type="number" min="0" value={dealForm.value} onChange={e => setDealForm({ ...dealForm, value: e.target.value })} />
              <select className={inputCls} value={dealForm.companyId} onChange={e => setDealForm({ ...dealForm, companyId: e.target.value })}>
                <option value="">Company</option>
                {state.companies.map(c => <option key={c.id} value={c.id}>{c.name}</option>)}
              </select>
              <select className={inputCls} value={dealForm.stage} onChange={e => setDealForm({ ...dealForm, stage: e.target.value as DealStage })}>
                {STAGES.map(stage => <option key={stage} value={stage}>{stage}</option>)}
              </select>
              <button className={btnCls} disabled={busy || !dealForm.name.trim()} onClick={async () => {
                if (await act({ entity: "deal", ...dealForm, value: Number(dealForm.value || 0) }, "Deal added.")) setDealForm({ name: "", value: "", companyId: "", stage: "qualification" });
              }}>Add</button>
            </div>
            <div className="space-y-2">
              {state.deals.slice(0, 8).map((deal: Deal) => (
                <div key={deal.id} className="flex items-center justify-between rounded-lg border border-white/5 bg-white/[0.02] px-3 py-2">
                  <div><p className="text-sm font-medium text-white">{deal.name}</p>
                    <p className="text-xs text-zinc-500">{deal.currency} {deal.value.toLocaleString()} · {deal.probability}% likely</p></div>
                  <select className={inputCls} value={deal.stage} disabled={busy}
                    onChange={e => act({ entity: "dealStage", id: deal.id, stage: e.target.value }, "Deal stage updated.")}>
                    {STAGES.map(stage => <option key={stage} value={stage}>{stage}</option>)}
                  </select>
                </div>
              ))}
              {!state.deals.length && <p className="text-sm text-zinc-500">Create a deal when a qualified relationship becomes a real opportunity.</p>}
            </div>
          </section>

          <section className="rounded-xl border border-white/10 bg-white/[0.03] p-4 space-y-3">
            <h3 className="text-sm font-semibold text-white">Activity timeline <span className="text-zinc-500">{state.activities.length}</span></h3>
            <div className="flex flex-wrap gap-2">
              <input className={inputCls} placeholder="Next action or note" value={activityForm.subject} onChange={e => setActivityForm({ ...activityForm, subject: e.target.value })} />
              <select className={inputCls} value={activityForm.type} onChange={e => setActivityForm({ ...activityForm, type: e.target.value })}>
                {["note", "task", "meeting", "email"].map(type => <option key={type} value={type}>{type}</option>)}
              </select>
              <input className={inputCls} type="datetime-local" value={activityForm.dueAt} onChange={e => setActivityForm({ ...activityForm, dueAt: e.target.value })} />
              <button className={btnCls} disabled={busy || !activityForm.subject.trim()} onClick={async () => {
                if (await act({ entity: "activity", ...activityForm }, "Activity added.")) setActivityForm({ subject: "", type: "note", dueAt: "" });
              }}>Add</button>
            </div>
            <div className="space-y-2">
              {state.activities.slice(0, 10).map((activity: WorkspaceActivity) => (
                <div key={activity.id} className="rounded-lg border border-white/5 bg-white/[0.02] px-3 py-2">
                  <p className="text-sm font-medium text-white">{activity.subject}</p>
                  <p className="text-xs text-zinc-500">{activity.type}{activity.dueAt ? ` · due ${new Date(activity.dueAt).toLocaleString()}` : ""}</p>
                </div>
              ))}
              {!state.activities.length && <p className="text-sm text-zinc-500">Record the next action so the team always knows what happens next.</p>}
            </div>
          </section>
        </div>
      )}
    </div>
  );
}
