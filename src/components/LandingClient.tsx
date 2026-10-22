"use client";

import { useEffect, useState, type FormEvent } from "react";
import Image from "next/image";
import Footer from "./Footer";
import LenisParallax from "./LenisParallax";
import LenisMarquee from "./LenisMarquee";
import InteractiveLiveWorkspace from "./InteractiveLiveWorkspace";
import { GoogleAuthProvider, onAuthStateChanged, signInWithPopup, type User } from "firebase/auth";
import { getFirebaseAuth } from "@/lib/firebase-client";
import {
  Activity, ArrowRight, ArrowUpRight, BarChart3, CalendarClock, Check, ChevronRight,
  CircleDollarSign, Copy, Flame, Globe2, Layers, Mail, Radar, Search, Sparkles,
  Target, TrendingUp, Users, Workflow, X, Zap,
} from "lucide-react";

/* ------------------------------------------------------------------ */
/* Content                                                             */
/* ------------------------------------------------------------------ */

const modules = [
  {
    tag: "01 · Capture",
    title: "Signal Radar",
    copy: "Listen across X, Reddit and communities for the exact words buyers use. Threadly scores intent, dedupes the noise, and hands you the thread worth joining.",
    stat: "+148% qualified conversations",
    accent: "orange" as const,
    icon: Radar,
    points: ["Intent scoring", "Pain-point clustering", "Saved segments"],
  },
  {
    tag: "02 · Qualify",
    title: "Lead Intelligence",
    copy: "Every prospect gets a fit score, buying-intent estimate and a reason. Segments build themselves from behaviour, not spreadsheets.",
    stat: "0% manual triage",
    accent: "violet" as const,
    icon: Users,
    points: ["Dual-model scoring", "Auto-enrichment", "Dynamic segments"],
  },
  {
    tag: "03 · Convert",
    title: "Sequence Engine",
    copy: "Multi-step outreach with conditional branches, A/B variants and best-time delivery. Every send is reviewed — no fire-and-forget spam.",
    stat: "31% reply rate",
    accent: "orange" as const,
    icon: Mail,
    points: ["Conditional steps", "A/B subject lines", "Reply detection"],
  },
  {
    tag: "04 · Amplify",
    title: "Campaign Command",
    copy: "Run paid and organic together. Threadly watches ROAS by channel and shifts budget to the winners while they're still winning.",
    stat: "2.4× blended ROAS",
    accent: "violet" as const,
    icon: CircleDollarSign,
    points: ["Budget reallocation", "Creative variants", "Spend guardrails"],
  },
  {
    tag: "05 · Publish",
    title: "Best-Time Scheduler",
    copy: "Content slots are chosen from your own audience's behaviour, not a generic listicle. Group posts into threads, campaigns and launches.",
    stat: "+22% engagement",
    accent: "orange" as const,
    icon: CalendarClock,
    points: ["Best-time slots", "Group scheduling", "Queue health"],
  },
  {
    tag: "06 · Compound",
    title: "GEO & SEO",
    copy: "Track how ChatGPT, Perplexity, Gemini and Google answer the questions your buyers ask. Then fix it — structure, citations and source coverage.",
    stat: "38% answer share",
    accent: "violet" as const,
    icon: Globe2,
    points: ["AI answer monitoring", "Citation gaps", "Entity coverage"],
  },
];

const liveEvents = [
  { who: "Signal Radar", what: "Detected buying intent in 12 new X threads", when: "now", tone: "orange" },
  { who: "Sequence Engine", what: "Step 2 delivered · 41% open rate on variant B", when: "2s", tone: "violet" },
  { who: "Lead Intelligence", what: "Scored 8 prospects · 3 strong-fit", when: "6s", tone: "orange" },
  { who: "Campaign Command", what: "Reallocated $240 from Meta → Google · ROAS 3.1", when: "11s", tone: "violet" },
  { who: "GEO Monitor", what: "ChatGPT now cites you for “outreach automation”", when: "18s", tone: "orange" },
];

const stack = [
  "HubSpot", "Salesforce", "Apollo", "Clay", "Calendly", "Stripe", "LinkedIn",
  "Google Ads", "Meta Ads", "Reddit", "X", "Slack", "Notion", "Zapier",
];

/* ------------------------------------------------------------------ */
/* Component                                                           */
/* ------------------------------------------------------------------ */

