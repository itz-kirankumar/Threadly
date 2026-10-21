"use client";

import { useEffect, useMemo, useState, type FormEvent } from "react";
import { ArrowUpRight, CalendarDays, Check, CircleHelp, Mail, Search, Send, Sparkles, Target } from "lucide-react";
import XDiscovery from "@/components/PortalXDiscovery";
import type { XPost } from "@/lib/x-discovery";

type OutreachEmail = { id: string; lead_id: string; recipient: string; subject: string; body: string; status: "draft" | "sending" | "sent"; created_at: string; sent_at?: string };
type Context = Record<string, string>;
type Qualification = { fit: "strong_fit" | "possible_fit" | "weak_fit"; fitConfidence: number; buyingIntent: number; model: "Laya" | "AnyJev"; route: "language" | "confidence" | "fallback"; assessedAt: string };
type Lead = { id: string; opportunity_id: string | null; name: string; email?: string; company: string; role: string; platform: string; pain: string; stage: string; notes: string; created_at: string; qualification?: Qualification };
type Capabilities = { xProvider: string | null; xProviderStatus: "connected" | "configured" | "unverified" | "not_configured"; emailOutreach: boolean; websiteAiProvider: string | null; emailAiProvider: string | null; decisionModels: { laya: boolean; anyjev: boolean } };

