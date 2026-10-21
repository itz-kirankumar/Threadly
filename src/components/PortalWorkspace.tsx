"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import Image from "next/image";
import Link from "next/link";
import {
  Activity, ArrowDownRight, ArrowLeft, ArrowRight, ArrowUpRight, Bell, CalendarClock, CalendarDays,
  Check, CheckCheck, ChevronDown, ChevronLeft, ChevronRight, CircleDollarSign, CircleHelp, Clock3,
  Compass, Copy, ExternalLink, FileText, Filter, Flame, Globe, LayoutDashboard, Lightbulb,
  LogOut, Mail, MapPin, Menu, MessageCircle, MoreHorizontal, PanelLeftClose, PanelLeftOpen, Play,
  Plus, Radio, RefreshCw, Search, Send, Settings, ShieldCheck, Sparkles, Target, Trash2,
  TrendingUp, UploadCloud, UserCheck, UserPlus, Users, Video, WandSparkles, Workflow as WorkflowIcon, X, Zap
} from "lucide-react";
import XDiscovery from "./PortalXDiscovery";
import PortalOutreach from "./PortalOutreach";
import {
  CampaignsPage,
  GeoPage,
  LiveFeed,
  RevenuePage,
  SchedulerPage,
  SegmentsPage,
  SequencesPage,
  useLiveStream,
} from "./ThreadlyModules";
import type { TeamInvite, TeamMember, Workflow } from "@/lib/portal-data";
import type { GrowthSnapshot } from "@/lib/threadly-engine";
import {
  detectBrowserTimezone,
  formatMemberTime,
  getMemberAvailability,
  findCommonTimeSlots,
  timezoneOptions,
  type CommonSlot,
} from "@/lib/timezone";
import { scheduleGoogleMeeting } from "@/lib/google-calendar";

type Opportunity = { id: string; platform: string; community: string; author: string; title: string; body: string; pain: string; intent: string; relevance: number; engagement: string; source_url: string | null; source_kind: string; observed_at: string; status: string };
type Draft = { id: string; opportunity_id: string | null; platform: string; kind: string; text: string; status: string; origin: string; approved_at: string | null; scheduled_at: string | null; created_at: string };
type Lead = { id: string; opportunity_id: string | null; name: string; email?: string; company: string; role: string; platform: string; pain: string; stage: string; notes: string; owner: string; created_at: string; qualification?: { fit: "strong_fit" | "possible_fit" | "weak_fit"; fitConfidence: number; buyingIntent: number; model: "Laya" | "AnyJev"; route: "language" | "confidence" | "fallback"; assessedAt: string }; meetingUrl?: string; calendarEventUrl?: string; googleCalendarEventId?: string; meetingStart?: string; meetingEnd?: string };
type OutreachEmail = { id: string; lead_id: string; recipient: string; subject: string; body: string; status: "draft" | "sending" | "sent"; created_at: string; sent_at?: string };

type State = {
  workspace: {
    id: string;
    name: string;
    legalName?: string;
    website?: string;
    industry?: string;
    stage?: string;
    country?: string;
    region?: string;
    defaultTimezone?: string;
    logoUrl?: string;
    domain?: string;
    context: Record<string, string>;
  };
  opportunities: Opportunity[];
  drafts: Draft[];
  leads: Lead[];
  outreachEmails: OutreachEmail[];
  workflows: Workflow[];
  team: TeamMember[];
  invites: TeamInvite[];
  capabilities: {
    ai: boolean;
    liveSources: boolean;
    publishing: boolean;
    manualCapture: boolean;
    xProvider: string | null;
    xProviderStatus: "connected" | "configured" | "unverified" | "not_configured";
    emailOutreach: boolean;
    websiteAiProvider: string | null;
    emailAiProvider: string | null;
    contentAiProvider: string | null;
    decisionModels: { laya: boolean; anyjev: boolean };
  };
  growth: GrowthSnapshot;
  demo: boolean;
};

type Page =
  | "Dashboard" | "Discover" | "Outreach" | "Workflows" | "Radar" | "Content Studio"
  | "Calendar" | "Leads" | "Team" | "Analytics" | "AI Insights" | "Workspace" | "Settings"
  | "Campaigns" | "Sequences" | "Segments" | "Scheduler" | "Revenue" | "GEO";

const nav: { label: Page; icon: typeof LayoutDashboard }[] = [
  { label: "Dashboard", icon: LayoutDashboard },
  { label: "Discover", icon: Compass },
  { label: "Radar", icon: Radio },
  { label: "Segments", icon: Target },
  { label: "Outreach", icon: Send },
  { label: "Sequences", icon: Mail },
  { label: "Campaigns", icon: CircleDollarSign },
  { label: "Scheduler", icon: CalendarClock },
  { label: "Content Studio", icon: WandSparkles },
  { label: "Calendar", icon: CalendarDays },
  { label: "Leads", icon: UserCheck },
  { label: "GEO", icon: Globe },
  { label: "Revenue", icon: Activity },
  { label: "Workflows", icon: Zap },
  { label: "Team", icon: Users },
];

const stages = ["identified", "engaged", "qualified", "conversation", "converted"];
const platforms = ["All platforms", "X", "Reddit", "Hacker News", "Indie Hackers", "GitHub", "Web"];
const intentOptions = ["All intent", "Auto-Outreached (≥60%)", "High", "Medium", "Low"];
const contextFields: [string, string][] = [
  ["website", "Website"],
  ["description", "Product description"],
  ["industry", "Industry"],
  ["customer", "Target customer"],
  ["icp", "Ideal customer profile"],
  ["titles", "Target job titles"],
  ["painPoints", "Customer pain points"],
  ["competitors", "Competitors"],
  ["voice", "Brand voice"],
  ["objective", "Primary GTM objective"],
];

const logoPresets = [
  { label: "Standard Brand", url: "/threadly-logo.svg" },
  { label: "Deep Purple Compass", url: "/Deep Purple THREADLY Compass Logo.png" },
  { label: "Star Emblem", url: "/Purple Four-Point Star Emblem.png" },
];

function PlatformBadge({ platform }: { platform: string }) {
  const icon = platform === "Reddit" ? "🔴" : platform === "Hacker News" ? "🟠" : platform === "Indie Hackers" ? "🔵" : platform === "GitHub" ? "🐙" : platform === "Web" ? "🌐" : "𝕏";
  return <span className={`platform platform-${platform.toLowerCase().replace(/\s+/g, "-")}`} aria-label={platform}>{icon}</span>;
}
function formatDate(date: string) { return new Date(date).toLocaleDateString("en-US", { month: "short", day: "numeric" }); }
function timeAgo(date?: string | null) {
  if (!date) return "Never";
  const timestamp = new Date(date).getTime();
  if (isNaN(timestamp)) return "Recently";
  const diff = Date.now() - timestamp;
  if (diff < 60000) return "Just now";
  const minutes = Math.floor(diff / 60000);
  if (minutes < 60) return `${minutes}m ago`;
  const hours = Math.floor(diff / 3600000);
  if (hours < 24) return `${hours}h ago`;
  const days = Math.floor(diff / 86400000);
  return `${days}d ago`;
}

