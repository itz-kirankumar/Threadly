"use client";
import { useEffect, useState } from 'react';
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

type XResults = { query: string; posts: XPost[]; retrievedAt: string; provider: string };
type WebResults = { query: string; discussions: WebDiscussion[]; retrievedAt: string; provider: string };

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
}: {
  context: Record<string, string>;
  provider: string | null;
  providerStatus: "connected" | "configured" | "unverified" | "not_configured";
  tavilyEnabled?: boolean;
  getIdToken: () => Promise<string>;
  onResults: () => Promise<void>;
  onSaveProspect?: (item: ProspectItem) => Promise<void>;
  onGoRadar?: () => void;
}) {
  const [source, setSource] = useState<"web" | "x">("web");
  const [topic, setTopic] = useState((context.painPoints || '').split(/[,;\n]/)[0].slice(0, 100));
  const [xResult, setXResult] = useState<XResults | null>(null);
  const [webResult, setWebResult] = useState<WebResults | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const [savedProspectIds, setSavedProspectIds] = useState<Set<string>>(new Set());

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

  async function search(event: React.FormEvent) {
    event.preventDefault();
    if (busy) return;
    setBusy(true);
    setError('');

    try {
      const token = await getIdToken();
      if (source === "web") {
        setWebResult(null);
        const response = await fetch('/api/discovery/web', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` },
          body: JSON.stringify({ topic }),
          signal: AbortSignal.timeout(45000),
        });
        const payload = await response.json();
        if (!response.ok) throw new Error(payload.error || 'Web discovery search failed.');
        setWebResult(payload as WebResults);
        await onResults();
      } else {
        setXResult(null);
        const response = await fetch('/api/discovery/x', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` },
          body: JSON.stringify({ topic }),
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
          🌐 Web & Communities (Tavily)
        </button>
        <button
          type="button"
          className={`btn ${source === 'x' ? 'btn-dark' : 'btn-outline'}`}
          onClick={() => { setSource('x'); setError(''); }}
          style={{ fontSize: '11px', padding: '6px 12px' }}
        >
          𝕏 X (Twitter)
        </button>
      </div>

      <div className="section-kicker">
        {source === 'web' ? 'TAVILY · REDDIT, HACKER NEWS, INDIE HACKERS & FORUMS' : 'X · REAL PUBLIC POSTS'}
      </div>
      <h2 id="discovery-search-title">Find people talking about the problem you solve</h2>
      <p>
        {source === 'web'
          ? 'Search high-intent public discussions across Reddit, Hacker News, Indie Hackers, GitHub, and niche communities.'
          : 'Enter a short phrase your customers would use. We search recent X posts and keep the original source with every result.'}
      </p>

      <p className="source-notice">
        {source === 'web' ? 'Tavily Search API connected · Multi-platform discussion radar' : xConnectionLabel}
      </p>

      <form onSubmit={search} className="x-search-form">
        <label htmlFor="discovery-topic">Customer problem or topic</label>
        <input
          id="discovery-topic"
          value={topic}
          onChange={e => setTopic(e.target.value)}
          minLength={3}
          maxLength={100}
          required
          placeholder="e.g. customer onboarding"
          disabled={busy}
        />
        <button
          className="btn btn-dark"
          disabled={busy || (source === 'x' && !provider) || topic.trim().length < 3}
        >
          {busy ? (source === 'web' ? 'Searching Web…' : 'Searching X…') : (source === 'web' ? 'Search Communities' : 'Search X')}
        </button>
      </form>

      <p className="muted-copy">
        {source === 'web'
          ? 'Live real-time discussion search via Tavily. Results automatically appear in your Radar feed.'
          : `Up to 10 posts from the last seven days. Searches use provider credits${provider === 'Apify' ? ' with a $0.10 cap per run' : ''}. Results appear in Radar.`}
      </p>

      {error && <p role="alert" className="x-search-error">{error}</p>}

      <div aria-live="polite" aria-busy={busy}>
        {busy && <p>Fetching real discussions. This can take a few seconds…</p>}

        {/* Web Results */}
        {source === 'web' && webResult && (
          <>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', flexWrap: 'wrap', gap: '10px', background: 'var(--thread-orange-light, #fff1eb)', border: '1px solid #fed7aa', padding: '12px 16px', borderRadius: '8px', margin: '14px 0' }}>
              <div>
                <strong style={{ color: '#9a3412', display: 'block', fontSize: '14px' }}>
                  ✓ {webResult.discussions.length} Discussions Synced to Radar
                </strong>
                <span style={{ fontSize: '12px', color: '#7c2d12' }}>
                  Real discussions from Reddit, Hacker News, and Indie Hackers are active in your Radar.
                </span>
              </div>
              {onGoRadar && (
                <button
                  type="button"
                  className="btn btn-dark"
                  onClick={onGoRadar}
                  style={{ fontSize: '12px', padding: '6px 14px' }}
                >
                  Open Radar Feed →
                </button>
              )}
            </div>

            <p className="muted-copy">Search used: {webResult.query} · Provider: {webResult.provider}</p>
            {!webResult.discussions.length && <p>No discussions matched. Try a broader problem description.</p>}
            <div className="x-results">
              {webResult.discussions.map(d => (
                <article key={d.id} className="x-result">
                  <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                    <div>
                      <span className="status-tag">{d.platform} · {d.community}</span>
                      {d.author && <strong> · {d.author}</strong>}
                    </div>
                    <span style={{ fontSize: '11px', color: '#16a34a', fontWeight: 600 }}>Radar Synced ✓</span>
                  </div>
                  <h3 style={{ margin: '8px 0 6px', fontSize: '14px', fontWeight: 600 }}>{d.title}</h3>
                  <p className="x-post-text">{d.body}</p>
                  <p className="muted-copy">Match Relevance: {d.relevanceScore}% · Real-time market signal</p>
                  <div className="outreach-result-actions">
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
              ))}
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
                  <span className="status-tag">X · {xResult.provider}</span>
                  {post.author && <strong> @{post.author}</strong>}
                  {post.createdAt && <time dateTime={post.createdAt}> · {new Date(post.createdAt).toLocaleDateString()}</time>}
                  <p className="x-post-text">{post.text}</p>
                  <p className="muted-copy">
                    {post.metrics ? `${post.metrics.likes} likes · ${post.metrics.replies} replies · ${post.metrics.reposts} reposts` : 'Public metrics unavailable'} · Buying intent not assessed
                  </p>
                  <div className="outreach-result-actions">
                    <a className="text-link" href={post.url} target="_blank" rel="noopener noreferrer">
                      Open original X post ↗
                    </a>
                    {onSaveProspect && (
                      <button
                        className="btn btn-outline"
                        type="button"
                        onClick={() => onSaveProspect({
                          id: post.id,
                          author: post.author,
                          text: post.text,
                          url: post.url,
                          platform: "X",
                        })}
                      >
                        Add prospect
                      </button>
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
