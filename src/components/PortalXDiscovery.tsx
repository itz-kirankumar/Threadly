"use client";
import { useCallback, useEffect, useRef, useState } from 'react';
import type { XPost } from '@/lib/x-discovery';
import type { AgentReachCrawlResult, AgentReachDoctorReport } from '@/lib/agent-reach';
import {
  Globe,
  Link as LinkIcon,
  Terminal,
  CheckCircle2,
  AlertCircle,
  RefreshCw,
  Copy,
  Check,
  ExternalLink,
  ArrowRight,
  Sparkles,
  Activity,
  FileText,
  Mail,
  Users,
} from 'lucide-react';

type WebDiscussion = {
  id: string;
  platform: string;
  community: string;
  author: string;
  title: string;
  body: string;
  url: string;
  publishedAt: string | null;
  relevanceScore: number;
};

type AutoSummary = {
  savedCount: number;
  qualifiedCount: number;
  draftsCount: number;
  qualifiedLeads: Array<{ id: string; name: string; score: number; platform: string }>;
};

type XResults = { query: string; posts: XPost[]; retrievedAt: string; provider: string };
type WebResults = {
  query: string;
  discussions: WebDiscussion[];
  autoSummary?: AutoSummary;
  threshold?: number;
  retrievedAt: string;
  provider: string;
};

export type ProspectItem = {
  id: string;
  author?: string;
  text: string;
  url?: string;
  platform?: string;
};