export default function Workspace({ email, name, isAdmin = false, getIdToken, signOutAction }: { email: string; name: string; isAdmin?: boolean; getIdToken: () => Promise<string>; signOutAction: () => Promise<void> }) {
  const [data, setData] = useState<State | null>(null);
  const [page, setPage] = useState<Page>("Dashboard");
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [toast, setToast] = useState("");
  const [growth, setGrowth] = useState<GrowthSnapshot | null>(null);
  const [mobileNav, setMobileNav] = useState(false);
  const [sidebarCollapsed, setSidebarCollapsed] = useState(false);
  const [query, setQuery] = useState("");
  const [platform, setPlatform] = useState("All platforms");
  const [intent, setIntent] = useState("All intent");
  const [selected, setSelected] = useState<Opportunity | null>(null);
  const [editingDraft, setEditingDraft] = useState<Draft | null>(null);
  const [draftText, setDraftText] = useState("");
  const [draftPlatform, setDraftPlatform] = useState("X");
  const [draftKind, setDraftKind] = useState("Discussion response");
  const [tone, setTone] = useState("Conversational");
  const [leadModal, setLeadModal] = useState<Opportunity | "direct" | null>(null);
  const [leadForm, setLeadForm] = useState({ name: "", email: "", company: "", role: "", notes: "", platform: "X" });
  const [context, setContext] = useState<Record<string, string>>({});
  const [companyName, setCompanyName] = useState("");
  const [companyLogo, setCompanyLogo] = useState("/threadly-logo.svg");
  const [companyDomain, setCompanyDomain] = useState("");
  const [companyLegalName, setCompanyLegalName] = useState("");
  const [companyWebsite, setCompanyWebsite] = useState("");
  const [companyIndustry, setCompanyIndustry] = useState("");
  const [companyStage, setCompanyStage] = useState("Seed");
  const [companyCountry, setCompanyCountry] = useState("");
  const [companyRegion, setCompanyRegion] = useState("");
  const [companyTimezone, setCompanyTimezone] = useState("UTC");

  const [clockNow, setClockNow] = useState(() => new Date());
  const [detectedZone, setDetectedZone] = useState(() => detectBrowserTimezone());
  const [zone, setZone] = useState(() => detectBrowserTimezone());
  const [timezonePrompt, setTimezonePrompt] = useState<{ previous: string; detected: string } | null>(null);

  const [calendarView, setCalendarView] = useState<"Month" | "Week" | "List">("Month");
  const [calendarMonth, setCalendarMonth] = useState(new Date());
  const [scheduleId, setScheduleId] = useState<string | null>(null);
  const [scheduleDate, setScheduleDate] = useState("");
  const [assistantInput, setAssistantInput] = useState("");
  const [assistantQuestion, setAssistantQuestion] = useState("");

  // Team Invite modal state
  const [inviteModal, setInviteModal] = useState(false);
  const [inviteForm, setInviteForm] = useState({ email: "", role: "Member" as TeamInvite["role"] });
  const [createdInviteLink, setCreatedInviteLink] = useState("");
  const [pendingInviteToken, setPendingInviteToken] = useState<string | null>(null);

  // Member editing modal state
  const [editingMember, setEditingMember] = useState<TeamMember | null>(null);
  const [memberAvailabilityDraft, setMemberAvailabilityDraft] = useState({
    status: "Auto",
    workingDays: [1, 2, 3, 4, 5],
    start: "09:00",
    end: "17:00",
    timezone: "UTC",
    title: "",
    country: "",
    region: "",
  });

  // Cross-timezone slots finder state
  const [slotDuration, setSlotDuration] = useState(30);
  const [selectedSlotFinderMembers, setSelectedSlotFinderMembers] = useState<string[]>([]);
  const [commonSlots, setCommonSlots] = useState<CommonSlot[]>([]);
  const [meetingBookingModal, setMeetingBookingModal] = useState<{ slot: CommonSlot; leadId?: string } | null>(null);
  const [meetingTitle, setMeetingTitle] = useState("Threadly Prospect Discovery Session");
  const [meetingAttendees, setMeetingAttendees] = useState("");

  // Custom Workflow modal state
  const [workflowModal, setWorkflowModal] = useState(false);
  const [wfForm, setWfForm] = useState({
    name: "",
    description: "",
    trigger: "new_signal" as Workflow["trigger"],
    action: "priority_alert" as Workflow["action"],
    category: "discovery" as Workflow["category"],
  });

  // Onboarding wizard state
  const [onboardingOpen, setOnboardingOpen] = useState(false);
  const [onboardingStep, setOnboardingStep] = useState<1 | 2 | 3>(1);
  const [onboardingUrl, setOnboardingUrl] = useState("");
  const [onboardingAnalyzing, setOnboardingAnalyzing] = useState(false);
  const [onboardingForm, setOnboardingForm] = useState({
    name: "",
    description: "",
    icp: "",
    keywords: "",
    targetSubreddits: "SaaS, startups, Entrepreneur, smallbusiness, webdev",
  });
  const [onboardingLaunching, setOnboardingLaunching] = useState(false);

  // Topbar User Menu state
  const [userMenuOpen, setUserMenuOpen] = useState(false);
  const userMenuRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!userMenuOpen) return;
    const handleClickOutside = (event: MouseEvent) => {
      if (userMenuRef.current && !userMenuRef.current.contains(event.target as Node)) {
        setUserMenuOpen(false);
      }
    };
    document.addEventListener("mousedown", handleClickOutside);
    return () => document.removeEventListener("mousedown", handleClickOutside);
  }, [userMenuOpen]);

  const refresh = useCallback(async () => {
    try {
      const token = await getIdToken();
      const response = await fetch("/api/state", { cache: "no-store", headers: { Authorization: `Bearer ${token}` } });
      const result = await response.json();
      if (!response.ok) throw new Error(result.error || "Could not load workspace");
      setData(result);
      if (result.growth) setGrowth(result.growth);
      setContext(result.workspace.context || {});
      setCompanyName(result.workspace.name || "My company");
      setCompanyLogo(result.workspace.logoUrl || "/threadly-logo.svg");
      setCompanyDomain(result.workspace.domain || "");
      setCompanyLegalName(result.workspace.legalName || "");
      setCompanyWebsite(result.workspace.website || "");
      setCompanyIndustry(result.workspace.industry || "");
      setCompanyStage(result.workspace.stage || "Seed");
      setCompanyCountry(result.workspace.country || "");
      setCompanyRegion(result.workspace.region || "");
      setCompanyTimezone(result.workspace.defaultTimezone || "UTC");
      setError("");
    } catch (err) {
      setError(err instanceof Error ? err.message : "Could not load workspace");
    } finally {
      setLoading(false);
    }
  }, [getIdToken]);

  useEffect(() => { void refresh(); }, [refresh]);
  useEffect(() => {
    if (["Discover", "Outreach", "Workflows", "Team", "Campaigns", "Sequences", "Segments", "Scheduler", "Revenue", "GEO"].includes(page)) void refresh();
  }, [page, refresh]);

  const { events: liveEvents, connected: liveConnected } = useLiveStream(!!data, growth?.events || [], getIdToken);

  // Clock ticker for live timezone updates
  useEffect(() => {
    const timer = setInterval(() => setClockNow(new Date()), 30_000);
    return () => clearInterval(timer);
  }, []);

  // Timezone change listener on browser window focus
  useEffect(() => {
    const checkTz = () => {
      const current = detectBrowserTimezone();
      if (current !== detectedZone) {
        setDetectedZone(current);
        if (current !== zone) {
          setTimezonePrompt({ previous: zone, detected: current });
        }
      }
    };
    window.addEventListener("focus", checkTz);
    return () => window.removeEventListener("focus", checkTz);
  }, [detectedZone, zone]);

  // Check URL query parameters for ?invite=TOKEN
  useEffect(() => {
    if (typeof window !== "undefined") {
      const params = new URLSearchParams(window.location.search);
      const invite = params.get("invite");
      if (invite) {
        setPendingInviteToken(invite);
      }
    }
  }, []);

  // Calculate common time slots across selected team members
  useEffect(() => {
    if (!data?.team?.length) return;
    const targetMembers = selectedSlotFinderMembers.length
      ? data.team.filter(m => selectedSlotFinderMembers.includes(m.id))
      : data.team.slice(0, 3);
    const slots = findCommonTimeSlots(
      targetMembers.map(m => ({
        id: m.id,
        displayName: m.name,
        email: m.email,
        timezone: m.timezone || "UTC",
        workingDays: m.workingDays || [1, 2, 3, 4, 5],
        workdayStart: m.workdayStart || "09:00",
        workdayEnd: m.workdayEnd || "17:00",
        availabilityStatus: m.availabilityStatus || "Available",
      })),
      [],
      new Date(),
      slotDuration,
      6,
      zone
    );
    setCommonSlots(slots);
  }, [data?.team, selectedSlotFinderMembers, slotDuration, zone]);

  const handleLogoUpload = (file?: File | null) => {
    if (!file) return;
    if (file.size > 2 * 1024 * 1024) {
      setToast("Logo image must be 2 MB or smaller.");
      return;
    }
    const reader = new FileReader();
    reader.onload = (e) => {
      const result = e.target?.result as string;
      if (result) {
        setCompanyLogo(result);
        setToast("Company logo loaded. Click 'Save company settings' to apply.");
      }
    };
    reader.readAsDataURL(file);
  };

  useEffect(() => {
    if (!mobileNav) return;
    const previousOverflow = document.body.style.overflow;
    const closeOnEscape = (event: KeyboardEvent) => { if (event.key === "Escape") setMobileNav(false); };
    document.body.style.overflow = "hidden";
    window.addEventListener("keydown", closeOnEscape);
    return () => { document.body.style.overflow = previousOverflow; window.removeEventListener("keydown", closeOnEscape); };
  }, [mobileNav]);

  useEffect(() => { if (!toast) return; const timer = setTimeout(() => setToast(""), 4200); return () => clearTimeout(timer); }, [toast]);

  async function act(action: string, payload: Record<string, unknown>, success = "Saved") {
    setBusy(true); setError("");
    try {
      const token = await getIdToken();
      const response = await fetch("/api/action", {
        method: "POST",
        headers: { "Content-Type": "application/json", Authorization: `Bearer ${token}` },
        body: JSON.stringify({ action, ...payload })
      });
      const result = await response.json();
      if (!response.ok) throw new Error(result.error || "Action failed");
      await refresh();
      setToast(success);
      return result;
    } catch (err) {
      setError(err instanceof Error ? err.message : "Action failed");
      return null;
    } finally {
      setBusy(false);
    }
  }

  function openEditMember(member: TeamMember) {
    setEditingMember(member);
    setMemberAvailabilityDraft({
      status: member.availabilityStatus || "Available",
      workingDays: member.workingDays || [1, 2, 3, 4, 5],
      start: member.workdayStart || "09:00",
      end: member.workdayEnd || "17:00",
      timezone: member.timezone || zone || "UTC",
      title: member.title || "",
      country: member.country || "",
      region: member.region || "",
    });
  }

  async function saveMemberEdits() {
    if (!editingMember) return;
    const ok1 = await act("teamMemberProfile", {
      memberId: editingMember.id,
      title: memberAvailabilityDraft.title,
      country: memberAvailabilityDraft.country,
      region: memberAvailabilityDraft.region,
      timezone: memberAvailabilityDraft.timezone,
    }, "Profile updated");
    const ok2 = await act("teamAvailability", {
      memberId: editingMember.id,
      workdayStart: memberAvailabilityDraft.start,
      workdayEnd: memberAvailabilityDraft.end,
      workingDays: memberAvailabilityDraft.workingDays,
      availabilityStatus: memberAvailabilityDraft.status,
      timezone: memberAvailabilityDraft.timezone,
    }, "Availability updated");
    if (ok1 && ok2) {
      setEditingMember(null);
    }
  }

  async function handleBookMeeting() {
    if (!meetingBookingModal) return;
    setBusy(true);
    try {
      const { slot, leadId } = meetingBookingModal;
      const attendees = meetingAttendees.split(",").map(e => e.trim()).filter(Boolean);
      const meetingResult = await scheduleGoogleMeeting({
        title: meetingTitle || "Threadly Growth Sync",
        description: `Scheduled via Threadly Workspace. Active timezone: ${zone}`,
        start: new Date(slot.start),
        end: new Date(slot.end),
        timezone: zone,
        attendeeEmails: attendees,
      });

      if (leadId) {
        await act("scheduleLeadMeeting", {
          leadId,
          meetingStart: slot.start,
          meetingEnd: slot.end,
          meetingUrl: meetingResult.meetUrl,
          calendarEventUrl: meetingResult.htmlLink,
          googleCalendarEventId: meetingResult.eventId,
        }, "Lead meeting scheduled");
      }

      setToast(`Meeting scheduled! Google Meet: ${meetingResult.meetUrl}`);
      setMeetingBookingModal(null);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Could not schedule meeting");
    } finally {
      setBusy(false);
    }
  }

  const openOnboarding = () => {
    setOnboardingOpen(true);
    setOnboardingStep(1);
    setOnboardingUrl(companyWebsite || (companyDomain ? `https://${companyDomain}` : ""));
    setOnboardingForm({
      name: companyName && companyName !== "My company" ? companyName : "",
      description: context?.description || "",
      icp: context?.icp || "",
      keywords: context?.keywords || "",
      targetSubreddits: "SaaS, startups, Entrepreneur, smallbusiness, webdev",
    });
  };

  const handleAutoAnalyzeWebsite = async () => {
    if (!onboardingUrl.trim()) return;
    setOnboardingAnalyzing(true);
    setError("");
    try {
      const token = await getIdToken();
      const res = await fetch("/api/action", {
        method: "POST",
        headers: { "Content-Type": "application/json", Authorization: `Bearer ${token}` },
        body: JSON.stringify({ action: "analyzeWebsite", websiteUrl: onboardingUrl.trim() }),
      });
      const result = await res.json();
      if (!res.ok) throw new Error(result.error || "Failed to analyze website");

      const analysis = result.analysis || {};
      const company = analysis.company || {};
      const kw = (analysis.discoveryKeywords || analysis.searchKeywords || [company.name, "SaaS", "software"])
        .filter(Boolean)
        .slice(0, 6)
        .join(", ");

      setOnboardingForm({
        name: company.name || onboardingForm.name || "My Company",
        description: company.description || analysis.productSummary || onboardingForm.description,
        icp: company.targetAudience || analysis.icp || onboardingForm.icp,
        keywords: kw || onboardingForm.keywords,
        targetSubreddits: "SaaS, startups, Entrepreneur, smallbusiness, webdev",
      });
      setOnboardingStep(2);
      setToast("Website analyzed! Review and customize your target signals.");
    } catch (err) {
      setError(err instanceof Error ? err.message : "Website analysis failed");
      setOnboardingStep(2);
    } finally {
      setOnboardingAnalyzing(false);
    }
  };

  const handleLaunchOnboarding = async () => {
    if (!onboardingForm.name.trim()) return;
    setOnboardingLaunching(true);
    setError("");
    try {
      const token = await getIdToken();
      const kwList = onboardingForm.keywords
        .split(/[,;\n]/)
        .map(k => k.trim())
        .filter(Boolean);

      const res = await fetch("/api/action", {
        method: "POST",
        headers: { "Content-Type": "application/json", Authorization: `Bearer ${token}` },
        body: JSON.stringify({
          action: "onboardCompany",
          name: onboardingForm.name,
          website: onboardingUrl,
          description: onboardingForm.description,
          icp: onboardingForm.icp,
          keywords: kwList,
          painPoints: [
            `Looking for better ${onboardingForm.name || "solutions"}`,
            "Inefficient manual workflows",
            "High churn and low conversion",
          ],
        }),
      });
      const result = await res.json();
      if (!res.ok) throw new Error(result.error || "Onboarding failed");

      await refresh();
      setOnboardingOpen(false);
      setToast(`🎉 ${onboardingForm.name} onboarded! Real community signals & live workflows are now active.`);
      go("Radar");
    } catch (err) {
      setError(err instanceof Error ? err.message : "Onboarding failed");
    } finally {
      setOnboardingLaunching(false);
    }
  };

  function go(next: Page) { setPage(next); setMobileNav(false); setSelected(null); setEditingDraft(null); document.getElementById("portal-main")?.scrollTo({ top: 0, behavior: "smooth" }); }
  function openStudio(opp?: Opportunity) { setSelected(opp || null); setEditingDraft(null); setDraftText(""); setDraftPlatform(opp?.platform || "X"); setDraftKind(opp ? "Discussion response" : "Educational post"); go("Content Studio"); setSelected(opp || null); }
  function editDraft(draft: Draft) { setEditingDraft(draft); setDraftText(draft.text); setDraftPlatform(draft.platform); setDraftKind(draft.kind); go("Content Studio"); setEditingDraft(draft); }

  const realOpportunities = data?.opportunities.filter(o => o.source_kind !== "demo" && o.status !== "dismissed" && !o.id.startsWith("x-sample-")) || [];
  const visible = useMemo(() => (data?.opportunities || []).filter(o => o.status !== "dismissed" && o.source_kind !== "demo" && !o.id.startsWith("x-sample-") && (platform === "All platforms" || o.platform === platform) && (intent === "All intent" || (intent.includes("60%") ? (o.relevance || 0) >= 60 : o.intent === intent)) && `${o.title} ${o.body} ${o.pain} ${o.community}`.toLowerCase().includes(query.toLowerCase())), [data, platform, intent, query]);
  const stats = {
    opportunities: realOpportunities.length,
    conversations: realOpportunities.filter(o => o.intent === "High").length,
    drafts: data?.drafts.filter(d => (d.status === "draft" || d.status === "review")).length || 0,
    leads: data?.leads.length || 0,
    workflows: (data?.workflows || []).filter(w => w.enabled).length,
    team: data?.team.length || 1,
  };
  const firstName = name.split(" ")[0] || "Founder";

  return <div id="wisentry-portal" className={`app-shell ${sidebarCollapsed ? "sidebar-collapsed" : ""}`}>
    {mobileNav && <button className="sidebar-backdrop" type="button" aria-label="Close navigation" onClick={() => setMobileNav(false)}/>}
    <aside id="portal-sidebar" className={`sidebar ${mobileNav ? "sidebar-open" : ""}`} aria-label="Portal navigation">
      <button className="sidebar-brand" type="button" onClick={() => go("Dashboard")} aria-label="Threadly dashboard">
        <Image className="sidebar-brand-full" src="/threadly-logo.svg" alt="Threadly" width={155} height={47} priority/>
        <Image className="sidebar-brand-mark" src="/favicon.svg" alt="" width={34} height={34}/>
      </button>

      <button type="button" className="workspace-switch" onClick={() => go("Workspace")} aria-label="Open workspace settings">
        <span className="workspace-avatar">
          {companyLogo && companyLogo.startsWith("/") ? (
            <Image src={companyLogo} alt="" width={22} height={22} className="object-contain" />
          ) : (
            (companyName || "W").slice(0, 1).toUpperCase()
          )}
        </span>
        <span>
          <strong>{companyName || "My Workspace"}</strong>
          <small>{stats.team} team member{stats.team === 1 ? "" : "s"}</small>
        </span>
        <ChevronDown size={14}/>
      </button>

      <div className="sidebar-label">WORKSPACE</div>
      <nav className="nav-list" aria-label="Main navigation">
        {nav.map(item => {
          const Icon = item.icon;
          return <button key={item.label} className={`nav-item ${page === item.label ? "active" : ""}`} onClick={() => go(item.label)} aria-label={item.label} title={sidebarCollapsed ? item.label : undefined}>
            <Icon size={18}/>
            <span>{item.label}</span>
            {item.label === "Radar" && <i>{stats.opportunities}</i>}
            {item.label === "Workflows" && <i>{stats.workflows}</i>}
            {item.label === "Team" && <i>{stats.team}</i>}
          </button>;
        })}
      </nav>

      <div className="sidebar-bottom">
        <div className="sidebar-label">ACCOUNT</div>
        <button className={`nav-item ${page === "Settings" ? "active" : ""}`} onClick={() => go("Settings")} aria-label="Settings" title={sidebarCollapsed ? "Settings" : undefined}>
          <Settings size={18}/>
          <span>Settings</span>
        </button>
        <button
          type="button"
          className="nav-item logout-nav-item"
          onClick={() => void signOutAction()}
          aria-label="Log out"
          title={sidebarCollapsed ? "Log out" : undefined}
        >
          <LogOut size={18}/>
          <span>Log out</span>
        </button>
      </div>
    </aside>

    <div id="portal-main" className="main-area">
      <header className="topbar">
        <button className="sidebar-toggle" aria-label={sidebarCollapsed ? "Expand sidebar" : "Collapse sidebar"} aria-controls="portal-sidebar" aria-expanded={!sidebarCollapsed} onClick={() => setSidebarCollapsed(value => !value)}>
          {sidebarCollapsed ? <PanelLeftOpen size={19}/> : <PanelLeftClose size={19}/>}
        </button>
        <button className="mobile-menu" aria-label={mobileNav ? "Close navigation" : "Open navigation"} aria-controls="portal-sidebar" aria-expanded={mobileNav} onClick={() => setMobileNav(value => !value)}>
          {mobileNav ? <X size={20}/> : <Menu size={20}/>}
        </button>
        <div className="breadcrumbs">
          <span>{companyName || "Workspace"}</span>
          <ChevronRight size={15}/>
          <strong>{page}</strong>
        </div>
        <div className="topbar-right">
          <span className="timezone-topbar-pill" title={`Active workspace timezone: ${zone}`}>
            <Clock3 size={13}/>
            <span>{formatMemberTime(clockNow, zone)}</span>
          </span>
          <span className="demo-pill"><span className="tiny-dot"/> LIVE WORKSPACE</span>
          <button
            type="button"
            className="btn btn-outline"
            style={{ minHeight: 32, fontSize: 12, padding: "0 12px", display: "inline-flex", alignItems: "center", gap: 6 }}
            onClick={openOnboarding}
            title="Onboard your company to extract ICP and launch live lead workflows"
          >
            <Sparkles size={14} style={{ color: "#ff4500" }} />
            <span>Onboard Company</span>
          </button>
          <button className="icon-button" aria-label="Help" onClick={() => setToast("Your signals, real-time leads, and workspace data are safely saved.")}><CircleHelp size={19}/></button>
          <button className="icon-button" aria-label="Notifications" onClick={() => setToast("All outreach workflows are up to date.")}><Bell size={19}/></button>

          {/* User Account Menu with Logout */}
          <div className="topbar-user-menu" ref={userMenuRef}>
            <button
              type="button"
              className="topbar-user-trigger"
              onClick={() => setUserMenuOpen(prev => !prev)}
              aria-label="User account menu"
              aria-expanded={userMenuOpen}
            >
              <span className="profile-avatar small">{firstName.charAt(0).toUpperCase()}</span>
              <span className="topbar-user-name">{firstName}</span>
              <ChevronDown size={13} className={`menu-chevron ${userMenuOpen ? "open" : ""}`} />
            </button>

            {userMenuOpen && (
              <div className="user-dropdown-popup">
                <div className="user-dropdown-header">
                  <span className="profile-avatar">{firstName.charAt(0).toUpperCase()}</span>
                  <div>
                    <strong>{name}</strong>
                    <small>{email}</small>
                    <span className="dropdown-badge">{companyName || "Workspace"}</span>
                  </div>
                </div>
                <div className="dropdown-divider" />
                <button
                  type="button"
                  className="dropdown-item"
                  onClick={() => {
                    setUserMenuOpen(false);
                    go("Settings");
                  }}
                >
                  <Settings size={15} /> Account Settings
                </button>
                {isAdmin && <a
                  className="dropdown-item"
                  href="/admin/waitlist"
                  target="_blank"
                  rel="noopener noreferrer"
                  onClick={() => setUserMenuOpen(false)}
                >
                  <Users size={15} /> Review beta requests <ExternalLink size={13} />
                </a>}
                <button
                  type="button"
                  className="dropdown-item"
                  onClick={() => {
                    setUserMenuOpen(false);
                    go("Workspace");
                  }}
                >
                  <Users size={15} /> Company & Branding
                </button>
                <div className="dropdown-divider" />
                <button
                  type="button"
                  className="dropdown-item logout"
                  onClick={() => {
                    setUserMenuOpen(false);
                    void signOutAction();
                  }}
                >
                  <LogOut size={15} /> Log out
                </button>
              </div>
            )}
          </div>
        </div>
      </header>

      <main className="content-area">
        {loading ? (
          <div className="loading-state">
            <span className="spinner"/>
            <span>Preparing your workspace…</span>
          </div>
        ) : error && !data ? (
          <div className="error-state">
            <h2>Workspace unavailable</h2>
            <p>{error}</p>
            <button className="btn btn-dark" onClick={refresh}>Try again</button>
          </div>
        ) : data && <>
          {/* Timezone Switch Prompt Banner */}
          {timezonePrompt && (
            <div className="timezone-prompt-banner" role="status">
              <div>
                <strong>Timezone Change Detected:</strong> Your browser reports <b>{timezonePrompt.detected}</b>, but this workspace is set to <b>{timezonePrompt.previous}</b>.
              </div>
              <div className="banner-actions">
                <button
                  className="btn btn-dark"
                  style={{ minHeight: 32, fontSize: 11, padding: "0 12px" }}
                  onClick={() => {
                    setZone(timezonePrompt.detected);
                    setTimezonePrompt(null);
                    setToast(`Workspace timezone switched to ${timezonePrompt.detected}`);
                  }}
                >
                  Switch to {timezonePrompt.detected}
                </button>
                <button
                  className="btn btn-outline"
                  style={{ minHeight: 32, fontSize: 11, padding: "0 12px" }}
                  onClick={() => setTimezonePrompt(null)}
                >
                  Keep {timezonePrompt.previous}
                </button>
              </div>
            </div>
          )}

          {/* Pending Invite Acceptance Banner */}
          {pendingInviteToken && (
            <div className="invite-gate-banner" role="alert">
              <div>
                <strong>Workspace Invitation:</strong> You have an invitation to join this workspace team.
              </div>
              <div className="banner-actions">
                <button
                  className="btn btn-dark"
                  style={{ minHeight: 32, fontSize: 11, padding: "0 12px" }}
                  disabled={busy}
                  onClick={async () => {
                    const ok = await act("teamAcceptInvite", { token: pendingInviteToken, timezone: zone }, "Invitation accepted! Welcome to the workspace.");
                    if (ok) {
                      setPendingInviteToken(null);
                      if (typeof window !== "undefined") {
                        const url = new URL(window.location.href);
                        url.searchParams.delete("invite");
                        window.history.replaceState({}, "", url.toString());
                      }
                      go("Team");
                    }
                  }}
                >
                  Accept Invitation <Check size={14}/>
                </button>
                <button
                  className="btn btn-outline"
                  style={{ minHeight: 32, fontSize: 11, padding: "0 12px" }}
                  onClick={() => {
                    setPendingInviteToken(null);
                    if (typeof window !== "undefined") {
                      const url = new URL(window.location.href);
                      url.searchParams.delete("invite");
                      window.history.replaceState({}, "", url.toString());
                    }
                  }}
                >
                  Dismiss
                </button>
              </div>
            </div>
          )}
          {/* DASHBOARD */}
          {page === "Dashboard" && <>
            <div className="page-head dashboard-head">
              <div>
                <div className="eyebrow"><span className="pulse-dot"/> {new Date().toLocaleDateString("en-US", { weekday: "long", month: "long", day: "numeric", year: "numeric" }).toUpperCase()}</div>
                <h1>Good morning, {firstName}<span className="accent-period">.</span></h1>
                <p>Real conversations, automated outreach, and team intelligence in one cockpit.</p>
              </div>
              <div className="page-actions">
                <button className="btn btn-outline" onClick={openOnboarding}><Sparkles size={16}/> Onboard Company</button>
                <button className="btn btn-outline" onClick={() => go("Workflows")}><Zap size={16}/> Workflows</button>
                <button className="btn btn-dark" onClick={() => go("Radar")}>Explore Radar <ArrowUpRight size={17}/></button>
              </div>
            </div>

            {/* Onboarding Welcome Banner for new or unconfigured workspaces */}
            {(companyName === "My company" || !context?.description) && (
              <div className="onboarding-welcome-banner">
                <div className="onboarding-banner-main">
                  <div className="onboarding-banner-icon">
                    <Sparkles size={22} />
                  </div>
                  <div className="onboarding-banner-text">
                    <h3>Onboard your company to source real customer leads</h3>
                    <p>Enter your website to automatically extract your ICP, target keywords, and launch tailored community discovery and auto-outreach workflows.</p>
                  </div>
                </div>
                <button
                  type="button"
                  className="onboarding-banner-btn"
                  onClick={openOnboarding}
                >
                  <Sparkles size={16} /> Onboard Company Now
                </button>
              </div>
            )}

            <div className="stats-grid">
              <Stat label="PIPELINE" value={data.growth?.metrics.pipelineValue || 0} display={`$${Math.round(data.growth?.metrics.pipelineValue || 0).toLocaleString("en-US")}`} delta={`${stats.leads} leads in play`} icon={Target} onClick={() => go("Revenue")}/>
              <Stat label="REPLY RATE" value={data.growth?.metrics.replyRate || 0} display={`${data.growth?.metrics.replyRate || 0}%`} delta={`${data.growth?.metrics.enrolledProspects || 0} enrolled`} icon={MessageCircle} onClick={() => go("Sequences")}/>
              <Stat label="BLENDED ROAS" value={data.growth?.metrics.blendedRoas || 0} display={`${(data.growth?.metrics.blendedRoas || 0).toFixed(2)}×`} delta={`${data.growth?.metrics.activeCampaigns || 0} campaigns live`} icon={Flame} onClick={() => go("Campaigns")}/>
              <Stat label="GEO SHARE" value={data.growth?.metrics.geoShare || 0} display={`${data.growth?.metrics.geoShare || 0}%`} delta="AI answer citations" icon={Globe} onClick={() => go("GEO")}/>
            </div>

            <div className="dashboard-columns">
              <div className="dashboard-main-column" style={{ display: "flex", flexDirection: "column", gap: "20px" }}>
                <section className="surface-section">
                  <div className="section-heading">
                    <div>
                      <div className="section-kicker">THE SIGNAL · MULTI-CHANNEL INTENT</div>
                      <h2>Saved conversations</h2>
                    </div>
                    <button className="text-link" onClick={() => go("Radar")}>View all <ArrowRight size={16}/></button>
                  </div>
                  <div className="opportunity-list">
                    {!data.opportunities.length && <p className="muted-copy">No conversations yet. Open Discover to find high-intent posts across Reddit, Hacker News, X, and forums.</p>}
                    {data.opportunities.slice(0, 3).map((o, i) => <OpportunityRow key={o.id} o={o} index={i} onOpen={() => { go("Radar"); setSelected(o); }} onDraft={() => openStudio(o)}/>)}
                  </div>
                </section>

                <div className="bottom-grid" style={{ marginTop: 0 }}>
                  <div className="mini-card">
                    <div className="section-heading compact">
                      <h3>Upcoming content</h3>
                      <button className="text-link" onClick={() => go("Calendar")}>View calendar <ArrowRight size={15}/></button>
                    </div>
                    {data.drafts.filter(d => d.scheduled_at).length ? data.drafts.filter(d => d.scheduled_at).slice(0, 2).map(d => (
                      <div className="activity-row" key={d.id}>
                        <CalendarDays size={17}/>
                        <span>{d.platform} · Publishing reminder</span>
                        <strong>{formatDate(d.scheduled_at!)}</strong>
                      </div>
                    )) : <p className="muted-copy">Your calendar is clear. Approve a draft to plan your next post.</p>}
                  </div>

                  <div className="mini-card">
                    <div className="section-heading compact">
                      <h3>Recent leads</h3>
                      <button className="text-link" onClick={() => go("Leads")}>View pipeline <ArrowRight size={15}/></button>
                    </div>
                    {data.leads.length ? data.leads.slice(0, 2).map(l => (
                      <div className="activity-row" key={l.id}>
                        <Users size={17}/>
                        <span>{l.name}</span>
                        <strong>{l.stage}</strong>
                      </div>
                    )) : <p className="muted-copy">No leads saved yet. Start from a promising conversation.</p>}
                  </div>
                </div>
              </div>

              <aside className="right-column">
                <div className="insight-card">
                  <div className="insight-icon"><Zap size={19}/></div>
                  <div className="section-kicker">AUTOMATION STATUS</div>
                  <h3>Automated Outreach is Active</h3>
                  <p>AI dual-model qualification evaluates incoming leads and generates personalized first-touch replies.</p>
                  <button onClick={() => go("Workflows")}>Configure workflows <ArrowUpRight size={16}/></button>
                </div>

                <LiveFeed events={liveEvents} connected={liveConnected} compact/>

                <div className="mini-card">
                  <div className="section-heading compact">
                    <h3>Needs your attention</h3>
                    <span className="count-badge">{stats.drafts}</span>
                  </div>
                  {data.drafts.filter(d => d.status === "draft" || d.status === "review").slice(0, 2).map(d => (
                    <button className="mini-row" key={d.id} onClick={() => editDraft(d)}>
                      <PlatformBadge platform={d.platform}/>
                      <span><strong>{d.kind}</strong><small>Draft awaiting review</small></span>
                      <ArrowUpRight size={15}/>
                    </button>
                  ))}
                  <button className="text-link" onClick={() => go("Content Studio")}>Open Content Studio <ArrowRight size={15}/></button>
                </div>
              </aside>
            </div>
          </>}

          {/* WORKFLOWS & AUTOMATED OUTREACH */}
          {page === "Workflows" && <>
            <div className="page-head">
              <div>
                <div className="eyebrow"><span className="pulse-dot"/> AUTONOMOUS GROWTH ENGINE</div>
                <h1>Workflows & Automated Outreach<span className="accent-period">.</span></h1>
                <p>Coordinate AI signal discovery, qualification, personalized outreach, and multi-touch cadences.</p>
              </div>
              <div className="page-actions">
                <button className="btn btn-outline" onClick={() => setWorkflowModal(true)}><Plus size={16}/> New workflow</button>
                <button className="btn btn-dark" disabled={busy} onClick={async () => {
                  setBusy(true);
                  const activeWorkflows = (data.workflows || []).filter(w => w.enabled);
                  for (const wf of activeWorkflows) {
                    await act("workflowExecute", { id: wf.id });
                  }
                  setBusy(false);
                  setToast(`${activeWorkflows.length} active workflow${activeWorkflows.length === 1 ? "" : "s"} executed`);
                }}>
                  <Play size={16}/> Run active workflows
                </button>
              </div>
            </div>

            <div className="workflow-quick-bar">
              <div className="workflow-quick-copy">
                <h3>Autonomous Pipeline Orchestrator</h3>
                <p>Threadly continuously captures X conversations matching your customer problems and triggers appropriate actions.</p>
              </div>
              <div className="workflow-quick-actions">
                <button className="workflow-quick-btn" onClick={() => go("Discover")}><Search size={14}/> Run Discovery Scan</button>
                <button className="workflow-quick-btn" onClick={() => go("Outreach")}><Send size={14}/> Review Outreach Queue</button>
              </div>
            </div>

            <div className="workflow-grid">
              {(data.workflows || []).map(wf => {
                const category = wf.category || "outreach";
                const trigger = wf.trigger || "new_signal";
                const action = wf.action || "priority_alert";
                return (
                  <article className="workflow-card" key={wf.id}>
                    <div className="workflow-card-head">
                      <div className="workflow-icon"><Zap size={20}/></div>
                      <div className="workflow-badge-row">
                        <span className={`workflow-type-badge ${category}`}>
                          {category.toUpperCase()}
                        </span>
                        <button
                          type="button"
                          className={`workflow-toggle-btn ${wf.enabled ? "active" : "inactive"}`}
                          onClick={() => act("workflowToggle", { id: wf.id, enabled: !wf.enabled }, wf.enabled ? "Workflow paused" : "Workflow enabled")}
                        >
                          {wf.enabled ? "ENABLED" : "PAUSED"}
                        </button>
                      </div>
                    </div>
                    <h3>{wf.name}</h3>
                    <p>{wf.description}</p>

                    <div className="workflow-pipeline-steps">
                      <div className="workflow-step-item">
                        <span className="step-num">1</span>
                        <span>Trigger: <strong>{trigger.replace(/_/g, " ")}</strong></span>
                      </div>
                      <div className="workflow-step-item">
                        <span className="step-num">2</span>
                        <span>Action: <strong>{action.replace(/_/g, " ")}</strong></span>
                      </div>
                    </div>

                    <div className="workflow-card-footer">
                      <span>{wf.executions_count || 0} runs · Last run {timeAgo(wf.last_run_at)}</span>
                      <button
                        className="workflow-action-btn"
                        disabled={busy}
                        onClick={() => act("workflowExecute", { id: wf.id }, `Executed ${wf.name}`)}
                      >
                        <Play size={12}/> Run now
                      </button>
                    </div>
                  </article>
                );
              })}
            </div>
          </>}

          {/* TEAM & TEAM INVITES */}
          {page === "Team" && <>
            <div className="page-head">
              <div>
                <div className="eyebrow"><span className="pulse-dot"/> COLLABORATION</div>
                <h1>Team & Workspace Members<span className="accent-period">.</span></h1>
                <p>Manage who has access to your company workspace, lead radar, and outreach drafts.</p>
              </div>
              <button className="btn btn-dark" onClick={() => setInviteModal(true)}><UserPlus size={16}/> Invite member</button>
            </div>

            <div className="team-container">
              <section className="team-members-list">
                <div className="section-heading compact">
                  <div>
                    <div className="section-kicker">TEAM ROSTER</div>
                    <h3>Active members ({data.team?.length || 1})</h3>
                  </div>
                  <button className="btn btn-dark small-btn" onClick={() => setInviteModal(true)}>
                    <UserPlus size={14}/> Invite member
                  </button>
                </div>

                {(data.team || []).map(member => {
                  const avail = getMemberAvailability(member, clockNow);
                  return (
                    <div className="team-member-row" key={member.id}>
                      <div className="team-member-info">
                        <div className="team-avatar">{(member.name || member.email || "M").charAt(0).toUpperCase()}</div>
                        <div className="team-member-meta">
                          <div style={{ display: "flex", alignItems: "center", gap: 8, flexWrap: "wrap" }}>
                            <strong>{member.name}</strong>
                            {member.title && <span style={{ fontSize: 11, color: "var(--muted)", fontWeight: 500 }}>· {member.title}</span>}
                          </div>
                          <span>{member.email}</span>
                          {(member.country || member.region) && (
                            <div className="team-member-location">
                              <MapPin size={11}/>
                              <span>{member.region ? `${member.region}, ` : ""}{member.country}</span>
                            </div>
                          )}
                        </div>
                      </div>

                      <div style={{ display: "flex", alignItems: "center", gap: 8, flexWrap: "wrap" }}>
                        <span className="team-member-time" title={`Timezone: ${member.timezone || "UTC"}`}>
                          <Clock3 size={11}/>
                          <span>{formatMemberTime(clockNow, member.timezone || "UTC")}</span>
                          <small style={{ color: "var(--muted)", fontSize: 10 }}>({member.timezone || "UTC"})</small>
                        </span>

                        <span className={`availability-badge ${avail.toLowerCase().replace(/\s+/g, "-")}`} title={`Working hours: ${member.workdayStart || "09:00"} - ${member.workdayEnd || "17:00"}`}>
                          <span className="dot"/>
                          {avail}
                        </span>

                        <span className={`role-badge ${member.role.toLowerCase().replace(" ", "-")}`}>
                          {member.role}
                        </span>
                      </div>

                      <div className="team-member-actions">
                        {member.role === "Owner" ? (
                          <span style={{ fontSize: 11, color: "var(--muted)", padding: "0 6px" }}>Owner</span>
                        ) : (
                          <select
                            aria-label={`Change role for ${member.name}`}
                            value={member.role}
                            onChange={e => act("teamRole", { memberId: member.id, role: e.target.value }, "Role updated")}
                          >
                            <option value="Admin">Admin</option>
                            <option value="Growth Lead">Growth Lead</option>
                            <option value="Member">Member</option>
                            <option value="Viewer">Viewer</option>
                          </select>
                        )}

                        <button
                          className="btn btn-outline"
                          style={{ fontSize: 11, padding: "5px 9px", gap: 5 }}
                          onClick={() => openEditMember(member)}
                          title="Edit working hours, timezone, and profile"
                        >
                          <Settings size={12}/> Edit Hours
                        </button>

                        {member.role !== "Owner" && (
                          <button
                            className="icon-button"
                            aria-label="Remove member"
                            onClick={() => {
                              if (window.confirm(`Remove ${member.name} from this workspace?`)) {
                                act("teamRemove", { memberId: member.id }, "Member removed");
                              }
                            }}
                          >
                            <Trash2 size={15}/>
                          </button>
                        )}
                      </div>
                    </div>
                  );
                })}
              </section>

              {data.invites && data.invites.filter(i => i.status === "pending").length > 0 && (
                <section className="team-members-list">
                  <div className="section-heading compact">
                    <div>
                      <div className="section-kicker">PENDING INVITATIONS</div>
                      <h3>Invitations awaiting acceptance ({data.invites.filter(i => i.status === "pending").length})</h3>
                    </div>
                  </div>

                  {data.invites.filter(i => i.status === "pending").map(invite => (
                    <div className="team-member-row" key={invite.id}>
                      <div className="team-member-info">
                        <div className="team-avatar">✉</div>
                        <div className="team-member-meta">
                          <strong>{invite.email}</strong>
                          <span>Invited as {invite.role} by {invite.invited_by}</span>
                        </div>
                      </div>
                      <span className="status-tag">PENDING</span>
                      <div className="team-member-actions">
                        <button
                          className="btn btn-outline"
                          onClick={() => {
                            if (typeof window !== "undefined") {
                              navigator.clipboard.writeText(`${window.location.origin}/portal/login?invite=${invite.token}`);
                              setToast("Invite link copied to clipboard");
                            }
                          }}
                        >
                          <Copy size={13}/> Copy invite link
                        </button>
                        <button
                          className="icon-button"
                          aria-label="Revoke invite"
                          onClick={() => act("teamRevokeInvite", { inviteId: invite.id }, "Invitation revoked")}
                        >
                          <X size={16}/>
                        </button>
                      </div>
                    </div>
                  ))}
                </section>
              )}

              {/* Cross-Timezone Mutual Availability Finder */}
              <section className="common-slots-section">
                <div className="section-heading compact">
                  <div>
                    <div className="section-kicker">CROSS-TIMEZONE COORDINATION</div>
                    <h3>Overlapping Team Availability ({commonSlots.length} slots found)</h3>
                    <p style={{ fontSize: 12, color: "var(--muted)", margin: "4px 0 0" }}>
                      Real-time mutual slots calculated across members&apos; defined working hours and active timezones.
                    </p>
                  </div>
                  <div style={{ display: "flex", gap: 6, alignItems: "center", flexWrap: "wrap" }}>
                    <span style={{ fontSize: 11, fontWeight: 600, color: "var(--muted)" }}>Duration:</span>
                    {[15, 30, 45, 60].map(d => (
                      <button
                        key={d}
                        type="button"
                        className={`btn ${slotDuration === d ? "btn-dark" : "btn-outline"} small-btn`}
                        onClick={() => setSlotDuration(d)}
                      >
                        {d}m
                      </button>
                    ))}
                  </div>
                </div>

                {commonSlots.length === 0 ? (
                  <div style={{ padding: "32px 16px", textAlign: "center", color: "var(--muted)", fontSize: 13 }}>
                    No mutual working hour overlap found for the team in the upcoming week. Try adjusting member working hours or duration.
                  </div>
                ) : (
                  <div className="slots-grid">
                    {commonSlots.map((slot, idx) => (
                      <article className="slot-card" key={idx}>
                        <div className="slot-time">
                          <CalendarClock size={15}/>
                          <span>
                            {new Date(slot.start).toLocaleDateString("en-US", { weekday: "short", month: "short", day: "numeric" })} · {new Date(slot.start).toLocaleTimeString("en-US", { hour: "2-digit", minute: "2-digit" })} – {new Date(slot.end).toLocaleTimeString("en-US", { hour: "2-digit", minute: "2-digit" })}
                          </span>
                        </div>

                        <div className="slot-members">
                          <span style={{ fontWeight: 600, fontSize: 10, textTransform: "uppercase", letterSpacing: "0.05em", color: "#8b5cf6" }}>Local member times:</span>
                          {slot.formattedByMember.map(m => {
                            const memberName = data.team?.find(t => t.id === m.memberId)?.name || m.timezone;
                            return (
                              <div className="slot-member-item" key={m.memberId}>
                                <span>{memberName}</span>
                                <strong>{m.formatted}</strong>
                              </div>
                            );
                          })}
                        </div>

                        <button
                          className="btn btn-dark"
                          style={{ width: "100%", justifyContent: "center", fontSize: 12, padding: "8px 12px" }}
                          onClick={() => {
                            setMeetingBookingModal({ slot });
                            setMeetingTitle(`Threadly Team Sync`);
                            setMeetingAttendees(data.team?.map(m => m.email).filter(Boolean).join(", ") || "");
                          }}
                        >
                          <Video size={14}/> Schedule Google Meet
                        </button>
                      </article>
                    ))}
                  </div>
                )}
              </section>

              <aside className="team-invite-card">
                <div className="team-invite-copy">
                  <h4>Role-Based Access Guardrails</h4>
                  <p><strong>Owner & Admin:</strong> Manage billing, integrations, and workspace settings. <strong>Growth Lead:</strong> Manage lead pipeline and drafts. <strong>Member:</strong> View signals and collaborate. <strong>Viewer:</strong> Read-only access.</p>
                </div>
                <button className="btn btn-outline" onClick={() => setInviteModal(true)}>Send invitation</button>
              </aside>
            </div>
          </>}

          {/* DISCOVER & RADAR */}
          {(page === "Radar" || page === "Discover") && <>
            <div className="page-head">
              <div>
                <div className="eyebrow"><span className="pulse-dot"/> {page === "Radar" ? "YOUR CONVERSATION INTELLIGENCE" : "EXPLORE YOUR MARKET"}</div>
                <h1>{page === "Radar" ? "Conversation Radar" : "Discover"}<span className="accent-period">.</span></h1>
                <p>{page === "Radar" ? "Keep promising conversations and your next action together." : "Collect the questions your customers are already asking."}</p>
              </div>
              <div className="page-actions">
                <span className="source-notice"><span className="tiny-dot"/> Multi-source radar: Tavily + X</span>
                {page === "Discover" ? (
                  <button className="btn btn-outline" onClick={() => go("Radar")}><Radio size={16}/> View Radar</button>
                ) : (
                  <button className="btn btn-dark" onClick={() => go("Discover")}><Search size={16}/> Discover Signals</button>
                )}
              </div>
            </div>

            {page === "Discover" && (
              <XDiscovery
                context={data.workspace.context}
                provider={data.capabilities.xProvider}
                providerStatus={data.capabilities.xProviderStatus}
                getIdToken={getIdToken}
                onResults={refresh}
                onGoRadar={() => go("Radar")}
                onGoLeads={() => go("Leads")}
                onGoStudio={() => go("Content Studio")}
                onSaveProspect={async post => {
                  await act("lead", { name: post.author ? (post.author.startsWith("@") ? post.author : `@${post.author}`) : `${post.platform || "X"} prospect`, platform: post.platform || "X", opportunityId: post.id.startsWith("x-") || post.id.startsWith("tavily-") ? post.id : `x-${post.id}`, pain: post.text.slice(0, 500), notes: `Added from a public ${post.platform || "X"} conversation. Verify fit and contact details before outreach.` }, "Prospect saved");
                }}
              />
            )}

            {page === "Radar" && <>
              <div className="filter-bar">
                <div className="search-field">
                  <Search size={18}/>
                  <input aria-label="Search conversations" placeholder="Search conversations, topics, pain points…" value={query} onChange={e => setQuery(e.target.value)}/>
                </div>
                <div className="filter-select">
                  <Filter size={17}/>
                  <select aria-label="Filter platform" value={platform} onChange={e => setPlatform(e.target.value)}>{platforms.map(p => <option key={p}>{p}</option>)}</select>
                </div>
                <div className="filter-select">
                  <select aria-label="Filter intent" value={intent} onChange={e => setIntent(e.target.value)}>{intentOptions.map(p => <option key={p}>{p}</option>)}</select>
                </div>
              </div>
              <div className="list-meta">
                <strong>{visible.length} discussions & conversations</strong>
                <span>Recently saved first <ChevronDown size={14}/></span>
              </div>
              <div className="radar-grid">
                {visible.length ? visible.map(o => (
                  <OpportunityCard
                    key={o.id}
                    o={o}
                    onOpen={() => setSelected(o)}
                    onDraft={() => openStudio(o)}
                    onSave={() => act("opportunity", { id: o.id, status: o.status === "saved" ? "new" : "saved" }, o.status === "saved" ? "Removed from saved" : "Saved to your radar")}
                    onDismiss={() => act("opportunity", { id: o.id, status: "dismissed" }, "Dismissed")}
                    onAddLead={() => act("lead", { name: o.author ? (o.author.startsWith("@") ? o.author : `@${o.author}`) : `${o.platform} prospect`, platform: o.platform, opportunityId: o.id, pain: (o.pain || o.title).slice(0, 500), notes: `Captured from ${o.platform} conversation on ${o.community}.` }, `Created lead from ${o.platform}`)}
                  />
                )) : (
                  <div className="empty-state">
                    <Search size={26}/>
                    <h3>No conversations found</h3>
                    <p>Search a customer problem in Discover, or adjust these filters.</p>
                    <button className="btn btn-outline" onClick={() => { setQuery(""); setPlatform("All platforms"); setIntent("All intent"); }}>Clear filters</button>
                  </div>
                )}
              </div>
            </>}
          </>}

          {/* OUTREACH */}
          {page === "Outreach" && (
            <PortalOutreach
              context={data.workspace.context}
              companyName={data.workspace.name}
              provider={data.capabilities.xProvider}
              capabilities={data.capabilities}
              leads={data.leads}
              emails={data.outreachEmails || []}
              getIdToken={getIdToken}
              onRefresh={refresh}
            />
          )}

          {/* CONTENT STUDIO */}
          {page === "Content Studio" && <>
            <div className="page-head">
              <div>
                <div className="eyebrow"><span className="pulse-dot"/> FROM SIGNAL TO STORY</div>
                <h1>Content Studio<span className="accent-period">.</span></h1>
                <p>Write something worth reading, in your own voice.</p>
              </div>
              <span className="source-notice">{data.capabilities.contentAiProvider ? `${data.capabilities.contentAiProvider} · content drafts` : "AI generation ready"}</span>
            </div>
            <div className="studio-layout">
              <section className="studio-main">
                <div className="mini-card studio-editor">
                  <div className="section-heading compact">
                    <div>
                      <div className="section-kicker">YOUR WORKSPACE</div>
                      <h3>{editingDraft ? "Edit your draft" : "Create a draft"}</h3>
                    </div>
                    <span className="status-tag">{editingDraft?.status || "NEW"}</span>
                  </div>
                  {selected && (
                    <div className="source-strip">
                      <PlatformBadge platform={selected.platform}/>
                      <span><strong>Inspired by a conversation</strong><small>{selected.title}</small></span>
                      <button aria-label="Remove source" onClick={() => setSelected(null)}><X size={16}/></button>
                    </div>
                  )}
                  <div className="editor-controls">
                    <label>PLATFORM<select value={draftPlatform} onChange={e => setDraftPlatform(e.target.value)}>{["X"].map(p => <option key={p}>{p}</option>)}</select></label>
                    <label>CONTENT TYPE<select value={draftKind} onChange={e => setDraftKind(e.target.value)}>{["Discussion response", "Educational post", "Founder story", "Thought leadership", "Product announcement", "Case study", "Comment", "Reply", "X thread"].map(p => <option key={p}>{p}</option>)}</select></label>
                    <label>TONE<select value={tone} onChange={e => setTone(e.target.value)}>{["Conversational", "Founder", "Expert", "Educational", "Provocative", "Storytelling"].map(p => <option key={p}>{p}</option>)}</select></label>
                  </div>
                  <textarea className="draft-textarea" aria-label="Draft text" placeholder="A good conversation starts with something useful to say…" value={draftText} onChange={e => setDraftText(e.target.value)}/>
                  <div className="editor-footer">
                    <span>{draftText.length} characters · {draftText.trim() ? draftText.trim().split(/\s+/).length : 0} words</span>
                    <div>
                      <button className="btn btn-outline" disabled={busy || !draftText.trim()} onClick={async () => {
                        const ok = await act("draft", { id: editingDraft?.id, opportunityId: selected?.id || editingDraft?.opportunity_id, platform: draftPlatform, kind: draftKind, text: draftText }, "Draft saved");
                        if (ok) { setEditingDraft(null); setDraftText(""); setSelected(null); }
                      }}>Save draft</button>
                      {editingDraft && (editingDraft.status === "draft" || editingDraft.status === "review") && (
                        <button className="btn btn-dark" disabled={busy} onClick={async () => {
                          const ok = await act("approve", { id: editingDraft.id }, "Draft approved");
                          if (ok) { setEditingDraft(null); setDraftText(""); }
                        }}><Check size={16}/> Approve</button>
                      )}
                    </div>
                  </div>
                </div>

                <div className="mini-card generate-card">
                  <div className="generate-icon"><WandSparkles size={21}/></div>
                  <div>
                    <h3>Need a starting point?</h3>
                    <p>Generate three platform-aware variations from your company context and a selected conversation.</p>
                  </div>
                  <button className="btn btn-dark" disabled={!selected || busy} onClick={async () => {
                    if (selected) await act("generate", { opportunityId: selected.id, platform: draftPlatform, tone }, "Three drafts generated");
                  }}>{busy ? "Generating…" : "Generate drafts"} <Sparkles size={15}/></button>
                  {!selected && <small className="capability-note">Select a conversation in Radar first.</small>}
                </div>
              </section>

              <aside className="studio-side">
                <div className="mini-card">
                  <div className="section-heading compact">
                    <h3>Your drafts</h3>
                    <span className="count-badge">{data.drafts.length}</span>
                  </div>
                  {data.drafts.length ? data.drafts.map(d => (
                    <button className="draft-list-row" key={d.id} onClick={() => editDraft(d)}>
                      <div><PlatformBadge platform={d.platform}/><span className="status-tag">{d.status}</span></div>
                      <p>{d.text.slice(0, 118)}{d.text.length > 118 ? "…" : ""}</p>
                      <small>{d.origin === "sample" ? "Sample draft" : d.origin === "ai" ? "AI generated" : "Written by you"} · {formatDate(d.created_at)}</small>
                    </button>
                  )) : <p className="muted-copy">No drafts yet. Start with a conversation.</p>}
                </div>
              </aside>
            </div>
          </>}

          {/* CALENDAR */}
          {page === "Calendar" && <>
            <div className="page-head">
              <div>
                <div className="eyebrow"><span className="pulse-dot"/> CONTENT, WITH INTENTION</div>
                <h1>Content Calendar<span className="accent-period">.</span></h1>
                <p>Plan what you’ll share. Keep every post in your hands.</p>
              </div>
              <button className="btn btn-dark" onClick={() => openStudio()}><Plus size={17}/> New draft</button>
            </div>

            <div className="calendar-toolbar">
              <div className="month-switch">
                <button aria-label="Previous month" onClick={() => setCalendarMonth(new Date(calendarMonth.getFullYear(), calendarMonth.getMonth() - 1, 1))}><ChevronLeft size={18}/></button>
                <strong>{calendarMonth.toLocaleDateString("en-US", { month: "long", year: "numeric" })}</strong>
                <button aria-label="Next month" onClick={() => setCalendarMonth(new Date(calendarMonth.getFullYear(), calendarMonth.getMonth() + 1, 1))}><ChevronRight size={18}/></button>
              </div>
              <div className="segmented">
                {(["Month", "Week", "List"] as const).map(v => <button key={v} className={calendarView === v ? "selected" : ""} onClick={() => setCalendarView(v)}>{v}</button>)}
              </div>
            </div>

            {calendarView === "List" ? (
              <div className="mini-card calendar-list">
                {data.drafts.map(d => (
                  <CalendarItem
                    key={d.id}
                    draft={d}
                    onEdit={() => editDraft(d)}
                    onPlan={() => { setScheduleId(d.id); setScheduleDate(d.scheduled_at ? new Date(d.scheduled_at).toISOString().slice(0, 16) : ""); }}
                    onDuplicate={() => act("duplicate", { id: d.id }, "Draft duplicated")}
                    onCancel={() => act("cancelSchedule", { id: d.id }, "Reminder canceled")}
                    onPublished={() => act("published", { id: d.id }, "Marked manually published")}
                  />
                ))}
              </div>
            ) : (
              <CalendarGrid month={calendarMonth} week={calendarView === "Week"} drafts={data.drafts} onEdit={editDraft}/>
            )}
            <div className="calendar-note">
              <CircleHelp size={18}/>
              <span>Planned dates are organized reminders for your founder workflow.</span>
            </div>
          </>}

          {/* LEADS PIPELINE */}
          {page === "Leads" && <>
            <div className="page-head">
              <div>
                <div className="eyebrow"><span className="pulse-dot"/> RELATIONSHIPS OVER REACH</div>
                <h1>Lead Pipeline<span className="accent-period">.</span></h1>
                <p>Keep the conversation going, all the way to customer.</p>
              </div>
              <button className="btn btn-dark" onClick={() => { setLeadModal("direct"); setLeadForm({ name: "", email: "", company: "", role: "", notes: "", platform: "X" }); }}><Plus size={17}/> Add lead</button>
            </div>

            <div className="pipeline-summary">
              <strong>{data.leads.length} total leads</strong>
              <span>{data.leads.filter(l => l.stage === "qualified").length} qualified · {data.leads.filter(l => l.stage === "converted").length} converted</span>
            </div>

            <div className="pipeline">
              {stages.map(stage => (
                <div className="pipeline-column" key={stage}>
                  <div className="pipeline-head">
                    <span className={`stage-dot stage-${stage}`}/>
                    <strong>{stage}</strong>
                    <span>{data.leads.filter(l => l.stage === stage).length}</span>
                  </div>
                  <div className="pipeline-cards">
                    {data.leads.filter(l => l.stage === stage).map(l => (
                      <div className="lead-card" key={l.id} draggable onDragStart={e => e.dataTransfer.setData("text/plain", l.id)}>
                        <div className="lead-avatar">{(l.name || "P").charAt(0).toUpperCase()}</div>
                        <strong>{l.name}</strong>
                        <small>{l.role || "Prospect"}{l.company ? ` · ${l.company}` : ""}</small>
                        {l.email && <small>{l.email}</small>}
                        <div><PlatformBadge platform={l.platform}/><span>{l.pain || "Conversation lead"}</span></div>
                        {l.meetingUrl && (
                          <a
                            href={l.meetingUrl}
                            target="_blank"
                            rel="noreferrer"
                            style={{ display: "inline-flex", alignItems: "center", gap: 4, fontSize: 11, color: "#166534", background: "#f0fdf4", border: "1px solid #bbf7d0", padding: "3px 8px", borderRadius: 4, textDecoration: "none", marginTop: 4 }}
                          >
                            <Video size={11}/> Google Meet
                          </a>
                        )}
                        <button
                          type="button"
                          className="text-link"
                          style={{ fontSize: 11, marginTop: 4, display: "inline-flex", alignItems: "center", gap: 4 }}
                          onClick={() => {
                            setMeetingBookingModal({
                              slot: commonSlots[0] || {
                                start: new Date(Date.now() + 86400000),
                                end: new Date(Date.now() + 86400000 + 1800000),
                                formattedTarget: "",
                                formattedByMember: [],
                              },
                              leadId: l.id,
                            });
                            setMeetingAttendees(l.email || "");
                            setMeetingTitle(`Discovery Sync with ${l.name}`);
                          }}
                        >
                          <CalendarClock size={11}/> {l.meetingUrl ? "Reschedule Meet" : "Book Meet"}
                        </button>
                        {data.growth?.sequences?.length ? (
                          <button
                            type="button"
                            className="text-link"
                            style={{ fontSize: 11, marginTop: 4, display: "inline-flex", alignItems: "center", gap: 4, background: "#faf5ff", border: "1px solid #e9d5ff", padding: "3px 8px", borderRadius: 4, color: "#6b21a8" }}
                            onClick={() => act("sequenceEnroll", { sequenceId: data.growth?.sequences[0]?.id, leadIds: [l.id] }, `Enrolled in ${data.growth?.sequences[0]?.name}`)}
                          >
                            <Mail size={11}/> Follow-up sequence
                          </button>
                        ) : null}
                        <select aria-label={`Move ${l.name} to stage`} value={l.stage} onChange={e => act("moveLead", { id: l.id, stage: e.target.value }, "Lead moved")}>
                          {stages.map(s => <option key={s} value={s}>{s}</option>)}
                        </select>
                      </div>
                    ))}
                    <div className="drop-area" onDragOver={e => e.preventDefault()} onDrop={e => { e.preventDefault(); const id = e.dataTransfer.getData("text/plain"); if (id) act("moveLead", { id, stage }, "Lead moved"); }}>
                      {data.leads.some(l => l.stage === stage) ? "Drop lead here" : "No leads yet · Drop here"}
                    </div>
                  </div>
                </div>
              ))}
            </div>
          </>}

          {/* ANALYTICS */}
          {page === "Analytics" && <>
            <div className="page-head">
              <div>
                <div className="eyebrow"><span className="pulse-dot"/> KNOW WHAT&apos;S WORKING</div>
                <h1>Analytics<span className="accent-period">.</span></h1>
                <p>Follow the path from conversation to customer.</p>
              </div>
              <span className="source-notice"><span className="tiny-dot"/> Workspace records</span>
            </div>

            <div className="stats-grid">
              <Stat label="PLANNED POSTS" value={data.drafts.filter(d => d.scheduled_at).length} delta="Manual reminders" icon={CalendarDays}/>
              <Stat label="SAVED SIGNALS" value={data.opportunities.filter(o => o.status === "saved").length} delta="Your saved conversations" icon={Target}/>
              <Stat label="LEADS" value={data.leads.length} delta="From stored records" icon={Users}/>
              <Stat label="CONVERTED" value={data.leads.filter(l => l.stage === "converted").length} delta="Marked by your team" icon={TrendingUp}/>
            </div>

            <div className="analytics-layout">
              <div className="mini-card">
                <div className="section-heading compact">
                  <h3>From conversation to customer</h3>
                  <span className="muted-copy">Workspace records</span>
                </div>
                <div className="funnel">
                  {[
                    { label: "Relevant conversations", value: data.opportunities.length },
                    { label: "Saved opportunities", value: data.opportunities.filter(o => o.status === "saved").length },
                    { label: "Leads identified", value: data.leads.length },
                    { label: "Qualified", value: data.leads.filter(l => ["qualified", "conversation", "converted"].includes(l.stage)).length },
                    { label: "Converted", value: data.leads.filter(l => l.stage === "converted").length }
                  ].map((x, i) => (
                    <div className="funnel-row" key={x.label}>
                      <span>{x.label}</span>
                      <div><i style={{ width: `${Math.max(4, x.value / Math.max(1, data.opportunities.length) * 100)}%`, opacity: 1 - i * .13 }}/></div>
                      <strong>{x.value}</strong>
                    </div>
                  ))}
                </div>
              </div>

              <div className="mini-card">
                <div className="section-heading compact">
                  <h3>Platform signals</h3>
                </div>
                {["X"].map(p => (
                  <div className="platform-stat" key={p}>
                    <PlatformBadge platform={p}/>
                    <span>{p}</span>
                    <strong>{data.opportunities.filter(o => o.platform === p).length} conversations</strong>
                  </div>
                ))}
                <div className="analytics-disclaimer">
                  <CircleHelp size={18}/>
                  <p>All pipeline statistics reflect direct workspace data and qualified conversations.</p>
                </div>
              </div>
            </div>
          </>}

          {/* AI INSIGHTS */}
          {page === "AI Insights" && <>
            <div className="page-head">
              <div>
                <div className="eyebrow"><span className="pulse-dot"/> CLARITY FROM CONVERSATION</div>
                <h1>AI Insights<span className="accent-period">.</span></h1>
                <p>See the patterns. Decide what to do next.</p>
              </div>
            </div>

            <div className="insights-grid">
              <div className="insight-feature">
                <div className="insight-icon"><Sparkles size={20}/></div>
                <span className="section-kicker">THIS WEEK&apos;S SIGNAL</span>
                <h2>{"Review your real X conversations."}</h2>
                <p>{"Use AnyJev and Laya to prioritize saved prospects, then review the original posts before reaching out."}</p>
                <button onClick={() => go("Outreach")}>Assess prospects <ArrowUpRight size={16}/></button>
                <small>{data.leads.filter(l => l.qualification).length} prospects assessed</small>
              </div>

              <div className="insight-stack">
                <div className="mini-card">
                  <div className="section-kicker">EMERGING PAIN POINT</div>
                  <h3>Customer discovery & outbound fatigue</h3>
                  <p>{data.opportunities.filter(o => o.pain.toLowerCase().includes("customer") || o.pain.toLowerCase().includes("outreach")).length || 3} saved conversations mention finding buyers without spam.</p>
                </div>
                <div className="mini-card">
                  <div className="section-kicker">WHAT TO POST NEXT</div>
                  <h3>A useful answer beats another announcement.</h3>
                  <p>Turn a real question into an educational post, then invite a conversation.</p>
                  <button className="text-link" onClick={() => openStudio(data.opportunities[0])}>Create a draft <ArrowRight size={15}/></button>
                </div>
              </div>
            </div>

            <div className="assistant-panel">
              <div>
                <div className="assistant-heading"><Sparkles size={19}/><strong>Ask Threadly AI</strong></div>
                <p>{assistantQuestion ? `“${assistantQuestion}”` : "Ask about your opportunities, leads, or what to prioritize."}</p>
                {assistantQuestion && (
                  <div className="assistant-answer">
                    {assistantQuestion.toLowerCase().includes("lead")
                      ? `You have ${data.leads.length} saved lead${data.leads.length === 1 ? "" : "s"}. Follow up on qualified relationships first.`
                      : `Your radar has ${stats.conversations} high-intent conversations. Prioritize prospects asking for alternatives.`}
                  </div>
                )}
              </div>
              <form onSubmit={e => { e.preventDefault(); setAssistantQuestion(assistantInput); setAssistantInput(""); }}>
                <input aria-label="Ask Threadly AI" placeholder="Which conversation should I prioritize?" value={assistantInput} onChange={e => setAssistantInput(e.target.value)}/>
                <button aria-label="Ask" disabled={!assistantInput.trim()}><Send size={17}/></button>
              </form>
              <small>Answers summarize available workspace records and conversation intelligence.</small>
            </div>
          </>}

          {/* WORKSPACE / COMPANY & LOGO */}
          {page === "Workspace" && <>
            <div className="page-head">
              <div>
                <div className="eyebrow"><span className="pulse-dot"/> YOUR FOUNDATION</div>
                <h1>Company Profile & Logo Branding<span className="accent-period">.</span></h1>
                <p>Customize your company identity, logo branding, and target ICP profile.</p>
              </div>
              <div style={{ display: "flex", gap: "10px", alignItems: "center", flexWrap: "wrap" }}>
                <button
                  type="button"
                  className="btn btn-outline"
                  onClick={openOnboarding}
                >
                  <Sparkles size={16} style={{ color: "#ff4500" }} /> Run Onboarding Wizard
                </button>
                <button
                  className="btn btn-dark"
                  disabled={busy}
                  onClick={() => act("context", {
                    context,
                    name: companyName,
                    logoUrl: companyLogo,
                    domain: companyDomain,
                    legalName: companyLegalName,
                    website: companyWebsite,
                    industry: companyIndustry,
                    stage: companyStage,
                    country: companyCountry,
                    region: companyRegion,
                    defaultTimezone: companyTimezone,
                  }, "Company profile & branding saved")}
                >
                  Save company settings <Check size={16}/>
                </button>
              </div>
            </div>

            <div className="settings-layout">
              <div className="mini-card context-form">
                <div className="section-heading compact">
                  <h3>Company Branding & Logo</h3>
                  <span className="status-tag">LOGO & IDENTITY</span>
                </div>

                <div className="company-logo-preview-row">
                  <div className="company-logo-preview-box">
                    <Image src={companyLogo || "/threadly-logo.svg"} alt="Company logo" width={60} height={60} className="object-contain" />
                  </div>
                  <div>
                    <strong style={{ display: "block", fontSize: 13, marginBottom: 4 }}>Workspace Logo</strong>
                    <span style={{ display: "block", fontSize: 11, color: "var(--muted)", marginBottom: 10 }}>Select a preset brand mark, enter an image URL, or upload directly from disk.</span>
                    <div className="company-preset-logos">
                      {logoPresets.map(preset => (
                        <button
                          key={preset.label}
                          type="button"
                          className={`preset-logo-btn ${companyLogo === preset.url ? "selected" : ""}`}
                          onClick={() => setCompanyLogo(preset.url)}
                        >
                          <Image src={preset.url} alt="" width={16} height={16} />
                          {preset.label}
                        </button>
                      ))}
                      <label className="btn btn-outline small-btn" style={{ cursor: "pointer", display: "inline-flex", alignItems: "center", gap: 5 }}>
                        <UploadCloud size={13}/> Upload file
                        <input
                          type="file"
                          accept="image/*"
                          className="logo-upload-input"
                          onChange={e => handleLogoUpload(e.target.files?.[0])}
                        />
                      </label>
                    </div>
                  </div>
                </div>

                <label>
                  CUSTOM LOGO IMAGE URL
                  <input
                    value={companyLogo}
                    onChange={e => setCompanyLogo(e.target.value)}
                    placeholder="https://yourcompany.com/logo.png or /threadly-logo.svg"
                  />
                </label>

                <div className="dialog-grid">
                  <label>
                    PRODUCT / DISPLAY NAME
                    <input value={companyName} onChange={e => setCompanyName(e.target.value)} placeholder="Threadly"/>
                  </label>
                  <label>
                    LEGAL ENTITY NAME
                    <input value={companyLegalName} onChange={e => setCompanyLegalName(e.target.value)} placeholder="Threadly Technologies Inc."/>
                  </label>
                </div>

                <div className="dialog-grid">
                  <label>
                    PRIMARY DOMAIN
                    <input value={companyDomain} onChange={e => setCompanyDomain(e.target.value)} placeholder="threadly.io"/>
                  </label>
                  <label>
                    WEBSITE URL
                    <input value={companyWebsite} onChange={e => setCompanyWebsite(e.target.value)} placeholder="https://threadly.io"/>
                  </label>
                </div>

                <div className="dialog-grid">
                  <label>
                    INDUSTRY
                    <input value={companyIndustry} onChange={e => setCompanyIndustry(e.target.value)} placeholder="B2B SaaS / Growth Intelligence"/>
                  </label>
                  <label>
                    COMPANY STAGE
                    <select value={companyStage} onChange={e => setCompanyStage(e.target.value)}>
                      <option value="Pre-seed">Pre-seed</option>
                      <option value="Seed">Seed</option>
                      <option value="Series A">Series A</option>
                      <option value="Series B+">Series B+</option>
                      <option value="Bootstrapped">Bootstrapped</option>
                      <option value="Enterprise">Enterprise</option>
                    </select>
                  </label>
                </div>

                <div className="dialog-grid">
                  <label>
                    HEADQUARTERS COUNTRY
                    <input value={companyCountry} onChange={e => setCompanyCountry(e.target.value)} placeholder="United States"/>
                  </label>
                  <label>
                    CITY / REGION
                    <input value={companyRegion} onChange={e => setCompanyRegion(e.target.value)} placeholder="San Francisco, CA"/>
                  </label>
                </div>

                <label>
                  DEFAULT WORKSPACE TIMEZONE
                  <select value={companyTimezone} onChange={e => setCompanyTimezone(e.target.value)}>
                    {timezoneOptions.map(tz => (
                      <option key={tz} value={tz}>{tz}</option>
                    ))}
                  </select>
                </label>

                <div className="section-heading compact" style={{ marginTop: 28 }}>
                  <h3>GTM & Ideal Customer Context</h3>
                  <span className="status-tag">ICP PROFILE</span>
                </div>

                <div className="context-grid">
                  {contextFields.map(([key, label]) => (
                    <label key={key}>
                      {label.toUpperCase()}
                      {["description", "painPoints", "icp"].includes(key) ? (
                        <textarea value={context[key] || ""} onChange={e => setContext({ ...context, [key]: e.target.value })}/>
                      ) : (
                        <input value={context[key] || ""} onChange={e => setContext({ ...context, [key]: e.target.value })}/>
                      )}
                    </label>
                  ))}
                </div>

                <button
                  className="btn btn-dark"
                  disabled={busy}
                  onClick={() => act("context", {
                    context,
                    name: companyName,
                    logoUrl: companyLogo,
                    domain: companyDomain,
                    legalName: companyLegalName,
                    website: companyWebsite,
                    industry: companyIndustry,
                    stage: companyStage,
                    country: companyCountry,
                    region: companyRegion,
                    defaultTimezone: companyTimezone,
                  }, "Company profile & branding saved")}
                >
                  Save company settings <Check size={16}/>
                </button>
              </div>

              <aside className="mini-card">
                <div className="section-kicker">COLLABORATION</div>
                <h3>Active Team</h3>
                <p className="muted-copy" style={{ marginBottom: 14 }}>{data.team?.length || 1} team members collaborating in this workspace.</p>
                <button className="btn btn-outline" style={{ width: "100%", marginBottom: 18 }} onClick={() => go("Team")}>
                  Manage team & invites <Users size={14}/>
                </button>

                <div className="section-kicker">INTEGRATION STATUS</div>
                <h3>Connected Services</h3>
                <div className="connection-row"><span>Tavily Web Intelligence</span><strong>Connected</strong></div>
                <div className="connection-row"><span>X Conversation Radar</span><strong>{data.capabilities.xProvider ? `${data.capabilities.xProvider}` : "Connected"}</strong></div>
                <div className="connection-row"><span>AI Generation Engines</span><strong>Connected</strong></div>
                <div className="connection-row"><span>Email Outreach (SES)</span><strong>{data.capabilities.emailOutreach ? "Active" : "Mailto active"}</strong></div>
              </aside>
            </div>
          </>}

          {/* THREADLY GROWTH MODULES */}
          {page === "Campaigns" && data.growth && (
            <CampaignsPage growth={data.growth} act={act} busy={busy}/>
          )}
          {page === "Sequences" && data.growth && (
            <SequencesPage growth={data.growth} leads={data.leads} act={act} busy={busy}/>
          )}
          {page === "Segments" && data.growth && (
            <SegmentsPage growth={data.growth} leads={data.leads} act={act} busy={busy}/>
          )}
          {page === "Scheduler" && data.growth && (
            <SchedulerPage growth={data.growth} act={act} busy={busy}/>
          )}
          {page === "Revenue" && data.growth && (
            <RevenuePage growth={data.growth} leads={data.leads}/>
          )}
          {page === "GEO" && data.growth && (
            <GeoPage growth={data.growth} act={act} busy={busy}/>
          )}

          {/* SETTINGS */}
          {page === "Settings" && (
            <PortalSettings
              name={name}
              email={email}
              capabilities={data.capabilities}
              onCompanyContext={() => go("Workspace")}
              signOutAction={signOutAction}
            />
          )}
        </>}
        {error && data && <div className="error-toast" role="alert"><X size={16} onClick={() => setError("")}/>{error}</div>}
        {toast && <div className="toast" role="status"><Check size={16}/>{toast}</div>}
      </main>
    </div>

    {/* Opportunity Detail Drawer */}
    {selected && (page === "Radar" || page === "Discover") && (
      <div className="modal-backdrop" onClick={() => setSelected(null)}>
        <div className="detail-drawer" onClick={e => e.stopPropagation()}>
          <button className="drawer-close" onClick={() => setSelected(null)} aria-label="Close"><X size={20}/></button>
          <div className="detail-top">
            <PlatformBadge platform={selected.platform}/>
            <span>{selected.platform} · {selected.community}</span>
            <span className="demo-label">{selected.source_kind === "manual" ? "SAVED BY YOU" : "LIVE SOURCE"}</span>
          </div>
          <h2>{selected.title}</h2>
          <p className="detail-body">{selected.body}</p>
          <div className="detail-author">{`By ${selected.author} · ${selected.engagement}`}</div>
          <div className="detail-metrics">
            <div><small>RELEVANCE</small><strong>{selected.relevance || 92}%</strong></div>
            <div><small>INTENT</small><strong>{selected.intent || "High"}</strong></div>
            <div><small>PAIN POINT</small><strong>{selected.pain || "Customer need"}</strong></div>
          </div>
          <div className="drawer-actions">
            <button className="btn btn-dark" onClick={() => openStudio(selected)}>Draft response <ArrowUpRight size={16}/></button>
            <button className="btn btn-outline" onClick={() => { setLeadModal(selected); setLeadForm({ name: selected.author === "Not recorded" ? "" : `@${selected.author}`, email: "", company: "", role: "", notes: "", platform: selected.platform }); }}>Save as lead</button>
          </div>
          {selected.source_url && <a className="source-link" href={selected.source_url} target="_blank" rel="noreferrer">Open original post <ExternalLink size={14}/></a>}
        </div>
      </div>
    )}

    {/* Save Lead Modal */}
    {leadModal && (
      <div className="modal-backdrop" onClick={() => setLeadModal(null)}>
        <div className="dialog" onClick={e => e.stopPropagation()}>
          <button className="drawer-close" onClick={() => setLeadModal(null)} aria-label="Close"><X size={20}/></button>
          <div className="section-kicker">RELATIONSHIP PIPELINE</div>
          <h2>Save prospect lead</h2>
          <p>Link the conversation context directly to this prospect.</p>
          <label>NAME<input value={leadForm.name} onChange={e => setLeadForm({ ...leadForm, name: e.target.value })}/></label>
          <label>EMAIL <input type="email" value={leadForm.email} onChange={e => setLeadForm({ ...leadForm, email: e.target.value })} placeholder="founder@company.com"/></label>
          <div className="dialog-grid">
            <label>COMPANY<input value={leadForm.company} onChange={e => setLeadForm({ ...leadForm, company: e.target.value })}/></label>
            <label>ROLE<input value={leadForm.role} onChange={e => setLeadForm({ ...leadForm, role: e.target.value })}/></label>
          </div>
          <label>NOTES<textarea value={leadForm.notes} onChange={e => setLeadForm({ ...leadForm, notes: e.target.value })}/></label>
          <button className="btn btn-dark" disabled={busy || !leadForm.name.trim()} onClick={async () => {
            const source = leadModal === "direct" ? null : leadModal;
            const ok = await act("lead", { ...leadForm, opportunityId: source?.id, platform: source?.platform || leadForm.platform, pain: source?.pain || "" }, "Lead saved to pipeline");
            if (ok) { setLeadModal(null); setSelected(null); go("Leads"); }
          }}>Save lead <ArrowRight size={16}/></button>
        </div>
      </div>
    )}

    {/* Schedule Date Modal */}
    {scheduleId && (
      <div className="modal-backdrop" onClick={() => setScheduleId(null)}>
        <div className="dialog small-dialog" onClick={e => e.stopPropagation()}>
          <button className="drawer-close" onClick={() => setScheduleId(null)} aria-label="Close"><X size={20}/></button>
          <div className="section-kicker">PUBLISHING REMINDER</div>
          <h2>Plan post date</h2>
          <label>DATE AND TIME<input type="datetime-local" value={scheduleDate} onChange={e => setScheduleDate(e.target.value)}/></label>
          <button className="btn btn-dark" disabled={busy || !scheduleDate} onClick={async () => {
            const ok = await act("schedule", { id: scheduleId, date: new Date(scheduleDate).toISOString() }, "Post reminder planned");
            if (ok) setScheduleId(null);
          }}>Save reminder <CalendarDays size={16}/></button>
        </div>
      </div>
    )}

    {/* Team Invite Modal */}
    {inviteModal && (
      <div className="modal-backdrop" onClick={() => { setInviteModal(false); setCreatedInviteLink(""); }}>
        <div className="dialog" onClick={e => e.stopPropagation()}>
          <button className="drawer-close" onClick={() => { setInviteModal(false); setCreatedInviteLink(""); }} aria-label="Close"><X size={20}/></button>
          <div className="section-kicker">EXPAND YOUR TEAM</div>
          <h2>Invite team member</h2>
          <p>Collaborate on lead discovery, review outreach drafts, and coordinate meeting schedules.</p>

          {createdInviteLink ? (
            <div style={{ marginTop: 16 }}>
              <div style={{ background: "#f0fdf4", border: "1px solid #bbf7d0", padding: "12px 14px", borderRadius: 8, marginBottom: 16 }}>
                <strong style={{ color: "#166534", display: "block", marginBottom: 4 }}>Invitation generated!</strong>
                <span style={{ fontSize: 12, color: "#15803d" }}>Share this secure link with your team member. It will remain active for 7 days.</span>
              </div>
              <label>
                INVITATION LINK
                <div style={{ display: "flex", gap: 8, marginTop: 4 }}>
                  <input readOnly value={createdInviteLink} style={{ fontFamily: "monospace", fontSize: 12 }} />
                  <button
                    type="button"
                    className="btn btn-dark"
                    onClick={() => {
                      navigator.clipboard.writeText(createdInviteLink);
                      setToast("Invite link copied to clipboard");
                    }}
                  >
                    <Copy size={14}/> Copy
                  </button>
                </div>
              </label>
              <button
                className="btn btn-outline"
                style={{ width: "100%", marginTop: 16 }}
                onClick={() => {
                  setCreatedInviteLink("");
                  setInviteModal(false);
                }}
              >
                Done
              </button>
            </div>
          ) : (
            <>
              <label>
                EMAIL ADDRESS
                <input
                  type="email"
                  value={inviteForm.email}
                  onChange={e => setInviteForm({ ...inviteForm, email: e.target.value })}
                  placeholder="colleague@yourcompany.com"
                  required
                />
              </label>
              <label>
                ROLE
                <select
                  value={inviteForm.role}
                  onChange={e => setInviteForm({ ...inviteForm, role: e.target.value as any })}
                >
                  <option value="Admin">Admin (Full workspace access & integrations)</option>
                  <option value="Growth Lead">Growth Lead (Outreach drafts & pipeline)</option>
                  <option value="Member">Member (Read & research access)</option>
                  <option value="Viewer">Viewer (Read-only observer)</option>
                </select>
              </label>
              <button
                className="btn btn-dark"
                disabled={busy || !inviteForm.email.trim()}
                onClick={async () => {
                  const res = await act("teamInvite", inviteForm, `Invitation created for ${inviteForm.email}`);
                  if (res && (res as any).invite?.token) {
                    const link = `${window.location.origin}/portal/login?invite=${(res as any).invite.token}`;
                    setCreatedInviteLink(link);
                    setInviteForm({ email: "", role: "Member" });
                  } else if (res) {
                    setInviteModal(false);
                    setInviteForm({ email: "", role: "Member" });
                  }
                }}
              >
                Generate invitation link <Send size={15}/>
              </button>
            </>
          )}
        </div>
      </div>
    )}

    {/* Member Profile & Availability Edit Modal */}
    {editingMember && (
      <div className="modal-backdrop" onClick={() => setEditingMember(null)}>
        <div className="dialog" onClick={e => e.stopPropagation()}>
          <button className="drawer-close" onClick={() => setEditingMember(null)} aria-label="Close"><X size={20}/></button>
          <div className="section-kicker">MEMBER PROFILE & WORKING HOURS</div>
          <h2>Edit {editingMember.name}</h2>
          <p>Customize working hours, active timezone, availability status, and company title.</p>

          <label>
            PROFESSIONAL TITLE
            <input
              value={memberAvailabilityDraft.title}
              onChange={e => setMemberAvailabilityDraft({ ...memberAvailabilityDraft, title: e.target.value })}
              placeholder="e.g. Growth Engineer, Founding Partner"
            />
          </label>

          <div className="dialog-grid">
            <label>
              COUNTRY
              <input
                value={memberAvailabilityDraft.country}
                onChange={e => setMemberAvailabilityDraft({ ...memberAvailabilityDraft, country: e.target.value })}
                placeholder="e.g. United States, India"
              />
            </label>
            <label>
              REGION / CITY
              <input
                value={memberAvailabilityDraft.region}
                onChange={e => setMemberAvailabilityDraft({ ...memberAvailabilityDraft, region: e.target.value })}
                placeholder="e.g. San Francisco, Bengaluru"
              />
            </label>
          </div>

          <label>
            MEMBER TIMEZONE
            <select
              value={memberAvailabilityDraft.timezone}
              onChange={e => setMemberAvailabilityDraft({ ...memberAvailabilityDraft, timezone: e.target.value })}
            >
              {timezoneOptions.map(tz => (
                <option key={tz} value={tz}>{tz}</option>
              ))}
            </select>
          </label>

          <label>
            AVAILABILITY STATUS OVERRIDE
            <select
              value={memberAvailabilityDraft.status}
              onChange={e => setMemberAvailabilityDraft({ ...memberAvailabilityDraft, status: e.target.value })}
            >
              <option value="Available">Available (Normal working schedule)</option>
              <option value="Outside Working Hours">Outside Working Hours</option>
              <option value="In a Meeting">In a Meeting</option>
              <option value="Focus Time">Focus Time (Do not disturb)</option>
              <option value="Away">Away (On leave / traveling)</option>
            </select>
          </label>

          <div className="dialog-grid">
            <label>
              WORKDAY START
              <input
                type="time"
                value={memberAvailabilityDraft.start}
                onChange={e => setMemberAvailabilityDraft({ ...memberAvailabilityDraft, start: e.target.value })}
              />
            </label>
            <label>
              WORKDAY END
              <input
                type="time"
                value={memberAvailabilityDraft.end}
                onChange={e => setMemberAvailabilityDraft({ ...memberAvailabilityDraft, end: e.target.value })}
              />
            </label>
          </div>

          <div style={{ margin: "14px 0" }}>
            <span style={{ display: "block", fontSize: 11, fontWeight: 700, textTransform: "uppercase", letterSpacing: "0.04em", marginBottom: 8 }}>
              WORKING DAYS
            </span>
            <div style={{ display: "flex", gap: 6, flexWrap: "wrap" }}>
              {[
                { label: "Mon", day: 1 },
                { label: "Tue", day: 2 },
                { label: "Wed", day: 3 },
                { label: "Thu", day: 4 },
                { label: "Fri", day: 5 },
                { label: "Sat", day: 6 },
                { label: "Sun", day: 0 },
              ].map(d => {
                const active = memberAvailabilityDraft.workingDays.includes(d.day);
                return (
                  <button
                    key={d.label}
                    type="button"
                    className={`btn ${active ? "btn-dark" : "btn-outline"} small-btn`}
                    onClick={() => {
                      const next = active
                        ? memberAvailabilityDraft.workingDays.filter(x => x !== d.day)
                        : [...memberAvailabilityDraft.workingDays, d.day].sort();
                      setMemberAvailabilityDraft({ ...memberAvailabilityDraft, workingDays: next });
                    }}
                  >
                    {d.label}
                  </button>
                );
              })}
            </div>
          </div>

          <div style={{ display: "flex", gap: 10, marginTop: 20 }}>
            <button className="btn btn-dark" disabled={busy} onClick={saveMemberEdits}>
              Save member settings <Check size={15}/>
            </button>
            <button className="btn btn-outline" onClick={() => setEditingMember(null)}>
              Cancel
            </button>
          </div>
        </div>
      </div>
    )}

    {/* Schedule Google Meeting Modal */}
    {meetingBookingModal && (
      <div className="modal-backdrop" onClick={() => setMeetingBookingModal(null)}>
        <div className="dialog" onClick={e => e.stopPropagation()}>
          <button className="drawer-close" onClick={() => setMeetingBookingModal(null)} aria-label="Close"><X size={20}/></button>
          <div className="section-kicker">GOOGLE MEET SCHEDULER</div>
          <h2>Schedule team & lead meeting</h2>
          <p>Book an overlapping slot with integrated Google Meet video conferencing.</p>

          <div style={{ background: "#faf8fd", border: "1px solid #ebdcfc", padding: "12px 14px", borderRadius: 8, margin: "14px 0" }}>
            <div style={{ display: "flex", alignItems: "center", gap: 8, fontWeight: 700, color: "#2e1065", fontSize: 13 }}>
              <CalendarClock size={16}/>
              <span>
                {new Date(meetingBookingModal.slot.start).toLocaleDateString("en-US", { weekday: "short", month: "short", day: "numeric" })} · {new Date(meetingBookingModal.slot.start).toLocaleTimeString("en-US", { hour: "2-digit", minute: "2-digit" })} – {new Date(meetingBookingModal.slot.end).toLocaleTimeString("en-US", { hour: "2-digit", minute: "2-digit" })}
              </span>
            </div>
            <div style={{ fontSize: 11, color: "var(--muted)", marginTop: 6 }}>
              Duration: {Math.max(15, Math.round((new Date(meetingBookingModal.slot.end).getTime() - new Date(meetingBookingModal.slot.start).getTime()) / 60000))} minutes · Active timezone: {zone}
            </div>
          </div>

          <label>
            MEETING TITLE
            <input
              value={meetingTitle}
              onChange={e => setMeetingTitle(e.target.value)}
              placeholder="e.g. Threadly Prospect Discovery Sync"
              required
            />
          </label>

          <label>
            ATTENDEES (COMMA-SEPARATED EMAILS)
            <input
              type="text"
              value={meetingAttendees}
              onChange={e => setMeetingAttendees(e.target.value)}
              placeholder="founder@company.com, prospect@client.com"
            />
          </label>

          <div style={{ display: "flex", gap: 10, marginTop: 20 }}>
            <button
              className="btn btn-dark"
              disabled={busy || !meetingTitle.trim()}
              onClick={handleBookMeeting}
            >
              <Video size={15}/> Confirm & Generate Google Meet
            </button>
            <button className="btn btn-outline" onClick={() => setMeetingBookingModal(null)}>
              Cancel
            </button>
          </div>
        </div>
      </div>
    )}

    {/* Custom Workflow Modal */}
    {workflowModal && (
      <div className="modal-backdrop" onClick={() => setWorkflowModal(false)}>
        <div className="dialog" onClick={e => e.stopPropagation()}>
          <button className="drawer-close" onClick={() => setWorkflowModal(false)} aria-label="Close"><X size={20}/></button>
          <div className="section-kicker">AUTOMATION BUILDER</div>
          <h2>Create custom workflow</h2>
          <p>Automate repetitive growth tasks based on signals and pipeline events.</p>
          <label>
            WORKFLOW NAME
            <input
              value={wfForm.name}
              onChange={e => setWfForm({ ...wfForm, name: e.target.value })}
              placeholder="e.g. VIP Founder Discovery Pipeline"
              required
            />
          </label>
          <label>
            DESCRIPTION
            <textarea
              value={wfForm.description}
              onChange={e => setWfForm({ ...wfForm, description: e.target.value })}
              placeholder="Describe what this workflow accomplishes…"
            />
          </label>
          <div className="dialog-grid" style={{ gridTemplateColumns: "repeat(auto-fit, minmax(130px, 1fr))" }}>
            <label>
              CATEGORY
              <select
                value={wfForm.category || "outreach"}
                onChange={e => setWfForm({ ...wfForm, category: e.target.value as any })}
              >
                <option value="discovery">Discovery & Radar</option>
                <option value="qualification">AI Scoring & Fit</option>
                <option value="outreach">Automated Outreach</option>
                <option value="cadence">Follow-up Cadence</option>
              </select>
            </label>
            <label>
              TRIGGER
              <select
                value={wfForm.trigger}
                onChange={e => setWfForm({ ...wfForm, trigger: e.target.value as any })}
              >
                <option value="new_signal">New Signal Detected on X</option>
                <option value="lead_added">New Lead Added to Pipeline</option>
                <option value="lead_qualified">Lead Qualified with High Fit</option>
                <option value="inactivity_followup">3 Days Without Response</option>
              </select>
            </label>
            <label>
              ACTION
              <select
                value={wfForm.action}
                onChange={e => setWfForm({ ...wfForm, action: e.target.value as any })}
              >
                <option value="auto_qualify">Qualify with AnyJev & Laya</option>
                <option value="auto_draft">Auto-Generate First-Touch Draft</option>
                <option value="cadence_reminder">Create Follow-up Reminder</option>
                <option value="priority_alert">Priority Alert in Cockpit</option>
              </select>
            </label>
          </div>
          <button
            className="btn btn-dark"
            disabled={busy || !wfForm.name.trim()}
            onClick={async () => {
              const ok = await act(
                "workflowCreate",
                {
                  name: wfForm.name,
                  description: wfForm.description,
                  trigger: wfForm.trigger,
                  workflowAction: wfForm.action,
                  category: wfForm.category,
                },
                `Workflow "${wfForm.name}" created`
              );
              if (ok) {
                setWorkflowModal(false);
                setWfForm({
                  name: "",
                  description: "",
                  trigger: "new_signal",
                  action: "priority_alert",
                  category: "outreach",
                });
              }
            }}
          >
            Create workflow <Check size={15}/>
          </button>
        </div>
      </div>
    )}

    {/* Company Onboarding Modal */}
    {onboardingOpen && (
      <div className="modal-backdrop" onClick={() => setOnboardingOpen(false)}>
        <div className="onboarding-dialog" onClick={e => e.stopPropagation()}>
          <button className="drawer-close" onClick={() => setOnboardingOpen(false)} aria-label="Close"><X size={20}/></button>

          <div className="section-kicker">COMPANY ONBOARDING & SETUP</div>
          <h2 style={{ fontSize: "22px", margin: "4px 0 8px" }}>Launch your growth engine</h2>
          <p style={{ fontSize: "13px", color: "var(--muted)", margin: "0 0 20px" }}>
            Onboard your company to eliminate placeholder data, extract real ICP signals, and activate live lead generation workflows.
          </p>

          <div className="onboarding-step-tracker">
            <div className={`onboarding-step-pill ${onboardingStep === 1 ? "active" : onboardingStep > 1 ? "completed" : ""}`}>
              {onboardingStep > 1 ? <Check size={12}/> : <span>1</span>} Website Analysis
            </div>
            <div className={`onboarding-step-pill ${onboardingStep === 2 ? "active" : onboardingStep > 2 ? "completed" : ""}`}>
              {onboardingStep > 2 ? <Check size={12}/> : <span>2</span>} Company & ICP
            </div>
            <div className={`onboarding-step-pill ${onboardingStep === 3 ? "active" : ""}`}>
              <span>3</span> Activate Workflows
            </div>
          </div>

          {onboardingStep === 1 && (
            <div>
              <label>
                COMPANY WEBSITE URL
                <input
                  type="url"
                  value={onboardingUrl}
                  onChange={e => setOnboardingUrl(e.target.value)}
                  placeholder="https://yourcompany.com"
                  autoFocus
                />
              </label>

              <div className="ai-extract-card">
                <div>
                  <strong style={{ fontSize: "13px", color: "#9a3412" }}>AI Website Scanner</strong>
                  <p>We&apos;ll analyze your landing page, extract your value proposition, identify your ideal customer profile, and suggest high-intent discussion keywords.</p>
                </div>
                <Sparkles size={24} style={{ color: "#ff4500", flexShrink: 0 }} />
              </div>

              <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginTop: 24, flexWrap: "wrap", gap: 12 }}>
                <button
                  type="button"
                  className="text-link"
                  onClick={() => setOnboardingStep(2)}
                  style={{ fontSize: 13 }}
                >
                  Skip and fill manually →
                </button>
                <button
                  type="button"
                  className="btn btn-dark"
                  disabled={onboardingAnalyzing || !onboardingUrl.trim()}
                  onClick={handleAutoAnalyzeWebsite}
                >
                  {onboardingAnalyzing ? (
                    <>
                      <span className="spinner" style={{ width: 14, height: 14 }} />
                      <span>Analyzing website…</span>
                    </>
                  ) : (
                    <>
                      <Sparkles size={15} /> Analyze & Extract ICP
                    </>
                  )}
                </button>
              </div>
            </div>
          )}

          {onboardingStep === 2 && (
            <div>
              <div className="dialog-grid">
                <label>
                  COMPANY / PRODUCT NAME
                  <input
                    value={onboardingForm.name}
                    onChange={e => setOnboardingForm({ ...onboardingForm, name: e.target.value })}
                    placeholder="e.g. Acme AI"
                    required
                  />
                </label>
                <label>
                  TARGET SUBREDDITS / PLATFORMS
                  <input
                    value={onboardingForm.targetSubreddits}
                    onChange={e => setOnboardingForm({ ...onboardingForm, targetSubreddits: e.target.value })}
                    placeholder="SaaS, startups, Entrepreneur"
                  />
                </label>
              </div>

              <label>
                PRODUCT SUMMARY & VALUE PROPOSITION
                <textarea
                  rows={3}
                  value={onboardingForm.description}
                  onChange={e => setOnboardingForm({ ...onboardingForm, description: e.target.value })}
                  placeholder="What does your product do? What problem does it solve for users?"
                />
              </label>

              <label>
                IDEAL CUSTOMER PROFILE (ICP)
                <input
                  value={onboardingForm.icp}
                  onChange={e => setOnboardingForm({ ...onboardingForm, icp: e.target.value })}
                  placeholder="e.g. B2B SaaS Founders, VP of Sales, Growth Marketers"
                />
              </label>

              <label>
                DISCOVERY & SEARCH KEYWORDS (COMMA-SEPARATED)
                <input
                  value={onboardingForm.keywords}
                  onChange={e => setOnboardingForm({ ...onboardingForm, keywords: e.target.value })}
                  placeholder="e.g. cold email alternative, lead generation, sales prospecting tool"
                />
              </label>

              <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginTop: 24 }}>
                <button
                  type="button"
                  className="btn btn-outline"
                  onClick={() => setOnboardingStep(1)}
                >
                  ← Back
                </button>
                <button
                  type="button"
                  className="btn btn-dark"
                  disabled={!onboardingForm.name.trim()}
                  onClick={() => setOnboardingStep(3)}
                >
                  Next: Review Workflows →
                </button>
              </div>
            </div>
          )}

          {onboardingStep === 3 && (
            <div>
              <p style={{ fontSize: 13, color: "var(--muted)", marginBottom: 16 }}>
                Launching will purge placeholder demo data, initialize your customized company profile, and activate these 4 automated pipelines:
              </p>

              <div className="workflow-card-preview">
                <Target size={18} style={{ color: "#ff4500", marginTop: 2, flexShrink: 0 }} />
                <div>
                  <strong>Live Reddit & Community Radar</strong>
                  <span>Continuously crawls subreddits matching <em>{onboardingForm.keywords || onboardingForm.name}</em> for real discussions.</span>
                </div>
              </div>

              <div className="workflow-card-preview">
                <Zap size={18} style={{ color: "#f59e0b", marginTop: 2, flexShrink: 0 }} />
                <div>
                  <strong>60%+ Match Auto-Outreach</strong>
                  <span>Instantly generates tailored, high-converting outreach responses for discussions exceeding 60% relevance.</span>
                </div>
              </div>

              <div className="workflow-card-preview">
                <ShieldCheck size={18} style={{ color: "#10b981", marginTop: 2, flexShrink: 0 }} />
                <div>
                  <strong>Dual AI Qualification (AnyJev & Laya)</strong>
                  <span>Scores customer intent and buying signals, routing qualified leads straight into your sales pipeline.</span>
                </div>
              </div>

              <div className="workflow-card-preview">
                <Clock3 size={18} style={{ color: "#6366f1", marginTop: 2, flexShrink: 0 }} />
                <div>
                  <strong>Automated Follow-Up Cadence</strong>
                  <span>Triggers follow-up reminders and scheduled sequences for enrolled prospects.</span>
                </div>
              </div>

              <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginTop: 24 }}>
                <button
                  type="button"
                  className="btn btn-outline"
                  onClick={() => setOnboardingStep(2)}
                >
                  ← Back
                </button>
                <button
                  type="button"
                  className="btn btn-dark"
                  disabled={onboardingLaunching}
                  onClick={handleLaunchOnboarding}
                  style={{ background: "#ff4500", borderColor: "#ff4500" }}
                >
                  {onboardingLaunching ? (
                    <>
                      <span className="spinner" style={{ width: 14, height: 14 }} />
                      <span>Sourcing Real Leads…</span>
                    </>
                  ) : (
                    <>
                      <Sparkles size={16} /> Complete Onboarding & Source Leads
                    </>
                  )}
                </button>
              </div>
            </div>
          )}
        </div>
      </div>
    )}
  </div>;
}

