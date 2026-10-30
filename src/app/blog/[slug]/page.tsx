import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import Navbar from "@/components/Navbar";
import Footer from "@/components/Footer";
import { getBlogPost, publishedPosts } from "@/lib/blog/content";
import type { DocBlock } from "@/lib/docs/content";

export function generateStaticParams() {
  return publishedPosts().map((post) => ({ slug: post.slug }));
}

export async function generateMetadata({ params }: { params: Promise<{ slug: string }> }): Promise<Metadata> {
  const { slug } = await params;
  const post = getBlogPost(slug);
  if (!post) return {};
  return {
    title: post.title,
    description: post.description,
    alternates: { canonical: `/blog/${post.slug}` },
    openGraph: { title: post.title, description: post.description, type: "article", publishedTime: post.date },
  };
}

function Block({ block, i }: { block: DocBlock; i: number }) {
  switch (block.type) {
    case "p":
      return <p key={i} className="mt-4 leading-7 text-zinc-300">{block.text}</p>;
    case "h2":
      return <h2 key={i} className="mt-10 border-t border-zinc-800 pt-8 text-xl font-semibold text-zinc-100">{block.text}</h2>;
    case "h3":
      return <h3 key={i} className="mt-8 text-base font-semibold text-zinc-100">{block.text}</h3>;
    case "list":
      return (
        <ul key={i} className="mt-4 list-disc space-y-2 pl-5 leading-7 text-zinc-300 marker:text-zinc-600">
          {block.items.map((item, j) => <li key={j}>{item}</li>)}
        </ul>
      );
    case "code":
      return (
        <div key={i} className="mt-4 overflow-hidden rounded-lg border border-zinc-800 bg-zinc-900">
          {block.title && <p className="border-b border-zinc-800 px-4 py-2 text-xs text-zinc-500">{block.title}</p>}
          <pre className="overflow-x-auto px-4 py-3 text-sm text-emerald-200"><code>{block.text}</code></pre>
        </div>
      );
    case "note":
      return (
        <div key={i} className="mt-6 rounded-lg border border-emerald-900/60 bg-emerald-950/30 px-4 py-3 text-sm leading-6 text-emerald-200/90">
          {block.text}
        </div>
      );
  }
}

export default async function BlogPostPage({ params }: { params: Promise<{ slug: string }> }) {
  const { slug } = await params;
  const post = getBlogPost(slug);
  if (!post) notFound();
  const baseUrl = process.env.NEXT_PUBLIC_APP_URL || "https://www.gothreadly.live";
  const jsonLd = {
    "@context": "https://schema.org",
    "@type": "Article",
    headline: post.title,
    description: post.description,
    datePublished: post.date,
    author: { "@type": "Organization", name: "Threadly", url: baseUrl },
    publisher: { "@type": "Organization", name: "Threadly", url: baseUrl },
    mainEntityOfPage: `${baseUrl}/blog/${post.slug}`,
  };
  return (
    <div className="flex min-h-screen flex-col site bg-zinc-950">
      <Navbar />
      <main className="mx-auto w-full max-w-3xl flex-grow px-6 py-16">
        <script type="application/ld+json" dangerouslySetInnerHTML={{ __html: JSON.stringify(jsonLd) }} />
        <Link href="/blog" className="text-sm text-violet-300 hover:text-violet-200">← Blog</Link>
        <h1 className="mt-6 text-3xl font-bold tracking-tight text-white md:text-4xl">{post.title}</h1>
        <p className="mt-3 text-sm text-zinc-500">
          {new Date(`${post.date}T00:00:00Z`).toLocaleDateString("en-US", { year: "numeric", month: "long", day: "numeric" })}
          {" · "}{post.readingTime}
        </p>
        <article className="mt-8">
          {post.blocks.map((block, i) => <Block key={i} block={block} i={i} />)}
        </article>
        <div className="mt-12 rounded-xl border border-violet-400/30 bg-violet-500/10 px-6 py-6">
          <p className="text-sm font-medium text-violet-200">Measure your own AI visibility</p>
          <p className="mt-1 text-sm text-zinc-400">
            Track the questions your buyers ask and see how ChatGPT, Claude and Gemini answer them.
          </p>
          <Link href="/portal" className="mt-4 inline-block rounded-lg bg-violet-500 px-4 py-2 text-sm font-medium text-white transition hover:bg-violet-400">
            Start free
          </Link>
        </div>
      </main>
      <Footer />
    </div>
  );
}
