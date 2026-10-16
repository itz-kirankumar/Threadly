"use client";
import { useEffect, useState } from 'react';
import type { XPost } from '@/lib/x-discovery';
type Results = {query: string; posts: XPost[]; retrievedAt: string; provider: string};
export default function XDiscovery({context, provider, providerStatus, getIdToken, onResults, onSaveProspect}: {context: Record<string,string>; provider: string | null; providerStatus: "connected" | "configured" | "unverified" | "not_configured"; getIdToken: () => Promise<string>; onResults: () => Promise<void>; onSaveProspect?: (post: XPost) => Promise<void>}) {
  const [topic,setTopic] = useState((context.painPoints || '').split(/[,;\n]/)[0].slice(0,100));
  const [result,setResult] = useState<Results | null>(null);
  const [busy,setBusy] = useState(false);
  const [error,setError] = useState('');
  const connectionLabel = providerStatus === 'connected'
    ? `${provider} connected · account verified`
    : providerStatus === 'unverified'
      ? 'Apify token found · account verification unavailable'
      : providerStatus === 'configured'
        ? 'X API token configured'
        : 'X search not connected · Apify API token required';
  useEffect(() => { const suggestion = (context.outreachSearchPhrases || context.painPoints || '').split(/[,;\n]/)[0]?.trim().slice(0,100); if (suggestion) setTopic(suggestion); }, [context.outreachSearchPhrases, context.painPoints]);
  async function search(event: React.FormEvent) {
    event.preventDefault(); if (busy) return;
    setBusy(true);setError('');setResult(null);
    try {
      const token=await getIdToken();
      const response=await fetch('/api/discovery/x',{method:'POST',headers:{'Content-Type':'application/json',Authorization:`Bearer ${token}`},body:JSON.stringify({topic}),signal:AbortSignal.timeout(85000)});
      const payload=await response.json();
      if (!response.ok) throw new Error(payload.error || 'Search failed.');
      setResult(payload);await onResults();
    } catch(err) {setError(err instanceof Error && err.name !== 'TimeoutError' ? err.message : 'Search timed out. Check Apify before starting another run.');}
    finally {setBusy(false);}
  }
  return <section className="mini-card x-discovery" aria-labelledby="x-search-title">
    <div className="section-kicker">X · REAL PUBLIC POSTS</div>
    <h2 id="x-search-title">Find people talking about the problem you solve</h2>
    <p>Enter a short phrase your customers would use. We search recent X posts and keep the original source with every result.</p>
    <p className="source-notice">{connectionLabel}</p>
    <form onSubmit={search} className="x-search-form"><label htmlFor="x-topic">Customer problem or topic</label><input id="x-topic" value={topic} onChange={e=>setTopic(e.target.value)} minLength={3} maxLength={100} required placeholder="e.g. customer onboarding" disabled={busy}/><button className="btn btn-dark" disabled={busy || !provider || topic.trim().length<3}>{busy ? 'Searching X…' : 'Search X'}</button></form>
    <p className="muted-copy">Up to 10 posts from the last seven days. Searches use provider credits{provider === 'Apify' ? ' with a $0.10 cap per run' : ''}. Results appear in Radar. A phrase match is not proof of buying intent.</p>
    {error && <p role="alert" className="x-search-error">{error}</p>}
    <div aria-live="polite" aria-busy={busy}>{busy && <p>Fetching real posts. This can take about a minute…</p>}{result && <><p><strong>{result.posts.length} real X posts returned</strong> · via {result.provider} · Retrieved {new Date(result.retrievedAt).toLocaleString()}</p><p className="muted-copy">Search used: {result.query}</p>{!result.posts.length && <p>No posts matched. Try a shorter phrase your customers would use.</p>}<div className="x-results">{result.posts.map(post=><article key={post.id} className="x-result"><span className="status-tag">X · {result.provider}</span>{post.author && <strong> @{post.author}</strong>}{post.createdAt && <time dateTime={post.createdAt}> · {new Date(post.createdAt).toLocaleString()}</time>}<p className="x-post-text">{post.text}</p><p className="muted-copy">{post.metrics ? `${post.metrics.likes} likes · ${post.metrics.replies} replies · ${post.metrics.reposts} reposts` : 'Public metrics unavailable'} · Buying intent not assessed</p><div className="outreach-result-actions"><a className="text-link" href={post.url} target="_blank" rel="noopener noreferrer">Open original X post ↗</a>{onSaveProspect && <button className="btn btn-outline" type="button" onClick={() => onSaveProspect(post)}>Add prospect</button>}</div></article>)}</div></>}</div>
  </section>;
}