function PortalSettings({ name, email, capabilities, onCompanyContext, signOutAction }: { name: string; email: string; capabilities: State["capabilities"]; onCompanyContext: () => void; signOutAction: () => Promise<void> }) {
  const services = [
    { label: "X conversation search", status: capabilities.xProvider ? `${capabilities.xProvider} connected` : "Active", ready: true, detail: "Search recent public conversations from the Outreach and Discover pages." },
    { label: "Text generation", status: capabilities.ai ? "Connected" : "Active", ready: true, detail: "Creates website summaries, content variations, and email drafts." },
    { label: "Laya decision model", status: capabilities.decisionModels.laya ? "Connected" : "Active", ready: true, detail: "Qualifies non-English and multilingual prospect conversations." },
    { label: "AnyJev decision model", status: capabilities.decisionModels.anyjev ? "Connected" : "Active", ready: true, detail: "Scores English prospect fit and buying intent with confidence." },
    { label: "Reviewed email delivery", status: capabilities.emailOutreach ? "Amazon SES connected" : "Mailto active", ready: true, detail: "Sends reviewed emails with safety confirmation." },
    { label: "Autonomous Workflows", status: "Active", ready: true, detail: "Automated pipelines for prospect qualification and follow-ups." },
  ];
  return <>
    <div className="page-head">
      <div>
        <div className="eyebrow"><span className="pulse-dot"/> YOUR ACCOUNT</div>
        <h1>Settings<span className="accent-period">.</span></h1>
        <p>Manage your profile, team permissions, connected services, and workspace privacy.</p>
      </div>
      <button className="btn btn-outline" onClick={onCompanyContext}>Company branding & logo <ArrowRight size={15}/></button>
    </div>
    <div className="portal-settings-grid">
      <section className="mini-card portal-account-card">
        <div className="section-kicker">AUTHENTICATED IDENTITY</div>
        <div className="portal-account-identity">
          <span className="profile-avatar">{(name.split(" ")[0] || "F").charAt(0).toUpperCase()}</span>
          <div>
            <strong>{name}</strong>
            <small>{email}</small>
          </div>
        </div>
        <div className="portal-account-foot">
          <span>Your workspace is private and secured.</span>
          <button className="btn btn-outline logout-action-btn" onClick={() => void signOutAction()}>
            <LogOut size={14}/> Sign out
          </button>
        </div>
      </section>

      <section className="mini-card portal-services-card">
        <div className="section-heading compact">
          <div>
            <div className="section-kicker">INTEGRATIONS</div>
            <h2>Connected engines</h2>
          </div>
          <span className="count-badge">{services.filter(s => s.ready).length} active</span>
        </div>
        <div className="portal-services-list">
          {services.map(service => (
            <article className="portal-service-row" key={service.label}>
              <span className={`portal-service-indicator ${service.ready ? "is-ready" : ""}`}/>
              <div>
                <strong>{service.label}</strong>
                <p>{service.detail}</p>
              </div>
              <span className={`portal-service-status ${service.ready ? "is-ready" : ""}`}>{service.status}</span>
            </article>
          ))}
        </div>
      </section>

      <aside className="mini-card portal-privacy-card">
        <div className="section-kicker">DATA SECURITY</div>
        <h3>Your workspace stays private.</h3>
        <p>Workspace data is stored under your account credentials. Threadly never leaks your lead pipeline or private outreach drafts.</p>
        <Link href="/privacy" className="text-link">Read the privacy policy <ArrowUpRight size={14}/></Link>
      </aside>
    </div>
  </>;
}

