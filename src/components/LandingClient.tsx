"use client";

import { useState, useEffect } from "react";
import { motion, AnimatePresence, type Variants } from "framer-motion";
import { 
  Copy, Check, ArrowRight, ShieldCheck, X, Zap, Globe, Users, 
  Target, Sparkles, AlertTriangle, CheckCircle2, MessageSquare, 
  BarChart3, ChevronRight, Layers, Search, Cpu, ArrowUpRight, 
  Play, Star, Flame, Compass, FileText, Send
} from "lucide-react";
import Image from "next/image";
import Footer from "./Footer";

// Define animation variants
const fadeInUp: Variants = {
  hidden: { opacity: 0, y: 24 },
  visible: { opacity: 1, y: 0, transition: { duration: 0.6, ease: "easeOut" } },
};

const staggerContainer: Variants = {
  hidden: {},
  visible: { transition: { staggerChildren: 0.12 } },
};

export default function LandingClient() {
  const [modalState, setModalState] = useState<"closed" | "waitlist" | "community" | "revealed">("closed");
  const [scrolled, setScrolled] = useState(false);
  const [copied, setCopied] = useState(false);

  // Form states
  const [waitlistData, setWaitlistData] = useState({
    fullName: "",
    startupName: "",
    industry: "",
    url: "",
    challenge1: "",
    challenge2: "",
  });
  const [email, setEmail] = useState("");

  const challenges = [
    "Distribution / getting first real users",
    "Finding high-intent social leads",
    "Validating pricing & product-market fit",
    "Scaling user retention",
    "Avoiding paid ads burn",
  ];

  useEffect(() => {
    const handleScroll = () => {
      setScrolled(window.scrollY > 40);
    };
    window.addEventListener("scroll", handleScroll);
    return () => window.removeEventListener("scroll", handleScroll);
  }, []);

  const handleWaitlistSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!waitlistData.fullName || !waitlistData.startupName || !waitlistData.industry || !email || !waitlistData.challenge1) {
      alert("Please fill in all required fields.");
      return;
    }
    
    try {
      const res = await fetch("/api/waitlist", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ ...waitlistData, email }),
      });
      if (res.ok) {
        setModalState("community");
      } else {
        const data = await res.json();
        alert(data.error || "Something went wrong");
      }
    } catch (error) {
      console.error(error);
      alert("Failed to join waitlist");
    }
  };

  const copyToClipboard = async (text: string) => {
    try {
      await navigator.clipboard.writeText(text);
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    } catch (err) {
      console.error("Failed to copy:", err);
    }
  };

  return (
    <motion.div variants={staggerContainer} initial="hidden" animate="visible" className="min-h-screen flex flex-col bg-[#fdfcff] text-[#02010a] font-sans selection:bg-brand-pastel selection:text-white">
      
      {/* ============================================================ */}
      {/* 1. NAVBAR - Optimizely-style with tactile pill CTA            */}
      {/* ============================================================ */}
      <header className={`w-full fixed top-0 z-50 transition-all duration-300 ${scrolled ? "bg-white/90 backdrop-blur-md border-b border-gray-200/80 shadow-sm py-3" : "bg-transparent py-5"}`}>
        <div className="container mx-auto px-4 sm:px-6 lg:px-12 flex items-center justify-between">
          
          {/* Logo */}
          <div className="flex items-center gap-3">
            <div className="relative w-36 h-9 md:w-44 md:h-10 flex items-center overflow-hidden">
              <Image 
                src="/logo.png" 
                alt="Wisentry Logo" 
                fill
                className="object-contain object-left"
                priority
              />
            </div>
          </div>

          {/* Nav Links */}
          <nav className="hidden lg:flex items-center gap-8 text-sm font-semibold text-gray-700">
            <a href="#platform" className="hover:text-brand-violet transition-colors">Platform</a>
            <a href="#tools" className="hover:text-brand-violet transition-colors">Tools</a>
            <a href="#ai" className="hover:text-brand-violet transition-colors">AI Engine</a>
            <a href="#paths" className="hover:text-brand-violet transition-colors">Paths to Growth</a>
            <a href="#stories" className="hover:text-brand-violet transition-colors">Stories</a>
          </nav>

          {/* Action CTA */}
          <div className="flex items-center gap-3">
            <button 
              onClick={() => setModalState("waitlist")}
              className="btn-tactile-violet inline-flex items-center justify-center gap-2 px-5 py-2.5 sm:px-6 sm:py-3 rounded-full bg-brand-violet border-2 border-brand-violet text-white text-xs sm:text-sm font-extrabold tracking-wide cursor-pointer focus:outline-none"
              aria-label="Let's grow CTA"
            >
              <span>Let&apos;s grow</span>
              <ArrowRight className="w-4 h-4 text-brand-pastel" />
            </button>
          </div>
        </div>
      </header>

      {/* ============================================================ */}
      {/* 2. HERO SECTION - "You're free to grow" style                */}
      {/* ============================================================ */}
      <section className="relative w-full pt-32 pb-20 md:pt-44 md:pb-28 overflow-hidden bg-gradient-to-b from-purple-50/50 via-[#fdfcff] to-[#f8f5fd]">
        
        {/* Ambient atmospheric glows */}
        <div className="absolute top-10 right-1/4 w-[600px] h-[600px] bg-brand-pastel/15 rounded-full blur-[140px] pointer-events-none"></div>
        <div className="absolute top-40 left-10 w-[500px] h-[500px] bg-brand-electric/10 rounded-full blur-[120px] pointer-events-none"></div>

        <div className="container mx-auto px-4 sm:px-6 lg:px-12 relative z-10 flex flex-col items-center text-center">
          
          {/* Top Announcement Pill */}
          <motion.div variants={fadeInUp} className="inline-flex items-center gap-2.5 px-4 py-2 rounded-full bg-white border border-brand-violet/20 shadow-sm text-brand-violet text-xs sm:text-sm font-semibold mb-8 hover:border-brand-violet/40 transition-colors">
            <span className="flex h-2 w-2 rounded-full bg-brand-electric animate-ping" />
            <span>Wisentry Early Access • Free for the first 100 B2C startups</span>
            <ChevronRight className="w-4 h-4 text-brand-bush" />
          </motion.div>

          {/* Signature Optimizely 3D Extruded Headline */}
          <motion.h1 variants={fadeInUp} className="max-w-5xl text-5xl sm:text-6xl md:text-7xl lg:text-[96px] font-black tracking-tight leading-[1.05] text-[#02010a] mb-6">
            <span className="block">You&apos;re free to</span>
            <span className="block mt-1 sm:mt-2 text-brand-bush extruded-violet">
              grow again.
            </span>
          </motion.h1>

          {/* Subtitle */}
          <motion.p variants={fadeInUp} className="max-w-2xl text-lg sm:text-xl md:text-2xl text-gray-600 font-normal leading-relaxed mb-10">
            The AI platform to discover high-intent consumers and scale your B2C startup. So the experience-makers can do the work they love.
          </motion.p>

          {/* Action Buttons */}
          <motion.div variants={fadeInUp} className="flex flex-col sm:flex-row items-center gap-4 sm:gap-6 mb-16 w-full sm:w-auto">
            <button 
              onClick={() => setModalState("waitlist")}
              className="btn-tactile-violet w-full sm:w-auto px-8 py-4 rounded-2xl bg-brand-violet border-2 border-brand-violet text-white text-base sm:text-lg font-black flex items-center justify-center gap-3 cursor-pointer"
            >
              <span>Let&apos;s grow</span>
              <ArrowRight className="w-5 h-5 text-brand-pastel" />
            </button>

            <a 
              href="#tools"
              className="w-full sm:w-auto px-7 py-4 rounded-2xl bg-white border-2 border-gray-200 text-gray-800 text-base font-bold hover:border-brand-violet/40 hover:bg-purple-50/50 transition-all flex items-center justify-center gap-2 shadow-sm"
            >
              <Play className="w-4 h-4 fill-brand-violet text-brand-violet" />
              <span>Explore tools</span>
            </a>
          </motion.div>

          {/* Hero Visual Card with Lifestyle & Floating Micro-Widgets */}
          <motion.div variants={fadeInUp} className="relative w-full max-w-5xl rounded-3xl overflow-hidden border-2 border-brand-violet/20 bg-white shadow-2xl p-3 sm:p-5">
            <div className="relative w-full h-[320px] sm:h-[460px] md:h-[540px] rounded-2xl overflow-hidden bg-gradient-to-tr from-brand-violet via-brand-bush to-brand-pastel">
              {/* High-quality background visual */}
              <img 
                src="https://images.unsplash.com/photo-1522071820081-009f0129c71c?auto=format&fit=crop&w=1920&q=80" 
                alt="Builders collaborating and scaling" 
                className="w-full h-full object-cover object-center opacity-75 mix-blend-multiply"
              />

              {/* Overlay Gradient */}
              <div className="absolute inset-0 bg-gradient-to-t from-brand-haiti/90 via-brand-haiti/30 to-transparent"></div>

              {/* Floating Widget 1: Intent Signals */}
              <div className="absolute top-6 left-6 sm:top-8 sm:left-8 bg-white/95 backdrop-blur-md border border-gray-200/80 rounded-2xl p-3 sm:p-4 shadow-xl flex items-center gap-3 text-left max-w-xs animate-in fade-in duration-700">
                <div className="w-10 h-10 rounded-xl bg-brand-violet/10 text-brand-violet flex items-center justify-center shrink-0">
                  <Target className="w-5 h-5" />
                </div>
                <div>
                  <div className="text-xs font-bold text-gray-500 uppercase tracking-wider">Live Signal Radar</div>
                  <div className="text-sm font-extrabold text-gray-900">+1,420 High-Intent Leads</div>
                </div>
              </div>

              {/* Floating Widget 2: Conversion Lift */}
              <div className="absolute top-6 right-6 sm:top-8 sm:right-8 bg-white/95 backdrop-blur-md border border-gray-200/80 rounded-2xl p-3 sm:p-4 shadow-xl flex items-center gap-3 text-left max-w-xs animate-in fade-in duration-700">
                <div className="w-10 h-10 rounded-xl bg-emerald-50 text-emerald-600 flex items-center justify-center shrink-0">
                  <BarChart3 className="w-5 h-5" />
                </div>
                <div>
                  <div className="text-xs font-bold text-gray-500 uppercase tracking-wider">Verified Outcome</div>
                  <div className="text-sm font-extrabold text-gray-900">82% Conversion Lift</div>
                </div>
              </div>

              {/* Floating Bottom Card: Cohort Testers */}
              <div className="absolute bottom-6 left-6 right-6 sm:bottom-8 sm:left-8 sm:right-8 bg-white/90 backdrop-blur-xl border border-white/40 rounded-2xl p-4 sm:p-6 shadow-2xl flex flex-col sm:flex-row items-center justify-between gap-4">
                <div className="flex items-center gap-4 text-left">
                  <div className="w-12 h-12 rounded-2xl bg-brand-violet text-white flex items-center justify-center shrink-0 shadow-md">
                    <Users className="w-6 h-6" />
                  </div>
                  <div>
                    <h3 className="text-base sm:text-lg font-black text-gray-900">Pre-Vetted B2C Tester Collective</h3>
                    <p className="text-xs sm:text-sm text-gray-600">Access 1,000+ early adopters ready to test, give qualitative feedback, and evangelize.</p>
                  </div>
                </div>
                <button 
                  onClick={() => setModalState("waitlist")}
                  className="btn-tactile-violet px-5 py-2.5 rounded-xl bg-brand-violet text-white text-xs sm:text-sm font-bold shrink-0 cursor-pointer"
                >
                  Join Cohort
                </button>
              </div>

            </div>
          </motion.div>

        </div>
      </section>

      {/* ============================================================ */}
      {/* 3. SPOTLIGHT BANNER - Optimizely "Save your spot" event style */}
      {/* ============================================================ */}
      <section className="w-full py-12 px-4 sm:px-6 lg:px-12 bg-[#f8f5fd]">
        <div className="container mx-auto max-w-6xl">
          <div className="relative rounded-3xl overflow-hidden border-2 border-brand-violet/20 bg-white shadow-xl flex flex-col md:flex-row items-center justify-between p-6 sm:p-10 md:p-12 gap-8">
            <div className="relative z-10 max-w-2xl text-left">
              <div className="inline-flex items-center gap-2 px-3 py-1 rounded-lg bg-brand-violet/10 text-brand-violet text-xs font-bold uppercase tracking-wider mb-4">
                <Sparkles className="w-3.5 h-3.5 text-brand-electric" />
                Special Access Cohort #1
              </div>
              <h2 className="text-3xl sm:text-4xl md:text-5xl font-black text-gray-900 leading-tight mb-3">
                Save your spot in Wisentry 1.0
              </h2>
              <p className="text-sm font-mono font-bold text-brand-bush mb-3">
                ONLINE • GLOBAL ACCESS • LIMITED TO 100 STARTUPS
              </p>
              <p className="text-gray-600 text-sm sm:text-base leading-relaxed">
                Join the ambitious founders, growth hackers, and consumer builders gearing up to launch without the startup tarpit.
              </p>
            </div>

            <div className="relative z-10 shrink-0 w-full sm:w-auto">
              <button 
                onClick={() => setModalState("waitlist")}
                className="btn-tactile-violet w-full sm:w-auto px-8 py-4 rounded-2xl bg-brand-violet border-2 border-brand-violet text-white text-base font-extrabold flex items-center justify-center gap-3 cursor-pointer"
              >
                <span>Register now</span>
                <ArrowRight className="w-5 h-5 text-brand-pastel" />
              </button>
            </div>
          </div>
        </div>
      </section>

      {/* ============================================================ */}
      {/* 4. LOGO MARQUEE - Trusted by founders from                    */}
      {/* ============================================================ */}
      <section className="w-full py-14 bg-white border-y border-gray-100">
        <div className="container mx-auto px-4 sm:px-6 lg:px-12 text-center">
          <p className="text-xs sm:text-sm font-bold uppercase tracking-wider text-gray-500 mb-8">
            Built for founders from leading ecosystems & communities
          </p>
          <div className="flex flex-wrap items-center justify-center gap-4 sm:gap-8">
            {["Y Combinator Alumni", "Product Hunt Top #1", "Indie Hackers", "Subreddit Builders", "Discord Collectives", "Techstars"].map((name) => (
              <div 
                key={name}
                className="px-5 py-2.5 rounded-2xl bg-[#faf8fc] border border-gray-200/70 text-gray-700 text-xs sm:text-sm font-bold shadow-sm hover:border-brand-violet/30 hover:text-brand-violet transition-colors"
              >
                {name}
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* ============================================================ */}
      {/* 5. TOOLS TO GET YOU GROWING AGAIN - Optimizely 3-Card Grid   */}
      {/* ============================================================ */}
      <section id="tools" className="w-full py-24 md:py-32 bg-[#faf8fc]">
        <div className="container mx-auto px-4 sm:px-6 lg:px-12 max-w-6xl">
          
          {/* Section Header with 3D Extruded Text */}
          <div className="text-center mb-16 sm:mb-20">
            <h2 className="text-4xl sm:text-5xl md:text-6xl lg:text-7xl font-black tracking-tight text-gray-900 leading-tight">
              <span>Tools to get you </span>
              <span className="block extruded-violet text-brand-bush mt-1">growing again</span>
            </h2>
            <p className="text-gray-600 text-base sm:text-lg max-w-2xl mx-auto mt-4">
              Autonomous modules designed to turn social chaos into a predictable engine of early adopters.
            </p>
          </div>

          {/* 3 Showcase Product Cards */}
          <div className="grid lg:grid-cols-3 gap-8">
            
            {/* Card 1: Agentic Signal Radar */}
            <div className="rounded-3xl border-2 border-gray-200/90 bg-white p-6 sm:p-8 flex flex-col justify-between shadow-lg hover:border-brand-violet/40 hover:shadow-xl transition-all group">
              <div>
                <div className="w-full h-48 rounded-2xl bg-gradient-to-br from-brand-violet/10 via-purple-50 to-brand-pastel/15 border border-purple-100 p-4 mb-6 relative overflow-hidden flex flex-col justify-between">
                  <div className="flex items-center justify-between text-xs font-mono text-brand-violet font-bold">
                    <span>LIVE RADAR</span>
                    <span className="flex h-2 w-2 rounded-full bg-emerald-500 animate-pulse" />
                  </div>
                  <div className="space-y-2">
                    <div className="bg-white/90 p-2.5 rounded-xl border border-purple-100 shadow-sm text-xs text-gray-800">
                      <span className="font-bold text-brand-violet">r/SideProject:</span> &quot;Need a clean tool to track habits without ads...&quot;
                    </div>
                    <div className="bg-white/90 p-2 rounded-xl border border-purple-100 shadow-sm text-[11px] text-gray-500 flex items-center justify-between">
                      <span>Intent Score: 94%</span>
                      <span className="text-emerald-600 font-bold">Matched ICP</span>
                    </div>
                  </div>
                </div>
                <div className="text-xs font-bold text-brand-violet uppercase tracking-wider mb-2">Let creators create</div>
                <h3 className="text-2xl font-black text-gray-900 mb-3 group-hover:text-brand-violet transition-colors">Agentic Signal Radar</h3>
                <p className="text-gray-600 text-sm leading-relaxed mb-6">
                  Publish your niche and automatically detect real people complaining about competitors across Reddit, X, and forums.
                </p>
              </div>
              <button 
                onClick={() => setModalState("waitlist")}
                className="btn-tactile-violet w-full py-3.5 rounded-xl bg-brand-violet text-white text-sm font-black flex items-center justify-center gap-2 cursor-pointer"
              >
                <span>Let&apos;s build</span>
                <ArrowRight className="w-4 h-4 text-brand-pastel" />
              </button>
            </div>

            {/* Card 2: Agentic Beta Collective */}
            <div className="rounded-3xl border-2 border-gray-200/90 bg-white p-6 sm:p-8 flex flex-col justify-between shadow-lg hover:border-brand-violet/40 hover:shadow-xl transition-all group">
              <div>
                <div className="w-full h-48 rounded-2xl bg-gradient-to-br from-purple-100/60 via-brand-pastel/20 to-brand-bush/10 border border-purple-100 p-4 mb-6 relative overflow-hidden flex flex-col justify-between">
                  <div className="flex items-center justify-between text-xs font-mono text-brand-bush font-bold">
                    <span>COHORT ANALYTICS</span>
                    <span className="text-xs bg-white px-2 py-0.5 rounded-md font-bold text-brand-violet">Beta v1.2</span>
                  </div>
                  <div className="bg-white/95 p-3 rounded-xl border border-purple-100 shadow-sm">
                    <div className="flex justify-between items-center text-xs font-bold text-gray-800 mb-1">
                      <span>Activation Rate</span>
                      <span className="text-emerald-600">+82% vs avg</span>
                    </div>
                    <div className="w-full bg-gray-100 h-2 rounded-full overflow-hidden">
                      <div className="bg-brand-bush h-full w-[82%] rounded-full"></div>
                    </div>
                    <div className="mt-2 text-[11px] text-gray-500">1,024 Verified Consumer Testers</div>
                  </div>
                </div>
                <div className="text-xs font-bold text-brand-violet uppercase tracking-wider mb-2">Turn traffic into retention</div>
                <h3 className="text-2xl font-black text-gray-900 mb-3 group-hover:text-brand-violet transition-colors">Agentic Experimentation</h3>
                <p className="text-gray-600 text-sm leading-relaxed mb-6">
                  Continuously test onboarding, pricing thresholds, and core features with 1,000+ early adopters. Then prove true market demand.
                </p>
              </div>
              <button 
                onClick={() => setModalState("waitlist")}
                className="btn-tactile-violet w-full py-3.5 rounded-xl bg-brand-violet text-white text-sm font-black flex items-center justify-center gap-2 cursor-pointer"
              >
                <span>Let&apos;s test</span>
                <ArrowRight className="w-4 h-4 text-brand-pastel" />
              </button>
            </div>

            {/* Card 3: Autonomous Outreach Engine */}
            <div className="rounded-3xl border-2 border-gray-200/90 bg-white p-6 sm:p-8 flex flex-col justify-between shadow-lg hover:border-brand-violet/40 hover:shadow-xl transition-all group">
              <div>
                <div className="w-full h-48 rounded-2xl bg-gradient-to-br from-brand-violet/10 via-purple-50 to-brand-electric/10 border border-purple-100 p-4 mb-6 relative overflow-hidden flex flex-col justify-between">
                  <div className="flex items-center justify-between text-xs font-mono text-brand-electric font-bold">
                    <span>AGENT STATUS</span>
                    <span className="text-xs bg-emerald-100 text-emerald-800 px-2 py-0.5 rounded-md font-bold">Active</span>
                  </div>
                  <div className="bg-white/95 p-3 rounded-xl border border-purple-100 shadow-sm space-y-1">
                    <div className="flex items-center gap-2 text-xs font-bold text-gray-800">
                      <Cpu className="w-3.5 h-3.5 text-brand-electric" />
                      <span>Warm Conversation Bot</span>
                    </div>
                    <p className="text-[11px] text-gray-500 leading-tight">Crafting bespoke, value-first replies without spamming or triggering bans.</p>
                  </div>
                </div>
                <div className="text-xs font-bold text-brand-violet uppercase tracking-wider mb-2">Put AI agents to work</div>
                <h3 className="text-2xl font-black text-gray-900 mb-3 group-hover:text-brand-violet transition-colors">Agent Platform</h3>
                <p className="text-gray-600 text-sm leading-relaxed mb-6">
                  Automate outreach, remove distribution bottlenecks, and scale your initial user base without hiring marketing headcount.
                </p>
              </div>
              <button 
                onClick={() => setModalState("waitlist")}
                className="btn-tactile-violet w-full py-3.5 rounded-xl bg-brand-violet text-white text-sm font-black flex items-center justify-center gap-2 cursor-pointer"
              >
                <span>Let&apos;s automate</span>
                <ArrowRight className="w-4 h-4 text-brand-pastel" />
              </button>
            </div>

          </div>
        </div>
      </section>

      {/* ============================================================ */}
      {/* 6. AI TO MAKE YOU UNSTOPPABLE - Optimizely High-Contrast Dark */}
      {/* ============================================================ */}
      <section id="ai" className="relative w-full bg-[#120524] text-white pt-24 pb-28 md:pt-36 md:pb-36 rounded-t-[3rem] lg:rounded-t-[4.5rem] overflow-hidden">
        
        {/* Cosmic Ambient Background Glows */}
        <div className="absolute top-1/4 left-1/2 -translate-x-1/2 w-[700px] h-[700px] bg-brand-electric/20 rounded-full blur-[160px] pointer-events-none"></div>
        <div className="absolute -bottom-20 right-10 w-[500px] h-[500px] bg-brand-bush/30 rounded-full blur-[140px] pointer-events-none"></div>

        <div className="container mx-auto px-4 sm:px-6 lg:px-12 max-w-6xl relative z-10 text-center">
          
          {/* Header */}
          <div className="max-w-3xl mx-auto mb-16">
            <h2 className="text-4xl sm:text-5xl md:text-6xl lg:text-7xl font-black tracking-tight leading-none mb-4">
              <span>AI to make you</span>
              <span className="block extruded-electric text-white mt-2">unstoppable</span>
            </h2>
            <p className="text-gray-300 text-base sm:text-xl font-normal leading-relaxed mt-4 max-w-2xl mx-auto">
              The infinite workforce your great ideas have been waiting for. Here to run your workflows, save you costs, and free your sanity.
            </p>
          </div>

          {/* Central Glowing 3D Orb / Capability Cluster */}
          <div className="relative my-12 py-10 flex flex-col items-center justify-center">
            
            {/* Holographic Glowing Orb */}
            <div className="relative w-56 h-56 sm:w-72 sm:h-72 rounded-full bg-gradient-to-tr from-brand-violet via-brand-electric to-[#d8b4fe] p-1 shadow-[0_0_90px_rgba(177,41,255,0.4)] animate-pulse">
              <div className="w-full h-full rounded-full bg-[#180632] flex items-center justify-center p-6 text-center">
                <div className="flex flex-col items-center">
                  <Sparkles className="w-12 h-12 text-brand-electric mb-2" />
                  <div className="text-xl font-black text-white">Wisentry AI</div>
                  <div className="text-xs text-brand-pastel font-mono">Autonomous Core</div>
                </div>
              </div>
            </div>

            {/* Orbiting Capability Chips */}
            <div className="flex flex-wrap items-center justify-center gap-3 sm:gap-4 max-w-3xl mt-12">
              {[
                "🔥 Live Social Signal Mining",
                "💬 Value-First Conversation Scripts",
                "🎯 Competitor Complaint Interception",
                "👥 1,000+ Pre-Seeded Testers",
                "📊 Willingness-To-Pay Predictor",
                "⚡ Zero-Ad-Spend Funnel Architecture"
              ].map((pill) => (
                <div 
                  key={pill}
                  className="px-4 py-2 sm:px-5 sm:py-2.5 rounded-full bg-white/10 backdrop-blur-md border border-white/20 text-white text-xs sm:text-sm font-semibold hover:bg-white/20 hover:scale-105 transition-all shadow-lg"
                >
                  {pill}
                </div>
              ))}
            </div>
          </div>

          {/* Dark Section CTA */}
          <div className="mt-12 flex justify-center">
            <button 
              onClick={() => setModalState("waitlist")}
              className="btn-tactile-electric px-8 py-4 rounded-2xl bg-brand-electric text-white text-base font-black flex items-center gap-3 cursor-pointer hover:bg-white hover:text-brand-jaguar transition-colors"
            >
              <span>Try and stop me</span>
              <ArrowRight className="w-5 h-5" />
            </button>
          </div>

        </div>
      </section>

      {/* ============================================================ */}
      {/* 7. YES, YOU CAN TEST HERE - Optimizely Chunky Badges Row      */}
      {/* ============================================================ */}
      <section className="w-full py-24 md:py-32 bg-[#faf8fc] border-t border-gray-200">
        <div className="container mx-auto px-4 sm:px-6 lg:px-12 max-w-6xl text-center">
          
          <h2 className="text-3xl sm:text-4xl md:text-5xl lg:text-6xl font-black tracking-tight text-gray-900 mb-4">
            Yes, you can test here. And the rest!
          </h2>
          <p className="text-gray-600 text-base sm:text-lg max-w-2xl mx-auto mb-16">
            Everything consumer makers need to discover intent, validate ideas, and turn curiosity into revenue.
          </p>

          {/* 5 Expressive Optimizely-style Feature Badges */}
          <div className="grid grid-cols-2 md:grid-cols-5 gap-4 sm:gap-6">
            
            <div className="p-6 rounded-2xl bg-white border-2 border-gray-200 shadow-md flex flex-col items-center text-center hover:border-brand-violet hover:-translate-y-1 transition-all">
              <div className="w-14 h-14 rounded-2xl bg-purple-50 text-brand-violet flex items-center justify-center mb-4">
                <Search className="w-7 h-7" />
              </div>
              <h3 className="font-extrabold text-gray-900 text-base mb-1">Discover</h3>
              <p className="text-xs text-gray-500">Live Intent Signals</p>
            </div>

            <div className="p-6 rounded-2xl bg-white border-2 border-gray-200 shadow-md flex flex-col items-center text-center hover:border-brand-violet hover:-translate-y-1 transition-all">
              <div className="w-14 h-14 rounded-2xl bg-emerald-50 text-emerald-600 flex items-center justify-center mb-4">
                <Sparkles className="w-7 h-7" />
              </div>
              <h3 className="font-extrabold text-gray-900 text-base mb-1">Create</h3>
              <p className="text-xs text-gray-500">Outreach Playbooks</p>
            </div>

            <div className="p-6 rounded-2xl bg-white border-2 border-gray-200 shadow-md flex flex-col items-center text-center hover:border-brand-violet hover:-translate-y-1 transition-all">
              <div className="w-14 h-14 rounded-2xl bg-brand-violet/10 text-brand-violet flex items-center justify-center mb-4">
                <Users className="w-7 h-7" />
              </div>
              <h3 className="font-extrabold text-gray-900 text-base mb-1">Test</h3>
              <p className="text-xs text-gray-500">1,000 Beta Cohort</p>
            </div>

            <div className="p-6 rounded-2xl bg-white border-2 border-gray-200 shadow-md flex flex-col items-center text-center hover:border-brand-violet hover:-translate-y-1 transition-all">
              <div className="w-14 h-14 rounded-2xl bg-amber-50 text-amber-600 flex items-center justify-center mb-4">
                <FileText className="w-7 h-7" />
              </div>
              <h3 className="font-extrabold text-gray-900 text-base mb-1">Save</h3>
              <p className="text-xs text-gray-500">Feedback Archives</p>
            </div>

            <div className="p-6 rounded-2xl bg-white border-2 border-gray-200 shadow-md flex flex-col items-center text-center hover:border-brand-violet hover:-translate-y-1 transition-all col-span-2 md:col-span-1">
              <div className="w-14 h-14 rounded-2xl bg-blue-50 text-blue-600 flex items-center justify-center mb-4">
                <BarChart3 className="w-7 h-7" />
              </div>
              <h3 className="font-extrabold text-gray-900 text-base mb-1">Scale</h3>
              <p className="text-xs text-gray-500">Viral Referrals</p>
            </div>

          </div>
        </div>
      </section>

      {/* ============================================================ */}
      {/* 8. ONE PLATFORM. THREE PATHS TO GROWTH - Alternating Rows    */}
      {/* ============================================================ */}
      <section id="paths" className="w-full py-24 md:py-32 bg-white">
        <div className="container mx-auto px-4 sm:px-6 lg:px-12 max-w-6xl">
          
          <div className="text-center mb-20">
            <h2 className="text-4xl sm:text-5xl md:text-6xl font-black text-gray-900">
              <span>One platform. </span>
              <span className="block extruded-violet text-brand-bush mt-1">Three paths to growth.</span>
            </h2>
          </div>

          <div className="space-y-16">
            
            {/* Path 1 */}
            <div className="flex flex-col md:flex-row items-center gap-8 lg:gap-16 p-8 sm:p-10 rounded-3xl bg-[#faf8fc] border-2 border-gray-200">
              <div className="flex-1 text-left">
                <div className="text-xs font-bold text-brand-violet uppercase tracking-wider mb-2">Path 01 • Organic Listening</div>
                <h3 className="text-2xl sm:text-3xl font-black text-gray-900 mb-4">Catch buyers when intent is peaking</h3>
                <p className="text-gray-600 text-sm sm:text-base leading-relaxed mb-6">
                  Instead of interrupting people with annoying banner ads, listen to where they are actively looking for solutions. Connect with real buyers complaining about broken competitors.
                </p>
                <div className="flex items-center gap-2 text-xs font-bold text-brand-violet">
                  <CheckCircle2 className="w-4 h-4 text-emerald-500" />
                  Real-time Subreddit & X Thread Tracking
                </div>
              </div>
              <div className="w-full md:w-80 h-56 rounded-2xl bg-white border border-gray-200 p-5 shadow-md flex flex-col justify-center">
                <div className="text-xs font-mono text-gray-400 mb-2">Live Matching Engine</div>
                <div className="p-3 bg-purple-50 rounded-xl text-xs text-brand-violet font-semibold mb-2">
                  &quot;Any alternative to [Competitor]? It keeps crashing on iOS.&quot;
                </div>
                <div className="text-[11px] text-emerald-600 font-bold flex items-center gap-1">
                  <Check className="w-3.5 h-3.5" /> High Buying Intent Detected
                </div>
              </div>
            </div>

            {/* Path 2 */}
            <div className="flex flex-col md:flex-row-reverse items-center gap-8 lg:gap-16 p-8 sm:p-10 rounded-3xl bg-[#faf8fc] border-2 border-gray-200">
              <div className="flex-1 text-left">
                <div className="text-xs font-bold text-brand-bush uppercase tracking-wider mb-2">Path 02 • Beta Collective</div>
                <h3 className="text-2xl sm:text-3xl font-black text-gray-900 mb-4">Stress-test your UX before spending budget</h3>
                <p className="text-gray-600 text-sm sm:text-base leading-relaxed mb-6">
                  Never launch to silence. Our curated community of 1,000+ tech-forward consumer testers tests your flows, flags confusing UI, and gives unfiltered feedback.
                </p>
                <div className="flex items-center gap-2 text-xs font-bold text-brand-violet">
                  <CheckCircle2 className="w-4 h-4 text-emerald-500" />
                  48-Hour Qualitative Voice of Customer
                </div>
              </div>
              <div className="w-full md:w-80 h-56 rounded-2xl bg-white border border-gray-200 p-5 shadow-md flex flex-col justify-center">
                <div className="text-xs font-mono text-gray-400 mb-2">Tester Collective</div>
                <div className="p-3 bg-emerald-50 rounded-xl text-xs text-emerald-800 font-semibold mb-2">
                  &quot;Onboarding step 3 was confusing, but the core feature is 10/10.&quot;
                </div>
                <div className="text-[11px] text-brand-bush font-bold">142 Testers Responded in 24h</div>
              </div>
            </div>

            {/* Path 3 */}
            <div className="flex flex-col md:flex-row items-center gap-8 lg:gap-16 p-8 sm:p-10 rounded-3xl bg-[#faf8fc] border-2 border-gray-200">
              <div className="flex-1 text-left">
                <div className="text-xs font-bold text-brand-electric uppercase tracking-wider mb-2">Path 03 • Viral Multipliers</div>
                <h3 className="text-2xl sm:text-3xl font-black text-gray-900 mb-4">Turn your first 100 believers into 1,000</h3>
                <p className="text-gray-600 text-sm sm:text-base leading-relaxed mb-6">
                  Built-in referral loops, beta invitations, and exclusive member codes give your early adopters an incentive to champion your product to their friends.
                </p>
                <div className="flex items-center gap-2 text-xs font-bold text-brand-violet">
                  <CheckCircle2 className="w-4 h-4 text-emerald-500" />
                  Organic K-Factor Growth Blueprint
                </div>
              </div>
              <div className="w-full md:w-80 h-56 rounded-2xl bg-white border border-gray-200 p-5 shadow-md flex flex-col justify-center">
                <div className="text-xs font-mono text-gray-400 mb-2">Viral Referral Engine</div>
                <div className="p-3 bg-blue-50 rounded-xl text-xs text-blue-900 font-semibold mb-2">
                  Invites Sent: 4.2 per user
                </div>
                <div className="text-[11px] text-brand-electric font-bold">Exponential K-Factor &gt; 1.3</div>
              </div>
            </div>

          </div>
        </div>
      </section>

      {/* ============================================================ */}
      {/* 9. STORIES OF SUCCESS - Editorial Case Study Proof            */}
      {/* ============================================================ */}
      <section id="stories" className="w-full py-24 bg-[#faf8fc] border-t border-gray-200">
        <div className="container mx-auto px-4 sm:px-6 lg:px-12 max-w-6xl text-center">
          
          <h2 className="text-4xl sm:text-5xl font-black text-gray-900 mb-14">
            Stories of success
          </h2>

          <div className="grid md:grid-cols-3 gap-6 sm:gap-8">
            
            <div className="rounded-3xl bg-white border-2 border-gray-200 p-8 text-left shadow-lg flex flex-col justify-between">
              <div>
                <div className="text-5xl font-black text-brand-violet mb-2">82%</div>
                <div className="text-sm font-extrabold uppercase text-gray-500 tracking-wider mb-4">Conversion Lift</div>
                <p className="text-gray-600 text-sm leading-relaxed mb-6">
                  &quot;Wisentry replaced our $3,500/mo Meta ad spend with hyper-relevant Reddit conversations. Our early retention doubled.&quot;
                </p>
              </div>
              <div className="pt-4 border-t border-gray-100 text-xs font-bold text-gray-900">
                Founder, B2C FinTech App
              </div>
            </div>

            <div className="rounded-3xl bg-white border-2 border-gray-200 p-8 text-left shadow-lg flex flex-col justify-between">
              <div>
                <div className="text-5xl font-black text-brand-bush mb-2">400+</div>
                <div className="text-sm font-extrabold uppercase text-gray-500 tracking-wider mb-4">Hours Saved</div>
                <p className="text-gray-600 text-sm leading-relaxed mb-6">
                  &quot;We avoided 4 months of building the wrong feature because Wisentry testers showed us what was actually blocking signups.&quot;
                </p>
              </div>
              <div className="pt-4 border-t border-gray-100 text-xs font-bold text-gray-900">
                Co-Founder, AI Creation Studio
              </div>
            </div>

            <div className="rounded-3xl bg-white border-2 border-gray-200 p-8 text-left shadow-lg flex flex-col justify-between">
              <div>
                <div className="text-5xl font-black text-brand-electric mb-2">1,000</div>
                <div className="text-sm font-extrabold uppercase text-gray-500 tracking-wider mb-4">Users in 12 Days</div>
                <p className="text-gray-600 text-sm leading-relaxed mb-6">
                  &quot;From zero followers to a vibrant 1,000-user Discord community before our public Product Hunt launch.&quot;
                </p>
              </div>
              <div className="pt-4 border-t border-gray-100 text-xs font-bold text-gray-900">
                CEO, Consumer Productivity Tool
              </div>
            </div>

          </div>
        </div>
      </section>

      {/* ============================================================ */}
      {/* 10. FULL-WIDTH INTEGRATION BANNER                            */}
      {/* ============================================================ */}
      <section className="relative w-full py-28 md:py-36 overflow-hidden bg-gradient-to-r from-brand-violet via-brand-bush to-brand-haiti text-white text-center">
        <div className="absolute inset-0 bg-black/30 backdrop-blur-xs"></div>
        <div className="container mx-auto px-4 sm:px-6 lg:px-12 relative z-10 max-w-4xl">
          <div className="inline-flex items-center gap-2 px-4 py-1.5 rounded-full bg-white/10 text-white text-xs font-bold mb-6">
            <Layers className="w-4 h-4 text-brand-pastel" />
            Seamless Compatibility
          </div>
          <h2 className="text-4xl sm:text-5xl md:text-6xl font-black tracking-tight leading-tight mb-6">
            Slots straight into your existing stack
          </h2>
          <p className="text-lg sm:text-xl text-white/80 max-w-2xl mx-auto mb-10">
            Export leads directly to your CRM, connect webhooks to Discord, or sync waitlist analytics with your favorite data tools.
          </p>

          <div className="flex flex-wrap items-center justify-center gap-3 sm:gap-4 max-w-3xl mx-auto">
            {["Reddit", "X / Twitter", "Discord", "Product Hunt", "TikTok", "Stripe", "PostHog", "Supabase", "Slack"].map((tool) => (
              <span key={tool} className="px-5 py-2.5 rounded-xl bg-white/10 backdrop-blur-md border border-white/20 text-white font-bold text-xs sm:text-sm">
                {tool}
              </span>
            ))}
          </div>
        </div>
      </section>

      {/* ============================================================ */}
      {/* 11. EMBEDDED INTAKE FORM - "Let's grow"                      */}
      {/* ============================================================ */}
      <section className="w-full py-24 md:py-32 bg-[#faf8fc] px-4 sm:px-6 lg:px-12">
        <div className="container mx-auto max-w-5xl">
          
          <div className="rounded-3xl border-2 border-brand-violet/20 bg-white shadow-2xl overflow-hidden grid lg:grid-cols-12">
            
            {/* Left Visual Area */}
            <div className="lg:col-span-5 bg-gradient-to-br from-brand-violet via-brand-bush to-brand-haiti text-white p-8 sm:p-12 flex flex-col justify-between relative overflow-hidden">
              <div className="absolute top-0 right-0 w-64 h-64 bg-brand-electric/20 rounded-full blur-3xl pointer-events-none"></div>
              <div className="relative z-10">
                <span className="text-xs font-mono font-bold text-brand-pastel uppercase tracking-wider block mb-3">
                  WISENTRY ACCESS PASS
                </span>
                <h3 className="text-3xl sm:text-4xl font-black leading-tight mb-4">
                  Let&apos;s get your first 1,000 users.
                </h3>
                <p className="text-white/80 text-sm leading-relaxed mb-6">
                  Fill in your startup details to join the priority cohort. We will review your application and send you custom intent matches within 24 hours.
                </p>
              </div>

              <div className="relative z-10 pt-6 border-t border-white/10 text-xs text-brand-pastel space-y-2">
                <div className="flex items-center gap-2">
                  <Check className="w-4 h-4 text-emerald-400" />
                  <span>Free for the first 100 startups</span>
                </div>
                <div className="flex items-center gap-2">
                  <Check className="w-4 h-4 text-emerald-400" />
                  <span>Instant Discord community unlock</span>
                </div>
              </div>
            </div>

            {/* Right Form Area */}
            <div className="lg:col-span-7 p-8 sm:p-12">
              <form onSubmit={handleWaitlistSubmit} className="space-y-4 text-left">
                <div className="grid sm:grid-cols-2 gap-4">
                  <div>
                    <label className="block text-xs font-bold text-gray-700 uppercase tracking-wider mb-1.5">Full Name *</label>
                    <input
                      type="text"
                      placeholder="Alex Rivera"
                      required
                      className="w-full px-4 py-3 bg-gray-50 border border-gray-200 rounded-xl focus:outline-none focus:ring-2 focus:ring-brand-violet text-sm text-gray-900"
                      value={waitlistData.fullName}
                      onChange={(e) => setWaitlistData({ ...waitlistData, fullName: e.target.value })}
                    />
                  </div>
                  <div>
                    <label className="block text-xs font-bold text-gray-700 uppercase tracking-wider mb-1.5">Email Address *</label>
                    <input
                      type="email"
                      placeholder="alex@startup.com"
                      required
                      className="w-full px-4 py-3 bg-gray-50 border border-gray-200 rounded-xl focus:outline-none focus:ring-2 focus:ring-brand-violet text-sm text-gray-900"
                      value={email}
                      onChange={(e) => setEmail(e.target.value)}
                    />
                  </div>
                </div>

                <div className="grid sm:grid-cols-2 gap-4">
                  <div>
                    <label className="block text-xs font-bold text-gray-700 uppercase tracking-wider mb-1.5">Startup Name *</label>
                    <input
                      type="text"
                      placeholder="Wisentry App"
                      required
                      className="w-full px-4 py-3 bg-gray-50 border border-gray-200 rounded-xl focus:outline-none focus:ring-2 focus:ring-brand-violet text-sm text-gray-900"
                      value={waitlistData.startupName}
                      onChange={(e) => setWaitlistData({ ...waitlistData, startupName: e.target.value })}
                    />
                  </div>
                  <div>
                    <label className="block text-xs font-bold text-gray-700 uppercase tracking-wider mb-1.5">Industry / Niche *</label>
                    <input
                      type="text"
                      placeholder="e.g. AI Consumer, FinTech"
                      required
                      className="w-full px-4 py-3 bg-gray-50 border border-gray-200 rounded-xl focus:outline-none focus:ring-2 focus:ring-brand-violet text-sm text-gray-900"
                      value={waitlistData.industry}
                      onChange={(e) => setWaitlistData({ ...waitlistData, industry: e.target.value })}
                    />
                  </div>
                </div>

                <div>
                  <label className="block text-xs font-bold text-gray-700 uppercase tracking-wider mb-1.5">Primary Growth Challenge *</label>
                  <select
                    required
                    className="w-full px-4 py-3 bg-gray-50 border border-gray-200 rounded-xl focus:outline-none focus:ring-2 focus:ring-brand-violet text-sm text-gray-900 appearance-none cursor-pointer"
                    value={waitlistData.challenge1}
                    onChange={(e) => setWaitlistData({ ...waitlistData, challenge1: e.target.value })}
                  >
                    <option value="" disabled>Select your primary challenge</option>
                    {challenges.map((c) => (
                      <option key={c} value={c}>{c}</option>
                    ))}
                  </select>
                </div>

                <button 
                  type="submit"
                  className="btn-tactile-violet w-full py-4 rounded-xl bg-brand-violet text-white text-base font-black flex items-center justify-center gap-2 cursor-pointer mt-4"
                >
                  <span>Let&apos;s grow</span>
                  <ArrowRight className="w-5 h-5 text-brand-pastel" />
                </button>
              </form>
            </div>

          </div>
        </div>
      </section>

      {/* ============================================================ */}
      {/* 12. GIANT RETRO 3D FOOTER - Optimizely Brand Finale          */}
      {/* ============================================================ */}
      <Footer />

      {/* ============================================================ */}
      {/* 13. INTERACTIVE MODAL OVERLAY (Waitlist / Discord / Code)    */}
      {/* ============================================================ */}
      {modalState !== "closed" && (
        <div 
          className="fixed inset-0 z-50 flex items-center justify-center p-4 sm:p-6"
          role="dialog"
          aria-modal="true"
          aria-labelledby="modal-title"
        >
          {/* Backdrop */}
          <div 
            className="absolute inset-0 bg-[#02010a]/60 backdrop-blur-sm animate-in fade-in duration-300"
            onClick={() => setModalState("closed")}
            aria-hidden="true"
          />

          {/* Modal Content Box */}
          <div className="relative w-full max-w-md bg-white border-2 border-brand-violet/20 rounded-3xl shadow-2xl overflow-hidden animate-in zoom-in-95 fade-in duration-300">
            {/* Close Button */}
            <button 
              onClick={() => setModalState("closed")}
              className="absolute top-4 right-4 p-2 text-gray-400 hover:text-gray-900 hover:bg-gray-100 rounded-full transition-colors z-10 focus:outline-none"
              aria-label="Close modal"
            >
              <X className="w-5 h-5" />
            </button>

            {modalState === "waitlist" && (
              <div className="p-6 sm:p-8">
                <div className="text-center mb-6">
                  <div className="inline-flex items-center gap-1.5 px-3 py-1 rounded-full bg-brand-violet/10 text-brand-violet text-xs font-bold uppercase mb-2">
                    Priority Access
                  </div>
                  <h2 id="modal-title" className="text-2xl font-black text-gray-900">Join the Waitlist</h2>
                  <p className="text-gray-600 text-sm mt-1">Get early access to 1,000 real consumers.</p>
                </div>
                
                <form onSubmit={handleWaitlistSubmit} className="space-y-4">
                  <div>
                    <label className="block text-xs font-bold text-gray-700 uppercase mb-1">Full Name *</label>
                    <input
                      type="text"
                      placeholder="Alex Rivera"
                      required
                      className="w-full px-4 py-3 bg-gray-50 border border-gray-200 rounded-xl focus:outline-none focus:ring-2 focus:ring-brand-violet text-sm text-gray-900"
                      value={waitlistData.fullName}
                      onChange={(e) => setWaitlistData({ ...waitlistData, fullName: e.target.value })}
                    />
                  </div>
                  <div>
                    <label className="block text-xs font-bold text-gray-700 uppercase mb-1">Email Address *</label>
                    <input
                      type="email"
                      placeholder="alex@startup.com"
                      required
                      className="w-full px-4 py-3 bg-gray-50 border border-gray-200 rounded-xl focus:outline-none focus:ring-2 focus:ring-brand-violet text-sm text-gray-900"
                      value={email}
                      onChange={(e) => setEmail(e.target.value)}
                    />
                  </div>
                  <div>
                    <label className="block text-xs font-bold text-gray-700 uppercase mb-1">Startup Name *</label>
                    <input
                      type="text"
                      placeholder="Wisentry App"
                      required
                      className="w-full px-4 py-3 bg-gray-50 border border-gray-200 rounded-xl focus:outline-none focus:ring-2 focus:ring-brand-violet text-sm text-gray-900"
                      value={waitlistData.startupName}
                      onChange={(e) => setWaitlistData({ ...waitlistData, startupName: e.target.value })}
                    />
                  </div>
                  <div>
                    <label className="block text-xs font-bold text-gray-700 uppercase mb-1">Industry / Niche *</label>
                    <input
                      type="text"
                      placeholder="e.g. AI Consumer, Mobile App"
                      required
                      className="w-full px-4 py-3 bg-gray-50 border border-gray-200 rounded-xl focus:outline-none focus:ring-2 focus:ring-brand-violet text-sm text-gray-900"
                      value={waitlistData.industry}
                      onChange={(e) => setWaitlistData({ ...waitlistData, industry: e.target.value })}
                    />
                  </div>
                  <div>
                    <label className="block text-xs font-bold text-gray-700 uppercase mb-1">Biggest Challenge *</label>
                    <select
                      required
                      className="w-full px-4 py-3 bg-gray-50 border border-gray-200 rounded-xl focus:outline-none focus:ring-2 focus:ring-brand-violet text-sm text-gray-900"
                      value={waitlistData.challenge1}
                      onChange={(e) => setWaitlistData({ ...waitlistData, challenge1: e.target.value })}
                    >
                      <option value="" disabled>Select Challenge *</option>
                      {challenges.map(c => (
                        <option key={c} value={c}>{c}</option>
                      ))}
                    </select>
                  </div>

                  <button 
                    type="submit"
                    className="btn-tactile-violet w-full py-4 rounded-xl bg-brand-violet text-white font-black text-sm flex items-center justify-center gap-2 cursor-pointer mt-4"
                  >
                    <span>Let&apos;s grow</span>
                    <ArrowRight className="w-5 h-5 text-brand-pastel" />
                  </button>
                </form>
              </div>
            )}

            {modalState === "community" && (
              <div className="p-6 sm:p-8 text-center flex flex-col items-center">
                <div className="w-16 h-16 bg-emerald-100 rounded-2xl flex items-center justify-center mb-6 shadow-inner">
                  <Check className="w-8 h-8 text-emerald-600" />
                </div>
                <h2 className="text-2xl font-black text-gray-900 mb-2">You&apos;re on the list!</h2>
                <p className="text-gray-600 text-sm mb-8 leading-relaxed">
                  Join our exclusive Discord collective to start networking with B2C founders and testers immediately.
                </p>
                <a 
                  href="https://discord.gg/xTeuQ9yE4"
                  target="_blank"
                  rel="noopener noreferrer"
                  className="btn-tactile-violet w-full py-4 bg-[#5865F2] hover:bg-[#4752C4] text-white rounded-xl font-bold flex items-center justify-center gap-2"
                  onClick={() => setModalState("revealed")}
                >
                  <span>Join Discord Community</span>
                  <ArrowRight className="w-5 h-5" />
                </a>
              </div>
            )}

            {modalState === "revealed" && (
              <div className="p-6 sm:p-8 text-center flex flex-col items-center">
                <div className="w-16 h-16 bg-purple-100 rounded-2xl flex items-center justify-center mb-6 shadow-inner">
                  <Copy className="w-8 h-8 text-brand-violet" />
                </div>
                <h2 className="text-2xl font-black text-gray-900 mb-2">Welcome to Wisentry</h2>
                <p className="text-gray-600 text-sm mb-6">Save your access code for priority cohort onboarding.</p>
                
                <div className="w-full p-4 bg-gray-50 rounded-xl border border-gray-200 flex items-center justify-between mb-8">
                  <code className="text-brand-violet font-mono font-black text-lg">WSE-BETA-24</code>
                  <button 
                    onClick={() => copyToClipboard("WSE-BETA-24")}
                    className="p-2 text-gray-400 hover:text-brand-violet hover:bg-purple-100 rounded-lg transition-colors"
                    aria-label="Copy code"
                  >
                    {copied ? <Check className="w-5 h-5 text-emerald-500" /> : <Copy className="w-5 h-5" />}
                  </button>
                </div>
                
                <button
                  onClick={() => setModalState("closed")}
                  className="text-gray-500 hover:text-gray-900 font-bold text-sm transition-colors"
                >
                  Close & Return to site
                </button>
              </div>
            )}
          </div>
        </div>
      )}

    </motion.div>
  );
}
