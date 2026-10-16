"use client";

import { useState, type FormEvent } from "react";
import { ArrowUpRight, Search } from "lucide-react";

type XPost = {
  id: string;
  author?: string;
  text: string;
  url: string;
  createdAt: string | null;
  metrics: { likes: number; replies: number; reposts: number } | null;
};

type SearchResult = {
  query: string;
  posts: XPost[];
  retrievedAt: string;
  provider: string;
};

export default function XDiscovery({ provider }: { provider: string | null }) {
  const [topic, setTopic] = useState("");
  const [result, setResult] = useState<SearchResult | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");

  async function search(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (busy || !provider) return;

    setBusy(true);
    setError("");
    setResult(null);
    try {
      const response = await fetch("/api/discovery/x", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ topic }),
        signal: AbortSignal.timeout(85000),
      });
      const payload = await response.json();
      if (!response.ok) throw new Error(payload.error || "Search failed. Try again later.");
      setResult(payload as SearchResult);
    } catch (caught) {
      setError(caught instanceof Error && caught.name !== "TimeoutError"
        ? caught.message
        : "Search timed out. Check the provider run before trying again.");
    } finally {
      setBusy(false);
    }
  }

  return (
    <section id="live-x-discovery" className="mx-auto my-16 max-w-5xl scroll-mt-28 px-4 sm:px-6 lg:px-12" aria-labelledby="x-discovery-title">
      <div className="rounded-3xl border-2 border-brand-violet/20 bg-white p-6 shadow-xl sm:p-10">
        <div className="mb-6 flex flex-wrap items-center justify-between gap-3">
          <div className="inline-flex items-center gap-2 rounded-full bg-brand-violet/10 px-3 py-1.5 text-xs font-bold uppercase tracking-wide text-brand-violet">
            <span className={`h-2 w-2 rounded-full ${provider ? "bg-emerald-500" : "bg-gray-400"}`} />
            X · Real public posts
          </div>
          <span className="rounded-full border border-purple-100 bg-[#faf8fc] px-3 py-1.5 text-xs font-semibold text-gray-600">
            {provider ? `${provider} connected` : "Provider not configured"}
          </span>
        </div>

        <h2 id="x-discovery-title" className="mb-3 text-3xl font-black tracking-tight text-gray-900 sm:text-4xl">
          Find real conversations about the problem you solve
        </h2>
        <p className="mb-7 max-w-3xl text-sm leading-relaxed text-gray-600 sm:text-base">
          Search recent public X posts by customer pain point. Each result links to its original post and includes available public engagement metrics.
        </p>

        <form onSubmit={search} className="grid gap-3 sm:grid-cols-[1fr_auto]">
          <label className="sr-only" htmlFor="x-discovery-topic">Customer problem or topic</label>
          <input
            id="x-discovery-topic"
            value={topic}
            onChange={(event) => setTopic(event.target.value)}
            minLength={3}
            maxLength={100}
            required
            disabled={busy}
            placeholder="For example: hard to track shared expenses"
            className="min-h-12 rounded-xl border border-gray-300 bg-white px-4 text-sm text-gray-900 outline-none transition focus:border-brand-violet focus:ring-2 focus:ring-brand-violet/20 disabled:bg-gray-50"
          />
          <button
            type="submit"
            disabled={busy || !provider || topic.trim().length < 3}
            className="btn-tactile-violet inline-flex min-h-12 items-center justify-center gap-2 rounded-xl bg-brand-violet px-6 font-bold text-white disabled:cursor-not-allowed disabled:opacity-50"
          >
            <Search className="h-4 w-4" />
            {busy ? "Searching X…" : "Search X"}
          </button>
        </form>

        <p className="mt-3 text-xs leading-relaxed text-gray-500">
          Up to 10 English posts from the last 7 days. Each search can use provider credits (Apify runs are capped at $0.10). Results are not scored for buying intent.
        </p>

        {!provider && <p className="mt-4 rounded-xl bg-amber-50 p-4 text-sm text-amber-900" role="status">
          Live search is not configured. Add <code className="font-mono font-bold">APIFY_TOKEN</code> to the server environment to enable it.
        </p>}
        {error && <p className="mt-4 rounded-xl bg-red-50 p-4 text-sm text-red-800" role="alert">{error}</p>}

        <div className="mt-6" aria-live="polite" aria-busy={busy}>
          {busy && <p className="text-sm text-gray-600">Fetching real posts. This can take about a minute…</p>}
          {result && <>
            <div className="mb-4 border-b border-gray-200 pb-4">
              <p className="mb-1 text-sm font-bold text-gray-900">{result.posts.length} posts returned · via {result.provider}</p>
              <p className="mb-1 break-words text-xs text-gray-500">Search used: {result.query}</p>
              <p className="mb-0 text-xs text-gray-500">Retrieved {new Date(result.retrievedAt).toLocaleString()}</p>
            </div>
            {!result.posts.length && <p className="text-sm text-gray-600">No posts matched. Try a shorter phrase your customers would use.</p>}
            <div className="space-y-4">
              {result.posts.map((post) => <article key={post.id} className="rounded-2xl border border-gray-200 bg-[#fdfcff] p-5">
                <div className="flex flex-wrap items-center gap-x-2 gap-y-1 text-xs text-gray-500">
                  <span className="rounded-md bg-brand-violet/10 px-2 py-1 font-bold uppercase text-brand-violet">X · {result.provider}</span>
                  {post.author && <strong className="text-gray-800">@{post.author}</strong>}
                  {post.createdAt && <time dateTime={post.createdAt}>{new Date(post.createdAt).toLocaleString()}</time>}
                </div>
                <p className="my-4 whitespace-pre-wrap break-words text-sm leading-relaxed text-gray-800">{post.text}</p>
                <div className="flex flex-col gap-3 border-t border-gray-200 pt-3 sm:flex-row sm:items-center sm:justify-between">
                  <p className="m-0 text-xs text-gray-500">
                    {post.metrics
                      ? `${post.metrics.likes} likes · ${post.metrics.replies} replies · ${post.metrics.reposts} reposts`
                      : "Public metrics unavailable"}
                    {" · Buying intent not assessed"}
                  </p>
                  <a href={post.url} target="_blank" rel="noopener noreferrer" className="inline-flex items-center gap-1 text-xs font-bold text-brand-violet hover:underline">
                    Open original post <ArrowUpRight className="h-3.5 w-3.5" />
                  </a>
                </div>
              </article>)}
            </div>
          </>}
        </div>
      </div>
    </section>
  );
}