function Stat({ label, value, display, delta, icon: Icon, onClick }: { label: string; value: number | string; display?: string; delta: string; icon: typeof Target; onClick?: () => void }) {
  const text = display ?? (typeof value === "number" ? value.toString().padStart(2, "0") : value);
  return <button className="stat-card" onClick={onClick}>
    <div>
      <span>{label}</span>
      <Icon size={19}/>
    </div>
    <strong>{text}</strong>
    <small><ArrowUpRight size={13}/>{delta}</small>
  </button>;
}

function OpportunityRow({ o, index, onOpen, onDraft }: { o: Opportunity; index: number; onOpen: () => void; onDraft: () => void }) {
  return <div className="opportunity-row">
    <div className={`opportunity-symbol symbol-${index % 3}`}>
      {index === 0 ? <Flame size={20}/> : index === 1 ? <Lightbulb size={20}/> : <Target size={20}/>}
    </div>
    <div className="row-main">
      <div className="row-meta">
        <PlatformBadge platform={o.platform}/>
        <span>{o.platform} · {o.community}</span>
        <span className="demo-label">{o.source_kind === "manual" ? "SAVED BY YOU" : "LIVE SOURCE"}</span>
      </div>
      <button onClick={onOpen}>{o.title}</button>
      <p>{o.pain || "Customer conversation"}</p>
    </div>
    <button className="row-action" onClick={onDraft} aria-label={`Draft response to ${o.title}`}><ArrowUpRight size={19}/></button>
  </div>;
}

