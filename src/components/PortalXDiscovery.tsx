"use client";
import { useCallback, useEffect, useRef, useState } from 'react';
import type { XPost } from '@/lib/x-discovery';

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
  const [source, setSource] = useState<"web" | "x">("web");
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

  const executeSearch = useCallback(async (searchQuery: string) => {
    if (busy) return;
    setBusy(true);
    setError('');

    try {
      const token = await getIdToken();
      if (source === "web") {
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
      setError(err instanceof Error && err.name !== 'TimeoutError' ? err.message : 'Search timed out. Please try again.');
    } finally {
      setBusy(false);
    }
  }, [busy, getIdToken, onResults, source, threshold]);

  // Real-time Lead Surfer loop
  useEffect(() => {
    if (!isSurfing || source !== 'web') return;

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
  }, [isSurfing, source, phrases, topic, executeSearch]);

  async function handleManualSearch(event: React.FormEvent) {
    event.preventDefault();
    await executeSearch(topic);
  }

  return (
    <section className="mini-card x-discovery" aria-labelledby="discovery-search-title">
      <div style={{ display: 'flex', gap: '8px', marginBottom: '14px', flexWrap: 'wrap' }}>
        <button
          type="button"
          className={`btn ${source === 'web' ? 'btn-dark' : 'btn-outline'}`}
          onClick={() => { setSource('web'); setError(''); }}
          style={{ fontSize: '11px', padding: '6px 12px' }}
        >
          🌐 Multi-Community Web & Reddit (Tavily)
        </button>
        <button
          type="button"
          className={`btn ${source === 'x' ? 'btn-dark' : 'btn-outline'}`}
          onClick={() => { setSource('x'); setIsSurfing(false); setError(''); }}
          style={{ fontSize: '11px', padding: '6px 12px' }}
        >
          𝕏 X (Twitter)
        </button>
      </div>

      {/* REAL-TIME LEAD SURFER & AUTO-OUTREACH CONTROL PANEL */}
      {source === 'web' && (
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
                  {isSurfing ? '⚡ Live Lead Surfer Active · Surfing Reddit & Communities' : '⚡ Autonomous Real-Time Lead Surfer'}
                </strong>
                <span style={{ display: 'block', fontSize: '12px', color: '#64748b' }}>
                  {isSurfing
                    ? `Scanning next market signals in ${countdown}s · Auto-converting ≥ ${threshold}% matches`
                    : `Continuously watches Reddit, Hacker News, & forums. Automatically drafts outreach for leads scoring ≥ ${threshold}% match.`}
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

      <div className="section-kicker">
        {source === 'web' ? 'LIVE MULTI-PLATFORM RADAR · REDDIT, HACKER NEWS, INDIE HACKERS' : 'X · REAL PUBLIC POSTS'}
      </div>
      <h2 id="discovery-search-title">Find people talking about the problem you solve</h2>
      <p>
        {source === 'web'
          ? 'Search high-intent public discussions across Reddit, Hacker News, Indie Hackers, GitHub, and niche communities.'
          : 'Enter a short phrase your customers would use. We search recent X posts and keep the original source with every result.'}
      </p>

      <p className="source-notice">
        {source === 'web' ? 'Tavily Search API connected · Autonomous lead scoring enabled' : xConnectionLabel}
      </p>

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
          {busy ? (source === 'web' ? 'Surfing Communities…' : 'Searching X…') : (source === 'web' ? 'Surf Discussions Now' : 'Search X')}
        </button>
      </form>

      <p className="muted-copy">
        {source === 'web'
          ? `Discussions scoring ≥ ${threshold}% match are automatically enrolled in your follow-up sequence and queued in Content Studio.`
          : `Up to 10 posts from the last seven days. Searches use provider credits${provider === 'Apify' ? ' with a $0.10 cap per run' : ''}. Results appear in Radar.`}
      </p>

      {error && <p role="alert" className="x-search-error">{error}</p>}

      <div aria-live="polite" aria-busy={busy}>
        {busy && <p>⚡ Surfing real discussions and qualifying potential leads. This takes a few seconds…</p>}

        {/* Web Results */}
        {source === 'web' && webResult && (
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
                    `Real discussions from Reddit, Hacker News, and Indie Hackers are active in your Radar.`
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
                  <article
                    key={d.id}
                    className="x-result"
                    style={{
                      border: isAutoQualified ? '1.5px solid #fdba74' : undefined,
                      background: isAutoQualified ? '#fffdfb' : undefined,
                    }}
                  >
                    <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                      <div>
                        <span className="status-tag">{d.platform} · {d.community}</span>
                        {d.author && <strong> · {d.author}</strong>}
                      </div>
                      <div style={{ display: 'flex', gap: '6px', alignItems: 'center' }}>
                        {isAutoQualified && (
                          <span style={{
                            fontSize: '11px',
                            background: '#ffedd5',
                            color: '#9a3412',
                            padding: '2px 8px',
                            borderRadius: '4px',
                            fontWeight: 700,
                          }}>
                            ⚡ Auto-Outreached ({d.relevanceScore}%)
                          </span>
                        )}
                        <span style={{ fontSize: '11px', color: '#16a34a', fontWeight: 600 }}>Radar Synced ✓</span>
                      </div>
                    </div>

                    <h3 style={{ margin: '8px 0 6px', fontSize: '14px', fontWeight: 600 }}>{d.title}</h3>
                    <p className="x-post-text">{d.body}</p>

                    {/* Auto-Outreach Banner for >= 60% leads */}
                    {isAutoQualified && (
                      <div style={{
                        background: '#f0fdf4',
                        border: '1px solid #bbf7d0',
                        padding: '8px 12px',
                        borderRadius: '6px',
                        margin: '10px 0',
                        display: 'flex',
                        alignItems: 'center',
                        justifyContent: 'space-between',
                        flexWrap: 'wrap',
                        gap: '8px',
                      }}>
                        <div>
                          <strong style={{ color: '#166534', fontSize: '12px' }}>
                            ⚡ Auto-Qualified Lead ({d.relevanceScore}% ≥ {threshold}% Threshold)
                          </strong>
                          <span style={{ fontSize: '11px', color: '#15803d', display: 'block' }}>
                            Added to Pipeline · Sequence Enrolled · Tailored Discussion Reply Drafted
                          </span>
                        </div>
                        <div style={{ display: 'flex', gap: '6px' }}>
                          {onGoStudio && (
                            <button
                              type="button"
                              className="btn btn-outline"
                              style={{ fontSize: '11px', padding: '4px 10px', background: '#ffffff' }}
                              onClick={onGoStudio}
                            >
                              Review Draft ↗
                            </button>
                          )}
                          {onGoLeads && (
                            <button
                              type="button"
                              className="btn btn-dark"
                              style={{ fontSize: '11px', padding: '4px 10px' }}
                              onClick={onGoLeads}
                            >
                              View in Pipeline ↗
                            </button>
                          )}
                        </div>
                      </div>
                    )}

                    <p className="muted-copy">Match Relevance: {d.relevanceScore}% · Real-time market signal</p>
                    <div className="outreach-result-actions">
                      <a className="text-link" href={d.url} target="_blank" rel="noopener noreferrer">
                        Open original thread ↗
                      </a>
                      {onSaveProspect && (
                        (savedProspectIds.has(d.id) || isAutoQualified) ? (
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
