"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import type { Company, CrmContact, CrmLead, Deal, WorkspaceActivity, CrmAccountsState, DealStage } from "@/lib/crm/types";
import { useSuiteSignal } from "@/lib/suite/signals";
import { sendSignal } from "@/lib/suite/signals";
import type { AppId } from "@/lib/suite/apps";

const STAGES: DealStage[] = ["qualification", "discovery", "proposal", "negotiation", "won", "lost"];
const STAGE_LABEL: Record<DealStage, string> = { qualification: "Qualification", discovery: "Discovery", proposal: "Proposal", negotiation: "Negotiation", won: "Won", lost: "Lost" };

type View = "companies" | "contacts" | "deals" | "activities";
type Form = null | "company" | "contact" | "deal" | "activity";

const inputCls = "ui-input";
const btnCls = "ui-btn-primary";
const ghostBtn = "ui-btn-secondary";
const th = "px-3 py-2.5 text-left text-[11px] font-semibold uppercase tracking-wider text-zinc-500";
const td = "px-3 py-2.5 align-middle";

function money(value: number, currency: string): string {
  return `${currency} ${value.toLocaleString()}`;
}

// The CRM app: companies, contacts, deals and activities as one record
// system. Opening a company shows everything connected to it (people, deals,
// next actions and the saved leads at that domain), with a way back to Leads.
export default function CrmAccountsPanel({ authedFetch, onOpenApp }: { authedFetch: (path: string, init?: RequestInit) => Promise<unknown>; onOpenApp?: (id: AppId) => void }) {
  const [state, setState] = useState<CrmAccountsState>({ companies: [], contacts: [], deals: [], activities: [] });
  const [leads, setLeads] = useState<CrmLead[]>([]);
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState(false);
  const [notice, setNotice] = useState("");
  const [view, setView] = useState<View>("companies");
  const [form, setForm] = useState<Form>(null);
  const [filter, setFilter] = useState("");
  const [openCompanyId, setOpenCompanyId] = useState<string | null>(null);
  const [pending, setPending] = useState<{ kind: string; id: string } | null>(null);

  const [companyForm, setCompanyForm] = useState({ name: "", domain: "", industry: "" });
  const [contactForm, setContactForm] = useState({ name: "", email: "", title: "", companyId: "" });
  const [dealForm, setDealForm] = useState({ name: "", value: "", companyId: "", stage: "qualification" as DealStage });
  const [activityForm, setActivityForm] = useState({ subject: "", type: "note", dueAt: "", companyId: "" });

  const refresh = useCallback(async () => {
    setLoading(true);
    try {
      setState(await authedFetch("/api/crm/accounts") as CrmAccountsState);
    } catch {
      setNotice("Could not load the CRM workspace.");
    } finally {
      setLoading(false);
    }
    authedFetch("/api/crm/leads").then((x) => setLeads((x as { leads: CrmLead[] }).leads ?? [])).catch(() => setLeads([]));
  }, [authedFetch]);

  useEffect(() => { refresh(); }, [refresh]);

  useSuiteSignal((signal) => {
    if (signal.name === "new" && (signal.action === "company" || signal.action === "deal")) {
      setForm(signal.action);
      setView(signal.action === "company" ? "companies" : "deals");
      return true;
    }
    if (signal.name === "open-record" && ["Company", "Contact", "Deal"].includes(signal.kind)) {
      setPending({ kind: signal.kind, id: signal.id });
      return true;
    }
    return false;
  });

  // A record opened from search: its company's 360 view, once loaded.
  useEffect(() => {
    if (!pending || loading) return;
    if (pending.kind === "Company") setOpenCompanyId(pending.id);
    if (pending.kind === "Contact") {
      const c = state.contacts.find((x) => x.id === pending.id);
      if (c?.companyId) setOpenCompanyId(c.companyId);
      else { setView("contacts"); setFilter(c?.name ?? ""); }
    }
    if (pending.kind === "Deal") {
      const d = state.deals.find((x) => x.id === pending.id);
      if (d?.companyId) setOpenCompanyId(d.companyId);
      else { setView("deals"); }
    }
    setPending(null);
  }, [pending, loading, state]);

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

  const companyName = useMemo(() => new Map(state.companies.map((c) => [c.id, c.name])), [state.companies]);
  const openDeals = state.deals.filter((d) => !["won", "lost"].includes(d.stage));
  const openValue = openDeals.reduce((sum, d) => sum + (d.value || 0), 0);
  const currency = openDeals[0]?.currency ?? state.deals[0]?.currency ?? "USD";
  const openActions = state.activities.filter((a) => !a.completedAt);
  const q = filter.trim().toLowerCase();
  const match = (...parts: Array<string | null | undefined>) => !q || parts.some((p) => (p ?? "").toLowerCase().includes(q));

  const openCompany = openCompanyId ? state.companies.find((c) => c.id === openCompanyId) ?? null : null;

  function openLeadInLeads(lead: CrmLead) {
    onOpenApp?.("outreach");
    sendSignal({ name: "open-record", kind: "Lead", id: lead.id });
  }

  const forms: Record<Exclude<Form, null>, React.ReactNode> = {
    company: (
      <div className="flex flex-wrap gap-2">
        <input autoFocus className={inputCls} placeholder="Company name" value={companyForm.name} onChange={(e) => setCompanyForm({ ...companyForm, name: e.target.value })} />
        <input className={inputCls} placeholder="Domain" value={companyForm.domain} onChange={(e) => setCompanyForm({ ...companyForm, domain: e.target.value })} />
        <input className={inputCls} placeholder="Industry" value={companyForm.industry} onChange={(e) => setCompanyForm({ ...companyForm, industry: e.target.value })} />
        <button className={btnCls} disabled={busy || !companyForm.name.trim()} onClick={async () => {
          if (await act({ entity: "company", ...companyForm }, "Company added.")) { setCompanyForm({ name: "", domain: "", industry: "" }); setForm(null); }
        }}>Save company</button>
      </div>
    ),
    contact: (
      <div className="flex flex-wrap gap-2">
        <input autoFocus className={inputCls} placeholder="Full name" value={contactForm.name} onChange={(e) => setContactForm({ ...contactForm, name: e.target.value })} />
        <input className={inputCls} placeholder="Email" type="email" value={contactForm.email} onChange={(e) => setContactForm({ ...contactForm, email: e.target.value })} />
        <input className={inputCls} placeholder="Title" value={contactForm.title} onChange={(e) => setContactForm({ ...contactForm, title: e.target.value })} />
        <select className={inputCls} value={contactForm.companyId} onChange={(e) => setContactForm({ ...contactForm, companyId: e.target.value })}>
          <option value="">No company</option>
          {state.companies.map((c) => <option key={c.id} value={c.id}>{c.name}</option>)}
        </select>
        <button className={btnCls} disabled={busy || !contactForm.name.trim()} onClick={async () => {
          if (await act({ entity: "contact", ...contactForm }, "Contact added.")) { setContactForm({ name: "", email: "", title: "", companyId: "" }); setForm(null); }
        }}>Save contact</button>
      </div>
    ),
    deal: (
      <div className="flex flex-wrap gap-2">
        <input autoFocus className={inputCls} placeholder="Deal name" value={dealForm.name} onChange={(e) => setDealForm({ ...dealForm, name: e.target.value })} />
        <input className={inputCls} placeholder="Value" type="number" min="0" value={dealForm.value} onChange={(e) => setDealForm({ ...dealForm, value: e.target.value })} />
        <select className={inputCls} value={dealForm.companyId} onChange={(e) => setDealForm({ ...dealForm, companyId: e.target.value })}>
          <option value="">Company</option>
          {state.companies.map((c) => <option key={c.id} value={c.id}>{c.name}</option>)}
        </select>
        <select className={inputCls} value={dealForm.stage} onChange={(e) => setDealForm({ ...dealForm, stage: e.target.value as DealStage })}>
          {STAGES.map((stage) => <option key={stage} value={stage}>{STAGE_LABEL[stage]}</option>)}
        </select>
        <button className={btnCls} disabled={busy || !dealForm.name.trim()} onClick={async () => {
          if (await act({ entity: "deal", ...dealForm, value: Number(dealForm.value || 0) }, "Deal added.")) { setDealForm({ name: "", value: "", companyId: "", stage: "qualification" }); setForm(null); }
        }}>Save deal</button>
      </div>
    ),
    activity: (
      <div className="flex flex-wrap gap-2">
        <input autoFocus className={inputCls} placeholder="Next action or note" value={activityForm.subject} onChange={(e) => setActivityForm({ ...activityForm, subject: e.target.value })} />
        <select className={inputCls} value={activityForm.type} onChange={(e) => setActivityForm({ ...activityForm, type: e.target.value })}>
          {["note", "task", "meeting", "email"].map((type) => <option key={type} value={type}>{type}</option>)}
        </select>
        <select className={inputCls} value={activityForm.companyId} onChange={(e) => setActivityForm({ ...activityForm, companyId: e.target.value })}>
          <option value="">No company</option>
          {state.companies.map((c) => <option key={c.id} value={c.id}>{c.name}</option>)}
        </select>
        <input className={inputCls} type="datetime-local" value={activityForm.dueAt} onChange={(e) => setActivityForm({ ...activityForm, dueAt: e.target.value })} />
        <button className={btnCls} disabled={busy || !activityForm.subject.trim()} onClick={async () => {
          if (await act({ entity: "activity", ...activityForm, companyId: activityForm.companyId || undefined }, "Activity added.")) { setActivityForm({ subject: "", type: "note", dueAt: "", companyId: "" }); setForm(null); }
        }}>Save activity</button>
      </div>
    ),
  };

  const views: Array<{ id: View; label: string; count: number; form: Exclude<Form, null> }> = [
    { id: "companies", label: "Companies", count: state.companies.length, form: "company" },
    { id: "contacts", label: "Contacts", count: state.contacts.length, form: "contact" },
    { id: "deals", label: "Deals", count: state.deals.length, form: "deal" },
    { id: "activities", label: "Activities", count: state.activities.length, form: "activity" },
  ];
  const currentView = views.find((v) => v.id === view)!;

  return (
    <div className="space-y-5">
      <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
        {[
          { label: "Companies", value: String(state.companies.length), hint: `${state.companies.filter((c) => c.status === "customer").length} customers`, to: "companies" as View },
          { label: "Contacts", value: String(state.contacts.length), hint: "Known people", to: "contacts" as View },
          { label: "Open pipeline", value: openValue ? money(openValue, currency) : String(openDeals.length), hint: `${openDeals.length} open deal${openDeals.length === 1 ? "" : "s"}`, to: "deals" as View },
          { label: "Next actions", value: String(openActions.length), hint: "Tasks and notes open", to: "activities" as View },
        ].map((card) => (
          <button key={card.label} type="button" onClick={() => { setView(card.to); setOpenCompanyId(null); }} className="rounded-xl border border-white/10 bg-white/[0.03] p-3.5 text-left transition hover:border-violet-400/50">
            <p className="text-[11px] font-medium uppercase tracking-wider text-zinc-500">{card.label}</p>
            <p className="mt-1 truncate text-2xl font-semibold tabular-nums text-white">{card.value}</p>
            <p className="mt-0.5 text-xs text-zinc-500">{card.hint}</p>
          </button>
        ))}
      </div>

      {notice && <p role="status" className="rounded-lg border border-white/10 bg-white/[0.03] px-3 py-2 text-sm text-zinc-300">{notice}</p>}

      {openCompany ? (
        <AccountView
          company={openCompany}
          state={state}
          leads={leads.filter((l) => openCompany.domain && l.domain.toLowerCase() === openCompany.domain.toLowerCase())}
          busy={busy}
          onBack={() => setOpenCompanyId(null)}
          onStage={(deal, stage) => act({ entity: "dealStage", id: deal.id, stage }, "Deal stage updated.")}
          onAddDeal={() => { setDealForm({ ...dealForm, companyId: openCompany.id }); setOpenCompanyId(null); setView("deals"); setForm("deal"); }}
          onAddContact={() => { setContactForm({ ...contactForm, companyId: openCompany.id }); setOpenCompanyId(null); setView("contacts"); setForm("contact"); }}
          onAddActivity={() => { setActivityForm({ ...activityForm, companyId: openCompany.id }); setOpenCompanyId(null); setView("activities"); setForm("activity"); }}
          onOpenLead={openLeadInLeads}
        />
      ) : (
        <div className="overflow-hidden rounded-2xl border border-white/10 bg-white/[0.03]">
          <div className="flex flex-wrap items-center gap-2 border-b border-white/[0.08] px-3 py-2">
            <div role="tablist" className="flex gap-1">
              {views.map((v) => (
                <button key={v.id} type="button" role="tab" aria-selected={view === v.id} onClick={() => { setView(v.id); setForm(null); }}
                  className={`rounded-lg px-3 py-1.5 text-sm font-medium transition ${view === v.id ? "bg-violet-500/15 text-white" : "text-zinc-400 hover:bg-white/[0.05] hover:text-white"}`}>
                  {v.label} <span className="ml-1 text-xs tabular-nums text-zinc-500">{v.count}</span>
                </button>
              ))}
            </div>
            <div className="ml-auto flex items-center gap-2">
              <input className={`${inputCls} h-8 w-44 text-xs`} placeholder={`Filter ${currentView.label.toLowerCase()}`} value={filter} onChange={(e) => setFilter(e.target.value)} />
              <button type="button" className={`${btnCls} h-8 px-3 text-xs`} onClick={() => setForm(form === currentView.form ? null : currentView.form)}>
                {form === currentView.form ? "Cancel" : `New ${currentView.form}`}
              </button>
            </div>
          </div>
          {form && <div className="border-b border-white/[0.08] bg-white/[0.02] px-3 py-3">{forms[form]}</div>}

          {loading ? <p className="px-4 py-10 text-center text-sm text-zinc-500">Loading CRM…</p> : (
            <div className="overflow-x-auto">
              {view === "companies" && (
                <table className="w-full text-sm">
                  <thead><tr className="border-b border-white/[0.06]"><th className={th}>Company</th><th className={th}>Industry</th><th className={th}>Status</th><th className={`${th} text-right`}>Contacts</th><th className={`${th} text-right`}>Open deals</th><th className={`${th} hidden md:table-cell`}>Owner</th></tr></thead>
                  <tbody>
                    {state.companies.filter((c) => match(c.name, c.domain, c.industry)).map((company: Company) => {
                      const deals = state.deals.filter((d) => d.companyId === company.id && !["won", "lost"].includes(d.stage));
                      return (
                        <tr key={company.id} onClick={() => setOpenCompanyId(company.id)} className="cursor-pointer border-b border-white/5 transition hover:bg-white/[0.04]">
                          <td className={td}><p className="font-medium text-white">{company.name}</p><p className="text-xs text-zinc-500">{company.domain || "—"}</p></td>
                          <td className={`${td} text-zinc-400`}>{company.industry || "—"}</td>
                          <td className={td}><span className={`rounded-full px-2 py-0.5 text-xs ${company.status === "customer" ? "bg-emerald-500/15 text-emerald-300" : "bg-violet-500/10 text-violet-300"}`}>{company.status}</span></td>
                          <td className={`${td} text-right tabular-nums text-zinc-300`}>{state.contacts.filter((c) => c.companyId === company.id).length}</td>
                          <td className={`${td} text-right tabular-nums text-zinc-300`}>{deals.length}</td>
                          <td className={`${td} hidden truncate text-xs text-zinc-500 md:table-cell`}>{company.owner}</td>
                        </tr>
                      );
                    })}
                    {!state.companies.length && <tr><td colSpan={6} className="px-4 py-10 text-center text-sm text-zinc-500">Companies appear here when you save leads, or add one with New company.</td></tr>}
                  </tbody>
                </table>
              )}
              {view === "contacts" && (
                <table className="w-full text-sm">
                  <thead><tr className="border-b border-white/[0.06]"><th className={th}>Name</th><th className={th}>Title</th><th className={th}>Company</th><th className={`${th} hidden md:table-cell`}>Email</th></tr></thead>
                  <tbody>
                    {state.contacts.filter((c) => match(c.name, c.email, c.title, c.companyId ? companyName.get(c.companyId) : "")).map((contact: CrmContact) => (
                      <tr key={contact.id} onClick={() => contact.companyId && setOpenCompanyId(contact.companyId)} className={`border-b border-white/5 ${contact.companyId ? "cursor-pointer hover:bg-white/[0.04]" : ""}`}>
                        <td className={`${td} font-medium text-white`}>{contact.name}</td>
                        <td className={`${td} text-zinc-400`}>{contact.title || "—"}</td>
                        <td className={`${td} text-zinc-300`}>{contact.companyId ? companyName.get(contact.companyId) ?? "—" : "—"}</td>
                        <td className={`${td} hidden text-zinc-400 md:table-cell`}>{contact.email || "—"}</td>
                      </tr>
                    ))}
                    {!state.contacts.length && <tr><td colSpan={4} className="px-4 py-10 text-center text-sm text-zinc-500">Decision makers from saved leads become contacts here.</td></tr>}
                  </tbody>
                </table>
              )}
              {view === "deals" && (
                <div className="grid min-w-[900px] grid-cols-6 gap-2 p-3">
                  {STAGES.map((stage) => {
                    const inStage = state.deals.filter((d) => d.stage === stage && match(d.name, d.companyId ? companyName.get(d.companyId) : ""));
                    const total = inStage.reduce((sum, d) => sum + (d.value || 0), 0);
                    return (
                      <div key={stage} className="rounded-xl border border-white/[0.06] bg-white/[0.02] p-2">
                        <div className="flex items-baseline justify-between px-1 pb-2">
                          <p className="text-xs font-semibold text-zinc-300">{STAGE_LABEL[stage]} <span className="text-zinc-500">{inStage.length}</span></p>
                          <p className="text-[11px] tabular-nums text-zinc-500">{total ? total.toLocaleString() : ""}</p>
                        </div>
                        <div className="space-y-2">
                          {inStage.map((deal: Deal) => (
                            <div key={deal.id} className="rounded-lg border border-white/10 bg-white/[0.03] p-2.5">
                              <button type="button" onClick={() => deal.companyId && setOpenCompanyId(deal.companyId)} className="block w-full text-left">
                                <p className="truncate text-sm font-medium text-white">{deal.name}</p>
                                <p className="truncate text-xs text-zinc-500">{deal.companyId ? companyName.get(deal.companyId) : "No company"}</p>
                                <p className="mt-1 text-xs tabular-nums text-zinc-300">{money(deal.value, deal.currency)} · {deal.probability}%</p>
                              </button>
                              <select aria-label="Deal stage" className={`${inputCls} mt-2 h-7 w-full py-0 text-xs`} value={deal.stage} disabled={busy} onChange={(e) => act({ entity: "dealStage", id: deal.id, stage: e.target.value }, "Deal stage updated.")}>
                                {STAGES.map((s) => <option key={s} value={s}>{STAGE_LABEL[s]}</option>)}
                              </select>
                            </div>
                          ))}
                        </div>
                      </div>
                    );
                  })}
                </div>
              )}
              {view === "activities" && (
                <ul className="divide-y divide-white/5">
                  {state.activities.filter((a) => match(a.subject, a.type, a.companyId ? companyName.get(a.companyId) : "")).map((activity: WorkspaceActivity) => (
                    <li key={activity.id} className="flex items-center gap-3 px-4 py-2.5">
                      <span className="w-16 shrink-0 rounded-full bg-white/5 px-2 py-0.5 text-center text-[11px] text-zinc-400">{activity.type}</span>
                      <span className="min-w-0 flex-1">
                        <span className="block truncate text-sm text-white">{activity.subject}</span>
                        <span className="block text-xs text-zinc-500">{activity.companyId ? `${companyName.get(activity.companyId) ?? ""} · ` : ""}{activity.dueAt ? `due ${new Date(activity.dueAt).toLocaleString()}` : new Date(activity.createdAt).toLocaleDateString()}</span>
                      </span>
                      {activity.completedAt && <span className="text-xs text-emerald-300">Done</span>}
                    </li>
                  ))}
                  {!state.activities.length && <li className="px-4 py-10 text-center text-sm text-zinc-500">Record the next action so the team always knows what happens next.</li>}
                </ul>
              )}
            </div>
          )}
        </div>
      )}
    </div>
  );
}