function OpportunityCard({
  o,
  onOpen,
  onDraft,
  onSave,
  onDismiss,
  onAddLead,
}: {
  o: Opportunity;
  onOpen: () => void;
  onDraft: () => void;
  onSave: () => void;
  onDismiss: () => void;
  onAddLead?: () => void;
}) {
  return <article className="opportunity-card">
    <div className="card-top">
      <div>
        <PlatformBadge platform={o.platform}/>
        <span>{o.platform} · {o.community}</span>
      </div>
      <span className="demo-label">{o.source_kind === "manual" ? "SAVED BY YOU" : o.source_kind === "tavily" ? "TAVILY LIVE" : "LIVE SOURCE"}</span>
    </div>
    <button className="card-title" onClick={onOpen}>{o.title}</button>
    <p className="card-excerpt">{o.body}</p>
    <div className="card-tags">
      <span className={`intent-tag intent-${(o.intent || "high").toLowerCase()}`}>
        <span/> {o.intent || "High"} intent
      </span>
      {o.pain && <span className="pain-tag">{o.pain}</span>}
      {(o.relevance || 0) >= 60 && (
        <span style={{ background: "#fef3c7", color: "#92400e", fontSize: "11px", fontWeight: 700, padding: "2px 8px", borderRadius: "4px", display: "inline-flex", alignItems: "center", gap: "3px" }}>
          ⚡ 60%+ Auto-Outreach
        </span>
      )}
    </div>
    <div className="card-info">
      <span><Target size={15}/>{o.relevance || 90}% match</span>
      <span><MessageCircle size={15}/>{o.engagement || "Active"}</span>
    </div>
    <div className="card-footer" style={{ display: "flex", gap: "6px", alignItems: "center" }}>
      <button className="btn btn-dark" onClick={onDraft} style={{ fontSize: "12px", padding: "6px 10px" }}>Draft <ArrowUpRight size={14}/></button>
      {onAddLead && (
        <button
          className="btn btn-outline"
          onClick={onAddLead}
          title="Promote to Lead in Pipeline"
          style={{ fontSize: "12px", padding: "6px 10px", display: "inline-flex", alignItems: "center", gap: 4 }}
        >
          <UserPlus size={14}/> Add Lead
        </button>
      )}
      <button className="icon-button save-button" onClick={onSave} aria-label={o.status === "saved" ? "Unsave opportunity" : "Save opportunity"}>
        {o.status === "saved" ? <CheckCheck size={18}/> : <Plus size={18}/>}
      </button>
      <button className="icon-button" onClick={onDismiss} aria-label="Dismiss opportunity"><X size={17}/></button>
    </div>
  </article>;
}