export default function XDiscovery({
  context,
  provider,
  providerStatus,
  tavilyEnabled = true,
  getIdToken,
  onResults,
  onSaveProspect,
  onGoRadar,
  onGoLeads,
  onGoStudio,
}: {
  context: Record<string, string>;
  provider: string | null;
  providerStatus: "connected" | "configured" | "unverified" | "not_configured";
  tavilyEnabled?: boolean;
  getIdToken: () => Promise<string>;
  onResults: () => Promise<void>;
  onSaveProspect?: (item: ProspectItem) => Promise<void>;
  onGoRadar?: () => void;
  onGoLeads?: () => void;
  onGoStudio?: () => void;
}) {
  const [source, setSource] = useState<"agent-reach" | "web" | "x">("agent-reach");
  const [topic, setTopic] = useState((context.painPoints || '').split(/[,;\n]/)[0].slice(0, 100));
  const [xResult, setXResult] = useState<XResults | null>(null);
  const [webResult, setWebResult] = useState<WebResults | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const [savedProspectIds, setSavedProspectIds] = useState<Set<string>>(new Set());

  // Real-Time Lead Surfer & Auto-Outreach States
  const [isSurfing, setIsSurfing] = useState(false);
  const [threshold, setThreshold] = useState<number>(60);
  const [surfCount, setSurfCount] = useState(0);
  const [autoLeadsCount, setAutoLeadsCount] = useState(0);
  const [autoDraftsCount, setAutoDraftsCount] = useState(0);
  const [countdown, setCountdown] = useState(35);

  // Agent-Reach Specific States
  const [reachMode, setReachMode] = useState<"url" | "market" | "doctor">("market");
  const [targetUrl, setTargetUrl] = useState("https://news.ycombinator.com");
  const [saveUrlToRadar, setSaveUrlToRadar] = useState(true);
  const [crawlResult, setCrawlResult] = useState<AgentReachCrawlResult | null>(null);
  const [doctorReport, setDoctorReport] = useState<AgentReachDoctorReport | null>(null);
  const [doctorLoading, setDoctorLoading] = useState(false);
  const [copiedUrl, setCopiedUrl] = useState(false);

  const phrases = (context.outreachSearchPhrases || context.painPoints || 'B2B software, customer onboarding, growth tools')
    .split(/[,;\n]/)
    .map(p => p.trim())
    .filter(p => p.length >= 3);

  const phraseIndexRef = useRef(0);

  const xConnectionLabel = providerStatus === 'connected'
    ? `${provider} connected · account verified`
    : providerStatus === 'unverified'
      ? 'Apify token found · account verification unavailable'
      : providerStatus === 'configured'
        ? 'X API token configured'
        : 'X search not connected · Apify API token required';

  useEffect(() => {
    const suggestion = (context.outreachSearchPhrases || context.painPoints || '').split(/[,;\n]/)[0]?.trim().slice(0, 100);
    if (suggestion) setTopic(suggestion);
  }, [context.outreachSearchPhrases, context.painPoints]);

  const loadDoctorReport = useCallback(async () => {
    setDoctorLoading(true);
    try {
      const res = await fetch("/api/discovery/agent-reach", { cache: "no-store" });
      if (res.ok) {
        const report = await res.json() as AgentReachDoctorReport;
        setDoctorReport(report);
      }
    } catch {
      // Ignore
    } finally {
      setDoctorLoading(false);
    }
  }, []);

  useEffect(() => {
    if (source === "agent-reach" && reachMode === "doctor" && !doctorReport) {
      void loadDoctorReport();
    }
  }, [source, reachMode, doctorReport, loadDoctorReport]);

  const executeSearch = useCallback(async (searchQuery: string) => {
    if (busy) return;
    setBusy(true);
    setError('');

    try {
      const token = await getIdToken();

      if (source === "agent-reach") {
        if (reachMode === "url") {
          const res = await fetch("/api/discovery/agent-reach", {
            method: "POST",
            headers: { "Content-Type": "application/json", Authorization: `Bearer ${token}` },
            body: JSON.stringify({
              action: "crawl_url",
              url: targetUrl,
              saveToRadar: saveUrlToRadar,
              threshold,
            }),
            signal: AbortSignal.timeout(45000),
          });
          const payload = await res.json();
          if (!res.ok) throw new Error(payload.error || "Agent-Reach URL crawl failed.");
          setCrawlResult(payload.result as AgentReachCrawlResult);
          if (payload.autoSummary) {
            setAutoLeadsCount(prev => prev + (payload.autoSummary.qualifiedCount || 0));
          }
          await onResults();
        } else {
          // Multi-Platform Market Search Crawl
          const res = await fetch("/api/discovery/agent-reach", {
            method: "POST",
            headers: { "Content-Type": "application/json", Authorization: `Bearer ${token}` },
            body: JSON.stringify({
              action: "search",
              topic: searchQuery,
              threshold,
              autoOutreach: true,
            }),
            signal: AbortSignal.timeout(45000),
          });
          const payload = await res.json();
          if (!res.ok) throw new Error(payload.error || "Agent-Reach market search failed.");
          setWebResult(payload as WebResults);
          setSurfCount(prev => prev + (payload.discussions?.length || 0));
          if (payload.autoSummary) {
            setAutoLeadsCount(prev => prev + (payload.autoSummary.qualifiedCount || 0));
            setAutoDraftsCount(prev => prev + (payload.autoSummary.draftsCount || 0));
          }
          await onResults();
        }
      } else if (source === "web") {
        const response = await fetch('/api/discovery/web', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` },
          body: JSON.stringify({
            topic: searchQuery,
            threshold,
            autoOutreach: true,
          }),
          signal: AbortSignal.timeout(45000),
        });
        const payload = await response.json();
        if (!response.ok) throw new Error(payload.error || 'Web discovery search failed.');
        setWebResult(payload as WebResults);
        setSurfCount(prev => prev + (payload.discussions?.length || 0));
        if (payload.autoSummary) {
          setAutoLeadsCount(prev => prev + (payload.autoSummary.qualifiedCount || 0));
          setAutoDraftsCount(prev => prev + (payload.autoSummary.draftsCount || 0));
        }
        await onResults();
      } else {
        setXResult(null);
        const response = await fetch('/api/discovery/x', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` },
          body: JSON.stringify({ topic: searchQuery }),
          signal: AbortSignal.timeout(85000),
        });
        const payload = await response.json();
        if (!response.ok) throw new Error(payload.error || 'X search failed.');
        setXResult(payload as XResults);
        await onResults();
      }
    } catch (err) {
      setError(err instanceof Error && err.name !== 'TimeoutError' ? err.message : 'Operation timed out. Please try again.');
    } finally {
      setBusy(false);
    }
  }, [busy, getIdToken, onResults, source, reachMode, targetUrl, saveUrlToRadar, threshold]);

  // Real-time Lead Surfer loop
  useEffect(() => {
    if (!isSurfing || (source !== 'web' && !(source === 'agent-reach' && reachMode === 'market'))) return;

    const timer = setInterval(() => {
      setCountdown(prev => {
        if (prev <= 1) {
          const nextPhrase = phrases[phraseIndexRef.current % phrases.length] || topic;
          phraseIndexRef.current += 1;
          setTopic(nextPhrase);
          void executeSearch(nextPhrase);
          return 35;
        }
        return prev - 1;
      });
    }, 1000);

    return () => clearInterval(timer);
  }, [isSurfing, source, reachMode, phrases, topic, executeSearch]);

  async function handleManualSearch(event: React.FormEvent) {
    event.preventDefault();
    await executeSearch(topic);
  }

  return (
    <section className="mini-card x-discovery" aria-labelledby="discovery-search-title">
      {/* PRIMARY SOURCE SELECTION TABS */}
      <div style={{ display: 'flex', gap: '8px', marginBottom: '16px', flexWrap: 'wrap', alignItems: 'center' }}>
        <button
          type="button"
          className={`btn ${source === 'agent-reach' ? 'btn-dark' : 'btn-outline'}`}
          onClick={() => { setSource('agent-reach'); setError(''); }}
          style={{
            fontSize: '11.5px',
            padding: '7px 14px',
            display: 'inline-flex',
            alignItems: 'center',
            gap: '7px',
            border: source === 'agent-reach' ? '1px solid #ff4500' : undefined,
          }}
        >
          <Sparkles size={14} style={{ color: source === 'agent-reach' ? '#ff8a5c' : '#ff4500' }} />
          <strong>Agent-Reach Real-Time Crawler</strong>
          <span style={{
            fontSize: '9px',
            padding: '2px 6px',
            borderRadius: '999px',
            background: source === 'agent-reach' ? 'rgba(255,255,255,0.2)' : '#fef2ee',
            color: source === 'agent-reach' ? '#fff' : '#c2410c',
            fontWeight: 700,
          }}>
            ZERO API KEYS
          </span>
        </button>

        <button
          type="button"
          className={`btn ${source === 'web' ? 'btn-dark' : 'btn-outline'}`}
          onClick={() => { setSource('web'); setError(''); }}
          style={{ fontSize: '11.5px', padding: '7px 14px' }}
        >
          🌐 Multi-Community Web & Reddit (Tavily)
        </button>

        <button
          type="button"
          className={`btn ${source === 'x' ? 'btn-dark' : 'btn-outline'}`}
          onClick={() => { setSource('x'); setIsSurfing(false); setError(''); }}
          style={{ fontSize: '11.5px', padding: '7px 14px' }}
        >
          𝕏 X (Twitter)
        </button>
      </div>

      {/* AGENT-REACH SUBMODE BAR */}
      {source === 'agent-reach' && (
        <div style={{
          display: 'flex',
          gap: '8px',
          marginBottom: '16px',
          padding: '6px',
          background: '#f8fafc',
          borderRadius: '9px',
          border: '1px solid #e2e8f0',
          flexWrap: 'wrap',
          alignItems: 'center',
        }}>
          <button
            type="button"
            className={`btn ${reachMode === 'market' ? 'btn-dark' : 'btn-outline'}`}
            onClick={() => { setReachMode('market'); setError(''); }}
            style={{ fontSize: '11px', padding: '5px 12px', minHeight: '30px' }}
          >
            <Activity size={13} /> Multi-Platform Market Signals
          </button>
          <button
            type="button"
            className={`btn ${reachMode === 'url' ? 'btn-dark' : 'btn-outline'}`}
            onClick={() => { setReachMode('url'); setIsSurfing(false); setError(''); }}
            style={{ fontSize: '11px', padding: '5px 12px', minHeight: '30px' }}
          >
            <LinkIcon size={13} /> Deep URL & Website Crawler
          </button>
          <button
            type="button"
            className={`btn ${reachMode === 'doctor' ? 'btn-dark' : 'btn-outline'}`}
            onClick={() => { setReachMode('doctor'); setIsSurfing(false); setError(''); }}
            style={{ fontSize: '11px', padding: '5px 12px', minHeight: '30px' }}
          >
            <Terminal size={13} /> 16-Platform Health Doctor
          </button>
        </div>
      )}

      {/* REAL-TIME LEAD SURFER & AUTO-OUTREACH CONTROL PANEL (Web or Agent-Reach Market) */}
      {(source === 'web' || (source === 'agent-reach' && reachMode === 'market')) && (
        <div style={{
          background: isSurfing ? '#fff7ed' : '#f8fafc',
          border: isSurfing ? '1.5px solid #ff4500' : '1px solid #e2e8f0',
          borderRadius: '10px',
          padding: '16px',
          marginBottom: '18px',
          transition: 'all 0.2s ease',
        }}>
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', flexWrap: 'wrap', gap: '12px', marginBottom: '12px' }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
              <span style={{
                display: 'inline-block',
                width: '10px',
                height: '10px',
                borderRadius: '50%',
                backgroundColor: isSurfing ? '#ff4500' : '#94a3b8',
                boxShadow: isSurfing ? '0 0 10px #ff4500' : 'none',
              }} />
              <div>
                <strong style={{ fontSize: '14px', color: '#0f172a' }}>
                  {isSurfing ? '⚡ Live Lead Surfer Active · Crawling Multi-Platform Signals' : '⚡ Autonomous Real-Time Lead Surfer'}
                </strong>
                <span style={{ display: 'block', fontSize: '12px', color: '#64748b' }}>
                  {isSurfing
                    ? `Scanning next market signals in ${countdown}s · Auto-converting ≥ ${threshold}% matches`
                    : `Continuously watches Hacker News, GitHub, Reddit, & open web feeds. Automatically drafts outreach for leads scoring ≥ ${threshold}% match.`}
                </span>
              </div>
            </div>

            <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
              <button
                type="button"
                className={`btn ${isSurfing ? 'btn-outline' : 'btn-dark'}`}
                onClick={() => {
                  if (!isSurfing) {
                    setIsSurfing(true);
                    setCountdown(3);
                  } else {
                    setIsSurfing(false);
                  }
                }}
                style={{ fontSize: '12px', padding: '6px 14px', fontWeight: 600 }}
              >
                {isSurfing ? '⏸ Pause Surfing' : '⚡ Start Live Surfing'}
              </button>
            </div>
          </div>

          {/* Threshold & Metric Stats Bar */}
          <div style={{
            display: 'flex',
            justifyContent: 'space-between',
            alignItems: 'center',
            flexWrap: 'wrap',
            gap: '12px',
            background: '#ffffff',
            padding: '10px 14px',
            borderRadius: '8px',
            border: '1px solid #e2e8f0',
          }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: '8px', flexWrap: 'wrap' }}>
              <span style={{ fontSize: '12px', fontWeight: 600, color: '#334155' }}>
                Auto-Outreach Threshold:
              </span>
              {[50, 60, 70, 80].map(val => (
                <button
                  key={val}
                  type="button"
                  onClick={() => setThreshold(val)}
                  style={{
                    fontSize: '11px',
                    padding: '3px 9px',
                    borderRadius: '5px',
                    border: threshold === val ? '1.5px solid #ff4500' : '1px solid #cbd5e1',
                    background: threshold === val ? '#fff1eb' : '#ffffff',
                    color: threshold === val ? '#c2410c' : '#475569',
                    fontWeight: threshold === val ? 700 : 500,
                    cursor: 'pointer',
                  }}
                >
                  {val}% {val === 60 ? '★ Default' : ''}
                </button>
              ))}
            </div>

            <div style={{ display: 'flex', gap: '14px', fontSize: '12px' }}>
              <span>Signals: <strong>{surfCount}</strong></span>
              <span>Auto-Leads (≥{threshold}%): <strong style={{ color: '#16a34a' }}>{autoLeadsCount}</strong></span>
              <span>Outreach Drafts: <strong style={{ color: '#7c3aed' }}>{autoDraftsCount}</strong></span>
            </div>
          </div>
        </div>
      )}

      {/* HEADER / KICKER */}
      <div className="section-kicker">
        {source === 'agent-reach'
          ? (reachMode === 'url' ? 'AGENT-REACH · REAL-TIME URL & CONTENT CRAWLER' : reachMode === 'doctor' ? 'AGENT-REACH · 16-PLATFORM DIAGNOSTICS' : 'AGENT-REACH · REAL-TIME MULTI-PLATFORM SIGNALS')
          : source === 'web'
            ? 'LIVE MULTI-PLATFORM RADAR · REDDIT, HACKER NEWS, INDIE HACKERS'
            : 'X · REAL PUBLIC POSTS'}
      </div>

      <h2 id="discovery-search-title">
        {source === 'agent-reach' && reachMode === 'url'
          ? 'Deep crawl any website, discussion, or article in clean Markdown'
          : source === 'agent-reach' && reachMode === 'doctor'
            ? 'Real-Time Health & Status of All 16 Platform Channels'
            : 'Find people talking about the problem you solve'}
      </h2>

      <p>
        {source === 'agent-reach' && reachMode === 'url'
          ? 'Paste any URL. Agent-Reach extracts full clean markdown, headings, author details, contact emails, and social links with zero API keys required.'
          : source === 'agent-reach' && reachMode === 'doctor'
            ? 'Inspect which crawling backends are active, configured, and accessible right now across Web, Reddit, GitHub, Hacker News, RSS, and YouTube.'
            : source === 'web'
              ? 'Search high-intent public discussions across Reddit, Hacker News, Indie Hackers, GitHub, and niche communities.'
              : 'Enter a short phrase your customers would use. We search recent X posts and keep the original source with every result.'}
      </p>

      {/* SOURCE NOTICES */}
      <p className="source-notice">
        {source === 'agent-reach'
          ? `⚡ Agent-Reach Real-Time Crawler · Jina Reader + Algolia HN + GitHub + Google News RSS · Zero API Fees`
          : source === 'web'
            ? `${webResult?.provider || 'Multi-platform Radar (Reddit, Hacker News, Indie Hackers)'} · Autonomous lead scoring enabled`
            : xConnectionLabel}
      </p>

      {/* MODE 1: DEEP URL CRAWLER FORM */}
      {source === 'agent-reach' && reachMode === 'url' && (
        <form onSubmit={handleManualSearch} className="x-search-form" style={{ gridTemplateColumns: 'minmax(0, 1fr) auto' }}>
          <div>
            <label htmlFor="reach-url-input" style={{ display: 'block', fontSize: '11px', fontWeight: 600, marginBottom: '6px' }}>Target URL to crawl</label>
            <input
              id="reach-url-input"
              value={targetUrl}
              onChange={e => setTargetUrl(e.target.value)}
              required
              placeholder="e.g. https://news.ycombinator.com/item?id=... or https://stripe.com"
              disabled={busy}
              style={{ width: '100%', padding: '10px 14px', borderRadius: '8px', border: '1px solid #cbd5e1' }}
            />
            <div style={{ marginTop: '8px', display: 'flex', alignItems: 'center', gap: '8px' }}>
              <input
                type="checkbox"
                id="save-radar-check"
                checked={saveUrlToRadar}
                onChange={e => setSaveUrlToRadar(e.target.checked)}
              />
              <label htmlFor="save-radar-check" style={{ fontSize: '11px', color: '#64748b', cursor: 'pointer' }}>
                Auto-save crawled content directly into Radar as a High-Intent Opportunity
              </label>
            </div>
          </div>
          <button
            className="btn btn-dark"
            disabled={busy || targetUrl.trim().length < 5}
            style={{ alignSelf: 'flex-start', marginTop: '22px' }}
          >
            {busy ? 'Crawling Page…' : '⚡ Crawl URL with Agent-Reach'}
          </button>
        </form>
      )}

      {/* MODE 2: TOPIC SEARCH FORM (Market Search or Web or X) */}
      {(source === 'web' || source === 'x' || (source === 'agent-reach' && reachMode === 'market')) && (
        <form onSubmit={handleManualSearch} className="x-search-form">
          <label htmlFor="discovery-topic">Customer problem or topic</label>
          <input
            id="discovery-topic"
            value={topic}
            onChange={e => setTopic(e.target.value)}
            minLength={3}
            maxLength={100}
            required
            placeholder="e.g. cold email deliverability"
            disabled={busy}
          />
          <button
            className="btn btn-dark"
            disabled={busy || (source === 'x' && !provider) || topic.trim().length < 3}
          >
            {busy ? (source === 'x' ? 'Searching X…' : 'Crawling Live Discussions…') : (source === 'agent-reach' ? '⚡ Run Agent-Reach Live Crawl' : source === 'web' ? 'Surf Discussions Now' : 'Search X')}
          </button>
        </form>
      )}

      {/* MODE 3: DOCTOR DIAGNOSTIC VIEW */}
      {source === 'agent-reach' && reachMode === 'doctor' && (
        <div style={{ marginTop: '16px' }}>
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '14px', flexWrap: 'wrap', gap: '8px' }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
              <span style={{ fontSize: '13px', fontWeight: 700, color: '#0f172a' }}>
                System Status: {doctorReport?.activeChannels || 10} of {doctorReport?.totalChannels || 16} Channels Operational
              </span>
              <span style={{
                fontSize: '10px',
                padding: '2px 8px',
                borderRadius: '999px',
                background: doctorReport?.cliAvailable ? '#dcfce7' : '#f1f5f9',
                color: doctorReport?.cliAvailable ? '#15803d' : '#475569',
                fontWeight: 600,
              }}>
                {doctorReport?.cliAvailable ? '✓ Python CLI Connected' : 'Native TypeScript Engine Active'}
              </span>
            </div>
            <button
              type="button"
              className="btn btn-outline"
              onClick={loadDoctorReport}
              disabled={doctorLoading}
              style={{ fontSize: '11px', padding: '5px 12px', display: 'inline-flex', alignItems: 'center', gap: '6px' }}
            >
              <RefreshCw size={13} className={doctorLoading ? 'animate-spin' : ''} />
              {doctorLoading ? 'Probing Backends…' : 'Re-run Doctor Diagnostics'}
            </button>
          </div>

          {doctorLoading && <p>Testing channel endpoints and routing latencies…</p>}

          {doctorReport && (
            <div style={{
              display: 'grid',
              gridTemplateColumns: 'repeat(auto-fill, minmax(280px, 1fr))',
              gap: '12px',
            }}>
              {Object.entries(doctorReport.channels).map(([key, ch]) => {
                const isOk = ch.status === 'ok';
                const isWarn = ch.status === 'warn';
                return (
                  <div key={key} style={{
                    border: '1px solid #e2e8f0',
                    borderRadius: '10px',
                    padding: '14px',
                    background: isOk ? '#ffffff' : '#fafafa',
                  }}>
                    <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '6px' }}>
                      <strong style={{ fontSize: '13px', color: '#0f172a' }}>{ch.platform}</strong>
                      <span style={{
                        fontSize: '9px',
                        padding: '2px 6px',
                        borderRadius: '4px',
                        fontWeight: 700,
                        textTransform: 'uppercase',
                        background: isOk ? '#dcfce7' : isWarn ? '#fef3c7' : '#f1f5f9',
                        color: isOk ? '#15803d' : isWarn ? '#b45309' : '#64748b',
                      }}>
                        {isOk ? 'OK · READY' : isWarn ? 'CONFIG READY' : 'OFF'}
                      </span>
                    </div>
                    <div style={{ fontSize: '11px', color: '#475569', marginBottom: '6px', fontWeight: 500 }}>
                      Backend: <strong>{ch.activeBackend || ch.backends[0] || 'Direct API'}</strong>
                    </div>
                    <div style={{ fontSize: '10.5px', color: '#64748b', lineHeight: 1.4 }}>
                      {ch.message}
                    </div>
                  </div>
                );
              })}
            </div>
          )}
        </div>
      )}

      {error && <p role="alert" className="x-search-error">{error}</p>}

      <div aria-live="polite" aria-busy={busy}>
        {busy && <p>⚡ Agent-Reach is crawling real-time web discussions and extracting buyer signals. This takes a few seconds…</p>}

        {/* CRAWL RESULT VIEW FOR URL CRAWLER */}
        {source === 'agent-reach' && reachMode === 'url' && crawlResult && (
          <div style={{ marginTop: '18px' }}>
            <div style={{
              background: '#f8fafc',
              border: '1.5px solid #cbd5e1',
              borderRadius: '12px',
              padding: '18px',
            }}>
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', flexWrap: 'wrap', gap: '10px', marginBottom: '12px' }}>
                <div>
                  <span style={{ fontSize: '10px', fontWeight: 700, color: '#c2410c', textTransform: 'uppercase', letterSpacing: '0.08em' }}>
                    {crawlResult.provider} · CRAWLED IN REAL TIME
                  </span>
                  <h3 style={{ margin: '4px 0 6px', fontSize: '18px', fontWeight: 700, color: '#0f172a' }}>
                    {crawlResult.title}
                  </h3>
                  <a href={crawlResult.url} target="_blank" rel="noopener noreferrer" style={{ fontSize: '12px', color: '#ff4500', display: 'inline-flex', alignItems: 'center', gap: '4px' }}>
                    {crawlResult.url} <ExternalLink size={12} />
                  </a>
                </div>

                <div style={{ display: 'flex', gap: '8px' }}>
                  {saveUrlToRadar && onGoRadar && (
                    <button
                      type="button"
                      className="btn btn-dark"
                      onClick={onGoRadar}
                      style={{ fontSize: '11px', padding: '6px 12px' }}
                    >
                      Open in Radar →
                    </button>
                  )}
                  <button
                    type="button"
                    className="btn btn-outline"
                    onClick={() => {
                      navigator.clipboard.writeText(crawlResult.markdown);
                      setCopiedUrl(true);
                      setTimeout(() => setCopiedUrl(false), 2000);
                    }}
                    style={{ fontSize: '11px', padding: '6px 12px', display: 'inline-flex', alignItems: 'center', gap: '4px' }}
                  >
                    {copiedUrl ? <Check size={12} style={{ color: '#16a34a' }} /> : <Copy size={12} />}
                    {copiedUrl ? 'Copied Markdown' : 'Copy Markdown'}
                  </button>
                </div>
              </div>

              {/* Page Metadata Summary Tags */}
              <div style={{ display: 'flex', flexWrap: 'wrap', gap: '8px', marginBottom: '14px' }}>
                <span style={{ background: '#e2e8f0', color: '#334155', fontSize: '11px', padding: '3px 8px', borderRadius: '5px' }}>
                  {crawlResult.charCount.toLocaleString()} characters extracted
                </span>
                {crawlResult.publishedAt && (
                  <span style={{ background: '#e2e8f0', color: '#334155', fontSize: '11px', padding: '3px 8px', borderRadius: '5px' }}>
                    Published: {crawlResult.publishedAt}
                  </span>
                )}
                {crawlResult.headings.length > 0 && (
                  <span style={{ background: '#e0f2fe', color: '#0369a1', fontSize: '11px', padding: '3px 8px', borderRadius: '5px' }}>
                    {crawlResult.headings.length} Key Headings
                  </span>
                )}
                {crawlResult.emails.length > 0 && (
                  <span style={{ background: '#fef3c7', color: '#92400e', fontSize: '11px', padding: '3px 8px', borderRadius: '5px', fontWeight: 600 }}>
                    📧 {crawlResult.emails.length} Contact Email{crawlResult.emails.length > 1 ? 's' : ''} Found
                  </span>
                )}
              </div>

              {/* Found Emails and Social Handles */}
              {crawlResult.emails.length > 0 && (
                <div style={{ marginBottom: '14px', background: '#ffffff', padding: '10px 12px', borderRadius: '8px', border: '1px solid #e2e8f0' }}>
                  <strong style={{ fontSize: '11px', display: 'block', color: '#475569', marginBottom: '6px' }}>FOUND CONTACT EMAILS:</strong>
                  <div style={{ display: 'flex', gap: '8px', flexWrap: 'wrap' }}>
                    {crawlResult.emails.map(email => (
                      <span key={email} style={{ display: 'inline-flex', alignItems: 'center', gap: '6px', fontSize: '11.5px', background: '#f1f5f9', padding: '3px 8px', borderRadius: '4px' }}>
                        <Mail size={12} style={{ color: '#ff4500' }} />
                        <a href={`mailto:${email}`} style={{ color: '#0f172a', fontWeight: 600 }}>{email}</a>
                        {onSaveProspect && (
                          <button
                            type="button"
                            onClick={async () => {
                              await onSaveProspect({
                                id: `lead-${email}`,
                                author: email,
                                text: `Contact found on ${crawlResult.url}: ${crawlResult.title}`,
                                url: crawlResult.url,
                                platform: 'Web Crawl',
                              });
                            }}
                            style={{ border: 0, background: 'none', color: '#16a34a', fontSize: '10px', cursor: 'pointer', fontWeight: 700 }}
                          >
                            + Add Lead
                          </button>
                        )}
                      </span>
                    ))}
                  </div>
                </div>
              )}

              {/* Clean Markdown Excerpt Viewer */}
              <div style={{
                maxHeight: '340px',
                overflowY: 'auto',
                background: '#ffffff',
                border: '1px solid #e2e8f0',
                borderRadius: '8px',
                padding: '14px',
                fontFamily: 'monospace',
                fontSize: '11px',
                lineHeight: 1.5,
                whiteSpace: 'pre-wrap',
                color: '#1e293b',
              }}>
                {crawlResult.markdown}
              </div>
            </div>
          </div>
        )}

        {/* WEB & AGENT-REACH MARKET RESULTS */}
        {((source === 'agent-reach' && reachMode === 'market') || source === 'web') && webResult && (
          <>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', flexWrap: 'wrap', gap: '10px', background: 'var(--thread-orange-light, #fff1eb)', border: '1px solid #fed7aa', padding: '12px 16px', borderRadius: '8px', margin: '14px 0' }}>
              <div>
                <strong style={{ color: '#9a3412', display: 'block', fontSize: '14px' }}>
                  ✓ {webResult.discussions.length} Discussions Synced to Radar
                </strong>
                <span style={{ fontSize: '12px', color: '#7c2d12' }}>
                  {webResult.autoSummary?.qualifiedCount ? (
                    `⚡ ${webResult.autoSummary.qualifiedCount} leads crossed ≥ ${threshold}% match: Auto-qualified & enrolled into Follow-up Outreach Sequence.`
                  ) : (
                    `Real discussions crawled from Hacker News, GitHub, News RSS, and Reddit are active in your Radar.`
                  )}
                </span>
              </div>
              <div style={{ display: 'flex', gap: '8px' }}>
                {onGoRadar && (
                  <button
                    type="button"
                    className="btn btn-dark"
                    onClick={onGoRadar}
                    style={{ fontSize: '12px', padding: '6px 14px' }}
                  >
                    Open Radar →
                  </button>
                )}
                {onGoLeads && webResult.autoSummary && webResult.autoSummary.qualifiedCount > 0 && (
                  <button
                    type="button"
                    className="btn btn-outline"
                    onClick={onGoLeads}
                    style={{ fontSize: '12px', padding: '6px 12px', background: '#ffffff' }}
                  >
                    View Leads ({webResult.autoSummary.qualifiedCount}) →
                  </button>
                )}
              </div>
            </div>

            <p className="muted-copy">Search query: `{webResult.query}` · Provider: {webResult.provider}</p>
            {!webResult.discussions.length && <p>No discussions matched. Try a broader problem description.</p>}
            <div className="x-results">
              {webResult.discussions.map(d => {
                const isAutoQualified = d.relevanceScore >= threshold;
                return (
                  <article key={d.id} className="x-result" style={{ borderLeft: isAutoQualified ? '3px solid #ff4500' : undefined }}>
                    <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', flexWrap: 'wrap', gap: '6px' }}>
                      <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                        <span className="status-tag" style={{ background: d.platform === 'Hacker News' ? '#ff6600' : d.platform === 'GitHub' ? '#24292e' : '#fa622c', color: '#fff', fontWeight: 700 }}>
                          {d.platform}
                        </span>
                        <strong style={{ fontSize: '12px' }}>{d.community}</strong>
                        <span style={{ fontSize: '11px', color: '#64748b' }}>by {d.author}</span>
                      </div>
                      <div style={{ display: 'flex', alignItems: 'center', gap: '6px' }}>
                        <span style={{
                          fontSize: '10.5px',
                          fontWeight: 700,
                          padding: '2px 8px',
                          borderRadius: '4px',
                          background: isAutoQualified ? '#dcfce7' : '#f1f5f9',
                          color: isAutoQualified ? '#15803d' : '#64748b',
                        }}>
                          {d.relevanceScore}% match {isAutoQualified ? '⚡ Qualified' : ''}
                        </span>
                      </div>
                    </div>

                    <h4 style={{ margin: '8px 0 4px', fontSize: '14px', fontWeight: 600, color: '#0f172a' }}>
                      {d.title}
                    </h4>
                    <p className="x-post-text">{d.body}</p>

                    <div className="outreach-result-actions" style={{ marginTop: '10px' }}>
                      <a className="text-link" href={d.url} target="_blank" rel="noopener noreferrer">
                        Open original thread ↗
                      </a>
                      {onSaveProspect && (
                        savedProspectIds.has(d.id) ? (
                          <span style={{ color: "#16a34a", fontSize: "12px", fontWeight: 600, display: "inline-flex", alignItems: "center", gap: 4, padding: "6px 12px" }}>
                            ✓ Lead in Pipeline
                          </span>
                        ) : (
                          <button
                            className="btn btn-outline"
                            type="button"
                            onClick={async () => {
                              setSavedProspectIds(prev => new Set([...prev, d.id]));
                              await onSaveProspect({
                                id: d.id,
                                author: d.author,
                                text: `${d.title} — ${d.body}`,
                                url: d.url,
                                platform: d.platform,
                              });
                            }}
                          >
                            + Add as Lead
                          </button>
                        )
                      )}
                    </div>
                  </article>
                );
              })}
            </div>
          </>
        )}

        {/* X Results */}
        {source === 'x' && xResult && (
          <>
            <p>
              <strong>{xResult.posts.length} real X posts returned</strong> · via {xResult.provider} · Retrieved {new Date(xResult.retrievedAt).toLocaleTimeString()}
            </p>
            <p className="muted-copy">Search used: {xResult.query}</p>
            {!xResult.posts.length && <p>No posts matched. Try a shorter phrase your customers would use.</p>}
            <div className="x-results">
              {xResult.posts.map(post => (
                <article key={post.id} className="x-result">
                  <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                    <strong>{post.author ? (post.author.startsWith('@') ? post.author : `@${post.author}`) : 'Public X author'}</strong>
                    <span className="status-tag">𝕏 {post.metrics ? `${post.metrics.likes} likes` : 'Live post'}</span>
                  </div>
                  <p className="x-post-text">{post.text}</p>
                  <div className="outreach-result-actions">
                    <a className="text-link" href={post.url} target="_blank" rel="noopener noreferrer">
                      Open on X ↗
                    </a>
                    {onSaveProspect && (
                      savedProspectIds.has(post.id) ? (
                        <span style={{ color: "#16a34a", fontSize: "12px", fontWeight: 600, display: "inline-flex", alignItems: "center", gap: 4, padding: "6px 12px" }}>
                          ✓ Lead in Pipeline
                        </span>
                      ) : (
                        <button
                          className="btn btn-outline"
                          type="button"
                          onClick={async () => {
                            setSavedProspectIds(prev => new Set([...prev, post.id]));
                            await onSaveProspect({
                              id: post.id,
                              author: post.author,
                              text: post.text,
                              url: post.url,
                              platform: 'X',
                            });
                          }}
                        >
                          + Add as Lead
                        </button>
                      )
                    )}
                  </div>
                </article>
              ))}
            </div>
          </>
        )}
      </div>
    </section>
  );
}