function AccountView({ company, state, leads, busy, onBack, onStage, onAddDeal, onAddContact, onAddActivity, onOpenLead }: {
  company: Company;
  state: CrmAccountsState;
  leads: CrmLead[];
  busy: boolean;
  onBack: () => void;
  onStage: (deal: Deal, stage: DealStage) => void;
  onAddDeal: () => void;
  onAddContact: () => void;
  onAddActivity: () => void;
  onOpenLead: (lead: CrmLead) => void;
}) {
  const contacts = state.contacts.filter((c) => c.companyId === company.id);
  const deals = state.deals.filter((d) => d.companyId === company.id);
  const activities = state.activities.filter((a) => a.companyId === company.id);
  const section = "rounded-2xl border border-white/10 bg-white/[0.03] p-4";
  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-center justify-between gap-3 rounded-2xl border border-white/10 bg-white/[0.03] p-4">
        <div className="flex min-w-0 items-center gap-3">
          <button type="button" onClick={onBack} className={`${ghostBtn} h-8 px-2.5 text-xs`} aria-label="Back to CRM">←</button>
          <span className="flex h-11 w-11 shrink-0 items-center justify-center rounded-xl bg-violet-500/15 text-base font-semibold text-violet-300">{company.name.slice(0, 1).toUpperCase()}</span>
          <div className="min-w-0">
            <p className="truncate text-lg font-semibold text-white">{company.name}</p>
            <p className="truncate text-xs text-zinc-500">
              {company.domain ? <a href={`https://${company.domain}`} target="_blank" rel="noreferrer" className="hover:underline">{company.domain}</a> : "No domain"} · {company.industry || "Industry not set"} · {company.status} · from {company.source || "manual"}
            </p>
          </div>
        </div>
        <div className="flex flex-wrap gap-2">
          <button type="button" className={`${ghostBtn} h-8 px-3 text-xs`} onClick={onAddContact}>Add contact</button>
          <button type="button" className={`${ghostBtn} h-8 px-3 text-xs`} onClick={onAddActivity}>Add activity</button>
          <button type="button" className={`${btnCls} h-8 px-3 text-xs`} onClick={onAddDeal}>New deal</button>
        </div>
      </div>
      <div className="grid gap-4 lg:grid-cols-3">
        <section className={section}>
          <h3 className="text-sm font-semibold text-white">People <span className="text-zinc-500">{contacts.length}</span></h3>
          <ul className="mt-3 space-y-2">
            {contacts.map((c) => (
              <li key={c.id} className="rounded-lg border border-white/5 bg-white/[0.02] px-3 py-2">
                <p className="text-sm font-medium text-white">{c.name}</p>
                <p className="truncate text-xs text-zinc-500">{c.title || "Contact"}{c.email ? ` · ${c.email}` : ""}</p>
              </li>
            ))}
            {!contacts.length && <li className="text-sm text-zinc-500">No contacts yet.</li>}
          </ul>
        </section>
        <section className={section}>
          <h3 className="text-sm font-semibold text-white">Deals <span className="text-zinc-500">{deals.length}</span></h3>
          <ul className="mt-3 space-y-2">
            {deals.map((d) => (
              <li key={d.id} className="rounded-lg border border-white/5 bg-white/[0.02] px-3 py-2">
                <div className="flex items-center justify-between gap-2">
                  <p className="truncate text-sm font-medium text-white">{d.name}</p>
                  <p className="shrink-0 text-xs tabular-nums text-zinc-300">{money(d.value, d.currency)}</p>
                </div>
                <select aria-label="Deal stage" className={`${inputCls} mt-2 h-7 w-full py-0 text-xs`} value={d.stage} disabled={busy} onChange={(e) => onStage(d, e.target.value as DealStage)}>
                  {STAGES.map((s) => <option key={s} value={s}>{STAGE_LABEL[s]}</option>)}
                </select>
              </li>
            ))}
            {!deals.length && <li className="text-sm text-zinc-500">No deals yet.</li>}
          </ul>
        </section>
        <section className={section}>
          <h3 className="text-sm font-semibold text-white">Saved leads <span className="text-zinc-500">{leads.length}</span></h3>
          <ul className="mt-3 space-y-2">
            {leads.map((l) => (
              <li key={l.id}>
                <button type="button" onClick={() => onOpenLead(l)} className="w-full rounded-lg border border-white/5 bg-white/[0.02] px-3 py-2 text-left transition hover:border-violet-400/50">
                  <div className="flex items-center justify-between gap-2">
                    <p className="truncate text-sm font-medium text-white">{l.name || l.company}</p>
                    <span className="shrink-0 text-xs tabular-nums text-violet-300">{l.score}</span>
                  </div>
                  <p className="truncate text-xs text-zinc-500">{l.stage.replace(/_/g, " ")} · open in Leads →</p>
                </button>
              </li>
            ))}
            {!leads.length && <li className="text-sm text-zinc-500">No saved lead at this domain.</li>}
          </ul>
        </section>
      </div>
      <section className={section}>
        <h3 className="text-sm font-semibold text-white">Timeline <span className="text-zinc-500">{activities.length}</span></h3>
        <ul className="mt-3 space-y-2">
          {activities.map((a) => (
            <li key={a.id} className="flex gap-3 text-sm">
              <span className="w-16 shrink-0 rounded-full bg-white/5 px-2 py-0.5 text-center text-[11px] text-zinc-400">{a.type}</span>
              <span className="min-w-0 flex-1 truncate text-zinc-200">{a.subject}</span>
              <span className="shrink-0 text-xs text-zinc-500">{new Date(a.dueAt ?? a.createdAt).toLocaleDateString()}</span>
            </li>
          ))}
          {!activities.length && <li className="text-sm text-zinc-500">Nothing logged for this account yet.</li>}
        </ul>
      </section>
    </div>
  );
}
