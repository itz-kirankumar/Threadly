"use client";

import { useState } from "react";
import { Copy, Check, ArrowRight, ShieldCheck, X, Zap, Globe, Users } from "lucide-react";
import Image from "next/image";

export default function LandingClient() {
  const [modalState, setModalState] = useState<"closed" | "waitlist" | "community" | "revealed">("closed");
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
    "Raising funds",
    "Growing user base",
    "Scaling",
    "Building",
  ];

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
    <div className="min-h-screen flex flex-col relative overflow-hidden bg-white text-gray-900 font-sans">
      {/* Background decorations */}
      <div className="fixed inset-0 pointer-events-none z-0 overflow-hidden">
        <div className="absolute -top-1/4 -right-1/4 w-[1000px] h-[1000px] rounded-full bg-brand-pastel/40 blur-[120px] opacity-70"></div>
        <div className="absolute -bottom-1/4 -left-1/4 w-[800px] h-[800px] rounded-full bg-blue-100/50 blur-[120px] opacity-70"></div>
      </div>

      {/* Navbar */}
      <header className="w-full fixed top-0 z-40 bg-white/70 backdrop-blur-md border-b border-gray-200 shadow-sm transition-all duration-300">
        <div className="container mx-auto px-4 sm:px-6 h-16 sm:h-20 flex items-center justify-between">
          <div className="flex items-center gap-3">
            <div className="relative w-32 h-8 md:w-40 md:h-10 flex items-center overflow-hidden">
              <Image 
                src="/logo.png" 
                alt="Wisentry Logo" 
                fill
                className="object-contain object-left"
                priority
              />
            </div>
          </div>
          <button 
            onClick={() => setModalState("waitlist")}
            className="px-4 sm:px-6 py-2 sm:py-2.5 bg-brand-jaguar text-white hover:bg-brand-violet rounded-full text-sm font-semibold transition-all shadow-md hover:shadow-lg focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-brand-violet focus-visible:ring-offset-2"
            aria-label="Join Waitlist"
          >
            Join Waitlist
          </button>
        </div>
      </header>

      <main className="relative z-10 flex-grow flex flex-col items-center">
        {/* Hero Section */}
        <section className="w-full container mx-auto px-4 sm:px-6 pt-36 pb-20 md:pt-48 md:pb-28 text-center max-w-5xl flex flex-col items-center">
          <div className="inline-flex items-center gap-3 px-5 py-2.5 rounded-full bg-brand-violet/5 border border-brand-violet/10 text-brand-violet font-semibold text-xs sm:text-sm mb-6 sm:mb-8 animate-in slide-in-from-bottom-4 duration-700 fade-in shadow-sm hover:bg-brand-violet/10 transition-colors">
            <span className="relative flex h-2 w-2">
              <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-brand-electric opacity-75"></span>
              <span className="relative inline-flex rounded-full h-2 w-2 bg-brand-electric"></span>
            </span>
            Now helping B2C startups worldwide
          </div>

          <h1 className="text-4xl sm:text-5xl md:text-6xl lg:text-7xl font-extrabold tracking-tight mb-6 sm:mb-8 animate-in slide-in-from-bottom-6 duration-700 delay-150 fade-in text-gray-900 leading-[1.1]">
            Get Your First{' '}
            <span className="text-transparent bg-clip-text bg-gradient-to-r from-brand-violet to-brand-electric drop-shadow-sm">
              1000 Real Users
            </span>
          </h1>

          <p className="text-lg sm:text-xl md:text-2xl text-gray-600 mb-10 max-w-2xl leading-relaxed animate-in slide-in-from-bottom-8 duration-700 delay-300 fade-in px-4">
            Wisentry helps B2C startups get real leads and actionable user insights directly across social media channels.
          </p>

          <div className="flex flex-col sm:flex-row items-center gap-4 sm:gap-6 w-full sm:w-auto animate-in slide-in-from-bottom-10 duration-700 delay-500 fade-in px-4">
            <button 
              onClick={() => setModalState("waitlist")}
              className="group relative inline-flex items-center justify-center w-full sm:w-auto px-8 py-4 bg-brand-jaguar text-white hover:bg-brand-violet rounded-xl text-lg font-bold transition-all duration-300 shadow-xl hover:shadow-2xl hover:-translate-y-1 focus-visible:outline-none focus-visible:ring-4 focus-visible:ring-brand-violet/50"
              aria-label="Join the exclusive waitlist"
            >
              <span className="relative z-10 flex items-center gap-2">
                Join the exclusive waitlist
                <ArrowRight className="w-5 h-5 transition-transform duration-300 group-hover:translate-x-1" aria-hidden="true" />
              </span>
            </button>
            <div className="flex items-center justify-center gap-2 text-amber-700 font-semibold bg-amber-50 px-5 py-2.5 rounded-full border border-amber-200 max-w-full shadow-sm">
              <Zap className="w-4 h-4 shrink-0 text-amber-500" aria-hidden="true" />
              <span className="text-xs sm:text-sm text-center">Only free for the first 100 startups</span>
            </div>
          </div>
        </section>

        {/* Why Wisentry is Crucial Section */}
        <section className="w-full container mx-auto px-4 sm:px-6 py-20 md:py-32 max-w-6xl">
          <div className="text-center mb-16">
            <h2 className="text-3xl sm:text-4xl md:text-5xl font-bold mb-4 tracking-tight text-gray-900">Why Wisentry is Crucial</h2>
            <p className="text-gray-600 text-lg sm:text-xl max-w-2xl mx-auto">The B2C landscape is brutal. We give you the unfair advantage you need to survive and thrive.</p>
          </div>

          <div className="grid lg:grid-cols-2 gap-8 lg:gap-12 items-center">
            {/* Left Content */}
            <div className="flex flex-col gap-6 sm:gap-8">
              <div className="space-y-6">
                <div className="inline-flex items-center gap-2 px-4 py-2 rounded-lg bg-red-50 border border-red-100 text-red-600 font-semibold text-sm">
                  <ShieldCheck className="w-4 h-4" aria-hidden="true" />
                  The B2C Reality
                </div>
                <h3 className="text-3xl sm:text-4xl font-bold leading-tight text-gray-900">Avoid the Startup <span className="text-transparent bg-clip-text bg-gradient-to-r from-red-500 to-orange-500">Tarpit Trap</span></h3>
                <p className="text-lg sm:text-xl text-gray-600 mb-8 leading-relaxed">
                  90-99% of startups die. A massive percentage are B2C ideas that never get heard, never find real users, and never build what the market actually wants.
                </p>
                <div className="p-5 sm:p-7 rounded-2xl bg-white border border-gray-200 flex flex-col sm:flex-row items-start gap-5 hover:border-brand-violet/30 hover:shadow-lg transition-all duration-300 shadow-md">
                  <div className="p-3 bg-brand-pastel rounded-xl shrink-0" aria-hidden="true">
                    <Globe className="w-6 h-6 text-brand-violet" />
                  </div>
                  <div>
                    <h4 className="text-xl font-bold text-gray-900 mb-2">Real Validation</h4>
                    <p className="text-gray-600 text-sm sm:text-base leading-relaxed">Don't build in a vacuum. We connect you directly with potential users who actually care about your solution across the internet.</p>
                  </div>
                </div>
              </div>
            </div>

            {/* Right Content */}
            <div className="relative mt-8 lg:mt-0 group">
              <div className="absolute inset-0 bg-gradient-to-tr from-brand-pastel to-blue-100 rounded-[2rem] blur-2xl opacity-60 group-hover:opacity-100 transition-opacity duration-500"></div>
              <div className="relative aspect-square sm:aspect-[4/3] lg:aspect-auto lg:h-[450px] rounded-[2rem] border border-gray-200 bg-white/80 backdrop-blur-xl p-10 flex flex-col items-center justify-center text-center shadow-xl hover:border-brand-violet/30 transition-colors duration-500">
                <Users className="w-20 h-20 sm:w-24 sm:h-24 text-brand-electric mb-6 sm:mb-8 drop-shadow-md" aria-hidden="true" />
                <h3 className="text-2xl sm:text-3xl font-bold text-gray-900 mb-4">Stop Launching to Crickets</h3>
                <p className="text-gray-600 max-w-sm text-sm sm:text-base leading-relaxed">Our community and tools ensure you launch with an audience ready to test, give feedback, and convert.</p>
              </div>
            </div>
          </div>
        </section>

        {/* Bottom CTA */}
        <section className="w-full container mx-auto px-4 sm:px-6 py-24 sm:py-32 text-center max-w-3xl relative">
          <div className="absolute inset-0 bg-brand-pastel/30 blur-[100px] rounded-full" aria-hidden="true"></div>
          <div className="relative z-10 flex flex-col items-center">
            <h2 className="text-3xl sm:text-4xl md:text-5xl font-bold mb-6 sm:mb-8 text-gray-900 tracking-tight">Ready to grow your B2C startup?</h2>
            <p className="text-lg sm:text-xl text-gray-600 mb-10 px-4">Join the waitlist today and let's get your first 1000 users together.</p>
            <button 
              onClick={() => setModalState("waitlist")}
              className="group relative inline-flex items-center justify-center w-full sm:w-auto px-10 py-5 bg-brand-jaguar text-white hover:bg-brand-violet rounded-xl text-lg font-bold transition-all duration-300 cursor-pointer overflow-hidden shadow-xl hover:shadow-2xl hover:-translate-y-1 focus-visible:outline-none focus-visible:ring-4 focus-visible:ring-brand-violet/50 min-h-[56px]"
              aria-label="Get My 1000 Users"
            >
              <span className="relative z-10 flex items-center gap-2">
                Get My 1000 Users
                <ArrowRight className="w-5 h-5 transition-transform duration-300 group-hover:translate-x-1" aria-hidden="true" />
              </span>
            </button>
          </div>
        </section>
      </main>

      {/* Footer */}
      <footer className="w-full relative z-10 border-t border-gray-200 bg-gray-50 py-8">
        <div className="container mx-auto px-6 flex flex-col md:flex-row items-center justify-between gap-4">
          <div className="flex items-center gap-2">
            <img src="/icon.jpg" alt="" className="w-6 h-6 rounded object-cover" />
            <span className="font-bold tracking-wide text-gray-900">Wisentry</span>
          </div>
          <p className="text-sm text-gray-500">&copy; {new Date().getFullYear()} Wisentry. All rights reserved.</p>
        </div>
      </footer>

      {/* Modern Modal Overlay */}
      {modalState !== "closed" && (
        <div 
          className="fixed inset-0 z-50 flex items-center justify-center p-4 sm:p-6"
          role="dialog"
          aria-modal="true"
          aria-labelledby="modal-title"
        >
          {/* Backdrop */}
          <div 
            className="absolute inset-0 bg-gray-900/40 backdrop-blur-sm animate-in fade-in duration-300"
            onClick={() => setModalState("closed")}
            aria-hidden="true"
          />

          {/* Modal Content Box */}
          <div className="relative w-full max-w-md bg-white border border-gray-200 rounded-2xl shadow-2xl overflow-hidden animate-in zoom-in-95 fade-in duration-300">
            {/* Close Button */}
            <button 
              onClick={() => setModalState("closed")}
              className="absolute top-4 right-4 p-2 text-gray-400 hover:text-gray-900 hover:bg-gray-100 rounded-full transition-colors z-10 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-brand-violet"
              aria-label="Close modal"
            >
              <X className="w-5 h-5" />
            </button>

            {modalState === "waitlist" && (
              <div className="p-6 sm:p-8">
                <div className="text-center mb-6">
                  <h2 id="modal-title" className="text-2xl font-bold text-gray-900 mb-2">Join the Waitlist</h2>
                  <p className="text-gray-600 text-sm">Get early access to actionable user insights.</p>
                </div>
                
                <form onSubmit={handleWaitlistSubmit} className="space-y-4">
                  <div className="space-y-4">
                    <div>
                      <label htmlFor="fullName" className="sr-only">Full Name</label>
                      <input
                        id="fullName"
                        type="text"
                        placeholder="Full Name *"
                        required
                        className="w-full px-4 py-3 bg-gray-50 border border-gray-200 rounded-xl focus:outline-none focus:ring-2 focus:ring-brand-violet focus:border-transparent transition-all placeholder:text-gray-400 text-gray-900"
                        value={waitlistData.fullName}
                        onChange={(e) => setWaitlistData({ ...waitlistData, fullName: e.target.value })}
                      />
                    </div>
                    <div>
                      <label htmlFor="email" className="sr-only">Email Address</label>
                      <input
                        id="email"
                        type="email"
                        placeholder="Email Address *"
                        required
                        className="w-full px-4 py-3 bg-gray-50 border border-gray-200 rounded-xl focus:outline-none focus:ring-2 focus:ring-brand-violet focus:border-transparent transition-all placeholder:text-gray-400 text-gray-900"
                        value={email}
                        onChange={(e) => setEmail(e.target.value)}
                      />
                    </div>
                    <div>
                      <label htmlFor="startupName" className="sr-only">Startup Name</label>
                      <input
                        id="startupName"
                        type="text"
                        placeholder="Startup Name *"
                        required
                        className="w-full px-4 py-3 bg-gray-50 border border-gray-200 rounded-xl focus:outline-none focus:ring-2 focus:ring-brand-violet focus:border-transparent transition-all placeholder:text-gray-400 text-gray-900"
                        value={waitlistData.startupName}
                        onChange={(e) => setWaitlistData({ ...waitlistData, startupName: e.target.value })}
                      />
                    </div>
                    <div>
                      <label htmlFor="industry" className="sr-only">Industry</label>
                      <input
                        id="industry"
                        type="text"
                        placeholder="Industry / Niche *"
                        required
                        className="w-full px-4 py-3 bg-gray-50 border border-gray-200 rounded-xl focus:outline-none focus:ring-2 focus:ring-brand-violet focus:border-transparent transition-all placeholder:text-gray-400 text-gray-900"
                        value={waitlistData.industry}
                        onChange={(e) => setWaitlistData({ ...waitlistData, industry: e.target.value })}
                      />
                    </div>
                    <div>
                      <label htmlFor="url" className="sr-only">Website URL (Optional)</label>
                      <input
                        id="url"
                        type="url"
                        placeholder="Website URL (Optional)"
                        className="w-full px-4 py-3 bg-gray-50 border border-gray-200 rounded-xl focus:outline-none focus:ring-2 focus:ring-brand-violet focus:border-transparent transition-all placeholder:text-gray-400 text-gray-900"
                        value={waitlistData.url}
                        onChange={(e) => setWaitlistData({ ...waitlistData, url: e.target.value })}
                      />
                    </div>

                    <div className="space-y-3">
                      <p className="text-sm font-medium text-gray-700">What are your biggest challenges? *</p>
                      <div>
                        <label htmlFor="challenge1" className="sr-only">Challenge 1</label>
                        <select
                          id="challenge1"
                          required
                          className="w-full px-4 py-3 bg-gray-50 border border-gray-200 rounded-xl focus:outline-none focus:ring-2 focus:ring-brand-violet focus:border-transparent transition-all text-gray-900 appearance-none cursor-pointer"
                          value={waitlistData.challenge1}
                          onChange={(e) => setWaitlistData({ ...waitlistData, challenge1: e.target.value })}
                        >
                          <option value="" disabled>Select Challenge 1 *</option>
                          {challenges.map(c => (
                            <option key={c} value={c} disabled={c === waitlistData.challenge2}>{c}</option>
                          ))}
                        </select>
                      </div>
                      <div>
                        <label htmlFor="challenge2" className="sr-only">Challenge 2</label>
                        <select
                          id="challenge2"
                          className="w-full px-4 py-3 bg-gray-50 border border-gray-200 rounded-xl focus:outline-none focus:ring-2 focus:ring-brand-violet focus:border-transparent transition-all text-gray-900 appearance-none cursor-pointer"
                          value={waitlistData.challenge2}
                          onChange={(e) => setWaitlistData({ ...waitlistData, challenge2: e.target.value })}
                        >
                          <option value="" disabled>Select Challenge 2 (Optional)</option>
                          {challenges.map(c => (
                            <option key={c} value={c} disabled={c === waitlistData.challenge1}>{c}</option>
                          ))}
                        </select>
                      </div>
                    </div>
                  </div>

                  <button 
                    type="submit"
                    className="w-full py-4 bg-brand-violet hover:bg-brand-electric text-white rounded-xl font-bold transition-all shadow-md hover:shadow-lg focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-brand-electric focus-visible:ring-offset-2 flex items-center justify-center gap-2 group mt-2"
                  >
                    Get 1000 Users
                    <ArrowRight className="w-5 h-5 transition-transform group-hover:translate-x-1" />
                  </button>
                </form>
              </div>
            )}

            {modalState === "community" && (
              <div className="p-6 sm:p-8 text-center flex flex-col items-center">
                <div className="w-16 h-16 bg-green-100 rounded-full flex items-center justify-center mb-6 shadow-inner">
                  <Check className="w-8 h-8 text-green-600" />
                </div>
                <h2 id="modal-title" className="text-2xl font-bold text-gray-900 mb-3">You're on the list!</h2>
                <p className="text-gray-600 mb-8 leading-relaxed">
                  Join our exclusive Discord community to start networking and getting insights immediately.
                </p>
                <a 
                  href="https://discord.gg/xTeuQ9yE4"
                  target="_blank"
                  rel="noopener noreferrer"
                  className="w-full py-4 bg-[#5865F2] hover:bg-[#4752C4] text-white rounded-xl font-bold transition-all shadow-md hover:shadow-lg focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#5865F2] focus-visible:ring-offset-2 flex items-center justify-center gap-2"
                  onClick={() => setModalState("revealed")}
                >
                  Join Discord Community
                  <ArrowRight className="w-5 h-5" />
                </a>
              </div>
            )}

            {modalState === "revealed" && (
              <div className="p-6 sm:p-8 text-center flex flex-col items-center">
                <div className="w-16 h-16 bg-brand-pastel/50 rounded-full flex items-center justify-center mb-6 shadow-inner">
                  <Copy className="w-8 h-8 text-brand-violet" />
                </div>
                <h2 id="modal-title" className="text-2xl font-bold text-gray-900 mb-3">Welcome to Wisentry</h2>
                <p className="text-gray-600 mb-6">Save this access code for future reference.</p>
                
                <div className="w-full p-4 bg-gray-50 rounded-xl border border-gray-200 flex items-center justify-between group mb-8">
                  <code className="text-brand-violet font-mono font-bold text-lg">WSE-BETA-24</code>
                  <button 
                    onClick={() => copyToClipboard("WSE-BETA-24")}
                    className="p-2 text-gray-400 hover:text-brand-violet hover:bg-brand-pastel/50 rounded-lg transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-brand-violet"
                    aria-label="Copy access code"
                    title="Copy to clipboard"
                  >
                    {copied ? <Check className="w-5 h-5 text-green-500" /> : <Copy className="w-5 h-5" />}
                  </button>
                </div>
                
                <button
                  onClick={() => setModalState("closed")}
                  className="text-gray-500 hover:text-gray-900 font-medium transition-colors"
                >
                  Close & Return to site
                </button>
              </div>
            )}
          </div>
        </div>
      )}
    </div>
  );
}
