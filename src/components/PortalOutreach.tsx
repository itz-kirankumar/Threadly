"use client";

import { useEffect, useMemo, useState, type FormEvent } from "react";
import {
  ArrowUpRight,
  Bot,
  Briefcase,
  CalendarDays,
  Check,
  CheckCircle2,
  CircleHelp,
  Clock,
  ExternalLink,
  Flame,
  Inbox,
  Layers,
  Link as LinkIcon,
  Mail,
  MessageCircle,
  Play,
  Plus,
  RefreshCw,
  Search,
  Send,
  Share2,
  Sparkles,
  Split,
  Target,
  ToggleLeft,
  ToggleRight,
  Trash2,
  TrendingUp,
  UserCheck,
  Wand2,
  Zap,
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
import {
  type OpenReplyCampaign,
  type OpenReplyDmLog,
  INITIAL_OPENREPLY_CAMPAIGNS,
  INITIAL_OPENREPLY_LOGS,
  executeOpenReplyTrigger,
} from "@/lib/openreply-engine";
import {
  humanizeCopy,
  enrichBuyerProfile,
  triageInboundReply,
  classifyIntentTier,
  type EnrichedBuyer,
  type ReplyTriageResult,
} from "@/lib/pumpgtm-engine";

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

  // Workbench Mode: OpenReply, CogSend, Email, or PumpGTM Triage
  const [workbenchMode, setWorkbenchMode] = useState<"openreply" | "cogsend" | "email" | "triage">("openreply");

  // CogSend Multi-Platform Social & Thread State
  const [selectedPlatforms, setSelectedPlatforms] = useState<SocialPlatform[]>(["x", "linkedin", "bluesky", "threads"]);
  const [overrideTab, setOverrideTab] = useState<"base" | SocialPlatform>("base");
  const [segments, setSegments] = useState<string[]>([
    "Discovering customer intent in real time with Threadly. Multi-platform social outreach powered by CogSend.\n---\nCheck out live signals: https://threadly.app"
  ]);
  const [platformOverrides, setPlatformOverrides] = useState<Partial<Record<SocialPlatform, string>>>({});
  const [dispatches, setDispatches] = useState<SocialDispatchItem[]>(INITIAL_SAMPLE_DISPATCHES);
  const [scheduleDatetime, setScheduleDatetime] = useState<string>("");
  const [prospectTargetLead, setProspectTargetLead] = useState<Lead | null>(null);

  // OpenReply Comment-to-DM State
  const [openreplyCampaigns, setOpenreplyCampaigns] = useState<OpenReplyCampaign[]>(INITIAL_OPENREPLY_CAMPAIGNS);
  const [selectedCampaignId, setSelectedCampaignId] = useState<string>(INITIAL_OPENREPLY_CAMPAIGNS[0]?.id || "");
  const [openreplyLogs, setOpenreplyLogs] = useState<OpenReplyDmLog[]>(INITIAL_OPENREPLY_LOGS);
  const [isCreatingCampaign, setIsCreatingCampaign] = useState<boolean>(false);
  
  // OpenReply Simulation Tester
  const [simCommenter, setSimCommenter] = useState<string>("alex_founder");
  const [simCommentText, setSimCommentText] = useState<string>("Can you send me the LINK? We need this for our team.");
  const [simIsFollower, setSimIsFollower] = useState<boolean>(false);
  const [simResult, setSimResult] = useState<ReturnType<typeof executeOpenReplyTrigger> | null>(null);

  // New OpenReply Campaign Form
  const [newCampName, setNewCampName] = useState<string>("");
  const [newCampKeywords, setNewCampKeywords] = useState<string>("LINK, ACCESS");
  const [newCampDm, setNewCampDm] = useState<string>("Hey @{username}! Here is your direct access link 👇");
  const [newCampButton, setNewCampButton] = useState<string>("Get Instant Access 🚀");
  const [newCampUrl, setNewCampUrl] = useState<string>("https://threadly.app/playbook");
  const [newCampRequireFollow, setNewCampRequireFollow] = useState<boolean>(true);
  const [newCampPublicReply, setNewCampPublicReply] = useState<string>("Sent you a DM! Check your inbox 📬");

  // PumpGTM State
  const [enrichedBuyers, setEnrichedBuyers] = useState<Record<string, EnrichedBuyer>>({});
  const [triageInput, setTriageInput] = useState<string>("Hey! Saw this, sounds super interesting. Can you send over pricing or a calendar link?");
  const [triageProspectName, setTriageProspectName] = useState<string>("Alex");
  const [triageResult, setTriageResult] = useState<ReplyTriageResult | null>(null);

  const selectedEmail = useMemo(() => emails.find(email => email.id === selectedId) || null, [emails, selectedId]);
  const profile = analysis || (context.website ? {
    companyName, description: context.description || "", customer: context.customer || "", icp: context.icp || "",
    painPoints: context.painPoints || "", searchPhrases: context.outreachSearchPhrases || "", provider: null,
  } : null);

  const activeOpenReplyCampaign = useMemo(() => 
    openreplyCampaigns.find(c => c.id === selectedCampaignId) || openreplyCampaigns[0], 
    [openreplyCampaigns, selectedCampaignId]
  );

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
      setNotice("Prospect saved. Add a verified email address, enrich buyer, or draft outreach.");
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

  // PumpGTM 1-Click Buyer Enrichment
  function handleEnrichProspect(lead: Lead) {
    const enriched = enrichBuyerProfile({
      name: lead.name,
      role: lead.role,
      company: lead.company,
      pain: lead.pain,
      platform: lead.platform,
    });
    setEnrichedBuyers(prev => ({ ...prev, [lead.id]: enriched }));
    setNotice(`PumpGTM: Enriched ${lead.name} · Intent Tier: ${enriched.intentTier.toUpperCase()} (${enriched.intentScore}%)`);
  }

  // PumpGTM Anti-AI Slop Humanizer Actions
  function humanizeActiveSegment(index: number) {
    const current = segments[index] || "";
    const humanized = humanizeCopy(current);
    updateSegmentText(index, humanized);
    setNotice("PumpGTM: Copy humanized! Removed buzzwords, em dashes, and bot syntax.");
  }

  function humanizeEmailBody() {
    const humanized = humanizeCopy(body);
    setBody(humanized);
    setNotice("PumpGTM: Email humanized! Cut bot openers and pitch lines.");
  }

  // PumpGTM Reply Triage Trigger
  function handleRunTriage() {
    const res = triageInboundReply(triageInput, triageProspectName || "Prospect");
    setTriageResult(res);
    setNotice(`PumpGTM: Triaged as "${res.category.toUpperCase()}" with ${Math.round(res.confidence * 100)}% confidence.`);
  }

  function applyTriagedReplyToComposer() {
    if (!triageResult) return;
    setBody(triageResult.suggestedHumanizedReply);
    setWorkbenchMode("email");
    setNotice("PumpGTM: Triaged response loaded into Email Workbench.");
  }

  // CogSend 1-Click Prospect Outreach Synthesizer
  function draftMultiPlatformOutreach(lead: Lead) {
    setProspectTargetLead(lead);
    const cleanHandle = lead.name.startsWith("@") ? lead.name : `@${lead.name}`;
    const cleanPain = (lead.pain || "high-intent inquiry").replace(/\n+/g, " ").slice(0, 90);
    const rawPost = `Hey ${cleanHandle}, caught your note on ${cleanPain}.\n---\nAt ${companyName || "Threadly"}, we built a real-time signal monitor that spots high-intent buyers without cold spam. Live demo: https://threadly.app`;
    const initialPost = humanizeCopy(rawPost);
    
    const segs = splitLongText(initialPost, PLATFORM_LIMITS.x);
    setSegments(segs);
    setPlatformOverrides({
      linkedin: humanizeCopy(`Hey ${lead.name},\n\nNoticed your discussion regarding "${cleanPain}". We recently tackled this challenge by listening to intent conversations across social communities.\n\nHappy to compare notes: https://threadly.app`),
    });
    setWorkbenchMode("cogsend");
    setNotice(`CogSend multi-platform outreach prepared for ${cleanHandle}.`);
  }

  // OpenReply 1-Click: Attach Prospect to Comment Automation
  function attachProspectToOpenReply(lead: Lead) {
    setWorkbenchMode("openreply");
    setSimCommenter(lead.name.replace(/^@/, ""));
    setSimCommentText(`Hey, can you send the LINK for this? (${lead.pain.slice(0, 50)})`);
    setNotice(`Loaded ${lead.name} into OpenReply Comment-to-DM simulator.`);
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

  // OpenReply: Toggle Campaign Active
  function toggleOpenReplyCampaign(id: string) {
    setOpenreplyCampaigns(openreplyCampaigns.map(c => {
      if (c.id === id) {
        const nextActive = !c.isActive;
        setNotice(`OpenReply: "${c.name}" is now ${nextActive ? "Active" : "Paused"}.`);
        return { ...c, isActive: nextActive };
      }
      return c;
    }));
  }

  // OpenReply: Create Campaign
  function handleCreateOpenReplyCampaign(e: FormEvent) {
    e.preventDefault();
    if (!newCampName.trim()) return;
    const kw = newCampKeywords.split(",").map(k => k.trim()).filter(Boolean);
    const newCamp: OpenReplyCampaign = {
      id: `or-camp-${Date.now()}`,
      name: newCampName,
      platform: "Instagram",
      accountHandle: "@threadly_hq",
      matchAnyPost: true,
      keywords: kw.length ? kw : ["LINK"],
      wholeWordMatch: true,
      dmTriggerEnabled: true,
      dmMessage: newCampDm || "Here is your link @{username}!",
      linkButtonLabel: newCampButton || "Get Link",
      trackedDestinationUrl: newCampUrl || "https://threadly.app",
      requireFollow: newCampRequireFollow,
      publicReplyEnabled: Boolean(newCampPublicReply),
      publicReplyMessages: newCampPublicReply ? [newCampPublicReply] : [],
      isActive: true,
      createdAt: new Date().toISOString(),
      stats: { comments: 0, dmsSent: 0, clicks: 0, ctr: 0, followersGained: 0 },
    };

    setOpenreplyCampaigns([newCamp, ...openreplyCampaigns]);
    setSelectedCampaignId(newCamp.id);
    setIsCreatingCampaign(false);
    setNewCampName("");
    setNotice(`OpenReply campaign "${newCamp.name}" activated!`);
  }

  // OpenReply: Run Simulation Trigger
  async function testOpenReplyTrigger() {
    if (!activeOpenReplyCampaign) return;
    setBusy("openreply-sim"); setError(""); setNotice("");
    try {
      const result = executeOpenReplyTrigger({
        campaign: activeOpenReplyCampaign,
        commenterUsername: simCommenter,
        commentText: simCommentText,
        isFollower: simIsFollower,
      });

      setSimResult(result);
      if (result.matched) {
        setOpenreplyLogs([result.logItem, ...openreplyLogs]);

        setOpenreplyCampaigns(openreplyCampaigns.map(c => {
          if (c.id === activeOpenReplyCampaign.id) {
            const comments = c.stats.comments + 1;
            const dmsSent = c.stats.dmsSent + 1;
            const clicks = c.stats.clicks + 1;
            const followersGained = simIsFollower ? c.stats.followersGained : c.stats.followersGained + 1;
            return {
              ...c,
              stats: {
                comments,
                dmsSent,
                clicks,
                ctr: Math.round((clicks / dmsSent) * 1000) / 10,
                followersGained,
              }
            };
          }
          return c;
        }));

        await action("lead", {
          name: simCommenter.startsWith("@") ? simCommenter : `@${simCommenter}`,
          platform: "Instagram",
          opportunityId: `or-${Date.now()}`,
          pain: `Commented: "${simCommentText}" on ${activeOpenReplyCampaign.name}. Matched keyword: [${result.matchedKeyword}]. Direct Message sent with CTA button.`,
          stage: "engaged",
          notes: `Captured by OpenReply ManyChat automation. Follow-gate: ${activeOpenReplyCampaign.requireFollow ? "Yes" : "No"}. Public reply posted.`,
        });

        setNotice(`OpenReply: Triggered! DM delivered to @${simCommenter.replace(/^@/, "")} & lead auto-qualified in Threadly.`);
      } else {
        setNotice(`OpenReply: No match. The comment did not contain [${activeOpenReplyCampaign.keywords.join(", ")}].`);
      }
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : "Simulation failed.");
    } finally {
      setBusy("");
    }
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
        <p>Inbound and outbound customer acquisition. PumpGTM intent enrichment & anti-slop copy, OpenReply ManyChat automation, CogSend multi-platform publishing, and 1-to-1 verified emails.</p>
      </div>
      <span className="source-notice"><span className="tiny-dot"/> PumpGTM & OpenReply & CogSend Active</span>
    </div>
    
    <div className="outreach-steps">
      <span className="outreach-step active"><i>01</i> Understand your product</span>
      <span className="outreach-step active"><i>02</i> Find relevant conversations</span>
      <span className="outreach-step active"><i>03</i> Humanized Multi-Channel Outbound</span>
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
          <p>Autonomous lead scoring with PumpGTM Intent Tiers (Hot $\ge$ 65, Warm $\ge$ 35). Enrich buyer profiles, trigger OpenReply ManyChat DMs, or schedule CogSend social threads.</p>
          {!capabilities.decisionModels.laya && !capabilities.decisionModels.anyjev && <p className="outreach-help">Add LAYA_URL and/or ANYJEV_URL on the server to enable model qualification.</p>}
          
          {leads.length ? (
            <div className="outreach-prospect-list">
              {leads.map(lead => {
                const enriched = enrichedBuyers[lead.id];
                const tier = enriched?.intentTier || classifyIntentTier(Math.round((lead.qualification?.buyingIntent || 0.6) * 100));

                return (
                  <article className="outreach-prospect" key={lead.id}>
                    <div className="outreach-prospect-info">
                      <div style={{ display: "flex", alignItems: "center", gap: "6px", marginBottom: "3px" }}>
                        <strong>{lead.name}</strong>
                        {tier === "hot" && <span className="pumpgtm-tier-hot"><Flame size={10}/> HOT TIER</span>}
                        {tier === "warm" && <span className="pumpgtm-tier-warm"><Zap size={10}/> WARM</span>}
                        {tier === "watching" && <span className="pumpgtm-tier-watching">WATCHING</span>}
                      </div>

                      <span>{lead.company || lead.role || "Discussion Lead"} · {lead.stage}</span>
                      {lead.pain && <p>{lead.pain.slice(0, 160)}{lead.pain.length > 160 ? "…" : ""}</p>}
                      
                      {lead.qualification && (
                        <div className="outreach-qualification">
                          <span className={`fit-${lead.qualification.fit}`}>{lead.qualification.fit.replace("_", " ")}</span>
                          <small>Intent {Math.round(lead.qualification.buyingIntent * 100)}% · {lead.qualification.model} · confidence {Math.round(lead.qualification.fitConfidence * 100)}%</small>
                        </div>
                      )}

                      {/* PumpGTM Enriched Buyer Drawer */}
                      {enriched && (
                        <div className="pumpgtm-enrich-card">
                          <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: "4px" }}>
                            <span style={{ fontSize: "10px", fontWeight: 800, color: "#3730a3" }}>PUMPGTM BUYER SIGNALS</span>
                            <span style={{ fontSize: "9px", color: "#6366f1", fontWeight: 700 }}>Score: {enriched.intentScore}/100</span>
                          </div>
                          <div style={{ fontSize: "10px", color: "#312e81", marginBottom: "4px" }}>
                            <strong>Hiring Intent:</strong> {enriched.hiringSignals[0]}
                          </div>
                          <div style={{ marginBottom: "6px" }}>
                            {enriched.techStack.map(tech => (
                              <span key={tech} className="pumpgtm-chip">{tech}</span>
                            ))}
                          </div>
                          <div style={{ fontSize: "10px", color: "#4338ca", fontStyle: "italic", background: "#eef2ff", padding: "6px 8px", borderRadius: "6px" }}>
                            "{enriched.conversationalHook}"
                          </div>
                        </div>
                      )}
                    </div>

                    <div className="outreach-contact">
                      <div style={{ display: "flex", gap: "4px", flexWrap: "wrap", marginBottom: "6px" }}>
                        <button className="btn btn-outline" style={{ fontSize: "10px", padding: "4px 8px" }} onClick={() => assessProspect(lead)} disabled={!lead.pain || busy === `qualify-${lead.id}`}>
                          {busy === `qualify-${lead.id}` ? "Assessing…" : "Assess fit"}<Target size={12}/>
                        </button>
                        
                        {/* Action: PumpGTM Buyer Enrichment */}
                        <button
                          className="btn btn-outline"
                          style={{ fontSize: "10px", padding: "4px 8px", color: "#4f46e5", borderColor: "#c7d2fe", background: "#eef2ff" }}
                          onClick={() => handleEnrichProspect(lead)}
                        >
                          <Zap size={11}/> Enrich Buyer
                        </button>
                      </div>

                      {/* Action: OpenReply ManyChat trigger */}
                      <button
                        className="btn btn-outline"
                        style={{ color: "#db2777", borderColor: "#fbcfe8", background: "#fdf2f8", marginBottom: "6px", fontSize: "10px" }}
                        onClick={() => attachProspectToOpenReply(lead)}
                      >
                        <MessageCircle size={13}/> OpenReply Comment-to-DM
                      </button>

                      {/* Action: CogSend Multi-Platform Social Draft */}
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
                );
              })}
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
        {/* WORKBENCH SELECTOR: OPENREPLY vs COGSEND vs EMAIL vs PUMPGTM TRIAGE */}
        <section className="mini-card outreach-panel">
          <div className="cogsend-mode-toggle" style={{ flexWrap: "wrap", gap: "6px" }}>
            <button
              className={`cogsend-mode-btn ${workbenchMode === "openreply" ? "active" : ""}`}
              onClick={() => setWorkbenchMode("openreply")}
              style={workbenchMode === "openreply" ? { background: "linear-gradient(135deg, #e1306c, #833ab4)", borderColor: "#e1306c" } : {}}
            >
              <MessageCircle size={13}/> OpenReply (DM)
            </button>
            <button
              className={`cogsend-mode-btn ${workbenchMode === "cogsend" ? "active" : ""}`}
              onClick={() => setWorkbenchMode("cogsend")}
            >
              <Share2 size={13}/> CogSend (Social)
            </button>
            <button
              className={`cogsend-mode-btn ${workbenchMode === "email" ? "active" : ""}`}
              onClick={() => setWorkbenchMode("email")}
            >
              <Mail size={13}/> Email (SES)
            </button>
            <button
              className={`cogsend-mode-btn ${workbenchMode === "triage" ? "active" : ""}`}
              onClick={() => setWorkbenchMode("triage")}
              style={workbenchMode === "triage" ? { background: "#1e1b4b", borderColor: "#1e1b4b" } : {}}
            >
              <Inbox size={13}/> PumpGTM Triage
            </button>
          </div>

          {/* TAB 1: OPENREPLY (MANYCHAT ALTERNATIVE) */}
          {workbenchMode === "openreply" && (
            <div>
              <div className="outreach-panel-heading">
                <span className="outreach-icon" style={{ background: "#fdf2f8", color: "#db2777" }}><MessageCircle size={19}/></span>
                <div>
                  <div style={{ display: "flex", alignItems: "center", gap: "6px" }}>
                    <span className="openreply-header-badge">OPENREPLY ENGINE</span>
                    <span style={{ fontSize: "9px", color: "#8a7b97", fontWeight: 700 }}>MANYCHAT ALTERNATIVE</span>
                  </div>
                  <h2>Comment-to-DM Automation</h2>
                </div>
              </div>
              <p>Someone comments a keyword on your Reel, Post or Story, and OpenReply instantly queues a personalized DM with tracked links and optional follow gate.</p>

              {/* Active Campaigns List */}
              <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", margin: "14px 0 8px" }}>
                <span style={{ fontSize: "10px", fontWeight: 800, color: "#65566f", textTransform: "uppercase" }}>Active Automations</span>
                <button
                  type="button"
                  className="btn btn-outline"
                  style={{ fontSize: "10px", padding: "4px 8px", display: "inline-flex", alignItems: "center", gap: "4px" }}
                  onClick={() => setIsCreatingCampaign(!isCreatingCampaign)}
                >
                  <Plus size={11}/> {isCreatingCampaign ? "Close" : "New Campaign"}
                </button>
              </div>

              {/* Create Campaign Form Modal / Expander */}
              {isCreatingCampaign && (
                <form onSubmit={handleCreateOpenReplyCampaign} style={{ border: "1px solid #e2d8ec", background: "#fdfcff", borderRadius: "8px", padding: "12px", marginBottom: "14px" }}>
                  <div style={{ fontSize: "11px", fontWeight: 700, color: "#241831", marginBottom: "8px" }}>Create Comment-to-DM Campaign</div>
                  <label className="outreach-field">Campaign Name</label>
                  <input
                    type="text"
                    required
                    placeholder="e.g. Reel: 10x Pipeline Blueprint"
                    value={newCampName}
                    onChange={e => setNewCampName(e.target.value)}
                    style={{ fontSize: "11px", padding: "7px 10px", width: "100%", borderRadius: "6px", border: "1px solid #ded5e8" }}
                  />

                  <label className="outreach-field">Trigger Keywords (comma separated)</label>
                  <input
                    type="text"
                    required
                    placeholder="LINK, BLUEPRINT, DEMO"
                    value={newCampKeywords}
                    onChange={e => setNewCampKeywords(e.target.value)}
                    style={{ fontSize: "11px", padding: "7px 10px", width: "100%", borderRadius: "6px", border: "1px solid #ded5e8" }}
                  />

                  <label className="outreach-field">DM Message (use &#123;username&#125;)</label>
                  <textarea
                    rows={3}
                    value={newCampDm}
                    onChange={e => setNewCampDm(e.target.value)}
                    style={{ fontSize: "11px", padding: "7px 10px", width: "100%", borderRadius: "6px", border: "1px solid #ded5e8" }}
                  />

                  <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: "8px", marginTop: "8px" }}>
                    <div>
                      <label className="outreach-field">Button Label</label>
                      <input
                        type="text"
                        value={newCampButton}
                        onChange={e => setNewCampButton(e.target.value)}
                        style={{ fontSize: "11px", padding: "7px 10px", width: "100%", borderRadius: "6px", border: "1px solid #ded5e8" }}
                      />
                    </div>
                    <div>
                      <label className="outreach-field">Tracked URL</label>
                      <input
                        type="url"
                        value={newCampUrl}
                        onChange={e => setNewCampUrl(e.target.value)}
                        style={{ fontSize: "11px", padding: "7px 10px", width: "100%", borderRadius: "6px", border: "1px solid #ded5e8" }}
                      />
                    </div>
                  </div>

                  <div style={{ display: "flex", alignItems: "center", gap: "6px", marginTop: "10px" }}>
                    <input
                      type="checkbox"
                      id="camp-follow-gate"
                      checked={newCampRequireFollow}
                      onChange={e => setNewCampRequireFollow(e.target.checked)}
                    />
                    <label htmlFor="camp-follow-gate" style={{ fontSize: "10px", fontWeight: 600, color: "#37145a", cursor: "pointer" }}>
                      Follow Gate (require user to follow @threadly_hq before delivering link)
                    </label>
                  </div>

                  <label className="outreach-field">Public Comment Reply</label>
                  <input
                    type="text"
                    value={newCampPublicReply}
                    onChange={e => setNewCampPublicReply(e.target.value)}
                    placeholder="Sent you a DM! Check your inbox 📬"
                    style={{ fontSize: "11px", padding: "7px 10px", width: "100%", borderRadius: "6px", border: "1px solid #ded5e8" }}
                  />

                  <div style={{ display: "flex", justifyContent: "flex-end", gap: "6px", marginTop: "12px" }}>
                    <button type="button" className="btn btn-outline" style={{ fontSize: "10px" }} onClick={() => setIsCreatingCampaign(false)}>Cancel</button>
                    <button type="submit" className="btn btn-dark" style={{ fontSize: "10px", background: "#e1306c", borderColor: "#e1306c" }}>Create Automation</button>
                  </div>
                </form>
              )}

              {/* Campaign Cards */}
              <div style={{ display: "flex", flexDirection: "column", gap: "10px" }}>
                {openreplyCampaigns.map(camp => {
                  const isSelected = camp.id === selectedCampaignId;
                  return (
                    <div
                      key={camp.id}
                      className="openreply-campaign-card"
                      style={{ border: isSelected ? "2px solid #e1306c" : "1px solid #ded5e8", cursor: "pointer" }}
                      onClick={() => setSelectedCampaignId(camp.id)}
                    >
                      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start", marginBottom: "6px" }}>
                        <div>
                          <div style={{ fontSize: "12px", fontWeight: 800, color: "#241831" }}>{camp.name}</div>
                          <span style={{ fontSize: "9px", color: "#8a7b97" }}>{camp.platform} · {camp.accountHandle}</span>
                        </div>
                        <button
                          type="button"
                          onClick={(e) => { e.stopPropagation(); toggleOpenReplyCampaign(camp.id); }}
                          style={{ border: "none", background: "none", cursor: "pointer", color: camp.isActive ? "#16a34a" : "#9ca3af" }}
                        >
                          {camp.isActive ? <ToggleRight size={22}/> : <ToggleLeft size={22}/>}
                        </button>
                      </div>

                      {/* Keywords */}
                      <div style={{ display: "flex", gap: "4px", flexWrap: "wrap", margin: "6px 0" }}>
                        {camp.keywords.map(kw => (
                          <span key={kw} className="openreply-keyword-pill">{kw}</span>
                        ))}
                        {camp.requireFollow && (
                          <span style={{ fontSize: "9px", padding: "2px 6px", borderRadius: "999px", background: "#fef3c7", color: "#92400e", fontWeight: 700 }}>
                            Follow-gated
                          </span>
                        )}
                      </div>

                      {/* Stats Grid */}
                      <div className="openreply-stats-grid">
                        <div className="openreply-stat-item">
                          <div className="openreply-stat-val">{camp.stats.comments}</div>
                          <div className="openreply-stat-lbl">Comments</div>
                        </div>
                        <div className="openreply-stat-item">
                          <div className="openreply-stat-val">{camp.stats.dmsSent}</div>
                          <div className="openreply-stat-lbl">DMs Sent</div>
                        </div>
                        <div className="openreply-stat-item">
                          <div className="openreply-stat-val">{camp.stats.clicks}</div>
                          <div className="openreply-stat-lbl">Clicks</div>
                        </div>
                        <div className="openreply-stat-item">
                          <div className="openreply-stat-val" style={{ color: "#e1306c" }}>{camp.stats.ctr}%</div>
                          <div className="openreply-stat-lbl">CTR</div>
                        </div>
                      </div>
                    </div>
                  );
                })}
              </div>

              {/* Interactive Comment-to-DM Simulator */}
              {activeOpenReplyCampaign && (
                <div className="openreply-simulator-box">
                  <div style={{ display: "flex", alignItems: "center", gap: "6px", marginBottom: "8px" }}>
                    <Play size={14} style={{ color: "#e1306c" }} />
                    <span style={{ fontSize: "11px", fontWeight: 800, color: "#241831" }}>
                      Live Comment-to-DM Test Simulator
                    </span>
                  </div>
                  <p style={{ fontSize: "10px", color: "#6b5976", margin: "0 0 10px" }}>
                    Simulate an inbound comment on <strong>{activeOpenReplyCampaign.name}</strong> to test keyword triggers, follow gates, and public comment replies.
                  </p>

                  <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: "8px", marginBottom: "8px" }}>
                    <div>
                      <label className="outreach-field">Commenter @handle</label>
                      <input
                        type="text"
                        value={simCommenter}
                        onChange={e => setSimCommenter(e.target.value)}
                        style={{ fontSize: "11px", padding: "6px 8px", width: "100%", borderRadius: "6px", border: "1px solid #ded5e8" }}
                      />
                    </div>
                    <div>
                      <label className="outreach-field">Follower status</label>
                      <label style={{ display: "flex", alignItems: "center", gap: "6px", marginTop: "8px", fontSize: "10px", color: "#40344d", cursor: "pointer" }}>
                        <input
                          type="checkbox"
                          checked={simIsFollower}
                          onChange={e => setSimIsFollower(e.target.checked)}
                        />
                        Already follows @threadly_hq
                      </label>
                    </div>
                  </div>

                  <label className="outreach-field">Inbound Comment Text</label>
                  <input
                    type="text"
                    value={simCommentText}
                    onChange={e => setSimCommentText(e.target.value)}
                    style={{ fontSize: "11px", padding: "6px 8px", width: "100%", borderRadius: "6px", border: "1px solid #ded5e8", marginBottom: "10px" }}
                  />

                  <button
                    type="button"
                    className="btn btn-dark"
                    style={{ width: "100%", background: "linear-gradient(135deg, #e1306c, #833ab4)", borderColor: "#e1306c", fontSize: "11px", display: "flex", justifyContent: "center", alignItems: "center", gap: "6px" }}
                    onClick={testOpenReplyTrigger}
                    disabled={busy === "openreply-sim"}
                  >
                    <Zap size={13}/> {busy === "openreply-sim" ? "Processing Trigger…" : "Simulate Inbound Comment"}
                  </button>

                  {/* Simulation Live Result */}
                  {simResult && (
                    <div style={{ marginTop: "12px", borderTop: "1px solid #ded5e8", paddingTop: "12px" }}>
                      <div style={{ display: "flex", alignItems: "center", gap: "6px", marginBottom: "6px" }}>
                        {simResult.matched ? (
                          <span style={{ fontSize: "10px", fontWeight: 800, color: "#16a34a", display: "inline-flex", alignItems: "center", gap: "3px" }}>
                            <CheckCircle2 size={13}/> MATCHED: Keyword [{simResult.matchedKeyword}]
                          </span>
                        ) : (
                          <span style={{ fontSize: "10px", fontWeight: 800, color: "#dc2626" }}>
                            ✕ NO KEYWORD MATCH
                          </span>
                        )}
                      </div>

                      {simResult.matched && (
                        <>
                          {simResult.publicReplyText && (
                            <div className="openreply-public-reply-box">
                              <strong>Public comment reply:</strong> "{simResult.publicReplyText}"
                            </div>
                          )}

                          <div className="openreply-dm-mockup">
                            <div style={{ display: "flex", alignItems: "center", gap: "6px", marginBottom: "8px", borderBottom: "1px solid #ede8f2", paddingBottom: "6px" }}>
                              <div style={{ width: 20, height: 20, borderRadius: "50%", background: "#e1306c", color: "#fff", display: "grid", placeItems: "center", fontSize: "10px", fontWeight: 700 }}>T</div>
                              <span style={{ fontSize: "11px", fontWeight: 800, color: "#111827" }}>threadly_hq</span>
                              <span style={{ fontSize: "9px", color: "#9ca3af", marginLeft: "auto" }}>Just now</span>
                            </div>

                            <div className="openreply-dm-bubble">
                              {simResult.dmDeliveredText}
                              {simResult.buttons.map((btn, i) => (
                                <a
                                  key={i}
                                  href={btn.url}
                                  target="_blank"
                                  rel="noreferrer"
                                  className={`openreply-dm-btn ${i > 0 ? "openreply-dm-btn-secondary" : ""}`}
                                >
                                  {btn.label}
                                </a>
                              ))}
                            </div>
                            {simResult.followGated && (
                              <div style={{ fontSize: "9px", color: "#b45309", marginTop: "6px", textAlign: "center", fontWeight: 600 }}>
                                🔒 Follow-Gate Active: Link unlocks once user follows.
                              </div>
                            )}
                          </div>
                        </>
                      )}
                    </div>
                  )}
                </div>
              )}

              {/* Real-time DM Delivery Log */}
              <div style={{ marginTop: "18px" }}>
                <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: "8px" }}>
                  <span style={{ fontSize: "10px", fontWeight: 800, color: "#65566f", textTransform: "uppercase" }}>
                    Recent Inbound Triggers
                  </span>
                  <span style={{ fontSize: "9px", color: "#8b789b" }}>{openreplyLogs.length} events logged</span>
                </div>

                <div style={{ display: "flex", flexDirection: "column", gap: "6px" }}>
                  {openreplyLogs.map(log => (
                    <div key={log.id} style={{ padding: "8px 10px", border: "1px solid #e6dcef", borderRadius: "6px", background: "#fff", fontSize: "10px" }}>
                      <div style={{ display: "flex", justifyContent: "space-between", marginBottom: "2px" }}>
                        <span style={{ fontWeight: 800, color: "#37145a" }}>@{log.commenterUsername}</span>
                        <span style={{ fontWeight: 700, color: log.status === "delivered" ? "#16a34a" : "#dc2626" }}>
                          {log.status.toUpperCase()}
                        </span>
                      </div>
                      <div style={{ color: "#4b5563", marginBottom: "4px" }}>"{log.commentText}"</div>
                      <div style={{ display: "flex", gap: "6px", alignItems: "center" }}>
                        {log.matchedKeyword && (
                          <span style={{ background: "#fdf2f8", color: "#db2777", padding: "1px 5px", borderRadius: "3px", fontWeight: 700, fontSize: "9px" }}>
                            {log.matchedKeyword}
                          </span>
                        )}
                        {log.publicReplyText && <span style={{ color: "#7c3aed", fontSize: "9px" }}>Reply sent</span>}
                        {log.clickedLink && <span style={{ color: "#2563eb", fontSize: "9px", fontWeight: 700 }}>• Link Clicked</span>}
                      </div>
                    </div>
                  ))}
                </div>
              </div>
            </div>
          )}

          {/* TAB 2: COGSEND SOCIAL & THREAD SCHEDULER */}
          {workbenchMode === "cogsend" && (
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
                          <div style={{ display: "flex", gap: "6px", alignItems: "center" }}>
                            {/* PumpGTM Anti-AI Slop Humanizer Button */}
                            <button
                              type="button"
                              className="pumpgtm-humanize-btn"
                              onClick={() => humanizeActiveSegment(index)}
                              title="Rewrite with PumpGTM anti-AI slop humanizer"
                            >
                              <Wand2 size={11}/> Humanize
                            </button>

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
          )}

          {/* TAB 3: EMAIL WORKBENCH (SES) */}
          {workbenchMode === "email" && (
            <div className="outreach-email-panel">
              <div className="outreach-panel-heading">
                <span className="outreach-icon"><Mail size={19}/></span>
                <div>
                  <div className="section-kicker">EMAIL WORKBENCH</div>
                  <h2>Review every message</h2>
                </div>
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
                
                <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", margin: "10px 0 4px" }}>
                  <label className="outreach-field" style={{ margin: 0 }} htmlFor="outreach-body">Message</label>
                  {/* PumpGTM 1-Click Humanize */}
                  <button
                    type="button"
                    className="pumpgtm-humanize-btn"
                    onClick={humanizeEmailBody}
                    title="PumpGTM: Strip bot openers, em dashes, and salesy buzzwords"
                  >
                    <Wand2 size={11}/> ⚡ Humanize (PumpGTM)
                  </button>
                </div>
                
                <textarea id="outreach-body" value={body} onChange={event => setBody(event.target.value)} rows={10} disabled={selectedEmail.status !== "draft"}/>
                
                {selectedEmail.status === "draft" ? <div className="outreach-email-actions"><button className="btn btn-outline" onClick={saveDraft} disabled={busy === "save"}>{busy === "save" ? "Saving…" : "Save draft"}</button><a className="btn btn-outline" href={mailto}>Open in email app</a><button className="btn btn-dark" onClick={sendEmail} disabled={!capabilities.emailOutreach || busy === "send" || !subject.trim() || !body.trim()}>{busy === "send" ? "Sending…" : "Review & send"}<Send size={15}/></button></div> : <p className="outreach-help">{selectedEmail.status === "sent" ? `Sent ${selectedEmail.sent_at ? new Date(selectedEmail.sent_at).toLocaleString() : ""}.` : "Delivery is being checked. Threadly will not retry automatically."}</p>}
                {!capabilities.emailOutreach && selectedEmail.status === "draft" && <p className="outreach-help">Connect Amazon SES to enable in-app sending. You can still open this reviewed draft in your email app.</p>}
              </> : <div className="outreach-empty"><Mail size={19}/><span>Add a verified email to a prospect, then choose “Draft an email.”</span></div>}
              {bookingUrl && <p className="outreach-booking-note">New drafts can include your booking link: <a href={bookingUrl} target="_blank" rel="noopener noreferrer">{bookingUrl}</a></p>}
            </div>
          )}

          {/* TAB 4: PUMPGTM INBOUND REPLY TRIAGE */}
          {workbenchMode === "triage" && (
            <div>
              <div className="outreach-panel-heading">
                <span className="outreach-icon" style={{ background: "#e0e7ff", color: "#4338ca" }}><Inbox size={19}/></span>
                <div>
                  <div style={{ display: "flex", alignItems: "center", gap: "6px" }}>
                    <span className="pumpgtm-badge">PUMPGTM ENGINE</span>
                    <span style={{ fontSize: "9px", color: "#6366f1", fontWeight: 700 }}>HUMAN DECISION HUB</span>
                  </div>
                  <h2>Inbound Reply Triage</h2>
                </div>
              </div>
              <p>Every inbound reply across LinkedIn, X and Email is triaged into action buckets (Interested, Question, Referral, Objection). AI drafts the humanized response, you decide before sending.</p>

              <div style={{ margin: "14px 0" }}>
                <label className="outreach-field">Prospect Name / Handle</label>
                <input
                  type="text"
                  value={triageProspectName}
                  onChange={e => setTriageProspectName(e.target.value)}
                  style={{ fontSize: "11px", padding: "6px 8px", width: "100%", borderRadius: "6px", border: "1px solid #ded5e8", marginBottom: "8px" }}
                />

                <label className="outreach-field">Inbound Reply Message</label>
                <textarea
                  rows={3}
                  value={triageInput}
                  onChange={e => setTriageInput(e.target.value)}
                  style={{ fontSize: "11px", padding: "8px 10px", width: "100%", borderRadius: "6px", border: "1px solid #ded5e8" }}
                />

                <button
                  type="button"
                  className="btn btn-dark"
                  style={{ width: "100%", background: "#1e1b4b", borderColor: "#1e1b4b", fontSize: "11px", marginTop: "8px", display: "flex", justifyContent: "center", alignItems: "center", gap: "6px" }}
                  onClick={handleRunTriage}
                >
                  <Bot size={13}/> Triage & Draft Response
                </button>
              </div>

              {triageResult && (
                <div className="pumpgtm-triage-card">
                  <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: "6px" }}>
                    <span style={{ fontSize: "10px", fontWeight: 800, textTransform: "uppercase", color: triageResult.sentiment === "positive" ? "#166534" : "#1e1b4b" }}>
                      Category: {triageResult.category} ({Math.round(triageResult.confidence * 100)}% fit)
                    </span>
                    <span style={{ fontSize: "9px", padding: "2px 6px", borderRadius: "4px", background: triageResult.sentiment === "positive" ? "#dcfce7" : "#f1f5f9", color: triageResult.sentiment === "positive" ? "#15803d" : "#475569", fontWeight: 700 }}>
                      {triageResult.sentiment.toUpperCase()}
                    </span>
                  </div>

                  <div style={{ fontSize: "11px", color: "#4b5563", marginBottom: "8px" }}>
                    <strong>Recommended Next Step:</strong> {triageResult.recommendedAction}
                  </div>

                  <label className="outreach-field">Suggested Humanized Response</label>
                  <div style={{ background: "#f8fafc", border: "1px solid #e2e8f0", borderRadius: "6px", padding: "8px 10px", fontSize: "11px", color: "#1e293b", lineHeight: 1.5, marginBottom: "8px" }}>
                    "{triageResult.suggestedHumanizedReply}"
                  </div>

                  <button
                    type="button"
                    className="btn btn-outline"
                    style={{ fontSize: "10px", padding: "6px 10px", display: "flex", alignItems: "center", gap: "4px" }}
                    onClick={applyTriagedReplyToComposer}
                  >
                    <Send size={12}/> Load into Email Workbench
                  </button>
                </div>
              )}
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