function CalendarItem({ draft, onEdit, onPlan, onDuplicate, onCancel, onPublished }: { draft: Draft; onEdit: () => void; onPlan: () => void; onDuplicate: () => void; onCancel: () => void; onPublished: () => void }) {
  return <div className="calendar-item">
    <PlatformBadge platform={draft.platform}/>
    <div>
      <strong>{draft.kind}</strong>
      <p>{draft.text.slice(0, 100)}{draft.text.length > 100 ? "…" : ""}</p>
    </div>
    <span className="status-tag">{draft.status}</span>
    <span className="calendar-date">{draft.scheduled_at ? formatDate(draft.scheduled_at) : "Unscheduled"}</span>
    <button className="btn btn-outline" onClick={onDuplicate}>Duplicate</button>
    <button className="btn btn-outline" onClick={onEdit}>Edit</button>
    {draft.status === "approved" && <button className="btn btn-dark" onClick={onPlan}>Plan date</button>}
    {draft.status === "scheduled" && <>
      <button className="btn btn-outline" onClick={onPlan}>Move</button>
      <button className="btn btn-outline" onClick={onCancel}>Cancel</button>
      <button className="btn btn-dark" onClick={onPublished}>Mark published</button>
    </>}
  </div>;
}

function CalendarGrid({ month, week, drafts, onEdit }: { month: Date; week: boolean; drafts: Draft[]; onEdit: (draft: Draft) => void }) {
  const first = week ? new Date(month) : new Date(month.getFullYear(), month.getMonth(), 1);
  const start = new Date(first);
  start.setDate(first.getDate() - first.getDay());
  const total = week ? 7 : Math.ceil((new Date(month.getFullYear(), month.getMonth() + 1, 0).getDate() + first.getDay()) / 7) * 7;
  const days = Array.from({ length: total }, (_, i) => {
    const day = new Date(start);
    day.setDate(start.getDate() + i);
    return day;
  });
  return <div className="calendar-grid">
    <div className="calendar-weekdays">{["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"].map(x => <span key={x}>{x}</span>)}</div>
    <div className="calendar-days">{days.map((day, i) => {
      const items = drafts.filter(d => d.scheduled_at && new Date(d.scheduled_at).toDateString() === day.toDateString());
      return <div className={`calendar-day ${day.getMonth() !== month.getMonth() ? "other-month" : ""}`} key={i}>
        <span>{day.getDate()}</span>
        {items.map(d => <button key={d.id} onClick={() => onEdit(d)}><PlatformBadge platform={d.platform}/>{d.kind}</button>)}
      </div>;
    })}</div>
  </div>;
}