export default function PortalOutreach({
  context, companyName, provider, capabilities, leads, emails, getIdToken, onRefresh,
}: {
  context: Context; companyName: string; provider: string | null; capabilities: Capabilities;
  leads: Lead[]; emails: OutreachEmail[]; getIdToken: () => Promise<string>; onRefresh: () => Promise<void>;
}) {
  const [website, setWebsite] = useState(context.website || "");
  const [bookingUrl, setBookingUrl] = useState(context.bookingUrl || "");
  const [subject, setSubject] = useState("");
  const [body, setBody] = useState("");
  const [selectedId, setSelectedId] = useState("");
  const [emailValues, setEmailValues] = useState<Record<string, string>>({});
  const [busy, setBusy] = useState("");
  const [notice, setNotice] = useState("");
  const [error, setError] = useState("");
  const [analysis, setAnalysis] = useState<{ companyName: string; description: string; customer: string; icp: string; painPoints: string; searchPhrases: string; provider: string | null } | null>(null);

  const selectedEmail = useMemo(() => emails.find(email => email.id === selectedId) || null, [emails, selectedId]);
  const profile = analysis || (context.website ? {
    companyName, description: context.description || "", customer: context.customer || "", icp: context.icp || "",
    painPoints: context.painPoints || "", searchPhrases: context.outreachSearchPhrases || "", provider: null,
  } : null);
  useEffect(() => { if (!selectedId && emails[0]) setSelectedId(emails[0].id); }, [emails, selectedId]);
  useEffect(() => {
    setSubject(selectedEmail?.subject || "");
    setBody(selectedEmail?.body || "");
  }, [selectedEmail?.id, selectedEmail?.subject, selectedEmail?.body]);
  useEffect(() => { setEmailValues(Object.fromEntries(leads.map(lead => [lead.id, lead.email || ""]))); }, [leads]);

  async function action(name: string, payload: Record<string, unknown>) {
    const token = await getIdToken();
    const response = await fetch("/api/action", {
      method: "POST", headers: { "Content-Type": "application/json", Authorization: `Bearer ${token}` },
      body: JSON.stringify({ action: name, ...payload }),
    });
    const result = await response.json();
    if (!response.ok) throw new Error(result.error || "Outreach action failed.");
    await onRefresh();
    return result;
  }

  async function analyze(event: FormEvent) {
    event.preventDefault();
    setBusy("analyze"); setError(""); setNotice(""); setAnalysis(null);
    try {
      const token = await getIdToken();
      const response = await fetch("/api/outreach/website", { method: "POST", headers: { "Content-Type": "application/json", Authorization: `Bearer ${token}` }, body: JSON.stringify({ website }) });
      const result = await response.json();
      if (!response.ok) throw new Error(result.error || "Website analysis failed.");
      setAnalysis(result.analysis);
      setWebsite(result.analysis.website);
      await onRefresh();
      setNotice(`Website analyzed with ${result.analysis.provider || "AI"}. Company context is saved to your workspace.`);
    } catch (caught) { setError(caught instanceof Error ? caught.message : "Website analysis failed."); }
    finally { setBusy(""); }
  }

  async function saveBookingLink() {
    setBusy("booking"); setError(""); setNotice("");
    try {
      const token = await getIdToken();
      const response = await fetch("/api/action", { method: "POST", headers: { "Content-Type": "application/json", Authorization: `Bearer ${token}` }, body: JSON.stringify({ action: "context", name: companyName, context: { ...context, bookingUrl } }) });
      const result = await response.json();
      if (!response.ok) throw new Error(result.error || "Could not save booking link.");
      await onRefresh(); setNotice("Booking link saved. New email drafts can include it.");
    } catch (caught) { setError(caught instanceof Error ? caught.message : "Could not save booking link."); }
    finally { setBusy(""); }
  }

  async function addProspect(post: { id: string; author?: string; text: string; platform?: string }) {
    setBusy(`prospect-${post.id}`); setError(""); setNotice("");
    try {
      await action("lead", { name: post.author ? (post.author.startsWith("@") ? post.author : `@${post.author}`) : `${post.platform || "X"} prospect`, platform: post.platform || "X", opportunityId: post.id.startsWith("x-") || post.id.startsWith("tavily-") ? post.id : `x-${post.id}`, pain: post.text.slice(0, 500), notes: `Added from a public ${post.platform || "X"} conversation. Verify fit and contact details before outreach.` });
      setNotice("Prospect saved. Add a verified email address before drafting outreach.");
    } catch (caught) { setError(caught instanceof Error ? caught.message : "Could not save prospect."); }
    finally { setBusy(""); }
  }

  async function saveEmailAddress(lead: Lead) {
    setBusy(`email-${lead.id}`); setError(""); setNotice("");
    try {
      await action("leadEmail", { id: lead.id, email: emailValues[lead.id] || "" });
      setNotice(lead.email ? "Contact email updated." : "Verified contact email saved.");
    } catch (caught) { setError(caught instanceof Error ? caught.message : "Could not save contact email."); }
    finally { setBusy(""); }
  }

  async function assessProspect(lead: Lead) {
    setBusy(`qualify-${lead.id}`); setError(""); setNotice("");
    try {
      const result = await action("qualifyLead", { leadId: lead.id });
      setNotice(`${lead.name} assessed with ${result.qualification.model}. Review the fit and intent signals before reaching out.`);
    } catch (caught) { setError(caught instanceof Error ? caught.message : "Could not assess this prospect."); }
    finally { setBusy(""); }
  }

  async function generateEmail(lead: Lead) {
    setBusy(`draft-${lead.id}`); setError(""); setNotice("");
    try {
      const result = await action("outreachGenerate", { leadId: lead.id });
      setSelectedId(result.email.id);
      setNotice(`A first-touch draft is ready${capabilities.emailAiProvider ? ` · ${capabilities.emailAiProvider}` : ""}. Review every detail before sending.`);
    } catch (caught) { setError(caught instanceof Error ? caught.message : "Could not create email draft."); }
    finally { setBusy(""); }
  }

  async function saveDraft() {
    if (!selectedEmail) return;
    setBusy("save"); setError(""); setNotice("");
    try { await action("outreachSave", { id: selectedEmail.id, subject, body }); setNotice("Email draft saved."); }
    catch (caught) { setError(caught instanceof Error ? caught.message : "Could not save draft."); }
    finally { setBusy(""); }
  }

  async function sendEmail() {
    if (!selectedEmail || selectedEmail.status !== "draft") return;
    if (!window.confirm(`Send this reviewed email to ${selectedEmail.recipient}? Threadly will send one email only.`)) return;
    setBusy("send"); setError(""); setNotice("");
    try {
      await action("outreachSave", { id: selectedEmail.id, subject, body });
      await action("outreachSend", { id: selectedEmail.id, confirmSend: true });
      setNotice("Email sent. The prospect is still in your pipeline for follow-up.");
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : "Email could not be confirmed. Check delivery status before retrying.");
      await onRefresh();
    } finally { setBusy(""); }
  }

  const selectedLead = selectedEmail ? leads.find(lead => lead.id === selectedEmail.lead_id) : null;
  const mailto = selectedEmail ? `mailto:${selectedEmail.recipient}?subject=${encodeURIComponent(subject)}&body=${encodeURIComponent(body)}` : "#";

  return <>
    <div className="page-head"><div><div className="eyebrow"><span className="pulse-dot"/> FROM PRODUCT TO PIPELINE</div><h1>Outreach<span className="accent-period">.</span></h1><p>Start with your website. Find real conversations, review each prospect, and write a useful first email.</p></div><span className="source-notice"><span className="tiny-dot"/> Human-reviewed outreach</span></div>
    <div className="outreach-steps"><span className="outreach-step active"><i>01</i> Understand your product</span><span className="outreach-step active"><i>02</i> Find relevant conversations</span><span className="outreach-step"><i>03</i> Review and reach out</span></div>

    <section className="mini-card outreach-panel">
      <div className="outreach-panel-heading"><span className="outreach-icon"><Target size={19}/></span><div><div className="section-kicker">01 · COMPANY CONTEXT</div><h2>Start with your website</h2></div><span className="outreach-model">{capabilities.websiteAiProvider ? `Analysis · ${capabilities.websiteAiProvider}` : "AI key needed"}</span></div>
      <p>Threadly reads public page text to draft an ideal-customer profile and search phrases. Review the suggestions before using them.</p>
      <form className="outreach-site-form" onSubmit={analyze}><label htmlFor="outreach-website">Company website</label><div><input id="outreach-website" type="url" value={website} onChange={event => setWebsite(event.target.value)} placeholder="https://yourcompany.com" required/><button className="btn btn-dark" disabled={busy === "analyze" || !capabilities.websiteAiProvider}>{busy === "analyze" ? "Analyzing…" : "Analyze website"}<Sparkles size={15}/></button></div></form>
      {!capabilities.websiteAiProvider && <p className="outreach-help">Add a text-generation API key to enable site summaries and personalized drafts. Your website text is sent to that provider for this request.</p>}
      {profile && <div className="outreach-analysis"><div><small>PRODUCT</small><strong>{profile.companyName || companyName}</strong></div><div><small>IDEAL CUSTOMER</small><strong>{profile.icp || profile.customer || "Add this in Company Context"}</strong></div><div><small>PROBLEM</small><strong>{profile.painPoints || "Review pain points in Company Context"}</strong></div><div><small>SEARCH PHRASES</small><strong>{profile.searchPhrases || "Add a phrase in Discover"}</strong></div></div>}
    </section>

    <div className="outreach-main-grid">
      <div className="outreach-column">
        <section className="mini-card outreach-panel">
          <div className="outreach-panel-heading"><span className="outreach-icon"><Search size={19}/></span><div><div className="section-kicker">02 · PROSPECT DISCOVERY</div><h2>Find people discussing the problem</h2></div></div>
          <p>Search live public X posts using customer language from your product context. Matches are research leads, not proof someone is a buyer.</p>
          <XDiscovery context={{ ...context, ...(analysis ? { painPoints: analysis.searchPhrases || analysis.painPoints } : {}) }} provider={provider} providerStatus={capabilities.xProviderStatus} getIdToken={getIdToken} onResults={onRefresh} onSaveProspect={addProspect}/>
        </section>
        <section className="mini-card outreach-panel">
          <div className="outreach-panel-heading"><span className="outreach-icon"><UsersIcon/></span><div><div className="section-kicker">03 · REVIEWED PROSPECTS</div><h2>Your prospect list</h2></div><span className="count-badge">{leads.length}</span></div>
          <p>Use Laya for multilingual conversations and AnyJev for confidence-aware English qualification. Low-confidence results can be checked by the other model. Review every result yourself.</p>
          {!capabilities.decisionModels.laya && !capabilities.decisionModels.anyjev && <p className="outreach-help">Add LAYA_URL and/or ANYJEV_URL on the server to enable model qualification.</p>}
          {leads.length ? <div className="outreach-prospect-list">{leads.map(lead => <article className="outreach-prospect" key={lead.id}>
            <div className="outreach-prospect-info"><strong>{lead.name}</strong><span>{lead.company || lead.role || "X conversation"} · {lead.stage}</span>{lead.pain && <p>{lead.pain.slice(0, 160)}{lead.pain.length > 160 ? "…" : ""}</p>}{lead.qualification && <div className="outreach-qualification"><span className={`fit-${lead.qualification.fit}`}>{lead.qualification.fit.replace("_", " ")}</span><small>Intent {Math.round(lead.qualification.buyingIntent * 100)}% · {lead.qualification.model} · confidence {Math.round(lead.qualification.fitConfidence * 100)}%</small></div>}</div>
            <div className="outreach-contact"><button className="btn btn-outline" onClick={() => assessProspect(lead)} disabled={!lead.pain || (!capabilities.decisionModels.laya && !capabilities.decisionModels.anyjev) || busy === `qualify-${lead.id}`}>{busy === `qualify-${lead.id}` ? "Assessing…" : lead.qualification ? "Reassess fit" : "Assess fit"}<Target size={14}/></button><label htmlFor={`contact-${lead.id}`}>Verified email</label><div><input id={`contact-${lead.id}`} type="email" value={emailValues[lead.id] || ""} onChange={event => setEmailValues({ ...emailValues, [lead.id]: event.target.value })} placeholder="name@company.com"/><button className="btn btn-outline" onClick={() => saveEmailAddress(lead)} disabled={busy === `email-${lead.id}`}>{busy === `email-${lead.id}` ? "Saving…" : "Save"}</button></div><button className="text-link" onClick={() => generateEmail(lead)} disabled={!lead.email || !capabilities.emailAiProvider || busy === `draft-${lead.id}`}>{busy === `draft-${lead.id}` ? "Drafting…" : "Draft an email"}<ArrowUpRight size={14}/></button></div>
          </article>)}</div> : <div className="outreach-empty"><CircleHelp size={19}/><span>Search a customer problem above and add relevant posts as prospects.</span></div>}
        </section>
      </div>

      <aside className="outreach-column outreach-side">
        <section className="mini-card outreach-panel">
          <div className="outreach-panel-heading"><span className="outreach-icon"><CalendarDays size={19}/></span><div><div className="section-kicker">CALL BOOKING</div><h2>Share your calendar</h2></div></div>
          <p>Add a Calendly, Cal.com, or other booking URL. Threadly can include it in drafts so the recipient chooses an available time.</p>
          <label className="outreach-field" htmlFor="booking-url">Your booking link</label><input id="booking-url" type="url" value={bookingUrl} onChange={event => setBookingUrl(event.target.value)} placeholder="https://cal.com/yourname/intro"/><button className="btn btn-outline outreach-save-booking" onClick={saveBookingLink} disabled={busy === "booking"}>{busy === "booking" ? "Saving…" : "Save booking link"}<Check size={15}/></button>
          {context.bookingUrl && <a className="text-link" href={context.bookingUrl} target="_blank" rel="noopener noreferrer">Open your booking page <ArrowUpRight size={14}/></a>}
        </section>

        <section className="mini-card outreach-panel outreach-email-panel">
          <div className="outreach-panel-heading"><span className="outreach-icon"><Mail size={19}/></span><div><div className="section-kicker">EMAIL WORKBENCH</div><h2>Review every message</h2></div></div>
          <div className="outreach-email-meta"><span>{emails.length} saved email{emails.length === 1 ? "" : "s"}</span>{selectedEmail && <span className={`status-tag ${selectedEmail.status === "sent" ? "" : "status-draft"}`}>{selectedEmail.status}</span>}</div>
          {emails.length > 0 && <label className="outreach-field" htmlFor="outreach-email-select">Drafts and sent messages<select id="outreach-email-select" value={selectedId} onChange={event => setSelectedId(event.target.value)}>{emails.map(item => <option key={item.id} value={item.id}>{(item.status || "draft").toUpperCase()} · {item.recipient} · {item.subject || "Untitled"}</option>)}</select></label>}
          {selectedEmail ? <>
            <p className="outreach-recipient">To <strong>{selectedEmail.recipient}</strong>{selectedLead ? ` · ${selectedLead.name}` : ""}</p>
            <label className="outreach-field" htmlFor="outreach-subject">Subject<input id="outreach-subject" value={subject} onChange={event => setSubject(event.target.value)} disabled={selectedEmail.status !== "draft"}/></label>
            <label className="outreach-field" htmlFor="outreach-body">Message<textarea id="outreach-body" value={body} onChange={event => setBody(event.target.value)} rows={10} disabled={selectedEmail.status !== "draft"}/></label>
            {selectedEmail.status === "draft" ? <div className="outreach-email-actions"><button className="btn btn-outline" onClick={saveDraft} disabled={busy === "save"}>{busy === "save" ? "Saving…" : "Save draft"}</button><a className="btn btn-outline" href={mailto}>Open in email app</a><button className="btn btn-dark" onClick={sendEmail} disabled={!capabilities.emailOutreach || busy === "send" || !subject.trim() || !body.trim()}>{busy === "send" ? "Sending…" : "Review & send"}<Send size={15}/></button></div> : <p className="outreach-help">{selectedEmail.status === "sent" ? `Sent ${selectedEmail.sent_at ? new Date(selectedEmail.sent_at).toLocaleString() : ""}.` : "Delivery is being checked. Threadly will not retry automatically."}</p>}
            {!capabilities.emailOutreach && selectedEmail.status === "draft" && <p className="outreach-help">Connect Amazon SES to enable in-app sending. You can still open this reviewed draft in your email app.</p>}
          </> : <div className="outreach-empty"><Mail size={19}/><span>Add a verified email to a prospect, then choose “Draft an email.”</span></div>}
          {bookingUrl && <p className="outreach-booking-note">New drafts can include your booking link: <a href={bookingUrl} target="_blank" rel="noopener noreferrer">{bookingUrl}</a></p>}
        </section>
        <div className="outreach-privacy-note"><CircleHelp size={17}/><span>Messages are saved privately under your Google account. Threadly sends one reviewed email at a time and never sends a sequence automatically.</span></div>
      </aside>
    </div>
    {error && <div className="error-toast" role="alert">{error}</div>}
    {notice && <div className="toast" role="status"><Check size={16}/>{notice}</div>}
  </>;
}

function UsersIcon() { return <Target size={19}/>; }
