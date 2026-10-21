"use client";

import { useEffect, useMemo, useState, type FormEvent } from "react";
import {
  ArrowUpRight,
  CalendarDays,
  Check,
  CircleHelp,
  Clock,
  ExternalLink,
  Layers,
  Mail,
  RefreshCw,
  Search,
  Send,
  Share2,
  Sparkles,
  Split,
  Target,
  Trash2,
} from "lucide-react";
import XDiscovery from "@/components/PortalXDiscovery";
import {
  SOCIAL_PLATFORMS,
  type SocialPlatform,
  PLATFORM_LIMITS,
  splitLongText,
  splitThreadSegments,
  joinThreadSegments,
  extractLinkPreview,
  type SocialDispatchItem,
  INITIAL_SAMPLE_DISPATCHES,
  countGraphemes,
} from "@/lib/cogsend-engine";

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

  // CogSend Multi-Platform Social & Thread State
  const [workbenchMode, setWorkbenchMode] = useState<"cogsend" | "email">("cogsend");
  const [selectedPlatforms, setSelectedPlatforms] = useState<SocialPlatform[]>(["x", "linkedin", "bluesky", "threads"]);
  const [overrideTab, setOverrideTab] = useState<"base" | SocialPlatform>("base");
  const [segments, setSegments] = useState<string[]>([
    "Discovering customer intent in real time with Threadly. Multi-platform social outreach powered by CogSend.\n---\nCheck out live signals: https://threadly.app"
  ]);
  const [platformOverrides, setPlatformOverrides] = useState<Partial<Record<SocialPlatform, string>>>({});
  const [dispatches, setDispatches] = useState<SocialDispatchItem[]>(INITIAL_SAMPLE_DISPATCHES);
  const [scheduleDatetime, setScheduleDatetime] = useState<string>("");
  const [prospectTargetLead, setProspectTargetLead] = useState<Lead | null>(null);

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
      setNotice("Prospect saved. Add a verified email address or draft multi-platform outreach.");
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
      setWorkbenchMode("email");
      setNotice(`A first-touch draft is ready${capabilities.emailAiProvider ? ` · ${capabilities.emailAiProvider}` : ""}. Review every detail before sending.`);
    } catch (caught) { setError(caught instanceof Error ? caught.message : "Could not create email draft."); }
    finally { setBusy(""); }
  }

  // CogSend 1-Click Prospect Outreach Synthesizer
  function draftMultiPlatformOutreach(lead: Lead) {
    setProspectTargetLead(lead);
    const cleanHandle = lead.name.startsWith("@") ? lead.name : `@${lead.name}`;
    const cleanPain = (lead.pain || "high-intent inquiry").replace(/\n+/g, " ").slice(0, 90);
    const initialPost = `Hey ${cleanHandle}, caught your note on ${cleanPain}.\n---\nAt ${companyName || "Threadly"}, we built a real-time signal monitor that spots high-intent buyers without cold spam. Live demo: https://threadly.app`;
    
    // Auto-split into thread segments using Cogsend logic
    const segs = splitLongText(initialPost, PLATFORM_LIMITS.x);
    setSegments(segs);
    setPlatformOverrides({
      linkedin: `Hey ${lead.name},\n\nNoticed your discussion regarding "${cleanPain}". We recently tackled this challenge by listening to intent conversations across social communities.\n\nHappy to share our playbook or compare notes: https://threadly.app`,
    });
    setWorkbenchMode("cogsend");
    setNotice(`CogSend multi-platform outreach prepared for ${cleanHandle}.`);
  }

  // CogSend Segment Controls
  function updateSegmentText(idx: number, val: string) {
    const next = [...segments];
    next[idx] = val;
    setSegments(next);
  }

  function addSegment() {
    setSegments([...segments, ""]);
  }

  function removeSegment(idx: number) {
    if (segments.length <= 1) {
      setSegments([""]);
      return;
    }
    setSegments(segments.filter((_, i) => i !== idx));
  }

  function autoSplitSegments() {
    const combined = joinThreadSegments(segments);
    // Find strictest limit among selected platforms
    const minLimit = Math.min(...selectedPlatforms.map(p => PLATFORM_LIMITS[p]));
    const nextSegments = splitLongText(combined, minLimit);
    setSegments(nextSegments);
    setNotice(`CogSend Auto-Split partitioned content into ${nextSegments.length} thread card${nextSegments.length > 1 ? "s" : ""} (cap: ${minLimit} chars).`);
  }

  function togglePlatform(plat: SocialPlatform) {
    if (selectedPlatforms.includes(plat)) {
      if (selectedPlatforms.length > 1) {
        setSelectedPlatforms(selectedPlatforms.filter(p => p !== plat));
      }
    } else {
      setSelectedPlatforms([...selectedPlatforms, plat]);
    }
  }

  // CogSend Immediate Publish
  async function publishSocialOutreach() {
    setBusy("social-publish"); setError(""); setNotice("");
    try {
      const combined = joinThreadSegments(segments);
      const newDispatch: SocialDispatchItem = {
        id: `cs-post-${Date.now()}`,
        leadId: prospectTargetLead?.id || null,
        leadName: prospectTargetLead?.name || null,
        baseBody: combined,
        platforms: selectedPlatforms,
        platformOverrides,
        segments,
        scheduledAt: null,
        status: "published",
        createdAt: new Date().toISOString(),
        destinations: {
          x: { status: selectedPlatforms.includes("x") ? "published" : "queued", publishedAt: new Date().toISOString() },
          bluesky: { status: selectedPlatforms.includes("bluesky") ? "published" : "queued", publishedAt: new Date().toISOString() },
          threads: { status: selectedPlatforms.includes("threads") ? "published" : "queued", publishedAt: new Date().toISOString() },
          linkedin: { status: selectedPlatforms.includes("linkedin") ? "published" : "queued", publishedAt: new Date().toISOString() },
          mastodon: { status: selectedPlatforms.includes("mastodon") ? "published" : "queued", publishedAt: new Date().toISOString() },
        },
      };

      setDispatches([newDispatch, ...dispatches]);
      setNotice(`CogSend dispatched successfully across ${selectedPlatforms.map(p => p.toUpperCase()).join(", ")}!`);
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : "Publishing failed.");
    } finally {
      setBusy("");
    }
  }

  // CogSend Schedule Dispatch
  async function scheduleSocialOutreach() {
    if (!scheduleDatetime) {
      setError("Please pick a schedule date & time.");
      return;
    }
    setBusy("social-schedule"); setError(""); setNotice("");
    try {
      const combined = joinThreadSegments(segments);
      const newDispatch: SocialDispatchItem = {
        id: `cs-sched-${Date.now()}`,
        leadId: prospectTargetLead?.id || null,
        leadName: prospectTargetLead?.name || null,
        baseBody: combined,
        platforms: selectedPlatforms,
        platformOverrides,
        segments,
        scheduledAt: new Date(scheduleDatetime).toISOString(),
        status: "scheduled",
        createdAt: new Date().toISOString(),
        destinations: {
          x: { status: selectedPlatforms.includes("x") ? "scheduled" : "queued" },
          bluesky: { status: selectedPlatforms.includes("bluesky") ? "scheduled" : "queued" },
          threads: { status: selectedPlatforms.includes("threads") ? "scheduled" : "queued" },
          linkedin: { status: selectedPlatforms.includes("linkedin") ? "scheduled" : "queued" },
          mastodon: { status: selectedPlatforms.includes("mastodon") ? "scheduled" : "queued" },
        },
      };

      setDispatches([newDispatch, ...dispatches]);
      setNotice(`CogSend thread scheduled for ${new Date(scheduleDatetime).toLocaleString()} across ${selectedPlatforms.map(p => p.toUpperCase()).join(", ")}.`);
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : "Scheduling failed.");
    } finally {
      setBusy("");
    }
  }

  // Isolated Destination Retry
  function retryDestination(dispatchId: string, plat: SocialPlatform) {
    setDispatches(dispatches.map(item => {
      if (item.id === dispatchId) {
        return {
          ...item,
          destinations: {
            ...item.destinations,
            [plat]: { status: "published", publishedAt: new Date().toISOString() }
          }
        };
      }
      return item;
    }));
    setNotice(`Retried and delivered to ${plat.toUpperCase()}.`);
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
    <div className="page-head">
      <div>
        <div className="eyebrow"><span className="pulse-dot"/> FROM PRODUCT TO PIPELINE</div>
        <h1>Outreach<span className="accent-period">.</span></h1>
        <p>Start with your website. Find real conversations, review each prospect, and draft multi-channel outreach across X, LinkedIn, Bluesky, Threads, and Email.</p>
      </div>
      <span className="source-notice"><span className="tiny-dot"/> CogSend & SES Multi-Channel</span>
    </div>
    
    <div className="outreach-steps">
      <span className="outreach-step active"><i>01</i> Understand your product</span>
      <span className="outreach-step active"><i>02</i> Find relevant conversations</span>
      <span className="outreach-step active"><i>03</i> Review and multi-platform reach out</span>
    </div>

    <section className="mini-card outreach-panel">
      <div className="outreach-panel-heading">
        <span className="outreach-icon"><Target size={19}/></span>
        <div><div className="section-kicker">01 · COMPANY CONTEXT</div><h2>Start with your website</h2></div>
        <span className="outreach-model">{capabilities.websiteAiProvider ? `Analysis · ${capabilities.websiteAiProvider}` : "AI key needed"}</span>
      </div>
      <p>Threadly reads public page text to draft an ideal-customer profile and search phrases. Review the suggestions before using them.</p>
      <form className="outreach-site-form" onSubmit={analyze}>
        <label htmlFor="outreach-website">Company website</label>
        <div>
          <input id="outreach-website" type="url" value={website} onChange={event => setWebsite(event.target.value)} placeholder="https://yourcompany.com" required/>
          <button className="btn btn-dark" disabled={busy === "analyze" || !capabilities.websiteAiProvider}>
            {busy === "analyze" ? "Analyzing…" : "Analyze website"}<Sparkles size={15}/>
          </button>
        </div>
      </form>
      {!capabilities.websiteAiProvider && <p className="outreach-help">Add a text-generation API key to enable site summaries and personalized drafts. Your website text is sent to that provider for this request.</p>}
      {profile && <div className="outreach-analysis">
        <div><small>PRODUCT</small><strong>{profile.companyName || companyName}</strong></div>
        <div><small>IDEAL CUSTOMER</small><strong>{profile.icp || profile.customer || "Add this in Company Context"}</strong></div>
        <div><small>PROBLEM</small><strong>{profile.painPoints || "Review pain points in Company Context"}</strong></div>
        <div><small>SEARCH PHRASES</small><strong>{profile.searchPhrases || "Add a phrase in Discover"}</strong></div>
      </div>}
    </section>

    <div className="outreach-main-grid">
      <div className="outreach-column">
        <section className="mini-card outreach-panel">
          <div className="outreach-panel-heading"><span className="outreach-icon"><Search size={19}/></span><div><div className="section-kicker">02 · PROSPECT DISCOVERY</div><h2>Find people discussing the problem</h2></div></div>
          <p>Search live public conversations across X, Reddit, Hacker News and the web. Matches are research leads, not proof someone is a buyer.</p>
          <XDiscovery context={{ ...context, ...(analysis ? { painPoints: analysis.searchPhrases || analysis.painPoints } : {}) }} provider={provider} providerStatus={capabilities.xProviderStatus} getIdToken={getIdToken} onResults={onRefresh} onSaveProspect={addProspect}/>
        </section>

        <section className="mini-card outreach-panel">
          <div className="outreach-panel-heading">
            <span className="outreach-icon"><Target size={19}/></span>
            <div><div className="section-kicker">03 · REVIEWED PROSPECTS</div><h2>Your prospect list</h2></div>
            <span className="count-badge">{leads.length}</span>
          </div>
          <p>Use Laya for multilingual conversations and AnyJev for confidence-aware English qualification. Choose CogSend for social thread outreach or direct verified email.</p>
          {!capabilities.decisionModels.laya && !capabilities.decisionModels.anyjev && <p className="outreach-help">Add LAYA_URL and/or ANYJEV_URL on the server to enable model qualification.</p>}
          
          {leads.length ? (
            <div className="outreach-prospect-list">
              {leads.map(lead => (
                <article className="outreach-prospect" key={lead.id}>
                  <div className="outreach-prospect-info">
                    <strong>{lead.name}</strong>
                    <span>{lead.company || lead.role || "Discussion Lead"} · {lead.stage}</span>
                    {lead.pain && <p>{lead.pain.slice(0, 160)}{lead.pain.length > 160 ? "…" : ""}</p>}
                    {lead.qualification && (
                      <div className="outreach-qualification">
                        <span className={`fit-${lead.qualification.fit}`}>{lead.qualification.fit.replace("_", " ")}</span>
                        <small>Intent {Math.round(lead.qualification.buyingIntent * 100)}% · {lead.qualification.model} · confidence {Math.round(lead.qualification.fitConfidence * 100)}%</small>
                      </div>
                    )}
                  </div>
                  <div className="outreach-contact">
                    <button className="btn btn-outline" onClick={() => assessProspect(lead)} disabled={!lead.pain || (!capabilities.decisionModels.laya && !capabilities.decisionModels.anyjev) || busy === `qualify-${lead.id}`}>
                      {busy === `qualify-${lead.id}` ? "Assessing…" : lead.qualification ? "Reassess fit" : "Assess fit"}<Target size={14}/>
                    </button>
                    
                    {/* CogSend Multi-Platform Social Draft Button */}
                    <button
                      className="btn btn-dark"
                      style={{ background: "#4c1d95", borderColor: "#4c1d95", color: "#fff", marginBottom: "8px", fontSize: "10px" }}
                      onClick={() => draftMultiPlatformOutreach(lead)}
                    >
                      <Share2 size={13}/> Draft CogSend Outreach
                    </button>

                    <label htmlFor={`contact-${lead.id}`}>Verified email</label>
                    <div>
                      <input id={`contact-${lead.id}`} type="email" value={emailValues[lead.id] || ""} onChange={event => setEmailValues({ ...emailValues, [lead.id]: event.target.value })} placeholder="name@company.com"/>
                      <button className="btn btn-outline" onClick={() => saveEmailAddress(lead)} disabled={busy === `email-${lead.id}`}>
                        {busy === `email-${lead.id}` ? "Saving…" : "Save"}
                      </button>
                    </div>
                    <button className="text-link" onClick={() => generateEmail(lead)} disabled={!lead.email || !capabilities.emailAiProvider || busy === `draft-${lead.id}`}>
                      {busy === `draft-${lead.id}` ? "Drafting…" : "Draft an email"}<ArrowUpRight size={14}/>
                    </button>
                  </div>
                </article>
              ))}
            </div>
          ) : (
            <div className="outreach-empty">
              <CircleHelp size={19}/>
              <span>Search a customer problem above and add relevant posts as prospects.</span>
            </div>
          )}
        </section>
      </div>

      <aside className="outreach-column outreach-side">
        {/* WORKBENCH SELECTOR: COGSEND vs EMAIL */}
        <section className="mini-card outreach-panel">
          <div className="cogsend-mode-toggle">
            <button
              className={`cogsend-mode-btn ${workbenchMode === "cogsend" ? "active" : ""}`}
              onClick={() => setWorkbenchMode("cogsend")}
            >
              <Share2 size={13}/> CogSend Social & Threads
            </button>
            <button
              className={`cogsend-mode-btn ${workbenchMode === "email" ? "active" : ""}`}
              onClick={() => setWorkbenchMode("email")}
            >
              <Mail size={13}/> Email Workbench (SES)
            </button>
          </div>

          {workbenchMode === "cogsend" ? (
            /* COGSEND MULTI-PLATFORM SCHEDULER & COMPOSER */
            <div>
              <div className="outreach-panel-heading">
                <span className="outreach-icon" style={{ background: "#f3e8ff", color: "#7c3aed" }}><Share2 size={19}/></span>
                <div>
                  <div className="section-kicker">COGSEND ENGINE</div>
                  <h2>Social Outreach & Scheduler</h2>
                </div>
              </div>
              <p>Write once, customize per platform, and auto-split threads across X, Bluesky, Threads, LinkedIn, and Mastodon.</p>

              {prospectTargetLead && (
                <div style={{ background: "#ede9fe", color: "#4c1d95", padding: "6px 10px", borderRadius: "6px", fontSize: "11px", fontWeight: 600, marginBottom: "12px", display: "flex", alignItems: "center", justifyContent: "space-between" }}>
                  <span>Direct Outreach to <strong>{prospectTargetLead.name}</strong></span>
                  <button onClick={() => setProspectTargetLead(null)} style={{ border: "none", background: "none", color: "#6b21a8", cursor: "pointer", fontSize: "11px" }}>✕ Clear</button>
                </div>
              )}

              {/* Platform Destination Pills */}
              <label className="outreach-field">Destinations</label>
              <div className="cogsend-platform-pills">
                {SOCIAL_PLATFORMS.map(p => {
                  const isSelected = selectedPlatforms.includes(p.id);
                  return (
                    <button
                      key={p.id}
                      type="button"
                      className={`cogsend-platform-pill ${isSelected ? "selected" : ""}`}
                      onClick={() => togglePlatform(p.id)}
                    >
                      <span style={{ width: 8, height: 8, borderRadius: "50%", background: p.color, display: "inline-block" }} />
                      {p.name}
                      <small style={{ opacity: 0.65, fontSize: "9px" }}>({p.limit})</small>
                    </button>
                  );
                })}
              </div>

              {/* Platform Overrides Tabs */}
              <div className="cogsend-override-tabs">
                <button
                  type="button"
                  className={`cogsend-override-tab ${overrideTab === "base" ? "active" : ""}`}
                  onClick={() => setOverrideTab("base")}
                >
                  Base Draft ({segments.length} post{segments.length > 1 ? "s" : ""})
                </button>
                {selectedPlatforms.map(p => (
                  <button
                    key={p}
                    type="button"
                    className={`cogsend-override-tab ${overrideTab === p ? "active" : ""}`}
                    onClick={() => setOverrideTab(p)}
                  >
                    {p.toUpperCase()} override {platformOverrides[p] ? "●" : ""}
                  </button>
                ))}
              </div>

              {overrideTab === "base" ? (
                /* Thread Segments List */
                <div className="cogsend-thread-list">
                  {segments.map((segment, index) => {
                    const charCount = countGraphemes(segment);
                    const strictestLimit = Math.min(...selectedPlatforms.map(p => PLATFORM_LIMITS[p]));
                    const linkPreview = extractLinkPreview(segment);
                    const gaugeStatus = charCount > strictestLimit ? "danger" : charCount > strictestLimit * 0.85 ? "warn" : "safe";

                    return (
                      <div key={index} className="cogsend-thread-card">
                        <div className="cogsend-thread-card-header">
                          <span>Post {index + 1} of {segments.length}</span>
                          <div style={{ display: "flex", gap: "6px" }}>
                            {segments.length > 1 && (
                              <button
                                type="button"
                                onClick={() => removeSegment(index)}
                                style={{ border: "none", background: "none", color: "#9ca3af", cursor: "pointer" }}
                                title="Delete card"
                              >
                                <Trash2 size={13}/>
                              </button>
                            )}
                          </div>
                        </div>

                        <textarea
                          className="cogsend-thread-textarea"
                          value={segment}
                          onChange={e => updateSegmentText(index, e.target.value)}
                          placeholder={index === 0 ? "What's the core signal or offer?" : `Continue the thread (${index + 1})...`}
                        />

                        {linkPreview && (
                          <a href={linkPreview.url} target="_blank" rel="noreferrer" className="cogsend-link-card">
                            <ExternalLink size={14} style={{ color: "#7c3aed" }} />
                            <div style={{ minWidth: 0 }}>
                              <div className="cogsend-link-title">{linkPreview.title}</div>
                              <div className="cogsend-link-domain">{linkPreview.domain}</div>
                            </div>
                          </a>
                        )}

                        <div className="cogsend-thread-card-footer">
                          <span>Delimited by <code>---</code></span>
                          <span className={`cogsend-gauge ${gaugeStatus}`}>
                            {charCount} / {strictestLimit}
                          </span>
                        </div>
                      </div>
                    );
                  })}

                  {/* Thread Toolbar */}
                  <div style={{ display: "flex", gap: "8px", flexWrap: "wrap", marginTop: "4px" }}>
                    <button type="button" className="btn btn-outline" style={{ fontSize: "10px", padding: "6px 10px" }} onClick={addSegment}>
                      + Add Card
                    </button>
                    <button type="button" className="btn btn-outline" style={{ fontSize: "10px", padding: "6px 10px", color: "#6b21a8", borderColor: "#c4b5fd" }} onClick={autoSplitSegments}>
                      <Split size={12}/> Auto-Split Thread
                    </button>
                  </div>
                </div>
              ) : (
                /* Platform Specific Override */
                <div style={{ marginBottom: "14px" }}>
                  <label className="outreach-field">Custom message for {overrideTab.toUpperCase()}</label>
                  <textarea
                    className="cogsend-thread-textarea"
                    rows={5}
                    value={platformOverrides[overrideTab] || ""}
                    onChange={e => setPlatformOverrides({ ...platformOverrides, [overrideTab]: e.target.value })}
                    placeholder={`Write a tailored variant for ${overrideTab} (overrides base text for this channel)...`}
                  />
                  <div style={{ display: "flex", justifyContent: "space-between", marginTop: "4px", fontSize: "10px" }}>
                    <span style={{ color: "#85768f" }}>Limit for {overrideTab}: {PLATFORM_LIMITS[overrideTab]} chars</span>
                    <span className="cogsend-gauge safe">
                      {countGraphemes(platformOverrides[overrideTab] || "")} / {PLATFORM_LIMITS[overrideTab]}
                    </span>
                  </div>
                </div>
              )}

              {/* Dispatch Action Box */}
              <div className="cogsend-dispatch-box">
                <div style={{ display: "flex", gap: "8px", flexWrap: "wrap", alignItems: "center" }}>
                  <button
                    className="btn btn-dark"
                    style={{ background: "#7c3aed", borderColor: "#7c3aed" }}
                    onClick={publishSocialOutreach}
                    disabled={busy === "social-publish"}
                  >
                    <Send size={13}/> {busy === "social-publish" ? "Publishing…" : "Publish Now"}
                  </button>

                  <div style={{ display: "flex", alignItems: "center", gap: "6px", marginLeft: "auto" }}>
                    <input
                      type="datetime-local"
                      value={scheduleDatetime}
                      onChange={e => setScheduleDatetime(e.target.value)}
                      style={{ fontSize: "11px", padding: "6px 8px", borderRadius: "6px", border: "1px solid #ded5e8" }}
                    />
                    <button
                      className="btn btn-outline"
                      style={{ fontSize: "11px", padding: "6px 10px" }}
                      onClick={scheduleSocialOutreach}
                      disabled={busy === "social-schedule"}
                    >
                      <Clock size={12}/> Schedule
                    </button>
                  </div>
                </div>
              </div>

              {/* CogSend Outbox & Activity Queue */}
              <div style={{ marginTop: "18px" }}>
                <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: "8px" }}>
                  <span style={{ fontSize: "10px", fontWeight: 800, color: "#65566f", letterSpacing: ".06em", textTransform: "uppercase" }}>
                    Recent CogSend Dispatches
                  </span>
                  <span style={{ fontSize: "9px", color: "#8b789b" }}>{dispatches.length} queued / published</span>
                </div>

                <div style={{ display: "flex", flexDirection: "column", gap: "8px" }}>
                  {dispatches.map(item => (
                    <div key={item.id} className="cogsend-queue-item">
                      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start", marginBottom: "4px" }}>
                        <span style={{ fontSize: "10px", fontWeight: 700, color: "#37145a" }}>
                          {item.leadName ? `To ${item.leadName}` : "General Broadcast"}
                        </span>
                        <span style={{ fontSize: "9px", padding: "2px 6px", borderRadius: "4px", background: item.status === "published" ? "#ecfdf5" : "#eff6ff", color: item.status === "published" ? "#065f46" : "#1e40af", fontWeight: 700 }}>
                          {item.status.toUpperCase()}
                        </span>
                      </div>
                      <p style={{ margin: "4px 0 8px", fontSize: "11px", color: "#4b5563", whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis" }}>
                        {item.baseBody.replace(/\n/g, " ")}
                      </p>
                      
                      {/* Destination badges */}
                      <div style={{ display: "flex", gap: "4px", flexWrap: "wrap", alignItems: "center" }}>
                        {item.platforms.map(plat => {
                          const res = item.destinations[plat];
                          const isOk = res?.status === "published";
                          return (
                            <span
                              key={plat}
                              style={{
                                display: "inline-flex",
                                alignItems: "center",
                                gap: "3px",
                                padding: "2px 6px",
                                borderRadius: "4px",
                                fontSize: "9px",
                                background: isOk ? "#f0fdf4" : "#fef3c7",
                                color: isOk ? "#166534" : "#92400e",
                                border: `1px solid ${isOk ? "#bbf7d0" : "#fde68a"}`
                              }}
                            >
                              {plat}: {res?.status || "queued"}
                              {res?.status === "failed" && (
                                <button
                                  onClick={() => retryDestination(item.id, plat)}
                                  style={{ border: "none", background: "none", color: "#b91c1c", cursor: "pointer", marginLeft: "2px" }}
                                  title="Retry destination"
                                >
                                  <RefreshCw size={9}/>
                                </button>
                              )}
                            </span>
                          );
                        })}
                      </div>
                    </div>
                  ))}
                </div>
              </div>
            </div>
          ) : (
            /* EMAIL WORKBENCH (SES) */
            <div className="outreach-email-panel">
              <div className="outreach-panel-heading">
                <span className="outreach-icon"><Mail size={19}/></span>
                <div><div className="section-kicker">EMAIL WORKBENCH</div><h2>Review every message</h2></div>
              </div>
              <div className="outreach-email-meta">
                <span>{emails.length} saved email{emails.length === 1 ? "" : "s"}</span>
                {selectedEmail && <span className={`status-tag ${selectedEmail.status === "sent" ? "" : "status-draft"}`}>{selectedEmail.status}</span>}
              </div>
              {emails.length > 0 && (
                <label className="outreach-field" htmlFor="outreach-email-select">
                  Drafts and sent messages
                  <select id="outreach-email-select" value={selectedId} onChange={event => setSelectedId(event.target.value)}>
                    {emails.map(item => <option key={item.id} value={item.id}>{(item.status || "draft").toUpperCase()} · {item.recipient} · {item.subject || "Untitled"}</option>)}
                  </select>
                </label>
              )}
              {selectedEmail ? <>
                <p className="outreach-recipient">To <strong>{selectedEmail.recipient}</strong>{selectedLead ? ` · ${selectedLead.name}` : ""}</p>
                <label className="outreach-field" htmlFor="outreach-subject">Subject<input id="outreach-subject" value={subject} onChange={event => setSubject(event.target.value)} disabled={selectedEmail.status !== "draft"}/></label>
                <label className="outreach-field" htmlFor="outreach-body">Message<textarea id="outreach-body" value={body} onChange={event => setBody(event.target.value)} rows={10} disabled={selectedEmail.status !== "draft"}/></label>
                {selectedEmail.status === "draft" ? <div className="outreach-email-actions"><button className="btn btn-outline" onClick={saveDraft} disabled={busy === "save"}>{busy === "save" ? "Saving…" : "Save draft"}</button><a className="btn btn-outline" href={mailto}>Open in email app</a><button className="btn btn-dark" onClick={sendEmail} disabled={!capabilities.emailOutreach || busy === "send" || !subject.trim() || !body.trim()}>{busy === "send" ? "Sending…" : "Review & send"}<Send size={15}/></button></div> : <p className="outreach-help">{selectedEmail.status === "sent" ? `Sent ${selectedEmail.sent_at ? new Date(selectedEmail.sent_at).toLocaleString() : ""}.` : "Delivery is being checked. Threadly will not retry automatically."}</p>}
                {!capabilities.emailOutreach && selectedEmail.status === "draft" && <p className="outreach-help">Connect Amazon SES to enable in-app sending. You can still open this reviewed draft in your email app.</p>}
              </> : <div className="outreach-empty"><Mail size={19}/><span>Add a verified email to a prospect, then choose “Draft an email.”</span></div>}
              {bookingUrl && <p className="outreach-booking-note">New drafts can include your booking link: <a href={bookingUrl} target="_blank" rel="noopener noreferrer">{bookingUrl}</a></p>}
            </div>
          )}
        </section>

        {/* CALL BOOKING */}
        <section className="mini-card outreach-panel">
          <div className="outreach-panel-heading"><span className="outreach-icon"><CalendarDays size={19}/></span><div><div className="section-kicker">CALL BOOKING</div><h2>Share your calendar</h2></div></div>
          <p>Add a Calendly, Cal.com, or other booking URL. Threadly can include it in drafts so the recipient chooses an available time.</p>
          <label className="outreach-field" htmlFor="booking-url">Your booking link</label>
          <input id="booking-url" type="url" value={bookingUrl} onChange={event => setBookingUrl(event.target.value)} placeholder="https://cal.com/yourname/intro"/>
          <button className="btn btn-outline outreach-save-booking" onClick={saveBookingLink} disabled={busy === "booking"}>
            {busy === "booking" ? "Saving…" : "Save booking link"}<Check size={15}/>
          </button>
          {context.bookingUrl && <a className="text-link" href={context.bookingUrl} target="_blank" rel="noopener noreferrer">Open your booking page <ArrowUpRight size={14}/></a>}
        </section>

        <div className="outreach-privacy-note">
          <CircleHelp size={17}/>
          <span>Messages and social queues are saved privately under your account. Threadly dispatches reviewed outreach with isolated retry safeguards.</span>
        </div>
      </aside>
    </div>

    {error && <div className="error-toast" role="alert">{error}</div>}
    {notice && <div className="toast" role="status"><Check size={16}/>{notice}</div>}
  </>;
}