export default function LandingClient() {
  const [modalOpen, setModalOpen] = useState(false);
  const [authUser, setAuthUser] = useState<User | null>(null);
  const [authReady, setAuthReady] = useState(false);
  const [authBusy, setAuthBusy] = useState(false);
  const [authError, setAuthError] = useState("");
  const [applicationChecked, setApplicationChecked] = useState(false);
  const [applicationStatus, setApplicationStatus] = useState<"pending" | "approved" | "rejected" | null>(null);
  const [confirmationEmailSent, setConfirmationEmailSent] = useState<boolean | null>(null);
  const [formError, setFormError] = useState("");
  const [submitting, setSubmitting] = useState(false);
  const [copied, setCopied] = useState(false);
  const [liveIndex, setLiveIndex] = useState(0);

  const [form, setForm] = useState({
    fullName: "",
    startupName: "",
    industry: "",
    url: "",
    challenge1: "",
  });

  useEffect(() => {
    let unsubscribe = () => {};
    try {
      unsubscribe = onAuthStateChanged(getFirebaseAuth(), async user => {
        setAuthUser(user);
        setAuthReady(true);
        setAuthError("");
        if (!user) {
          setApplicationStatus(null);
          setApplicationChecked(true);
          return;
        }
        setApplicationChecked(false);
        setForm(current => ({ ...current, fullName: current.fullName || user.displayName || "" }));
        try {
          const response = await fetch("/api/waitlist", {
            headers: { Authorization: `Bearer ${await user.getIdToken()}` },
            cache: "no-store",
          });
          const data = await response.json().catch(() => ({}));
          if (!response.ok) throw new Error(data.error || "Could not check your beta request.");
          const isUserAdmin = data.role === "admin" || (user.email ? ["kiran160703kumar@gmail.com", "founder@demo.threadly.io"].includes(user.email.toLowerCase().trim()) : false);
          if (isUserAdmin || data.accessGranted || data.application?.status === "approved") {
            setApplicationStatus("approved");
          } else {
            setApplicationStatus(data.application?.status || null);
          }
        } catch (error) {
          setFormError(error instanceof Error ? error.message : "Could not check your beta request.");
        } finally {
          setApplicationChecked(true);
        }
      });
    } catch (error) {
      setAuthError(error instanceof Error ? error.message : "Google sign-in is not configured.");
      setAuthReady(true);
    }
    return () => unsubscribe();
  }, []);

  useEffect(() => {
    const timer = setInterval(() => {
      setLiveIndex((index) => (index + 1) % liveEvents.length);
    }, 2600);
    return () => clearInterval(timer);
  }, []);

  useEffect(() => {
    if (!modalOpen) return;
    const close = (event: KeyboardEvent) => {
      if (event.key === "Escape") setModalOpen(false);
    };
    window.addEventListener("keydown", close);
    return () => window.removeEventListener("keydown", close);
  }, [modalOpen]);

  useEffect(() => {
    const openFromHash = () => {
      if (window.location.hash === "#waitlist") setModalOpen(true);
    };
    openFromHash();
    window.addEventListener("hashchange", openFromHash);
    return () => window.removeEventListener("hashchange", openFromHash);
  }, []);

  async function submit(event: FormEvent) {
    event.preventDefault();
    setFormError("");
    if (!authUser) {
      setFormError("Sign in with Google before sending your beta request.");
      return;
    }
    if (!form.fullName || !form.startupName || !form.industry || !form.challenge1) {
      setFormError("Fill in the required fields so we can route your workspace.");
      return;
    }
    setSubmitting(true);
    try {
      const response = await fetch("/api/waitlist", {
        method: "POST",
        headers: { "Content-Type": "application/json", Authorization: `Bearer ${await authUser.getIdToken()}` },
        body: JSON.stringify(form),
      });
      const data = await response.json().catch(() => ({}));
      if (!response.ok) throw new Error(data.error || "Could not save your request.");
      setApplicationStatus(data.status || "pending");
      setConfirmationEmailSent(typeof data.emailSent === "boolean" ? data.emailSent : null);
    } catch (error) {
      setFormError(error instanceof Error ? error.message : "Something went wrong.");
    } finally {
      setSubmitting(false);
    }
  }

  async function signInForBeta() {
    setAuthBusy(true);
    setAuthError("");
    try {
      const provider = new GoogleAuthProvider();
      provider.setCustomParameters({ prompt: "select_account" });
      await signInWithPopup(getFirebaseAuth(), provider);
    } catch (error) {
      const code = (error as { code?: string })?.code;
      if (code !== "auth/popup-closed-by-user" && code !== "auth/cancelled-popup-request") {
        setAuthError(error instanceof Error ? error.message : "Google sign-in failed. Please try again.");
      }
    } finally {
      setAuthBusy(false);
    }
  }

  const openWaitlist = () => {
    setFormError("");
    setConfirmationEmailSent(null);
    setModalOpen(true);
  };

  const visibleEvents = Array.from({ length: 4 }, (_, offset) => liveEvents[(liveIndex + offset) % liveEvents.length]);

  return (
    <div className="min-h-screen bg-brand-paper text-brand-black selection:bg-brand-orange selection:text-white">
      {/* ============================================================ */}
      {/* Nav                                                          */}
      {/* ============================================================ */}
      <header className="fixed inset-x-0 top-0 z-50 border-b-2 border-brand-black bg-brand-paper/95 backdrop-blur-md">
        <div className="mx-auto flex h-[76px] max-w-[1240px] items-center justify-between px-5 max-[380px]:px-3 lg:px-8">
          <a href="/" className="flex items-center gap-3 max-[640px]:gap-2" aria-label="Threadly home">
            <Image src="/threadly-mark.svg" alt="" width={34} height={34} className="h-[34px] w-[34px] max-[640px]:h-7 max-[640px]:w-7" priority />
            <span className="text-[26px] font-black leading-none tracking-[-0.05em] max-[640px]:text-[22px]">
              threadly<span className="text-brand-orange">.</span>
            </span>
          </a>
          <nav className="hidden items-center gap-1 lg:flex">
            {[
              ["Platform", "#platform"],
              ["Modules", "#modules"],
              ["Live workspace", "#workspace"],
              ["Stories", "#stories"],
            ].map(([label, href]) => (
              <a
                key={label}
                href={href}
                className="rounded-full px-4 py-2 text-[13px] font-bold text-brand-muted transition-colors hover:bg-white hover:text-brand-black"
              >
                {label}
              </a>
            ))}
          </nav>
          <div className="flex items-center gap-2.5">
            <a
              href="/portal/login"
              className="inline-flex shrink-0 whitespace-nowrap rounded-full border-2 border-brand-black px-3 py-2.5 text-[11px] font-extrabold transition-colors hover:bg-white sm:px-4 sm:text-[12px] max-[380px]:px-1 max-[380px]:text-[10px]"
            >
              Sign in
            </a>
            <button
              type="button"
              onClick={openWaitlist}
              aria-label="Request beta access"
              className="btn-tactile-orange inline-flex items-center gap-2 rounded-full border-2 border-brand-orange bg-brand-orange px-3 py-2.5 text-[11px] font-extrabold text-white sm:px-5 sm:text-[12px] max-[380px]:gap-1.5 max-[380px]:px-2"
            >
              <span className="max-[640px]:hidden">Request beta access</span>
              <span className="hidden max-[380px]:inline">Beta</span>
              <span className="hidden max-[640px]:inline max-[380px]:hidden">Join beta</span>
              <ArrowRight className="h-4 w-4 max-[380px]:h-3.5 max-[380px]:w-3.5" />
            </button>
          </div>
        </div>
      </header>

      {/* ============================================================ */}
      {/* Hero                                                         */}
      {/* ============================================================ */}
      <section className="relative overflow-hidden pt-[132px] pb-20 lg:pt-[164px] lg:pb-28">
        <div className="paper-grid pointer-events-none absolute inset-0 opacity-60" aria-hidden />
        <LenisParallax
          speed={-0.15}
          className="pointer-events-none absolute -right-32 top-10 h-[520px] w-[520px] rounded-full opacity-40 blur-[120px]"
          style={{ background: "radial-gradient(circle, #ff4500 0%, transparent 68%)" }}
          aria-hidden
        />
        <LenisParallax
          speed={0.18}
          className="pointer-events-none absolute -left-40 top-64 h-[460px] w-[460px] rounded-full opacity-30 blur-[120px]"
          style={{ background: "radial-gradient(circle, #7c3aed 0%, transparent 68%)" }}
          aria-hidden
        />

        <div className="relative mx-auto grid min-w-0 grid-cols-1 max-w-[1240px] items-center gap-14 px-5 lg:grid-cols-[1.05fr_0.95fr] lg:px-8">
          <div className="min-w-0">
            <a
              href="#modules"
              className="inline-flex items-center gap-2.5 rounded-full border-2 border-brand-black bg-white px-3.5 py-2 text-[11px] font-extrabold shadow-[3px_3px_0_#0a0a0a]"
            >
              <span className="live-dot" />
              <span>THREADLY 2.0 · PRIVATE BETA IS OPEN</span>
              <ChevronRight className="h-3.5 w-3.5" />
            </a>

            <h1 className="mt-7 text-[clamp(38px,7.2vw,92px)] font-black leading-[0.92] tracking-[-0.065em]">
              <span className="block">Every growth</span>
              <span className="block">channel, on</span>
              <span className="mt-1 block">
                one{" "}
                <span className="relative inline-block text-brand-orange">
                  thread
                  <svg
                    viewBox="0 0 300 26"
                    className="absolute -bottom-2 left-0 h-4 w-full"
                    preserveAspectRatio="none"
                    aria-hidden
                  >
                    <path
                      d="M2 18C60 6 150 24 298 8"
                      fill="none"
                      stroke="#7c3aed"
                      strokeWidth="7"
                      strokeLinecap="round"
                    />
                  </svg>
                </span>
                <span className="text-brand-orange">.</span>
              </span>
            </h1>

            <p className="mt-7 max-w-xl text-[17px] leading-relaxed text-brand-muted">
              Threadly finds the buyers already describing your product&apos;s problem, qualifies them,
              runs the outreach, optimizes the ads, schedules the content and measures what actually
              made money — in a single live workspace.
            </p>

            <div className="mt-9 flex flex-col gap-3 sm:flex-row">
              <button
                type="button"
                onClick={openWaitlist}
                className="btn-tactile-orange inline-flex items-center justify-center gap-2 rounded-2xl border-2 border-brand-orange bg-brand-orange px-7 py-4 text-[15px] font-black text-white"
              >
                Request beta access <ArrowRight className="h-4 w-4" />
              </button>
              <a
                href="#workspace"
                className="inline-flex items-center justify-center gap-2 rounded-2xl border-2 border-brand-black bg-white px-7 py-4 text-[15px] font-black transition-colors hover:bg-brand-orangeLight"
              >
                Explore live workspace <ArrowRight className="h-4 w-4" />
              </a>
            </div>

            <div className="mt-10 grid w-full min-w-0 max-w-lg grid-cols-2 gap-3 sm:grid-cols-3">
              {[
                ["2.4×", "blended ROAS"],
                ["31%", "reply rate"],
                ["< 6 min", "signal → outreach"],
              ].map(([value, label], index) => (
                <div key={label} className={`min-w-0 rounded-2xl border-2 border-brand-black bg-white px-4 py-3 ${index === 2 ? "col-span-2 sm:col-span-1" : ""}`}>
                  <div className="text-[22px] font-black leading-none tracking-[-0.05em]">{value}</div>
                  <div className="mt-1.5 font-mono text-[9px] font-bold uppercase tracking-[0.12em] text-brand-muted">
                    {label}
                  </div>
                </div>
              ))}
            </div>
          </div>

          {/* Live product mock with Lenis 3D velocity tilt ------------------------------------ */}
          <div className="relative min-w-0 [perspective:1200px]">
            <LenisParallax speed={-0.12} className="absolute -right-3 -top-4 z-20 hidden rotate-3 sm:block">
              <div className="flex items-center gap-2 rounded-full border-2 border-brand-black bg-brand-orange px-3.5 py-2 text-[10px] font-black uppercase tracking-[0.08em] text-white shadow-[3px_3px_0_#0a0a0a]">
                <span className="live-dot !bg-white !shadow-none" /> Live
              </div>
            </LenisParallax>

            <LenisParallax speed={0.05} velocityTilt>
              <div className="overflow-hidden rounded-[22px] border-2 border-brand-black bg-white shadow-[10px_10px_0_#0a0a0a] transition-shadow duration-300 hover:shadow-[14px_14px_0_#0a0a0a]">
              <div className="flex items-center justify-between border-b-2 border-brand-black bg-brand-black px-4 py-3">
                <div className="flex items-center gap-1.5">
                  <span className="h-2.5 w-2.5 rounded-full bg-brand-orange" />
                  <span className="h-2.5 w-2.5 rounded-full bg-brand-violetPastel" />
                  <span className="h-2.5 w-2.5 rounded-full bg-white/40" />
                </div>
                <span className="font-mono text-[10px] font-bold uppercase tracking-[0.12em] text-white/60">
                  threadly · command
                </span>
                <span className="rounded-md bg-white/10 px-2 py-1 font-mono text-[9px] font-bold text-white/70">
                  ⌘K
                </span>
              </div>

              <div className="grid grid-cols-3 gap-2.5 border-b border-brand-line p-4">
                {[
                  ["Pipeline", "$184k", "+18%"],
                  ["Reply rate", "31.4%", "+6.2"],
                  ["ROAS", "2.41×", "+0.36"],
                ].map(([label, value, delta]) => (
                  <div key={label} className="rounded-xl border border-brand-line bg-brand-paper px-3 py-2.5">
                    <div className="font-mono text-[8px] font-bold uppercase tracking-[0.1em] text-brand-quiet">
                      {label}
                    </div>
                    <div className="mt-1 text-[19px] font-black leading-none tracking-[-0.04em]">{value}</div>
                    <div className="mt-1 font-mono text-[9px] font-bold text-brand-orange">{delta}</div>
                  </div>
                ))}
              </div>

              <div className="grid min-w-0 grid-cols-[minmax(0,1fr)_100px] gap-3 p-4 sm:grid-cols-[minmax(0,1fr)_126px]">
                <div>
                  <div className="mb-2 flex items-center justify-between">
                    <span className="font-mono text-[9px] font-bold uppercase tracking-[0.12em] text-brand-quiet">
                      Real-time activity
                    </span>
                    <span className="flex items-center gap-1.5 font-mono text-[8px] font-bold uppercase tracking-[0.12em] text-brand-orange">
                      <i className="h-1.5 w-1.5 animate-pulse rounded-full bg-brand-orange" /> streaming
                    </span>
                  </div>
                  <div className="space-y-1.5">
                    {visibleEvents.map((event, index) => (
                      <div
                        key={`${event.what}-${index}`}
                        className="flex items-start gap-2.5 rounded-xl border border-brand-line bg-white px-2.5 py-2 transition-all"
                        style={{ opacity: 1 - index * 0.16 }}
                      >
                        <span
                          className={`mt-1 grid h-5 w-5 shrink-0 place-items-center rounded-md ${
                            event.tone === "orange"
                              ? "bg-brand-orangeLight text-brand-orangeDark"
                              : "bg-brand-violetLight text-brand-violetDark"
                          }`}
                        >
                          <Zap className="h-3 w-3" />
                        </span>
                        <div className="min-w-0">
                          <div className="truncate text-[10px] font-bold">{event.who}</div>
                          <div className="truncate text-[9px] leading-snug text-brand-muted">{event.what}</div>
                        </div>
                        <span className="ml-auto shrink-0 font-mono text-[8px] text-brand-quiet">{event.when}</span>
                      </div>
                    ))}
                  </div>
                </div>

                <div className="space-y-2">
                  <div className="rounded-xl border border-brand-line bg-brand-paper p-2.5">
                    <div className="font-mono text-[8px] font-bold uppercase tracking-[0.1em] text-brand-quiet">
                      Best time
                    </div>
                    <div className="mt-1 text-[15px] font-black leading-none">14:00</div>
                    <div className="mt-1 text-[8px] text-brand-muted">Tue · ET</div>
                    <div className="mt-2 space-y-1">
                      {[0.9, 0.55, 0.32].map((width, index) => (
                        <div key={index} className="h-1 rounded-full bg-brand-line">
                          <div
                            className="h-1 rounded-full bg-brand-violet"
                            style={{ width: `${width * 100}%` }}
                          />
                        </div>
                      ))}
                    </div>
                  </div>
                  <div className="rounded-xl border-2 border-brand-black bg-brand-black p-2.5 text-white">
                    <div className="font-mono text-[8px] font-bold uppercase tracking-[0.1em] text-brand-orange">
                      GEO share
                    </div>
                    <div className="mt-1 text-[15px] font-black leading-none">38%</div>
                    <div className="mt-1 text-[8px] text-white/50">↑ 9 pts this week</div>
                  </div>
                </div>
              </div>
            </div>
            </LenisParallax>

            <LenisParallax speed={0.16} className="absolute -bottom-5 -left-4 hidden rotate-[-3deg] sm:block z-20">
              <div className="flex items-center gap-2 rounded-xl border-2 border-brand-black bg-white px-3 py-2 shadow-[4px_4px_0_#7c3aed]">
                <TrendingUp className="h-4 w-4 text-brand-violet" />
                <div>
                  <div className="text-[10px] font-black leading-none">Sequence step 2</div>
                  <div className="mt-1 font-mono text-[8px] uppercase tracking-[0.08em] text-brand-quiet">
                    41% open · variant B
                  </div>
                </div>
              </div>
            </LenisParallax>
          </div>
        </div>
      </section>

      {/* ============================================================ */}
      {/* Integration marquee driven by Lenis scroll velocity           */}
      {/* ============================================================ */}
      <LenisMarquee items={stack} label="Plays well with" baseSpeed={1.2} />

      {/* ============================================================ */}
      {/* Platform strip                                               */}
      {/* ============================================================ */}
      <section id="platform" className="mx-auto max-w-[1240px] px-5 py-20 lg:px-8 lg:py-28">
        <div className="grid gap-10 lg:grid-cols-[0.9fr_1.1fr] lg:items-end">
          <div>
            <span className="font-mono text-[10px] font-bold uppercase tracking-[0.16em] text-brand-orange">
              One operating system
            </span>
            <h2 className="mt-4 text-[clamp(34px,4.6vw,60px)] font-black leading-[0.95] tracking-[-0.055em]">
              Stop stitching six tools
              <br />
              into{" "}
              <span className="extruded-violet text-brand-violet">a funnel</span>.
            </h2>
          </div>
          <p className="max-w-xl text-[15px] leading-relaxed text-brand-muted">
            Most growth stacks break at the handoff: the signal lives in one tab, the CRM in another,
            the ad account in a third, and nobody can tell which channel actually paid for the last
            deal. Threadly keeps the whole thread — from the first public complaint to the closed
            contract — in one workspace with one source of truth.
          </p>
        </div>

        <div className="mt-12 grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
          {[
            { icon: Radar, title: "Capture", copy: "Signals from X, Reddit and communities." },
            { icon: Workflow, title: "Automate", copy: "Workflows that qualify, draft and follow up." },
            { icon: BarChart3, title: "Optimize", copy: "Spend and content steered by live results." },
            { icon: Layers, title: "Compound", copy: "SEO and AI answers built on the same insight." },
          ].map((item, index) => (
            <LenisParallax key={item.title} speed={index % 2 === 0 ? 0.04 : -0.04} className="h-full">
              <div
                className="group h-full rounded-2xl border-2 border-brand-black bg-white p-5 transition-all duration-300 hover:-translate-y-1 hover:shadow-[6px_6px_0_#ff4500]"
              >
                <item.icon className="h-5 w-5 text-brand-orange" />
                <h3 className="mt-4 text-[15px] font-black tracking-[-0.03em]">{item.title}</h3>
                <p className="mt-1.5 text-[12px] leading-relaxed text-brand-muted">{item.copy}</p>
              </div>
            </LenisParallax>
          ))}
        </div>
      </section>

      {/* ============================================================ */}
      {/* Modules                                                      */}
      {/* ============================================================ */}
      <section id="modules" className="border-y-2 border-brand-black bg-brand-black py-20 text-white lg:py-28">
        <div className="mx-auto max-w-[1240px] px-5 lg:px-8">
          <div className="flex flex-col gap-6 lg:flex-row lg:items-end lg:justify-between">
            <div>
              <span className="font-mono text-[10px] font-bold uppercase tracking-[0.16em] text-brand-orange">
                The modules
              </span>
              <h2 className="mt-4 max-w-2xl text-[clamp(34px,4.6vw,60px)] font-black leading-[0.95] tracking-[-0.055em]">
                Six engines.
                <br />
                <span className="text-brand-violetPastel">One compounding loop.</span>
              </h2>
            </div>
            <button
              type="button"
              onClick={openWaitlist}
              className="inline-flex shrink-0 items-center gap-2 self-start rounded-full border-2 border-white px-5 py-3 text-[12px] font-extrabold transition-colors hover:bg-white hover:text-brand-black lg:self-auto"
            >
              Request beta access <ArrowUpRight className="h-4 w-4" />
            </button>
          </div>

          <div className="mt-12 grid gap-4 md:grid-cols-2 lg:grid-cols-3">
            {modules.map((module, index) => (
              <article
                key={module.title}
                onClick={() => {
                  window.dispatchEvent(new CustomEvent("threadly:select-module", { detail: { moduleId: index } }));
                  document.getElementById("workspace")?.scrollIntoView({ behavior: "smooth" });
                }}
                className="group relative cursor-pointer overflow-hidden rounded-2xl border border-white/15 bg-white/[0.035] p-6 transition-all hover:-translate-y-1 hover:border-brand-orange hover:bg-white/[0.06] hover:shadow-[0_8px_24px_rgba(255,69,0,0.15)]"
              >
                <div
                  className="pointer-events-none absolute -right-10 -top-10 h-32 w-32 rounded-full opacity-0 blur-3xl transition-opacity group-hover:opacity-100"
                  style={{
                    background:
                      module.accent === "orange"
                        ? "rgba(255,69,0,0.6)"
                        : "rgba(124,58,237,0.6)",
                  }}
                  aria-hidden
                />
                <div className="flex items-start justify-between">
                  <span className="font-mono text-[9px] font-bold uppercase tracking-[0.13em] text-white/45">
                    {module.tag}
                  </span>
                  <span
                    className={`grid h-9 w-9 place-items-center rounded-lg ${
                      module.accent === "orange"
                        ? "bg-brand-orange/15 text-brand-orange"
                        : "bg-brand-violet/25 text-brand-violetPastel"
                    }`}
                  >
                    <module.icon className="h-[18px] w-[18px]" />
                  </span>
                </div>
                <h3 className="mt-5 text-[21px] font-black tracking-[-0.04em]">{module.title}</h3>
                <p className="mt-2 text-[12.5px] leading-relaxed text-white/55">{module.copy}</p>
                <ul className="mt-4 space-y-1.5">
                  {module.points.map((point) => (
                    <li key={point} className="flex items-center gap-2 text-[11px] font-semibold text-white/70">
                      <Check className="h-3 w-3 text-brand-orange" /> {point}
                    </li>
                  ))}
                </ul>
                <div className="mt-5 flex items-center justify-between border-t border-white/10 pt-3">
                  <div className="font-mono text-[9px] font-bold uppercase tracking-[0.1em] text-brand-orange">
                    {module.stat}
                  </div>
                  <span className="inline-flex items-center gap-1 font-mono text-[8px] font-bold uppercase tracking-wider text-white/40 transition-colors group-hover:text-white">
                    Test live <ArrowRight className="h-3 w-3 transition-transform group-hover:translate-x-1" />
                  </span>
                </div>
              </article>
            ))}
          </div>
        </div>
      </section>

      {/* ============================================================ */}
      {/* Workspace preview                                            */}
      {/* ============================================================ */}
      <section id="workspace" className="mx-auto max-w-[1240px] px-5 py-20 lg:px-8 lg:py-28">
        <div className="grid gap-12 lg:grid-cols-[0.85fr_1.15fr] lg:items-center">
          <div>
            <span className="font-mono text-[10px] font-bold uppercase tracking-[0.16em] text-brand-violet">
              The workspace
            </span>
            <h2 className="mt-4 text-[clamp(34px,4.2vw,54px)] font-black leading-[0.96] tracking-[-0.055em]">
              A command center,
              <br />
              not a{" "}
              <span className="text-brand-orange">dashboard graveyard</span>.
            </h2>
            <p className="mt-5 text-[15px] leading-relaxed text-brand-muted">
              Every module shares the same leads, the same activity log and the same clock. Move a
              prospect and the sequence, the calendar and the analytics all update — live.
            </p>

            <ul className="mt-8 space-y-4">
              {[
                ["Real-time everything", "Server-sent events push new signals, sends and scores the moment they land."],
                ["Human in the loop", "Automation drafts; you approve. Nothing leaves without a review."],
                ["One activity thread", "Every module writes to the same auditable timeline."],
              ].map(([title, copy]) => (
                <li key={title} className="flex gap-3">
                  <span className="mt-0.5 grid h-6 w-6 shrink-0 place-items-center rounded-md bg-brand-orange text-white">
                    <Check className="h-3.5 w-3.5" />
                  </span>
                  <div>
                    <div className="text-[13px] font-black">{title}</div>
                    <div className="text-[12px] leading-relaxed text-brand-muted">{copy}</div>
                  </div>
                </li>
              ))}
            </ul>

            <button
              type="button"
              onClick={openWaitlist}
              className="btn-tactile-orange mt-9 inline-flex items-center gap-2 rounded-2xl border-2 border-brand-orange bg-brand-orange px-6 py-3.5 text-[14px] font-black text-white"
            >
              Request beta access <ArrowRight className="h-4 w-4" />
            </button>
          </div>

          <div className="relative [perspective:1200px]">
            <div className="pointer-events-none absolute -inset-3 rounded-[28px] border-2 border-dashed border-brand-black/15" aria-hidden />
            <LenisParallax speed={0.05} velocityTilt>
              <InteractiveLiveWorkspace />
            </LenisParallax>
          </div>
        </div>
      </section>

      {/* ============================================================ */}
      {/* Stories / proof                                              */}
      {/* ============================================================ */}
      <section id="stories" className="border-y-2 border-brand-black bg-white py-20 lg:py-24">
        <div className="mx-auto max-w-[1240px] px-5 lg:px-8">
          <div className="flex flex-col gap-4 sm:flex-row sm:items-end sm:justify-between">
            <h2 className="max-w-xl text-[clamp(30px,3.6vw,46px)] font-black leading-[0.98] tracking-[-0.05em]">
              Founders who stopped guessing.
            </h2>
            <span className="font-mono text-[10px] font-bold uppercase tracking-[0.14em] text-brand-quiet">
              Selected outcomes · 2025–2026
            </span>
          </div>

          <div className="mt-10 grid gap-4 md:grid-cols-3">
            {[
              {
                quote:
                  "The radar found a Reddit thread where our exact buyer was describing our product as “the thing that doesn't exist yet.” We closed them nine days later.",
                name: "Maya Chen",
                role: "Co-founder · Lumen (seed)",
                metric: "9 days to closed won",
              },
              {
                quote:
                  "We were burning $9k/mo on Meta with no attribution. Threadly reallocated to search, and ROAS went from 1.1× to 2.6× without new creative.",
                name: "Diego Ramos",
                role: "Head of Growth · Kite",
                metric: "2.6× blended ROAS",
              },
              {
                quote:
                  "Getting cited in ChatGPT answers moved more pipeline than any campaign we ran all year. The GEO tracker told us exactly which pages were missing.",
                name: "Priya Nair",
                role: "Founder · Slate AI",
                metric: "38% AI answer share",
              },
            ].map((story, index) => (
              <LenisParallax key={story.name} speed={index === 1 ? -0.05 : 0.04} className="h-full">
                <figure
                  className="flex h-full flex-col justify-between rounded-2xl border-2 border-brand-black bg-brand-paper p-6 transition-all duration-300 hover:-translate-y-1 hover:shadow-[6px_6px_0_#0a0a0a]"
                >
                  <blockquote className="text-[13.5px] leading-relaxed text-brand-black">
                    “{story.quote}”
                  </blockquote>
                  <figcaption className="mt-6 border-t border-brand-line pt-4">
                    <div className="text-[12px] font-black">{story.name}</div>
                    <div className="font-mono text-[9px] uppercase tracking-[0.1em] text-brand-quiet">
                      {story.role}
                    </div>
                    <div className="mt-2 inline-flex items-center gap-1.5 rounded-full bg-brand-orangeLight px-2.5 py-1 font-mono text-[8.5px] font-bold uppercase tracking-[0.08em] text-brand-orangeDark">
                      <Flame className="h-3 w-3" /> {story.metric}
                    </div>
                  </figcaption>
                </figure>
              </LenisParallax>
            ))}
          </div>
        </div>
      </section>

      {/* ============================================================ */}
      {/* CTA                                                          */}
      {/* ============================================================ */}
      <section className="relative overflow-hidden bg-brand-black py-20 text-white lg:py-28">
        <div
          className="pointer-events-none absolute left-1/2 top-1/2 h-[560px] w-[860px] -translate-x-1/2 -translate-y-1/2 rounded-full opacity-30 blur-[140px]"
          style={{ background: "radial-gradient(circle, #ff4500 0%, #7c3aed 55%, transparent 75%)" }}
          aria-hidden
        />
        <div className="relative mx-auto max-w-[1240px] px-5 text-center lg:px-8">
          <span className="font-mono text-[10px] font-bold uppercase tracking-[0.18em] text-brand-orange">
            Let&apos;s grow
          </span>
          <h2 className="mx-auto mt-4 max-w-3xl text-[clamp(38px,5.6vw,74px)] font-black leading-[0.93] tracking-[-0.06em]">
            Your next 1,000 customers
            <br />
            are already{" "}
            <span className="extruded-electric text-white">talking</span>.
          </h2>
          <p className="mx-auto mt-5 max-w-xl text-[15px] leading-relaxed text-white/55">
            Threadly is free for the first 100 teams while we tune the 2.0 engine. Bring a product
            people actually want to talk about.
          </p>
          <div className="mt-9 flex flex-col items-center justify-center gap-3 sm:flex-row">
            <button
              type="button"
              onClick={openWaitlist}
              className="btn-tactile-orange inline-flex items-center gap-2 rounded-2xl border-2 border-brand-orange bg-brand-orange px-7 py-4 text-[15px] font-black text-white"
            >
              Request beta access <ArrowRight className="h-4 w-4" />
            </button>
            <a
              href="#workspace"
              className="btn-tactile-white inline-flex items-center gap-2 rounded-2xl border-2 border-white px-7 py-4 text-[15px] font-black text-white"
            >
              Explore live workspace <ArrowUpRight className="h-4 w-4" />
            </a>
          </div>
        </div>
      </section>

      <Footer />

      {/* ============================================================ */}
      {/* Early-access modal                                           */}
      {/* ============================================================ */}
      {modalOpen && (
        <div
          className="fixed inset-0 z-[80] flex items-center justify-center bg-brand-black/70 p-4 backdrop-blur-sm"
          role="dialog"
          aria-modal="true"
          aria-label="Request beta access"
          data-lenis-prevent
          onMouseDown={(event) => {
            if (event.target === event.currentTarget) setModalOpen(false);
          }}
        >
          <div data-lenis-prevent className="relative w-full max-w-lg overflow-y-auto max-h-[92vh] rounded-[22px] border-2 border-brand-black bg-brand-paper shadow-[10px_10px_0_#ff4500]">
            <div className="flex items-start justify-between border-b-2 border-brand-black bg-white px-6 py-4">
              <div>
                <div className="font-mono text-[9px] font-bold uppercase tracking-[0.14em] text-brand-orange">
                  Private beta · cohort 01
                </div>
                <h3 className="mt-1 text-[22px] font-black tracking-[-0.045em]">Request beta access</h3>
              </div>
              <button
                type="button"
                onClick={() => setModalOpen(false)}
                className="grid h-8 w-8 place-items-center rounded-lg border-2 border-brand-black bg-white"
                aria-label="Close"
              >
                <X className="h-4 w-4" />
              </button>
            </div>

            {!authReady ? (
              <div className="px-6 py-10 text-center text-sm font-semibold text-brand-muted">Checking your sign-in…</div>
            ) : !authUser ? (
              <div className="px-6 py-8">
                <p className="text-[13px] leading-relaxed text-brand-muted">Sign in with Google first. We’ll use that account to track your Threadly 2.0 beta request and access approval.</p>
                {authError && <p role="alert" className="mt-3 rounded-lg border border-brand-orange/40 bg-brand-orangeLight px-3 py-2 text-[11px] font-semibold text-brand-orangeDark">{authError}</p>}
                <button type="button" onClick={() => void signInForBeta()} disabled={authBusy} className="mt-5 flex w-full items-center justify-center gap-3 rounded-xl border-2 border-brand-black bg-white px-5 py-3.5 text-[13px] font-black disabled:opacity-60">
                  <span className="grid h-5 w-5 place-items-center rounded-full bg-[#4285f4] font-sans text-[12px] font-bold text-white">G</span>
                  {authBusy ? "Connecting to Google…" : "Continue with Google"}
                </button>
              </div>
            ) : !applicationChecked ? (
              <div className="px-6 py-10 text-center text-sm font-semibold text-brand-muted">Checking your beta request…</div>
            ) : applicationStatus === "pending" ? (
              <div className="px-6 py-10 text-center">
                <span className="mx-auto grid h-14 w-14 place-items-center rounded-2xl bg-brand-orange text-white"><Check className="h-7 w-7" /></span>
                <h4 className="mt-5 text-[24px] font-black tracking-[-0.045em]">Request received.</h4>
                <p className="mx-auto mt-2 max-w-sm text-[13px] leading-relaxed text-brand-muted">{confirmationEmailSent === true ? <>We sent a confirmation email to <b className="text-brand-black">{authUser.email}</b>. Your request is now under review.</> : confirmationEmailSent === false ? <>Your request is saved and under review, but we couldn’t send the confirmation email. Contact us if you need help.</> : <>Your Threadly 2.0 beta request is under review for <b className="text-brand-black">{authUser.email}</b>. Return here with this Google account to check your access.</>}</p>
              </div>
            ) : applicationStatus === "approved" ? (
              <div className="px-6 py-10 text-center">
                <span className="mx-auto grid h-14 w-14 place-items-center rounded-2xl bg-brand-orange text-white"><Check className="h-7 w-7" /></span>
                <h4 className="mt-5 text-[24px] font-black tracking-[-0.045em]">You&apos;re approved.</h4>
                <p className="mt-2 text-[13px] leading-relaxed text-brand-muted">Your Google account has access to the Threadly 2.0 workspace.</p>
                <a href="/portal" className="btn-tactile-orange mt-6 inline-flex items-center gap-2 rounded-xl border-2 border-brand-orange bg-brand-orange px-5 py-3 text-[13px] font-black text-white">Open workspace <ArrowRight className="h-4 w-4" /></a>
              </div>
            ) : (
              <form onSubmit={submit} className="px-6 py-5">
                <div className="mb-4 rounded-xl border border-brand-line bg-white px-3 py-2.5 text-[12px] text-brand-muted">Requesting as <b className="text-brand-black">{authUser.email}</b>{applicationStatus === "rejected" && <span className="mt-1 block text-brand-orangeDark">Your previous request was declined. You may update and resubmit it.</span>}</div>
                <div className="grid gap-3 sm:grid-cols-2">
                  <label className="block">
                    <span className="font-mono text-[9px] font-bold uppercase tracking-[0.1em] text-brand-quiet">
                      Your name *
                    </span>
                    <input
                      required
                      value={form.fullName}
                      onChange={(event) => setForm({ ...form, fullName: event.target.value })}
                      className="mt-1.5 w-full rounded-xl border-2 border-brand-black bg-white px-3 py-2.5 text-[13px] font-semibold outline-none focus:border-brand-orange"
                      placeholder="Maya Chen"
                    />
                  </label>
                  <label className="block">
                    <span className="font-mono text-[9px] font-bold uppercase tracking-[0.1em] text-brand-quiet">
                      Company *
                    </span>
                    <input
                      required
                      value={form.startupName}
                      onChange={(event) => setForm({ ...form, startupName: event.target.value })}
                      className="mt-1.5 w-full rounded-xl border-2 border-brand-black bg-white px-3 py-2.5 text-[13px] font-semibold outline-none focus:border-brand-orange"
                      placeholder="Lumen"
                    />
                  </label>
                  <label className="block">
                    <span className="font-mono text-[9px] font-bold uppercase tracking-[0.1em] text-brand-quiet">
                      Industry *
                    </span>
                    <input
                      required
                      value={form.industry}
                      onChange={(event) => setForm({ ...form, industry: event.target.value })}
                      className="mt-1.5 w-full rounded-xl border-2 border-brand-black bg-white px-3 py-2.5 text-[13px] font-semibold outline-none focus:border-brand-orange"
                      placeholder="B2B SaaS"
                    />
                  </label>
                  <label className="block sm:col-span-2">
                    <span className="font-mono text-[9px] font-bold uppercase tracking-[0.1em] text-brand-quiet">
                      Website
                    </span>
                    <input
                      value={form.url}
                      onChange={(event) => setForm({ ...form, url: event.target.value })}
                      className="mt-1.5 w-full rounded-xl border-2 border-brand-black bg-white px-3 py-2.5 text-[13px] font-semibold outline-none focus:border-brand-orange"
                      placeholder="https://company.com"
                    />
                  </label>
                  <label className="block sm:col-span-2">
                    <span className="font-mono text-[9px] font-bold uppercase tracking-[0.1em] text-brand-quiet">
                      Biggest growth blocker *
                    </span>
                    <select
                      required
                      value={form.challenge1}
                      onChange={(event) => setForm({ ...form, challenge1: event.target.value })}
                      className="mt-1.5 w-full rounded-xl border-2 border-brand-black bg-white px-3 py-2.5 text-[13px] font-semibold outline-none focus:border-brand-orange"
                    >
                      <option value="">Select one</option>
                      {[
                        "Finding high-intent leads",
                        "Low reply rates on outreach",
                        "Ad spend without attribution",
                        "Content that doesn't convert",
                        "No presence in AI answers",
                        "Too many disconnected tools",
                      ].map((option) => (
                        <option key={option}>{option}</option>
                      ))}
                    </select>
                  </label>
                </div>

                {formError && (
                  <p className="mt-3 rounded-lg border border-brand-orange/40 bg-brand-orangeLight px-3 py-2 text-[11px] font-semibold text-brand-orangeDark">
                    {formError}
                  </p>
                )}

                <button
                  type="submit"
                  disabled={submitting}
                  className="btn-tactile-orange mt-5 flex w-full items-center justify-center gap-2 rounded-xl border-2 border-brand-orange bg-brand-orange px-5 py-3.5 text-[13px] font-black text-white disabled:opacity-60"
                >
                  {submitting ? "Claiming your spot…" : "Join cohort 01"}
                  <ArrowRight className="h-4 w-4" />
                </button>
                <p className="mt-3 text-center font-mono text-[8.5px] uppercase tracking-[0.08em] text-brand-quiet">
                  No card required. The Threadly team reviews every beta request.
                </p>
              </form>
            )}
          </div>
        </div>
      )}
    </div>
  );
}
