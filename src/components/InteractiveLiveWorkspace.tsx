"use client";

import { useState, useEffect } from "react";
import Image from "next/image";
import {
  Radar, Users, Mail, CircleDollarSign, CalendarClock, Globe2, BarChart3,
  Sparkles, Check, CheckCheck, TrendingUp, Zap, ArrowRight, RefreshCw,
  Send, Flame, SlidersHorizontal, MessageSquare, Bot, ExternalLink
} from "lucide-react";

export default function InteractiveLiveWorkspace() {
  // Default to Campaign Command (matching user's screenshot)
  const [activeModule, setActiveModule] = useState<number>(3);

  // Module 0: Signal Radar State
  const [radarSelectedSignal, setRadarSelectedSignal] = useState(0);
  const [radarDraftGenerated, setRadarDraftGenerated] = useState(false);
  const [radarSavedPipeline, setRadarSavedPipeline] = useState(false);

  // Module 1: Lead Intelligence State
  const [selectedLead, setSelectedLead] = useState(0);
  const [enrolledLeads, setEnrolledLeads] = useState<Record<number, boolean>>({});

  // Module 2: Sequence Engine State
  const [sequenceVariant, setSequenceVariant] = useState<"A" | "B">("B");
  const [sequenceTested, setSequenceTested] = useState(false);

  // Module 3: Campaign Command State (Screenshot)
  const [isReallocated, setIsReallocated] = useState(false);

  // Module 4: Scheduler State
  const [selectedSlot, setSelectedSlot] = useState(0);
  const [isSlotLocked, setIsSlotLocked] = useState(false);

  // Module 5: GEO State
  const [activeGeoEngine, setActiveGeoEngine] = useState<"chatgpt" | "perplexity" | "gemini">("chatgpt");
  const [citationsInspected, setCitationsInspected] = useState(false);

  // Module 6: Analytics State
  const [analyticsTimeframe, setAnalyticsTimeframe] = useState<"7D" | "30D" | "90D">("30D");

  // Allow external module selection from landing page cards
  useEffect(() => {
    const handleSelectModule = (e: Event) => {
      const customEvent = e as CustomEvent<{ moduleId: number }>;
      if (typeof customEvent.detail?.moduleId === "number") {
        setActiveModule(customEvent.detail.moduleId);
      }
    };
    window.addEventListener("threadly:select-module", handleSelectModule);
    return () => window.removeEventListener("threadly:select-module", handleSelectModule);
  }, []);

  const sidebarItems = [
    { id: 0, label: "Signal Radar", icon: Radar },
    { id: 1, label: "Lead Intelligence", icon: Users },
    { id: 2, label: "Sequence Engine", icon: Mail },
    { id: 3, label: "Campaign Command", icon: CircleDollarSign },
    { id: 4, label: "Best-Time Scheduler", icon: CalendarClock },
    { id: 5, label: "GEO & SEO Monitor", icon: Globe2 },
    { id: 6, label: "Revenue Analytics", icon: BarChart3 },
  ];

  return (
    <div className="w-full">
      {/* Main Workspace Window - Only Sidebar Navigation */}
      <div className="overflow-hidden rounded-[20px] border-2 border-brand-black bg-white shadow-[10px_10px_0_#ff4500] transition-shadow duration-300 hover:shadow-[14px_14px_0_#ff4500]">
        <div className="grid grid-cols-[52px_1fr]">
          {/* Left Mini Sidebar - The Only Navigation */}
          <div className="flex flex-col items-center gap-3 border-r-2 border-brand-black bg-brand-paper py-4">
            <button
              type="button"
              onClick={() => setActiveModule(3)}
              className="grid h-8 w-8 place-items-center rounded-lg bg-brand-black text-white transition-transform hover:scale-105"
              title="Threadly Workspace"
            >
              <Image src="/threadly-mark.svg" alt="" width={18} height={18} />
            </button>

            {sidebarItems.map((item) => {
              const Icon = item.icon;
              const active = activeModule === item.id;
              return (
                <button
                  key={item.id}
                  type="button"
                  onClick={() => setActiveModule(item.id)}
                  title={item.label}
                  className={`grid h-7 w-7 place-items-center rounded-md transition-all ${
                    active
                      ? "bg-brand-black text-brand-orange shadow-[2px_2px_0_#ff4500]"
                      : "text-brand-quiet hover:bg-white hover:text-brand-black"
                  }`}
                >
                  <Icon className="h-3.5 w-3.5" />
                </button>
              );
            })}
          </div>

          {/* Right Workspace Content Panel */}
          <div className="p-4 sm:p-5">
            {/* ------------------------------------------------------------- */}
            {/* MODULE 3: CAMPAIGN COMMAND (Default - Exact Screenshot Match) */}
            {/* ------------------------------------------------------------- */}
            {activeModule === 3 && (
              <div className="animate-in fade-in duration-150">
                <div className="flex items-center justify-between">
                  <div>
                    <div className="font-mono text-[8px] font-bold uppercase tracking-[0.13em] text-brand-quiet">
                      Campaign command
                    </div>
                    <div className="mt-1 text-[18px] font-black tracking-[-0.04em]">Q4 Pipeline Sprint</div>
                  </div>
                  <div className="flex items-center gap-2">
                    <button
                      type="button"
                      onClick={() => setIsReallocated(!isReallocated)}
                      className="inline-flex items-center gap-1 rounded-full border border-brand-orange bg-brand-orangeLight px-2.5 py-1 font-mono text-[8px] font-bold uppercase tracking-[0.08em] text-brand-orangeDark transition-all hover:bg-brand-orange hover:text-white"
                      title="Click to simulate AI budget reallocation"
                    >
                      <Sparkles className="h-2.5 w-2.5" />
                      {isReallocated ? "Reset Budget" : "Reallocate $320"}
                    </button>
                    <span className="rounded-full bg-brand-orangeLight px-2.5 py-1 font-mono text-[8px] font-bold uppercase tracking-[0.08em] text-brand-orangeDark">
                      Active
                    </span>
                  </div>
                </div>

                <div className="mt-4 grid grid-cols-3 gap-2">
                  {[
                    ["Spend", isReallocated ? "$4,600" : "$4,280"],
                    ["Revenue", isReallocated ? "$12,144" : "$10,296"],
                    ["ROAS", isReallocated ? "2.64×" : "2.41×"],
                  ].map(([label, value]) => (
                    <div key={label} className="rounded-lg border border-brand-line px-2.5 py-2">
                      <div className="font-mono text-[7.5px] font-bold uppercase tracking-[0.1em] text-brand-quiet">
                        {label}
                      </div>
                      <div className="mt-0.5 text-[13px] font-black">{value}</div>
                    </div>
                  ))}
                </div>

                <div className="mt-3 rounded-xl border border-brand-line p-3">
                  <div className="mb-2 flex items-center justify-between font-mono text-[8px] font-bold uppercase tracking-[0.1em] text-brand-quiet">
                    <span>Channel allocation</span>
                    <span className="text-brand-violet">auto-optimized</span>
                  </div>
                  {[
                    ["Google Search", isReallocated ? 86 : 78, "bg-brand-orange"],
                    ["LinkedIn", isReallocated ? 48 : 54, "bg-brand-violet"],
                    ["Reddit", isReallocated ? 42 : 36, "bg-brand-orangeDark"],
                    ["X", isReallocated ? 18 : 22, "bg-brand-black"],
                  ].map(([channel, width, color]) => (
                    <div key={channel as string} className="mb-1.5 last:mb-0">
                      <div className="flex items-center justify-between text-[8.5px] font-semibold text-brand-muted">
                        <span>{channel}</span>
                        <span className="font-mono">{width}%</span>
                      </div>
                      <div className="mt-0.5 h-1.5 rounded-full bg-brand-line overflow-hidden">
                        <div
                          className={`h-1.5 rounded-full transition-all duration-500 ${color}`}
                          style={{ width: `${width}%` }}
                        />
                      </div>
                    </div>
                  ))}
                </div>

                <div className="mt-3 flex items-center gap-2 rounded-xl border-2 border-brand-black bg-brand-black px-3 py-2 text-white">
                  <Sparkles className="h-3.5 w-3.5 shrink-0 text-brand-orange" />
                  <span className="text-[9px] leading-snug text-white/80">
                    {isReallocated ? (
                      <>Threadly shifted <b className="text-white">$320</b> into Google Search after ROAS crossed 3.1×.</>
                    ) : (
                      <>Threadly shifted <b className="text-white">$240</b> into Google Search after ROAS crossed 3.1×.</>
                    )}
                  </span>
                </div>
              </div>
            )}

            {/* ------------------------------------------------------------- */}
            {/* MODULE 0: SIGNAL RADAR                                        */}
            {/* ------------------------------------------------------------- */}
            {activeModule === 0 && (
              <div className="animate-in fade-in duration-150">
                <div className="flex items-center justify-between">
                  <div>
                    <div className="font-mono text-[8px] font-bold uppercase tracking-[0.13em] text-brand-quiet">
                      Signal Radar
                    </div>
                    <div className="mt-1 text-[18px] font-black tracking-[-0.04em]">Live Intent Stream</div>
                  </div>
                  <span className="inline-flex items-center gap-1 rounded-full bg-emerald-50 px-2 py-0.5 font-mono text-[8px] font-bold uppercase tracking-[0.08em] text-emerald-700">
                    <span className="h-1.5 w-1.5 animate-pulse rounded-full bg-emerald-500" /> 14 new
                  </span>
                </div>

                <div className="mt-3 space-y-2">
                  {[
                    {
                      platform: "Reddit · r/SaaS",
                      user: "u/devfounder_99",
                      text: "Looking for an outbound automation tool that doesn't trigger spam filters. Apollo and Lemlist keep burning my domain...",
                      score: "98% Intent",
                    },
                    {
                      platform: "X / Twitter",
                      user: "@alex_growth",
                      text: "What stack are founders using in 2026 for high-converting multi-channel sequence campaigns? Manual outreach is killing us.",
                      score: "94% Intent",
                    },
                  ].map((signal, idx) => (
                    <div
                      key={idx}
                      onClick={() => {
                        setRadarSelectedSignal(idx);
                        setRadarDraftGenerated(false);
                      }}
                      className={`cursor-pointer rounded-xl border p-2.5 transition-all ${
                        radarSelectedSignal === idx
                          ? "border-brand-black bg-brand-orangeLight/25 shadow-[3px_3px_0_#0a0a0a]"
                          : "border-brand-line bg-white hover:border-brand-black/30"
                      }`}
                    >
                      <div className="flex items-center justify-between text-[8.5px]">
                        <span className="font-mono font-bold text-brand-orangeDark">{signal.platform}</span>
                        <span className="rounded bg-brand-orange/15 px-1.5 py-0.5 font-mono font-bold text-brand-orangeDark">
                          {signal.score}
                        </span>
                      </div>
                      <p className="mt-1 text-[11px] font-medium leading-snug text-brand-black">{signal.text}</p>
                    </div>
                  ))}
                </div>

                <div className="mt-3 rounded-xl border border-brand-line bg-brand-paper p-3">
                  <div className="flex items-center justify-between">
                    <span className="font-mono text-[8px] font-bold uppercase tracking-[0.1em] text-brand-quiet">
                      AI Intent Copilot
                    </span>
                    {!radarDraftGenerated ? (
                      <button
                        type="button"
                        onClick={() => setRadarDraftGenerated(true)}
                        className="inline-flex items-center gap-1 rounded bg-brand-orange px-2 py-1 text-[9px] font-bold text-white transition-transform hover:scale-105"
                      >
                        <Sparkles className="h-2.5 w-2.5" /> Generate Reply
                      </button>
                    ) : (
                      <span className="font-mono text-[8px] font-bold text-emerald-700">✓ Ready to send</span>
                    )}
                  </div>

                  {radarDraftGenerated ? (
                    <div className="mt-2 space-y-2">
                      <div className="rounded-lg border border-brand-line bg-white p-2 text-[10px] leading-relaxed text-brand-black">
                        Hey! Saw your comment about deliverability. Threadly pairs real-time Reddit intent capture with automated domain warmup and human review so reply rates hit 31% without spam flags.
                      </div>
                      <div className="flex items-center justify-end">
                        <button
                          type="button"
                          onClick={() => setRadarSavedPipeline(true)}
                          className="inline-flex items-center gap-1 rounded-md border border-brand-black bg-brand-black px-2.5 py-1 text-[9px] font-bold text-white"
                        >
                          {radarSavedPipeline ? <Check className="h-3 w-3 text-brand-orange" /> : <Send className="h-3 w-3" />}
                          {radarSavedPipeline ? "Pushed to Pipeline" : "Push to Sequence Pipeline"}
                        </button>
                      </div>
                    </div>
                  ) : (
                    <div className="mt-1 text-[9.5px] italic text-brand-muted">
                      Click &ldquo;Generate Reply&rdquo; to auto-craft an authentic contextual response tailored to this thread.
                    </div>
                  )}
                </div>

                <div className="mt-3 flex items-center gap-2 rounded-xl border-2 border-brand-black bg-brand-black px-3 py-2 text-white">
                  <Sparkles className="h-3.5 w-3.5 shrink-0 text-brand-orange" />
                  <span className="text-[9px] leading-snug text-white/80">
                    Threadly detected <b>98% buying intent</b> in r/SaaS for outbound automation.
                  </span>
                </div>
              </div>
            )}

            {/* ------------------------------------------------------------- */}
            {/* MODULE 1: LEAD INTELLIGENCE                                   */}
            {/* ------------------------------------------------------------- */}
            {activeModule === 1 && (
              <div className="animate-in fade-in duration-150">
                <div className="flex items-center justify-between">
                  <div>
                    <div className="font-mono text-[8px] font-bold uppercase tracking-[0.13em] text-brand-quiet">
                      Lead Intelligence
                    </div>
                    <div className="mt-1 text-[18px] font-black tracking-[-0.04em]">Dual-Scored ICP Pipeline</div>
                  </div>
                  <span className="rounded-full bg-brand-violet/15 px-2.5 py-1 font-mono text-[8px] font-bold uppercase tracking-[0.08em] text-brand-violet">
                    Auto-Enriched
                  </span>
                </div>

                <div className="mt-3 grid grid-cols-3 gap-2">
                  {[
                    { name: "Elena Rostova", role: "VP Growth @ ScaleVector", score: 98, tech: "HubSpot, Stripe" },
                    { name: "Marcus Vance", role: "Head of RevOps @ HyperFunnel", score: 94, tech: "Salesforce, Apollo" },
                    { name: "Kiran Patel", role: "Founder @ CloudMesh", score: 91, tech: "Segment, PostHog" },
                  ].map((lead, idx) => (
                    <div
                      key={idx}
                      onClick={() => setSelectedLead(idx)}
                      className={`cursor-pointer rounded-xl border p-2 transition-all ${
                        selectedLead === idx
                          ? "border-brand-violet bg-brand-violet/5 shadow-[2px_2px_0_#7c3aed]"
                          : "border-brand-line bg-white hover:border-brand-black/30"
                      }`}
                    >
                      <div className="flex items-center justify-between">
                        <span className="font-mono text-[7px] font-bold text-brand-quiet">Fit Score</span>
                        <span className="font-mono text-[10px] font-black text-brand-violet">{lead.score}/100</span>
                      </div>
                      <div className="mt-0.5 text-[10.5px] font-black text-brand-black leading-tight truncate">{lead.name}</div>
                      <div className="text-[8px] text-brand-muted truncate">{lead.role}</div>
                    </div>
                  ))}
                </div>

                <div className="mt-3 rounded-xl border border-brand-line p-3">
                  <div className="flex items-center justify-between">
                    <div>
                      <div className="font-mono text-[8px] font-bold uppercase tracking-[0.1em] text-brand-quiet">
                        Intelligence Dossier · Dual-Model Analysis
                      </div>
                      <div className="text-[12px] font-black text-brand-black">
                        {selectedLead === 0 ? "Elena Rostova (ScaleVector)" : selectedLead === 1 ? "Marcus Vance (HyperFunnel)" : "Kiran Patel (CloudMesh)"}
                      </div>
                    </div>
                    <button
                      type="button"
                      onClick={() => setEnrolledLeads(prev => ({ ...prev, [selectedLead]: !prev[selectedLead] }))}
                      className={`inline-flex items-center gap-1 rounded-md px-2.5 py-1 text-[9px] font-bold transition-all ${
                        enrolledLeads[selectedLead]
                          ? "bg-emerald-600 text-white"
                          : "border border-brand-black bg-brand-black text-white hover:bg-brand-orange"
                      }`}
                    >
                      {enrolledLeads[selectedLead] ? <CheckCheck className="h-3 w-3" /> : <Zap className="h-3 w-3 text-brand-orange" />}
                      {enrolledLeads[selectedLead] ? "Enrolled in Cadence" : "+ Enroll in Sequence"}
                    </button>
                  </div>

                  <div className="mt-2 grid grid-cols-2 gap-2 text-[9px]">
                    <div className="rounded-lg bg-brand-paper p-2">
                      <span className="font-mono font-bold text-brand-quiet">Buying Signal:</span>
                      <p className="mt-0.5 font-medium text-brand-black">
                        Actively comparing outbound deliverability platforms across Reddit & X.
                      </p>
                    </div>
                    <div className="rounded-lg bg-brand-paper p-2">
                      <span className="font-mono font-bold text-brand-quiet">Enrichment:</span>
                      <p className="mt-0.5 font-medium text-brand-black">
                        Verified work email · Series A ($4.2M) · 100% ICP fit match.
                      </p>
                    </div>
                  </div>
                </div>

                <div className="mt-3 flex items-center gap-2 rounded-xl border-2 border-brand-black bg-brand-black px-3 py-2 text-white">
                  <Sparkles className="h-3.5 w-3.5 shrink-0 text-brand-orange" />
                  <span className="text-[9px] leading-snug text-white/80">
                    Auto-enriched <b>Elena Rostova</b>: 98/100 fit score, $4.2M Series A, active buyer.
                  </span>
                </div>
              </div>
            )}

            {/* ------------------------------------------------------------- */}
            {/* MODULE 2: SEQUENCE ENGINE                                     */}
            {/* ------------------------------------------------------------- */}
            {activeModule === 2 && (
              <div className="animate-in fade-in duration-150">
                <div className="flex items-center justify-between">
                  <div>
                    <div className="font-mono text-[8px] font-bold uppercase tracking-[0.13em] text-brand-quiet">
                      Sequence Engine
                    </div>
                    <div className="mt-1 text-[18px] font-black tracking-[-0.04em]">A/B Multi-Channel Cadence</div>
                  </div>
                  <span className="rounded-full bg-brand-orangeLight px-2.5 py-1 font-mono text-[8px] font-bold uppercase tracking-[0.08em] text-brand-orangeDark">
                    Step 2 of 4 Active
                  </span>
                </div>

                <div className="mt-3 flex items-center justify-between rounded-xl border border-brand-line bg-brand-paper p-2.5">
                  <div className="flex items-center gap-1.5">
                    <span className="font-mono text-[8px] font-bold uppercase text-brand-quiet">Variant Test:</span>
                    <button
                      type="button"
                      onClick={() => setSequenceVariant("A")}
                      className={`rounded px-2 py-0.5 font-mono text-[8.5px] font-bold transition-all ${
                        sequenceVariant === "A" ? "bg-brand-black text-white" : "border border-brand-line text-brand-muted"
                      }`}
                    >
                      Variant A (Standard)
                    </button>
                    <button
                      type="button"
                      onClick={() => setSequenceVariant("B")}
                      className={`inline-flex items-center gap-1 rounded px-2 py-0.5 font-mono text-[8.5px] font-bold transition-all ${
                        sequenceVariant === "B" ? "bg-brand-orange text-white shadow-[2px_2px_0_#0a0a0a]" : "border border-brand-line text-brand-muted"
                      }`}
                    >
                      Variant B (Winner 👑)
                    </button>
                  </div>
                  <div className="font-mono text-[8.5px] font-bold text-brand-black">
                    {sequenceVariant === "B" ? "Open: 64% · Reply: 31%" : "Open: 42% · Reply: 14%"}
                  </div>
                </div>

                <div className="mt-2.5 rounded-xl border border-brand-line p-3">
                  <div className="flex items-center justify-between text-[8.5px]">
                    <span className="font-mono font-bold text-brand-quiet">SUBJECT LINE</span>
                    <span className="font-mono font-bold text-brand-orangeDark">
                      {sequenceVariant === "B" ? "“quick observation about {{company}}'s CAC”" : "“quick question for {{first_name}}”"}
                    </span>
                  </div>
                  <p className="mt-2 text-[10px] leading-relaxed text-brand-muted">
                    {sequenceVariant === "B"
                      ? "Hey {{first_name}}, noticed your team scaling search spend. We spotted a 2.4× ROAS arbitrage opportunity in your category..."
                      : "Hey {{first_name}}, wondering who handles outbound automation at {{company}}? Would love to share some insights..."}
                  </p>
                </div>

                <div className="mt-3 flex items-center justify-between rounded-xl border border-brand-line p-2.5">
                  <span className="text-[9px] text-brand-muted">
                    Best-time delivery scheduled for <strong className="text-brand-black">Tue 09:14 AM EST</strong>
                  </span>
                  <button
                    type="button"
                    onClick={() => setSequenceTested(true)}
                    className="inline-flex items-center gap-1 rounded-md border border-brand-black bg-brand-black px-2.5 py-1 text-[9px] font-bold text-white hover:bg-brand-orange"
                  >
                    {sequenceTested ? <Check className="h-3 w-3 text-brand-orange" /> : <Send className="h-3 w-3" />}
                    {sequenceTested ? "Test Sent to Inbox" : "Send Test Dispatch"}
                  </button>
                </div>

                <div className="mt-3 flex items-center gap-2 rounded-xl border-2 border-brand-black bg-brand-black px-3 py-2 text-white">
                  <Sparkles className="h-3.5 w-3.5 shrink-0 text-brand-orange" />
                  <span className="text-[9px] leading-snug text-white/80">
                    Variant B active: <b>64% open rate</b>, delivery scheduled for optimal engagement window.
                  </span>
                </div>
              </div>
            )}

            {/* ------------------------------------------------------------- */}
            {/* MODULE 4: BEST-TIME SCHEDULER                                 */}
            {/* ------------------------------------------------------------- */}
            {activeModule === 4 && (
              <div className="animate-in fade-in duration-150">
                <div className="flex items-center justify-between">
                  <div>
                    <div className="font-mono text-[8px] font-bold uppercase tracking-[0.13em] text-brand-quiet">
                      Best-Time Scheduler
                    </div>
                    <div className="mt-1 text-[18px] font-black tracking-[-0.04em]">Audience Peak Windows</div>
                  </div>
                  <span className="rounded-full bg-emerald-50 px-2.5 py-1 font-mono text-[8px] font-bold text-emerald-700">
                    +22% Reach
                  </span>
                </div>

                <div className="mt-3 space-y-2">
                  {[
                    { day: "Tuesday · 09:14 AM EST", reach: "96% Audience Online", top: true },
                    { day: "Wednesday · 02:45 PM EST", reach: "88% Audience Online", top: false },
                    { day: "Thursday · 11:30 AM EST", reach: "91% Audience Online", top: false },
                  ].map((slot, idx) => (
                    <div
                      key={idx}
                      onClick={() => setSelectedSlot(idx)}
                      className={`cursor-pointer rounded-xl border p-2.5 transition-all ${
                        selectedSlot === idx
                          ? "border-brand-black bg-brand-paper shadow-[2px_2px_0_#0a0a0a]"
                          : "border-brand-line bg-white hover:border-brand-black/30"
                      }`}
                    >
                      <div className="flex items-center justify-between text-[9px]">
                        <span className="font-black text-brand-black">{slot.day}</span>
                        {slot.top && (
                          <span className="rounded bg-brand-orange px-1.5 py-0.5 font-mono text-[7.5px] font-bold text-white">
                            Peak Slot
                          </span>
                        )}
                      </div>
                      <div className="mt-0.5 font-mono text-[8.5px] font-bold text-emerald-600">{slot.reach}</div>
                    </div>
                  ))}
                </div>

                <div className="mt-3 flex items-center justify-between rounded-xl border border-brand-line p-2.5">
                  <span className="text-[9px] text-brand-muted">Optimal window identified</span>
                  <button
                    type="button"
                    onClick={() => setIsSlotLocked(!isSlotLocked)}
                    className="inline-flex items-center gap-1 rounded-md bg-brand-black px-2.5 py-1 text-[9px] font-bold text-white hover:bg-brand-orange"
                  >
                    {isSlotLocked ? <Check className="h-3 w-3 text-brand-orange" /> : <CalendarClock className="h-3 w-3" />}
                    {isSlotLocked ? "Slot Reserved ✓" : "Reserve Slot"}
                  </button>
                </div>

                <div className="mt-3 flex items-center gap-2 rounded-xl border-2 border-brand-black bg-brand-black px-3 py-2 text-white">
                  <Sparkles className="h-3.5 w-3.5 shrink-0 text-brand-orange" />
                  <span className="text-[9px] leading-snug text-white/80">
                    Optimal dispatch slot selected: <b>Tuesday 09:14 AM EST</b> (+22% reach).
                  </span>
                </div>
              </div>
            )}

            {/* ------------------------------------------------------------- */}
            {/* MODULE 5: GEO & SEO MONITOR                                   */}
            {/* ------------------------------------------------------------- */}
            {activeModule === 5 && (
              <div className="animate-in fade-in duration-150">
                <div className="flex items-center justify-between">
                  <div>
                    <div className="font-mono text-[8px] font-bold uppercase tracking-[0.13em] text-brand-quiet">
                      GEO & SEO Monitor
                    </div>
                    <div className="mt-1 text-[18px] font-black tracking-[-0.04em]">AI Engine Share of Voice</div>
                  </div>
                  <span className="rounded-full bg-brand-violet/15 px-2.5 py-1 font-mono text-[8px] font-bold uppercase text-brand-violet">
                    38% Answer Share
                  </span>
                </div>

                <div className="mt-3 flex items-center gap-1.5 border-b border-brand-line pb-2">
                  {(["chatgpt", "perplexity", "gemini"] as const).map((engine) => (
                    <button
                      key={engine}
                      type="button"
                      onClick={() => setActiveGeoEngine(engine)}
                      className={`rounded-lg px-2.5 py-1 font-mono text-[8.5px] font-bold uppercase transition-all ${
                        activeGeoEngine === engine
                          ? "bg-brand-black text-white"
                          : "border border-brand-line bg-white text-brand-muted hover:text-brand-black"
                      }`}
                    >
                      {engine === "chatgpt" ? "ChatGPT" : engine === "perplexity" ? "Perplexity" : "Gemini"}
                    </button>
                  ))}
                </div>

                <div className="mt-2.5 rounded-xl border border-brand-line p-3">
                  <div className="font-mono text-[7.5px] font-bold uppercase text-brand-quiet">Buyer Prompt</div>
                  <div className="mt-0.5 text-[10.5px] font-bold text-brand-black">
                    &ldquo;Best platform for intent-driven pipeline growth in 2026?&rdquo;
                  </div>

                  <div className="mt-2 rounded-lg bg-brand-paper p-2 text-[9.5px] text-brand-black leading-relaxed">
                    {activeGeoEngine === "chatgpt" && (
                      <>ChatGPT cites <strong>Threadly</strong> for autonomous intent qualification and compounding pipeline efficiency.</>
                    )}
                    {activeGeoEngine === "perplexity" && (
                      <>Perplexity cites <strong>Threadly</strong> as top recommendation for founder-led growth and high deliverability.</>
                    )}
                    {activeGeoEngine === "gemini" && (
                      <>Gemini rates <strong>Threadly</strong> as high-authority leader in real-time intent capture.</>
                    )}
                  </div>

                  <div className="mt-2 flex items-center justify-between text-[8.5px]">
                    <span className="font-mono text-brand-quiet">3 Citations verified</span>
                    <button
                      type="button"
                      onClick={() => setCitationsInspected(!citationsInspected)}
                      className="font-mono font-bold text-brand-violet underline hover:text-brand-black"
                    >
                      {citationsInspected ? "Hide Sources" : "Inspect Sources →"}
                    </button>
                  </div>

                  {citationsInspected && (
                    <div className="mt-2 space-y-0.5 border-t border-brand-line pt-1.5 font-mono text-[8px] text-brand-muted">
                      <div>[1] threadly.io/playbook/signal-radar</div>
                      <div>[2] techcrunch.com/2026/02/b2b-autonomous-growth</div>
                    </div>
                  )}
                </div>

                <div className="mt-3 flex items-center gap-2 rounded-xl border-2 border-brand-black bg-brand-black px-3 py-2 text-white">
                  <Sparkles className="h-3.5 w-3.5 shrink-0 text-brand-orange" />
                  <span className="text-[9px] leading-snug text-white/80">
                    Threadly indexed as <b>#1 recommended brand</b> across ChatGPT and Perplexity.
                  </span>
                </div>
              </div>
            )}

            {/* ------------------------------------------------------------- */}
            {/* MODULE 6: REVENUE ANALYTICS                                   */}
            {/* ------------------------------------------------------------- */}
            {activeModule === 6 && (
              <div className="animate-in fade-in duration-150">
                <div className="flex items-center justify-between">
                  <div>
                    <div className="font-mono text-[8px] font-bold uppercase tracking-[0.13em] text-brand-quiet">
                      Revenue Analytics
                    </div>
                    <div className="mt-1 text-[18px] font-black tracking-[-0.04em]">Closed-Loop Attribution</div>
                  </div>
                  <div className="flex items-center gap-1">
                    {(["7D", "30D", "90D"] as const).map((t) => (
                      <button
                        key={t}
                        type="button"
                        onClick={() => setAnalyticsTimeframe(t)}
                        className={`rounded px-2 py-0.5 font-mono text-[8px] font-bold transition-all ${
                          analyticsTimeframe === t
                            ? "bg-brand-black text-white"
                            : "border border-brand-line text-brand-muted hover:text-brand-black"
                        }`}
                      >
                        {t}
                      </button>
                    ))}
                  </div>
                </div>

                <div className="mt-3.5 grid grid-cols-3 gap-2">
                  <div className="rounded-lg border border-brand-line px-2.5 py-2">
                    <div className="font-mono text-[7.5px] font-bold uppercase tracking-[0.1em] text-brand-quiet">Pipeline Won</div>
                    <div className="mt-0.5 text-[13px] font-black">
                      {analyticsTimeframe === "7D" ? "$42,400" : analyticsTimeframe === "30D" ? "$184,200" : "$520,800"}
                    </div>
                  </div>
                  <div className="rounded-lg border border-brand-line px-2.5 py-2">
                    <div className="font-mono text-[7.5px] font-bold uppercase tracking-[0.1em] text-brand-quiet">Blended CAC</div>
                    <div className="mt-0.5 text-[13px] font-black text-brand-orange">
                      {analyticsTimeframe === "7D" ? "$142" : analyticsTimeframe === "30D" ? "$118" : "$94"}
                    </div>
                  </div>
                  <div className="rounded-lg border border-brand-line px-2.5 py-2">
                    <div className="font-mono text-[7.5px] font-bold uppercase tracking-[0.1em] text-brand-quiet">Blended ROAS</div>
                    <div className="mt-0.5 text-[13px] font-black text-emerald-600">
                      {analyticsTimeframe === "7D" ? "2.84×" : analyticsTimeframe === "30D" ? "2.41×" : "2.92×"}
                    </div>
                  </div>
                </div>

                <div className="mt-3 rounded-xl border border-brand-line p-3">
                  <div className="mb-2 font-mono text-[8px] font-bold uppercase tracking-[0.1em] text-brand-quiet">
                    Channel Contribution Waterfall
                  </div>
                  <div className="space-y-1.5 text-[9px]">
                    <div className="flex justify-between items-center">
                      <span className="font-semibold text-brand-muted">Signal Radar Inbound (52%)</span>
                      <span className="font-mono font-bold">$95,780</span>
                    </div>
                    <div className="h-1.5 rounded-full bg-brand-line overflow-hidden">
                      <div className="h-full bg-brand-orange rounded-full" style={{ width: "52%" }} />
                    </div>

                    <div className="flex justify-between items-center mt-2">
                      <span className="font-semibold text-brand-muted">Sequence Outreach (28%)</span>
                      <span className="font-mono font-bold">$51,570</span>
                    </div>
                    <div className="h-1.5 rounded-full bg-brand-line overflow-hidden">
                      <div className="h-full bg-brand-violet rounded-full" style={{ width: "28%" }} />
                    </div>

                    <div className="flex justify-between items-center mt-2">
                      <span className="font-semibold text-brand-muted">Paid Channel Amplification (20%)</span>
                      <span className="font-mono font-bold">$36,850</span>
                    </div>
                    <div className="h-1.5 rounded-full bg-brand-line overflow-hidden">
                      <div className="h-full bg-brand-black rounded-full" style={{ width: "20%" }} />
                    </div>
                  </div>
                </div>

                <div className="mt-3 flex items-center gap-2 rounded-xl border-2 border-brand-black bg-brand-black px-3 py-2 text-white">
                  <Sparkles className="h-3.5 w-3.5 shrink-0 text-brand-orange" />
                  <span className="text-[9px] leading-snug text-white/80">
                    Revenue attribution: <b>$184,200</b> pipeline won with blended 2.41× ROAS.
                  </span>
                </div>
              </div>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}
